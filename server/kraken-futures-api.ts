import crypto from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

const BASE_URL = "https://futures.kraken.com"

interface KrakenFuturesConfig {
  api_key: string
  api_secret: string
}

function signRequest(endpointPath: string, postData: string, nonce: string, apiSecret: string): string {
  const message = postData + nonce + endpointPath
  const sha256Hash = crypto.createHash("sha256").update(message).digest()
  const secretDecoded = Buffer.from(apiSecret, "base64")
  const hmac = crypto.createHmac("sha512", secretDecoded)
  hmac.update(sha256Hash)
  return hmac.digest("base64")
}

async function callFutures(endpoint: string, config: KrakenFuturesConfig, signaturePath?: string) {
  const nonce = Date.now().toString()
  const postData = ""
  const sigPath = signaturePath ?? endpoint.replace("/derivatives", "")
  const signature = signRequest(sigPath, postData, nonce, config.api_secret)

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "GET",
    headers: {
      APIKey: config.api_key,
      Nonce: nonce,
      Authent: signature,
      Accept: "application/json",
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Kraken Futures ${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  const data: Record<string, unknown> = await res.json()
  if (data.result === "error" || data.error) {
    throw new Error(`Kraken Futures API error: ${JSON.stringify(data.error ?? data)}`)
  }
  return data
}

export async function fetchFuturesAccounts(config: KrakenFuturesConfig) {
  return callFutures("/derivatives/api/v3/accounts", config)
}

export async function fetchFuturesOpenPositions(config: KrakenFuturesConfig) {
  return callFutures("/derivatives/api/v3/openpositions", config)
}

export async function fetchFuturesAccountLog(config: KrakenFuturesConfig) {
  return callFutures("/api/history/v2/account-log", config, "/api/history/v2/account-log")
}

export async function fetchFuturesTickers(): Promise<Array<{ symbol: string; markPrice: number }>> {
  const res = await fetch(`${BASE_URL}/derivatives/api/v3/tickers`, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
  if (!res.ok) {
    throw new Error(`Kraken Futures /tickers HTTP ${res.status}`)
  }
  const data = await res.json()
  return (data.tickers ?? []) as Array<{ symbol: string; markPrice: number }>
}

export async function syncKrakenFuturesAccount(serviceClient: SupabaseClient, accountId: string) {
  const { data: configRow, error: cfgErr } = await serviceClient
    .from("kraken_futures_config")
    .select("api_key, api_secret")
    .eq("account_id", accountId)
    .single()

  if (cfgErr || !configRow) {
    throw new Error("Kraken Futures config introuvable pour ce compte")
  }

  const config: KrakenFuturesConfig = configRow as KrakenFuturesConfig
  const accountsData = await fetchFuturesAccounts(config)
  const positionsData = await fetchFuturesOpenPositions(config).catch(() => ({ openPositions: [] }))

  // --- Parse balances from ALL sub-accounts (cash, flex, etc.) ---
  const rawAccounts = (accountsData as Record<string, unknown>).accounts as Record<string, unknown> | undefined
  if (process.env.DEBUG_KRAKEN_FUTURES && rawAccounts) {
    console.log("[kraken-futures] accounts keys:", Object.keys(rawAccounts))
    for (const key of Object.keys(rawAccounts)) {
      const sub = rawAccounts[key] as Record<string, unknown> | undefined
      if (sub) console.log(`[kraken-futures] accounts.${key} keys:`, Object.keys(sub))
    }
  }

  const balances: Record<string, number> = {}
  if (rawAccounts) {
    for (const subAccount of Object.values(rawAccounts)) {
      const sub = subAccount as Record<string, unknown> | undefined
      if (!sub || typeof sub !== "object") continue
      const sources = [sub.balances, sub.currencies] as unknown[]
      for (const source of sources) {
        if (!source || typeof source !== "object") continue
        for (const [currency, amount] of Object.entries(source as Record<string, unknown>)) {
          const amt = Number(amount)
          if (!isFinite(amt) || amt === 0) continue
          const key = currency.toUpperCase()
          balances[key] = (balances[key] ?? 0) + amt
        }
      }
    }
  }

  await serviceClient
    .from("cash_balances")
    .delete()
    .eq("account_id", accountId)
    .like("currency", "FUT:%")

  for (const [currency, amount] of Object.entries(balances)) {
    let fxRate: number | null = null
    if (currency === "EUR") fxRate = 1
    else if (currency === "USD") fxRate = 0.92
    await serviceClient.from("cash_balances").insert({
      account_id: accountId,
      currency: `FUT:${currency}`,
      amount,
      fx_rate_to_base: fxRate,
    })
  }

  // --- Fetch tickers for mark prices (public endpoint) ---
  const tickerPrices = new Map<string, number>()
  try {
    const tickers = await fetchFuturesTickers()
    for (const t of tickers) {
      if (t.markPrice) tickerPrices.set(t.symbol.toLowerCase(), t.markPrice)
    }
  } catch (e) {
    console.warn("[kraken-futures] failed to fetch tickers, using entry price as fallback:", e)
  }

  await serviceClient
    .from("positions")
    .delete()
    .eq("account_id", accountId)
    .eq("asset_class", "crypto_perp")

  const posData = positionsData as { openPositions?: Array<Record<string, unknown>> }
  const openPositions = posData?.openPositions ?? []
  for (const pos of openPositions) {
    const symbol = pos.symbol as string
    const markPrice = tickerPrices.get(symbol.toLowerCase()) ?? (Number(pos.price) || 0)
    await serviceClient.from("positions").insert({
      account_id: accountId,
      ticker: symbol,
      quantity: Number(pos.size) * ((pos.side as string) === "long" ? 1 : -1),
      market_price: markPrice,
      avg_cost: Number(pos.price) || 0,
      unrealized_pnl: Number((pos.unrealizedFunding as number) ?? 0),
      asset_class: "crypto_perp",
      currency: "USD",
      fx_rate_to_base: null,
    })
  }

  await serviceClient
    .from("kraken_futures_config")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_error: null,
    })
    .eq("account_id", accountId)

  return { balances, positionsCount: openPositions.length }
}
