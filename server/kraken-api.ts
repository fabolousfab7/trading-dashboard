import crypto from "crypto"

export interface KrakenConfig {
  apiKey: string
  apiSecret: string
}

function getKrakenSignature(urlPath: string, data: string, secret: string): string {
  const sha256Hash = crypto.createHash("sha256").update(data).digest()
  const hmac = crypto.createHmac("sha512", Buffer.from(secret, "base64"))
  hmac.update(Buffer.concat([Buffer.from(urlPath), sha256Hash]))
  return hmac.digest("base64")
}

export async function krakenPrivateRequest(endpoint: string, params: Record<string, string> = {}, config: KrakenConfig) {
  const urlPath = `/0/private/${endpoint}`
  const nonce = Date.now() * 1000
  const postData = new URLSearchParams({ nonce: String(nonce), ...params }).toString()
  const signature = getKrakenSignature(urlPath, nonce + postData, config.apiSecret)

  const res = await fetch(`https://api.kraken.com${urlPath}`, {
    method: "POST",
    headers: {
      "API-Key": config.apiKey,
      "API-Sign": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
  })
  const json = await res.json()
  if (json.error && json.error.length > 0) {
    throw new Error(`Kraken API error: ${json.error.join(", ")}`)
  }
  return json.result
}

export const KRAKEN_TO_COINGECKO: Record<string, string> = {
  "XXBT": "bitcoin", "XBT": "bitcoin", "BTC": "bitcoin",
  "XETH": "ethereum", "ETH": "ethereum",
  "XXRP": "ripple", "XRP": "ripple",
  "XLTC": "litecoin", "LTC": "litecoin",
  "XXLM": "stellar", "XLM": "stellar",
  "XDOGE": "dogecoin", "DOGE": "dogecoin",
  "SOL": "solana", "DOT": "polkadot",
  "LINK": "chainlink", "AVAX": "avalanche-2",
  "MATIC": "matic-network", "ADA": "cardano",
  "ATOM": "cosmos", "UNI": "uniswap",
  "AAVE": "aave", "MKR": "maker",
  "USDT": "tether", "USDC": "usd-coin", "DAI": "dai",
}

export function normalizeKrakenTicker(asset: string): string {
  if (asset.startsWith("X") && asset.length === 4 && asset !== "XDAO") return asset.slice(1)
  if (asset.startsWith("Z") && asset.length === 4) return asset.slice(1)
  return asset
}

const FIAT_ASSETS = ["ZUSD", "ZEUR", "ZGBP", "ZJPY", "USD", "EUR", "GBP", "JPY"]

export async function syncKrakenAccount(
  client: any,
  account: any,
  config: KrakenConfig,
  userId?: string,
) {
  const krakenCfg = config

  const balances = await krakenPrivateRequest("Balance", {}, krakenCfg)

  const cryptoBalances: { asset: string; qty: number; ticker: string; coingeckoId: string }[] = []
  const fiatBalances: { currency: string; amount: number }[] = []

  for (const [asset, qty] of Object.entries(balances)) {
    const amount = Number(qty)
    if (amount === 0) continue

    if (FIAT_ASSETS.includes(asset)) {
      const currency = asset.replace(/^Z/, "")
      fiatBalances.push({ currency, amount })
    } else {
      const ticker = normalizeKrakenTicker(asset)
      const coingeckoId = KRAKEN_TO_COINGECKO[asset] || KRAKEN_TO_COINGECKO[ticker] || ticker.toLowerCase()
      cryptoBalances.push({ asset, qty: amount, ticker, coingeckoId })
    }
  }

  const { fetchCoinGeckoPrices } = await import("./coingecko.js")
  const cgIds = [...new Set(cryptoBalances.map(b => b.coingeckoId).filter(Boolean))]
  let prices: Record<string, Record<string, number>> = {}
  if (cgIds.length > 0) {
    prices = await fetchCoinGeckoPrices(cgIds, ["eur", "usd"])
  }

  await client
    .from("positions")
    .update({ quantity: "0" })
    .eq("account_id", account.id)

  for (const b of cryptoBalances) {
    const coinPrices = prices[b.coingeckoId]
    const priceUsd = coinPrices?.usd || 0
    const priceEur = coinPrices?.eur || 0
    const fxRate = priceEur && priceUsd ? priceEur / priceUsd : 1

    const existing = await client
      .from("positions").select("id, avg_cost")
      .eq("account_id", account.id).eq("ticker", b.ticker).maybeSingle()

    const posData: any = {
      account_id: account.id,
      ticker: b.ticker,
      name: b.coingeckoId,
      quantity: String(b.qty),
      market_price: String(priceUsd),
      avg_cost: existing?.data?.avg_cost || String(priceUsd),
      currency: "USD",
      fx_rate_to_base: String(fxRate),
      coingecko_id: b.coingeckoId,
      unrealized_pnl: String((priceUsd - Number(existing?.data?.avg_cost || priceUsd)) * b.qty),
    }
    if (userId) posData.user_id = userId

    if (existing?.data) {
      await client.from("positions").update(posData).eq("id", existing.data.id)
    } else {
      await client.from("positions").insert(posData)
    }
  }

  await client.from("cash_balances").delete().eq("account_id", account.id)
  for (const fb of fiatBalances) {
    const fxRate = fb.currency === "EUR" ? 1 : (fb.currency === "USD" ? 0.92 : 1)
    const cashData: any = {
      account_id: account.id,
      currency: fb.currency,
      amount: String(fb.amount),
      fx_rate_to_base: String(fxRate),
    }
    if (userId) cashData.user_id = userId
    await client.from("cash_balances").insert(cashData)
  }

  await client
    .from("kraken_config")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("account_id", account.id)

  return { positions: cryptoBalances.length, fiat: fiatBalances.length }
}
