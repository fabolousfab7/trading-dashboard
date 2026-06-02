import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { syncKrakenAccount, KrakenConfig } from "./kraken-api.js"
import { syncKrakenFuturesAccount } from "./kraken-futures-api.js"
import { syncKrakenTradesForAccount } from "./routes-kraken-trades.js"
import { runDailySnapshot, upsertIbkrTrades } from "./routes-portfolio.js"
import { requestFlexReport, retrieveFlexReport } from "./ibkr-flex.js"
import type { FlexStatementData } from "./ibkr-flex.js"
import { fetchYahooPrice, yahooSuffix, YAHOO_DE_TICKERS } from "./yahoo-finance.js"
import { fetchStooqPrice, defaultStooqSymbol } from "./stooq.js"
import { fetchCoinGeckoPrices } from "./coingecko.js"
import { normalizeTicker } from "./utils/portfolio-math.js"
import { syncCotReports } from "./cot-cftc.js"
import { syncKrakenHoldingFees } from "./kraken-holding-fees.js"

function userScopedClient(userToken: string): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${userToken}` } } }
  )
}

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAuth(supabase: SupabaseClient, req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" })
  }
  const token = authHeader.replace("Bearer ", "")
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid token" })
  }
  ;(req as any).userId = data.user.id
  ;(req as any).userToken = token
  next()
}


async function refreshAllPositionPrices(
  svcClient: SupabaseClient,
  accountIds: string[],
): Promise<{ stocks: number; crypto: number; skipped: number; errors: string[] }> {
  const { data: positions } = await svcClient
    .from("positions")
    .select("*")
    .in("account_id", accountIds)

  if (!positions || positions.length === 0) return { stocks: 0, crypto: 0, skipped: 0, errors: [] }

  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  let stocks = 0
  let crypto = 0
  let skipped = 0
  const errors: string[] = []

  const cryptoPositions = positions.filter((p: any) => p.coingecko_id)
  if (cryptoPositions.length > 0) {
    const ids = Array.from(new Set(cryptoPositions.map((p: any) => p.coingecko_id))) as string[]
    const prices = await fetchCoinGeckoPrices(ids, ["eur", "usd"])
    for (const p of cryptoPositions) {
      const coinPrices = prices[p.coingecko_id]
      if (coinPrices?.eur !== undefined) {
        await svcClient.from("positions").update({
          market_price: coinPrices.eur,
          market_price_usd: coinPrices.usd || null,
          last_synced_at: now,
        }).eq("id", p.id)
        crypto++
      }
    }
  }

  const stockPositions = positions.filter((p: any) =>
    !p.coingecko_id && (p.asset_class === "STK" || p.asset_class === "stock")
  )
  for (const p of stockPositions) {
    try {
      const ticker = p.ticker as string
      const currency = (p.currency as string) || "USD"

      if (ticker.includes(".") || Number(p.quantity) === 0) {
        skipped++
        continue
      }

      let suffix = yahooSuffix(currency, ticker)
      if (suffix === null) { skipped++; continue }

      if (currency === "EUR" && YAHOO_DE_TICKERS.has(ticker)) suffix = "DE"

      let price = await fetchYahooPrice(ticker, suffix)

      if (price === null && currency === "EUR" && suffix === "PA") {
        price = await fetchYahooPrice(ticker, "DE")
      }
      if (price === null && currency === "EUR" && suffix === "DE") {
        price = await fetchYahooPrice(ticker, "PA")
      }

      let source = "yahoo"
      if (price === null || price === 0) {
        const stooqSym = (p.stooq_symbol as string) || defaultStooqSymbol(ticker, currency)
        const stooqPrice = await fetchStooqPrice(stooqSym).catch(() => null)
        if (stooqPrice !== null && stooqPrice > 0) {
          price = stooqPrice
          source = "stooq"
          console.log(`[refresh-prices] Stooq fallback for ${ticker}: ${stooqPrice}`)
        }
      }

      if (price !== null && price > 0) {
        await svcClient.from("positions").update({
          market_price: String(price),
          last_synced_at: now,
        }).eq("id", p.id)

        await svcClient.from("position_price_history").upsert({
          ticker: normalizeTicker(ticker),
          asset_class: p.asset_class || "stock",
          price_date: today,
          market_price: price,
          currency: currency,
          fx_rate_to_eur: p.fx_rate_to_base || null,
          source,
        }, { onConflict: "ticker,price_date" })

        stocks++
      } else {
        console.warn(`[refresh-prices] no price for ${ticker} (${currency}) — Yahoo and Stooq both failed`)
        skipped++
      }
    } catch (e: any) {
      console.warn(`[refresh-prices] error for ${p.ticker}: ${e.message}`)
      skipped++
    }
  }

  const otherPositions = positions.filter((p: any) =>
    !p.coingecko_id && p.asset_class !== "STK" && p.asset_class !== "stock" && p.asset_class !== "crypto_perp"
  )
  skipped += otherPositions.length

  console.log(`[refresh-prices] done: ${stocks} stocks, ${crypto} crypto, ${skipped} skipped`)
  return { stocks, crypto, skipped, errors }
}

interface StepResult {
  step: string
  status: "ok" | "error" | "skipped"
  message?: string
  durationMs: number
}

export function registerSyncRoutes(app: Express, supabase: SupabaseClient) {
  const auth = (req: Request, res: Response, next: NextFunction) => requireAuth(supabase, req, res, next)

  app.post("/api/sync/all", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const svcClient = serviceClient()
    const t0 = Date.now()
    const steps: StepResult[] = []

    const { data: accounts } = await userClient
      .from("accounts")
      .select("*, ibkr_config(*), kraken_config(*), kraken_futures_config(*)")
      .eq("user_id", userId)
      .eq("is_active", true)

    if (!accounts || accounts.length === 0) {
      return res.json({ ok: true, steps: [], durationMs: Date.now() - t0, message: "Aucun compte actif" })
    }

    const ibkrAccount = accounts.find((a: any) => a.broker === "IBKR")
    const krakenAccount = accounts.find((a: any) => a.broker === "Kraken")

    // Step 1: IBKR (async two-phase: request then retrieve)
    {
      const s0 = Date.now()
      try {
        if (!ibkrAccount) {
          steps.push({ step: "ibkr", status: "skipped", message: "Pas de compte IBKR", durationMs: 0 })
        } else {
          const config = ibkrAccount.ibkr_config?.[0] || ibkrAccount.ibkr_config
          if (!config?.flex_token || !config?.query_id) {
            steps.push({ step: "ibkr", status: "skipped", message: "Flex Query non configurée", durationMs: 0 })
          } else {
            const PENDING_MAX_AGE_MS = 15 * 60 * 1000
            const pendingRef = config.pending_reference_code as string | null
            const pendingAt = config.pending_requested_at ? new Date(config.pending_requested_at).getTime() : 0
            const pendingFresh = pendingRef && (Date.now() - pendingAt < PENDING_MAX_AGE_MS)

            let ibkrFlexData: FlexStatementData | null = null

            // Phase 1: try to retrieve a pending report
            if (pendingRef) {
              try {
                console.log("[sync] IBKR retrieve pending ref", pendingRef)
                ibkrFlexData = await retrieveFlexReport(config.flex_token, pendingRef)
              } catch (e: any) {
                console.warn("[sync] IBKR retrieve failed, will re-request:", e.message)
              }
            }

            // If retrieved → ingest positions + trades
            if (ibkrFlexData) {
              const now = new Date().toISOString()
              const posMsg: string[] = []

              const hasRealPositions = ibkrFlexData.openPositions.some((p: any) => p.quantity !== 0)
              const hasValidCostData = ibkrFlexData.openPositions.some((p: any) => Number(p.openPrice) > 0)

              if (hasRealPositions && hasValidCostData) {
                const { data: existingPositions } = await userClient
                  .from("positions").select("ticker, avg_cost, unrealized_pnl")
                  .eq("account_id", ibkrAccount.id)
                const existingCosts = new Map((existingPositions || []).map((p: any) => [p.ticker, p]))

                await userClient.from("positions").delete().eq("account_id", ibkrAccount.id)
                const positionRows = ibkrFlexData.openPositions.map((p: any) => {
                  const existing = existingCosts.get(p.symbol)
                  const newAvgCost = Number(p.openPrice) > 0 ? p.openPrice : (existing?.avg_cost ?? 0)
                  const newPnl = (p.fifoPnlUnrealized != null && Number(p.fifoPnlUnrealized) !== 0)
                    ? p.fifoPnlUnrealized : (existing?.unrealized_pnl ?? null)
                  return {
                    account_id: ibkrAccount.id,
                    ticker: p.symbol, name: p.description, quantity: p.quantity,
                    currency: p.currency, avg_cost: newAvgCost, market_price: p.markPrice,
                    unrealized_pnl: newPnl, asset_class: p.assetCategory,
                    fx_rate_to_base: p.fxRateToBase, last_synced_at: now,
                  }
                })
                await userClient.from("positions").insert(positionRows)
                posMsg.push(`${positionRows.length} positions`)
              } else if (hasRealPositions && !hasValidCostData) {
                console.warn("[sync] ibkr_cost_data_missing — positions avg_cost/pnl préservées, markPrice rafraîchi")
                for (const p of ibkrFlexData.openPositions) {
                  await userClient.from("positions").update({
                    market_price: p.markPrice, fx_rate_to_base: p.fxRateToBase, last_synced_at: now,
                  }).eq("account_id", ibkrAccount.id).eq("ticker", p.symbol)
                }
                posMsg.push("positions préservées (cost data manquant), markPrice rafraîchi")
              } else {
                posMsg.push("positions inchangées (qty=0)")
              }

              if (ibkrFlexData.cashBalances.length > 0) {
                await userClient.from("cash_balances").delete().eq("account_id", ibkrAccount.id)
                const cashRows = ibkrFlexData.cashBalances.map((c: any) => ({
                  account_id: ibkrAccount.id, currency: c.currency,
                  amount: c.endingCash, last_synced_at: now,
                }))
                await userClient.from("cash_balances").insert(cashRows)
              }

              if (ibkrFlexData.trades.length > 0) {
                const tr = await upsertIbkrTrades(userClient, ibkrAccount, ibkrFlexData.trades)
                posMsg.push(`${tr.inserted}+${tr.updated} trades`)
              }

              await userClient.from("ibkr_config").update({
                last_synced_at: now, last_sync_status: "success", last_sync_error: null,
                pending_reference_code: null, pending_requested_at: null,
              }).eq("account_id", ibkrAccount.id)

              steps.push({ step: "ibkr", status: "ok", message: posMsg.join(", "), durationMs: Date.now() - s0 })

            } else if (pendingFresh) {
              // Pending exists but not ready yet — don't re-request
              steps.push({ step: "ibkr", status: "ok", message: "Rapport en cours de génération, récupéré au prochain sync", durationMs: Date.now() - s0 })

            } else {
              // No pending or expired → request a new report
              console.log("[sync] IBKR requesting new report for query", config.query_id)
              try {
                const ref = await requestFlexReport(config.flex_token, config.query_id)
                await userClient.from("ibkr_config").update({
                  pending_reference_code: ref,
                  pending_requested_at: new Date().toISOString(),
                }).eq("account_id", ibkrAccount.id)
                console.log("[sync] IBKR pending ref stored:", ref)
                steps.push({ step: "ibkr", status: "ok", message: `Rapport demandé (ref ${ref}), récupéré au prochain sync`, durationMs: Date.now() - s0 })
              } catch (reqErr: any) {
                console.warn("[sync] IBKR request failed:", reqErr.message)
                steps.push({ step: "ibkr", status: "skipped", message: "IBKR occupé, nouvelle tentative au prochain sync", durationMs: Date.now() - s0 })
              }
            }
          }
        }
      } catch (e: any) {
        if (ibkrAccount) {
          try { await userClient.from("ibkr_config").update({ last_sync_status: "error", last_sync_error: e.message }).eq("account_id", ibkrAccount.id) } catch {}
        }
        steps.push({ step: "ibkr", status: "error", message: e.message, durationMs: Date.now() - s0 })
      }
    }

    // Step 2: Kraken spot positions
    {
      const s0 = Date.now()
      try {
        if (!krakenAccount) {
          steps.push({ step: "kraken_spot_positions", status: "skipped", message: "Pas de compte Kraken", durationMs: 0 })
        } else {
          const config = krakenAccount.kraken_config?.[0] || krakenAccount.kraken_config
          if (!config?.api_key || !config?.api_secret) {
            steps.push({ step: "kraken_spot_positions", status: "skipped", message: "Clés API Spot non configurées", durationMs: 0 })
          } else {
            const krakenCfg: KrakenConfig = { apiKey: config.api_key, apiSecret: config.api_secret }
            const result = await syncKrakenAccount(svcClient, krakenAccount, krakenCfg)
            await svcClient.from("kraken_config")
              .update({ last_sync_status: "success", last_sync_error: null })
              .eq("account_id", krakenAccount.id)
            steps.push({ step: "kraken_spot_positions", status: "ok", message: `${result.positions} positions, ${result.fiat} fiat`, durationMs: Date.now() - s0 })
          }
        }
      } catch (e: any) {
        if (krakenAccount) {
          try { await svcClient.from("kraken_config").update({ last_sync_status: "error", last_sync_error: e.message }).eq("account_id", krakenAccount.id) } catch {}
        }
        steps.push({ step: "kraken_spot_positions", status: "error", message: e.message, durationMs: Date.now() - s0 })
      }
    }

    // Step 3: Kraken trades (spot + futures in one call)
    {
      const s0 = Date.now()
      try {
        if (!krakenAccount) {
          steps.push({ step: "kraken_trades", status: "skipped", message: "Pas de compte Kraken", durationMs: 0 })
        } else {
          const result = await syncKrakenTradesForAccount(userClient, krakenAccount)
          const msgs: string[] = []
          if (result.spot.inserted || result.spot.updated) msgs.push(`Spot: ${result.spot.inserted} new, ${result.spot.updated} upd, ${result.spot.realized_recalc} FIFO`)
          if (result.futures.inserted || result.futures.updated) msgs.push(`Fut: ${result.futures.inserted} new, ${result.futures.updated} upd`)
          if (result.crypto_swaps.inserted || result.crypto_swaps.updated) msgs.push(`Crypto-swaps: ${result.crypto_swaps.inserted} new, ${result.crypto_swaps.updated} upd, ${result.crypto_swaps.needs_review} review`)
          if (result.errors.length > 0) throw new Error(result.errors.join("; "))
          steps.push({ step: "kraken_trades", status: "ok", message: msgs.join(" | ") || "Aucun trade", durationMs: Date.now() - s0 })
        }
      } catch (e: any) {
        steps.push({ step: "kraken_trades", status: "error", message: e.message, durationMs: Date.now() - s0 })
      }
    }

    // Step 4: Kraken futures positions
    {
      const s0 = Date.now()
      try {
        if (!krakenAccount) {
          steps.push({ step: "kraken_futures_positions", status: "skipped", message: "Pas de compte Kraken", durationMs: 0 })
        } else {
          const futConfig = krakenAccount.kraken_futures_config?.[0] || krakenAccount.kraken_futures_config
          if (!futConfig?.api_key || !futConfig?.api_secret) {
            steps.push({ step: "kraken_futures_positions", status: "skipped", message: "Clés API Futures non configurées", durationMs: 0 })
          } else {
            const result = await syncKrakenFuturesAccount(svcClient, krakenAccount.id)
            steps.push({ step: "kraken_futures_positions", status: "ok", message: `${result.positionsCount} positions`, durationMs: Date.now() - s0 })
          }
        }
      } catch (e: any) {
        if (krakenAccount) {
          try { await svcClient.from("kraken_futures_config").update({ last_sync_status: "error", last_sync_error: e.message }).eq("account_id", krakenAccount.id) } catch {}
        }
        steps.push({ step: "kraken_futures_positions", status: "error", message: e.message, durationMs: Date.now() - s0 })
      }
    }

    // Step 5: Refresh all position prices (always runs, independent of broker sync results)
    {
      const s0 = Date.now()
      try {
        const accountIds = accounts.map((a: any) => a.id)
        const result = await refreshAllPositionPrices(svcClient, accountIds)
        steps.push({ step: "refresh_prices", status: "ok", message: `${result.stocks} stocks, ${result.crypto} crypto, ${result.skipped} skip`, durationMs: Date.now() - s0 })
      } catch (e: any) {
        steps.push({ step: "refresh_prices", status: "error", message: e.message, durationMs: Date.now() - s0 })
      }
    }

    // Step 6: Daily snapshot (portfolio values + price history)
    {
      const s0 = Date.now()
      try {
        const snapshotResult = await runDailySnapshot(svcClient)
        if (!snapshotResult.success) throw new Error(snapshotResult.error || "Snapshot failed")
        steps.push({ step: "daily_snapshot", status: "ok", message: `${snapshotResult.results.length} comptes, ${snapshotResult.durationMs}ms`, durationMs: Date.now() - s0 })
      } catch (e: any) {
        steps.push({ step: "daily_snapshot", status: "error", message: e.message, durationMs: Date.now() - s0 })
      }
    }

    // Step 7: COT reports (CFTC)
    {
      const s0 = Date.now()
      try {
        const cotResult = await syncCotReports(svcClient)
        if (cotResult.errors.length > 0) throw new Error(cotResult.errors.join("; "))
        steps.push({ step: "cot_reports", status: "ok", message: `${cotResult.fetched} instruments`, durationMs: Date.now() - s0 })
      } catch (e: any) {
        steps.push({ step: "cot_reports", status: "error", message: e.message, durationMs: Date.now() - s0 })
      }
    }

    // Step 8: Kraken holding fees (rollover, margin, funding)
    {
      const s0 = Date.now()
      try {
        if (!krakenAccount) {
          steps.push({ step: "kraken_holding_fees", status: "skipped", message: "Pas de compte Kraken", durationMs: 0 })
        } else {
          const r = await syncKrakenHoldingFees(svcClient)
          if (r.errors.length > 0) throw new Error(r.errors.join("; "))
          steps.push({ step: "kraken_holding_fees", status: "ok", message: `rollover=${r.spot_rollover} margin=${r.spot_margin} funding=${r.futures_funding}`, durationMs: Date.now() - s0 })
        }
      } catch (e: any) {
        steps.push({ step: "kraken_holding_fees", status: "error", message: e.message, durationMs: Date.now() - s0 })
      }
    }

    const durationMs = Date.now() - t0
    const allOk = steps.every(s => s.status !== "error")
    console.log(`[sync/all] done in ${durationMs}ms, ${steps.filter(s => s.status === "ok").length}/${steps.length} ok`)

    return res.json({ ok: allOk, steps, durationMs })
  })

  app.get("/api/sync/status", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts")
      .select("*, ibkr_config(*), kraken_config(*), kraken_futures_config(*)")
      .eq("user_id", userId)
      .eq("is_active", true)

    if (!accounts) return res.json({ cards: [] })

    const cards: any[] = []
    const ONE_DAY = 86400_000

    function syncStatus(lastSyncedAt: string | null, lastSyncStatus: string | null): "green" | "orange" | "red" | "manual" {
      if (!lastSyncedAt) return "manual"
      if (lastSyncStatus === "error") return "red"
      const age = Date.now() - new Date(lastSyncedAt).getTime()
      if (age < ONE_DAY) return "green"
      if (age < 3 * ONE_DAY) return "orange"
      return "red"
    }

    for (const account of accounts) {
      if (account.broker === "IBKR") {
        const cfg = account.ibkr_config?.[0] || account.ibkr_config
        let ibkrStatus = syncStatus(cfg?.last_synced_at, cfg?.last_sync_status)
        let ibkrPricesAt: string | null = null

        if (ibkrStatus === "red" || ibkrStatus === "orange") {
          const { data: freshestPos } = await userClient
            .from("positions")
            .select("last_synced_at")
            .eq("account_id", account.id)
            .order("last_synced_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          if (freshestPos?.last_synced_at) {
            const posAge = Date.now() - new Date(freshestPos.last_synced_at).getTime()
            if (posAge < ONE_DAY) {
              ibkrStatus = "orange"
              ibkrPricesAt = freshestPos.last_synced_at
            }
          }
        }

        cards.push({
          id: account.id,
          label: account.label,
          broker: "IBKR",
          type: "positions",
          status: ibkrStatus,
          last_synced_at: cfg?.last_synced_at || null,
          last_sync_error: cfg?.last_sync_error || null,
          prices_refreshed_at: ibkrPricesAt,
        })
      }

      if (account.broker === "Kraken") {
        const spotCfg = account.kraken_config?.[0] || account.kraken_config
        cards.push({
          id: account.id,
          label: account.label,
          broker: "Kraken",
          type: "spot",
          status: syncStatus(spotCfg?.last_synced_at, spotCfg?.last_sync_status),
          last_synced_at: spotCfg?.last_synced_at || null,
          last_sync_error: spotCfg?.last_sync_error || null,
        })

        const futCfg = account.kraken_futures_config?.[0] || account.kraken_futures_config
        cards.push({
          id: account.id,
          label: account.label,
          broker: "Kraken",
          type: "futures",
          status: syncStatus(futCfg?.last_synced_at, futCfg?.last_sync_status),
          last_synced_at: futCfg?.last_synced_at || null,
          last_sync_error: futCfg?.last_sync_error || null,
        })
      }

      if (account.broker === "Qonto") {
        cards.push({
          id: account.id,
          label: account.label,
          broker: "Qonto",
          type: "bank",
          status: "manual" as const,
          last_synced_at: null,
          last_sync_error: null,
        })
      }
    }

    return res.json({ cards })
  })
}
