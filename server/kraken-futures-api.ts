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

  const accounts = accountsData as { accounts?: { cash?: { balances?: Record<string, number> } } }
  const cashAccount = accounts?.accounts?.cash
  const balances: Record<string, number> = cashAccount?.balances ?? {}

  await serviceClient
    .from("cash_balances")
    .delete()
    .eq("account_id", accountId)
    .like("currency", "FUT:%")

  for (const [currency, amount] of Object.entries(balances)) {
    const amt = Number(amount)
    if (amt === 0) continue
    let fxRate: number | null = null
    if (currency.toUpperCase() === "EUR") fxRate = 1
    else if (currency.toUpperCase() === "USD") fxRate = 0.92
    await serviceClient.from("cash_balances").insert({
      account_id: accountId,
      currency: `FUT:${currency}`,
      amount: amt,
      fx_rate_to_base: fxRate,
    })
  }

  await serviceClient
    .from("positions")
    .delete()
    .eq("account_id", accountId)
    .eq("asset_class", "crypto_perp")

  const posData = positionsData as { openPositions?: Array<Record<string, unknown>> }
  const openPositions = posData?.openPositions ?? []
  for (const pos of openPositions) {
    await serviceClient.from("positions").insert({
      account_id: accountId,
      ticker: pos.symbol as string,
      quantity: Number(pos.size) * ((pos.side as string) === "long" ? 1 : -1),
      market_price: Number(pos.markPrice) || 0,
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
