import { fetchCoinGeckoHistory } from "./coingecko.js"

const fxCache: Record<string, number> = {}

const CRYPTO_CG_MAP: Record<string, string> = {
  XBT: "bitcoin", BTC: "bitcoin", XXBT: "bitcoin",
  ETH: "ethereum", XETH: "ethereum",
  XMR: "monero", XXMR: "monero",
  XRP: "ripple", XXRP: "ripple",
  LTC: "litecoin", XLTC: "litecoin",
  SOL: "solana", DOT: "polkadot",
  LINK: "chainlink", AVAX: "avalanche-2",
  ADA: "cardano", ATOM: "cosmos",
  DOGE: "dogecoin", XDOGE: "dogecoin",
  UNI: "uniswap", AAVE: "aave", MKR: "maker",
}

const FIAT_SET = new Set([
  "EUR", "USD", "GBP", "JPY", "CHF",
  "ZEUR", "ZUSD", "ZGBP", "ZJPY", "ZCHF",
  "USDT", "USDC", "DAI",
])

async function getFiatToEur(currency: string, dateISO: string): Promise<number> {
  if (currency === "EUR" || currency === "ZEUR") return 1
  const day = dateISO.slice(0, 10)
  const cur = currency.replace(/^Z/, "")
  const usdLike = ["USDT", "USDC", "DAI"].includes(cur)
  const baseCur = usdLike ? "USD" : cur
  const key = `fiat:${baseCur}:${day}`
  if (key in fxCache) return fxCache[key]
  try {
    const r = await fetch(`https://api.frankfurter.app/${day}?from=${baseCur}&to=EUR`)
    if (!r.ok) throw new Error(`Frankfurter ${r.status}`)
    const data = await r.json()
    const rate = data?.rates?.EUR
    if (!rate) throw new Error("no EUR rate")
    fxCache[key] = rate
    return rate
  } catch {
    const fallback: Record<string, number> = { USD: 0.92, GBP: 1.17, CHF: 1.05, JPY: 0.006 }
    const fb = fallback[baseCur] ?? 1
    console.warn(`[fx-historical] Frankfurter fallback for ${baseCur} ${day}: ${fb}`)
    fxCache[key] = fb
    return fb
  }
}

async function getCryptoToEur(currency: string, dateISO: string): Promise<number> {
  const day = dateISO.slice(0, 10)
  const cur = currency.replace(/^X/, "")
  const cgId = CRYPTO_CG_MAP[currency] || CRYPTO_CG_MAP[cur]
  if (!cgId) {
    console.warn(`[fx-historical] no cgId for crypto ${currency}, using 0`)
    return 0
  }
  const key = `crypto:${cgId}:${day}`
  if (key in fxCache) return fxCache[key]
  try {
    const [yyyy, mm, dd] = day.split("-")
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cgId}/history?date=${dd}-${mm}-${yyyy}&localization=false`
    )
    if (!r.ok) throw new Error(`CG ${r.status}`)
    const data = await r.json()
    const price = data?.market_data?.current_price?.eur
    if (!price) throw new Error("no EUR price")
    fxCache[key] = price
    return price
  } catch (e: any) {
    console.warn(`[fx-historical] CoinGecko fallback for ${currency} ${day}: ${e.message}`)
    return 0
  }
}

export async function getHistoricalFxToEur(
  currency: string,
  dateISO: string
): Promise<number> {
  if (FIAT_SET.has(currency)) {
    return getFiatToEur(currency, dateISO)
  }
  return getCryptoToEur(currency, dateISO)
}

export async function preWarmCryptoFx(currencies: string[]): Promise<void> {
  const seen = new Set<string>()
  for (const cur of currencies) {
    const cgId = CRYPTO_CG_MAP[cur] || CRYPTO_CG_MAP[cur.replace(/^X/, "")]
    if (!cgId || seen.has(cgId)) continue
    seen.add(cgId)
    try {
      const history = await fetchCoinGeckoHistory(cgId, 400)
      for (const point of history) {
        fxCache[`crypto:${cgId}:${point.date}`] = point.price
      }
      console.log(`[fx-historical] pre-warmed ${cgId}: ${history.length} days`)
    } catch (e: any) {
      console.warn(`[fx-historical] pre-warm failed for ${cgId}: ${e.message}`)
    }
    await new Promise(r => setTimeout(r, 1500))
  }
}
