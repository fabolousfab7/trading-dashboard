import type { SupabaseClient } from "@supabase/supabase-js"
import { krakenPrivateRequest, KrakenConfig } from "./kraken-api.js"
import { callFutures, type KrakenFuturesConfig } from "./kraken-futures-api.js"
import { getHistoricalFxToEur } from "./fx-historical.js"

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

interface SyncResult {
  spot_rollover: number
  spot_margin: number
  futures_funding: number
  errors: string[]
}

export async function syncKrakenHoldingFees(serviceClient: SupabaseClient): Promise<SyncResult> {
  const result: SyncResult = { spot_rollover: 0, spot_margin: 0, futures_funding: 0, errors: [] }

  const { data: accounts } = await serviceClient
    .from("accounts")
    .select("id, label")
    .eq("broker", "Kraken")
    .eq("is_active", true)

  if (!accounts || accounts.length === 0) return result

  for (const account of accounts) {
    const { data: spotCfg } = await serviceClient
      .from("kraken_config")
      .select("api_key, api_secret")
      .eq("account_id", account.id)
      .maybeSingle()

    const { data: futCfg } = await serviceClient
      .from("kraken_futures_config")
      .select("api_key, api_secret")
      .eq("account_id", account.id)
      .maybeSingle()

    const sinceSec = Math.floor((Date.now() - 365 * 86400000) / 1000)

    // ── SPOT: rollover + margin fees ──
    if (spotCfg?.api_key && spotCfg?.api_secret) {
      const krakenCfg: KrakenConfig = { apiKey: spotCfg.api_key, apiSecret: spotCfg.api_secret }

      for (const type of ["rollover", "margin"] as const) {
        const pcgCode = type === "rollover" ? "661800" : "627800"
        const feeType = type
        let ofs = 0

        try {
          while (true) {
            const data = await krakenPrivateRequest("Ledgers", {
              type,
              start: String(sinceSec),
              ofs: String(ofs),
            }, krakenCfg)

            const ledger = data?.ledger || {}
            const countTotal = Number(data?.count) || 0
            const entries = Object.entries(ledger).map(([id, e]: [string, any]) => ({
              ledger_id: id,
              ...e,
            }))

            for (const entry of entries) {
              const feeVal = Math.abs(Number(entry.fee || 0))
              if (feeVal === 0) continue

              const currency = String(entry.asset || "ZEUR")
              const tsISO = new Date(Number(entry.time) * 1000).toISOString()
              const fx = await getHistoricalFxToEur(currency, tsISO)
              const amountEur = fx !== null ? feeVal * fx : null

              const { error } = await serviceClient
                .from("kraken_holding_fees")
                .upsert({
                  account_id: account.id,
                  source: "spot_ledger",
                  kraken_ref_id: entry.ledger_id,
                  ts: tsISO,
                  fee_type: feeType,
                  pcg_code: pcgCode,
                  amount_native: feeVal,
                  currency,
                  fx_rate_to_eur: fx,
                  amount_eur: amountEur,
                  amount_sign: -1,
                  raw_data: entry,
                }, { onConflict: "account_id,source,kraken_ref_id" })

              if (error) {
                console.warn(`[holding-fees] upsert error ${type}:`, error.message)
              } else {
                if (type === "rollover") result.spot_rollover++
                else result.spot_margin++
              }
            }

            ofs += entries.length
            if (ofs >= countTotal || entries.length === 0) break
            await sleep(1500)
          }
        } catch (e: any) {
          result.errors.push(`spot_${type}: ${e.message}`)
          console.error(`[holding-fees] spot ${type} error:`, e.message)
        }

        await sleep(1500)
      }
    }

    // ── FUTURES: funding rate entries ──
    if (futCfg?.api_key && futCfg?.api_secret) {
      const futuresCfg: KrakenFuturesConfig = { api_key: futCfg.api_key, api_secret: futCfg.api_secret }
      const sinceISO = new Date(sinceSec * 1000).toISOString()

      try {
        const data = await callFutures("/api/history/v2/account-log", futuresCfg, { since: sinceISO })
        const entries: any[] = (data as any).logs || (data as any).elements || (data as any).account_log || []

        const fundingEntries = entries.filter((e: any) => e.info === "funding rate change")

        for (const entry of fundingEntries) {
          const realizedFunding = Number(entry.realized_funding || 0)
          if (realizedFunding === 0) continue

          const currency = String(entry.asset || "USD").toUpperCase()
          const tsISO = entry.date || new Date().toISOString()
          const fx = await getHistoricalFxToEur(currency, tsISO)
          const amountEur = fx !== null ? Math.abs(realizedFunding) * fx : null
          const isPositive = realizedFunding > 0
          const pcgCode = isPositive ? "768000" : "668000"

          const { error } = await serviceClient
            .from("kraken_holding_fees")
            .upsert({
              account_id: account.id,
              source: "futures_log",
              kraken_ref_id: String(entry.booking_uid),
              ts: tsISO,
              fee_type: "funding",
              pcg_code: pcgCode,
              amount_native: Math.abs(realizedFunding),
              currency,
              fx_rate_to_eur: fx,
              amount_eur: amountEur,
              amount_sign: isPositive ? 1 : -1,
              raw_data: entry,
            }, { onConflict: "account_id,source,kraken_ref_id" })

          if (error) {
            console.warn("[holding-fees] upsert error futures:", error.message)
          } else {
            result.futures_funding++
          }
        }
      } catch (e: any) {
        result.errors.push(`futures_funding: ${e.message}`)
        console.error("[holding-fees] futures funding error:", e.message)
      }
    }
  }

  console.log(`[holding-fees] sync done: rollover=${result.spot_rollover}, margin=${result.spot_margin}, funding=${result.futures_funding}, errors=${result.errors.length}`)
  return result
}
