import crypto from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

const BASE_URL = "https://futures.kraken.com"

export interface KrakenFuturesConfig {
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

// https://docs.futures.kraken.com/#http-server-authentication (updated Feb 2024: QS included in sigPath)
export function buildSignedRequest(
  endpoint: string,
  params: Record<string, string>,
  config: KrakenFuturesConfig
): { url: string; headers: Record<string, string> } {
  const nonce = Date.now().toString()
  const qs = new URLSearchParams(params).toString()
  let sigPath = endpoint.startsWith("/derivatives")
    ? endpoint.slice("/derivatives".length)
    : endpoint
  if (qs) sigPath += "?" + qs

  const signature = signRequest(sigPath, "", nonce, config.api_secret)
  const finalUrl = `${BASE_URL}${endpoint}${qs ? "?" + qs : ""}`

  console.log("[kraken-debug] === REQUEST ===")
  console.log("[kraken-debug] endpoint:", endpoint)
  console.log("[kraken-debug] queryString:", qs || "(none)")
  console.log("[kraken-debug] sigPath (string signed):", sigPath)
  console.log("[kraken-debug] postData:", "(none)")
  console.log("[kraken-debug] nonce:", nonce)
  console.log("[kraken-debug] final URL:", finalUrl)
  console.log("[kraken-debug] Authent (first 20):", signature.substring(0, 20) + "...")
  console.log("[kraken-debug] APIKey (last 4):", "****" + config.api_key.slice(-4))

  return {
    url: finalUrl,
    headers: {
      APIKey: config.api_key,
      Nonce: nonce,
      Authent: signature,
      Accept: "application/json",
    },
  }
}

export async function callFutures(
  endpoint: string,
  config: KrakenFuturesConfig,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const { url, headers } = buildSignedRequest(endpoint, params, config)
  const res = await fetch(url, { method: "GET", headers })
  const rawBody = await res.text()
  console.log("[kraken-debug] === RESPONSE ===")
  console.log("[kraken-debug] endpoint:", endpoint)
  console.log("[kraken-debug] status:", res.status)
  console.log("[kraken-debug] body (first 500):", rawBody.slice(0, 500))

  if (!res.ok) {
    throw new Error(`Kraken Futures ${endpoint} HTTP ${res.status}: ${rawBody.slice(0, 300)}`)
  }

  const data: Record<string, unknown> = JSON.parse(rawBody)
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
  return callFutures("/api/history/v2/account-log", config)
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

async function fetchFxToEur(currency: string): Promise<number | null> {
  if (currency.toUpperCase() === "EUR") return 1
  const from = currency.toLowerCase()
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from}.json`)
    if (!res.ok) return null
    const data = await res.json()
    return data[from]?.eur ?? null
  } catch {
    return null
  }
}

const HARDCODED_FX: Record<string, number> = { EUR: 1, USD: 0.92, GBP: 1.17, CHF: 1.05, JPY: 0.006 }

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
        for (const [currency, rawAmount] of Object.entries(source as Record<string, unknown>)) {
          const amt = typeof rawAmount === "number"
            ? rawAmount
            : (typeof rawAmount === "object" && rawAmount !== null && "quantity" in rawAmount
                ? Number((rawAmount as Record<string, unknown>).quantity)
                : null)
          if (amt === null || !isFinite(amt) || amt === 0) continue
          const key = currency.toUpperCase()
          balances[key] = (balances[key] ?? 0) + amt
        }
      }
    }
  }

  // --- Fetch live FX rates for all non-EUR currencies ---
  const fxRates = new Map<string, number>()
  fxRates.set("EUR", 1)
  const nonEurCurrencies = Object.keys(balances).filter(c => c !== "EUR")
  for (const currency of nonEurCurrencies) {
    const rate = await fetchFxToEur(currency)
    if (rate !== null) {
      fxRates.set(currency, rate)
    } else {
      console.warn(`[kraken-futures] FX rate ${currency}→EUR failed, using hardcoded fallback`)
      fxRates.set(currency, HARDCODED_FX[currency] ?? 1)
    }
  }

  await serviceClient
    .from("cash_balances")
    .delete()
    .eq("account_id", accountId)
    .like("currency", "FUT:%")

  for (const [currency, amount] of Object.entries(balances)) {
    await serviceClient.from("cash_balances").insert({
      account_id: accountId,
      currency: `FUT:${currency}`,
      amount,
      fx_rate_to_base: fxRates.get(currency) ?? HARDCODED_FX[currency] ?? 1,
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

  // Ensure USD→EUR rate is available for positions
  if (!fxRates.has("USD")) {
    const usdRate = await fetchFxToEur("USD")
    fxRates.set("USD", usdRate ?? HARDCODED_FX["USD"])
  }
  const usdToEur = fxRates.get("USD") ?? HARDCODED_FX["USD"]

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
      fx_rate_to_base: usdToEur,
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
