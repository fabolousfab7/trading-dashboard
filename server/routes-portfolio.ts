import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  insertAccountSchema,
} from "../shared/schema.js"
import { fetchFlexReport, calculateNlvInBase } from "./ibkr-flex.js"
import { fetchStooqPrice, defaultStooqSymbol } from "./stooq.js"
import { yahooSuffix, YAHOO_DE_TICKERS } from "./yahoo-finance.js"
import { fetchCoinGeckoPrices, fetchCoinGeckoHistory } from "./coingecko.js"
import { fetchYahooPrice, fetchYahooHistory } from "./yahoo-finance.js"
import { fetchHighImpactEvents } from "./forex-factory.js"
import { syncKrakenAccount, KrakenConfig } from "./kraken-api.js"
import { syncCotReports, INSTRUMENTS as COT_INSTRUMENTS } from "./cot-cftc.js"
import { syncKrakenFuturesAccount } from "./kraken-futures-api.js"
import { syncKrakenHoldingFees } from "./kraken-holding-fees.js"
import { getHistoricalFxToEur, preWarmCryptoDates } from "./fx-historical.js"
import { getPositionValueEur, normalizeTicker } from "./utils/portfolio-math.js"

function userScopedClient(userToken: string): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${userToken}` } } }
  )
}

async function requireAuth(supabase: SupabaseClient, req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  console.log("[requireAuth] header present?", !!authHeader, authHeader?.slice(0, 30))
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" })
  }
  const token = authHeader.replace("Bearer ", "")
  console.log("[requireAuth] token length:", token.length, "preview:", token.slice(0, 20))
  const { data, error } = await supabase.auth.getUser(token)
  console.log("[requireAuth] getUser result:", { hasUser: !!data?.user, userId: data?.user?.id, error: error?.message })
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid token", detail: error?.message })
  }
  ;(req as any).userId = data.user.id
  ;(req as any).userToken = token
  next()
}

export async function runDailySnapshot(serviceClient: SupabaseClient): Promise<{
  success: boolean; date: string; durationMs: number; results: any[]; error?: string
}> {
  const t0 = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const results: any[] = []

  try {
    const { data: allAccounts } = await serviceClient
      .from("accounts")
      .select("*, ibkr_config(*)")
      .eq("is_active", true)

    console.log("[cron]", "start", { date: today, nb_accounts: allAccounts?.length })

    if (!allAccounts || allAccounts.length === 0) {
      return { success: true, date: today, durationMs: Date.now() - t0, results }
    }

    for (const account of allAccounts) {
      const accountResult: any = { account: account.label, broker: account.broker, actions: [] }
      console.log("[cron]", "account", account.label, account.broker)

      if (account.broker === "Qonto") {
        console.log("[cron]", "skip_qonto_in_main_loop", account.label)
        continue
      }

      try {
        if (account.broker === "Kraken") {
          const { data: kCfgRows } = await serviceClient
            .from("kraken_config").select("*").eq("account_id", account.id)
          const kCfg = kCfgRows?.[0]
          if (kCfg?.api_key && kCfg?.api_secret) {
            try {
              const krakenCfg: KrakenConfig = { apiKey: kCfg.api_key, apiSecret: kCfg.api_secret }
              const result = await syncKrakenAccount(serviceClient, account, krakenCfg)
              accountResult.actions.push(`kraken_sync_ok: ${result.positions} positions`)
              console.log("[cron]", "action", account.label, `kraken_sync_ok: ${result.positions} positions`)
            } catch (e: any) {
              accountResult.actions.push(`kraken_sync_fail: ${e.message}`)
              console.log("[cron]", "action", account.label, `kraken_sync_fail: ${e.message}`)
            }
          }

          try {
            const { data: futuresCfgRows } = await serviceClient
              .from("kraken_futures_config").select("api_key, api_secret").eq("account_id", account.id)
            const futuresCfg = futuresCfgRows?.[0]
            if (futuresCfg?.api_key && futuresCfg?.api_secret) {
              const fResult = await syncKrakenFuturesAccount(serviceClient, account.id)
              accountResult.actions.push(`kraken_futures_sync_ok: ${fResult.positionsCount} positions`)
              console.log("[cron]", "action", account.label, `kraken_futures_sync_ok: ${fResult.positionsCount} positions`)
            }
          } catch (e: any) {
            accountResult.actions.push(`kraken_futures_sync_fail: ${e.message}`)
            console.log("[cron]", "action", account.label, `kraken_futures_sync_fail: ${e.message}`)
          }
        }

        if (account.broker === "IBKR") {
          const ibkrCfg = account.ibkr_config?.[0] || account.ibkr_config
          if (ibkrCfg?.flex_token && ibkrCfg?.query_id) {
            try {
              const flexData = await fetchFlexReport(ibkrCfg.flex_token, ibkrCfg.query_id)
              const now = new Date().toISOString()
              const hasRealPositions = flexData.openPositions.some((p: any) => p.quantity !== 0)

              if (hasRealPositions) {
                await serviceClient.from("positions").delete().eq("account_id", account.id)
                const positionRows = flexData.openPositions.map((p: any) => ({
                  account_id: account.id,
                  ticker: p.symbol, name: p.description, quantity: p.quantity,
                  currency: p.currency, avg_cost: p.openPrice, market_price: p.markPrice,
                  unrealized_pnl: p.fifoPnlUnrealized, asset_class: p.assetCategory,
                  fx_rate_to_base: p.fxRateToBase, last_synced_at: now,
                }))
                await serviceClient.from("positions").insert(positionRows)
                accountResult.actions.push(`ibkr_flex_positions: ${positionRows.length}`)
                console.log("[cron]", "action", account.label, `ibkr_flex_positions: ${positionRows.length}`)
              } else {
                accountResult.actions.push("ibkr_flex_skipped_zero")
                console.log("[cron]", "action", account.label, "ibkr_flex_skipped_zero: all quantities=0, positions inchangées")
              }

              if (flexData.cashBalances.length > 0) {
                await serviceClient.from("cash_balances").delete().eq("account_id", account.id)
                const cashRows = flexData.cashBalances.map((c: any) => ({
                  account_id: account.id, currency: c.currency,
                  amount: c.endingCash, last_synced_at: now,
                }))
                await serviceClient.from("cash_balances").insert(cashRows)
                accountResult.actions.push(`ibkr_flex_cash: ${cashRows.length}`)
              }

              await serviceClient.from("ibkr_config")
                .update({ last_synced_at: now, last_sync_status: "success", last_sync_error: null })
                .eq("account_id", account.id)

            } catch (e: any) {
              console.warn("[cron] IBKR Flex failed, positions inchangées:", e.message)
              accountResult.actions.push(`ibkr_flex_error: ${e.message}`)
              try {
                await serviceClient.from("ibkr_config")
                  .update({ last_sync_status: "error", last_sync_error: e.message })
                  .eq("account_id", account.id)
              } catch {}
            }
          } else {
            accountResult.actions.push("ibkr_flex_skipped: no config")
          }
        }

        const { data: positions } = await serviceClient
          .from("positions")
          .select("*")
          .eq("account_id", account.id)

        if (positions && positions.length > 0) {
          const cryptoPositions = positions.filter((p: any) => p.coingecko_id)
          const stockPositions = positions.filter((p: any) =>
            !p.coingecko_id && (p.asset_class === "STK" || p.asset_class === "stock")
          )

          if (cryptoPositions.length > 0) {
            const ids = [...new Set(cryptoPositions.map((p: any) => p.coingecko_id))]
            const prices = await fetchCoinGeckoPrices(ids, ["eur", "usd"])
            for (const p of cryptoPositions) {
              const coinPrices = prices[p.coingecko_id]
              if (coinPrices?.eur !== undefined) {
                await serviceClient.from("positions").update({
                  market_price: coinPrices.eur,
                  market_price_usd: coinPrices.usd || null,
                  last_synced_at: new Date().toISOString(),
                }).eq("id", p.id)
              }
            }
            accountResult.actions.push(`coingecko_refreshed: ${Object.keys(prices).length}`)
            console.log("[cron]", "action", account.label, `coingecko_refreshed: ${Object.keys(prices).length}`)
          }

          for (const p of stockPositions) {
            try {
              const ticker = p.ticker as string
              const currency = (p.currency as string) || "USD"
              if (ticker.includes(".") || Number(p.quantity) === 0) continue

              let suffix = yahooSuffix(currency, ticker)
              if (suffix === null) continue
              if (currency === "EUR" && YAHOO_DE_TICKERS.has(ticker)) suffix = "DE"

              let price = await fetchYahooPrice(ticker, suffix)
              if (price === null && currency === "EUR" && suffix === "PA") {
                price = await fetchYahooPrice(ticker, "DE")
              }
              if (price === null && currency === "EUR" && suffix === "DE") {
                price = await fetchYahooPrice(ticker, "PA")
              }

              if (price === null || price === 0) {
                const stooqSym = (p.stooq_symbol as string) || defaultStooqSymbol(ticker, currency)
                const stooqPrice = await fetchStooqPrice(stooqSym).catch(() => null)
                if (stooqPrice !== null && stooqPrice > 0) {
                  price = stooqPrice
                  console.log(`[cron] Stooq fallback for ${ticker}: ${stooqPrice}`)
                }
              }

              if (price !== null && price > 0) {
                await serviceClient.from("positions").update({
                  market_price: price,
                  last_synced_at: new Date().toISOString(),
                }).eq("id", p.id)
              } else {
                console.warn(`[cron] no price for ${ticker} (${currency}) — Yahoo and Stooq both failed`)
              }
            } catch {}
          }
          if (stockPositions.length > 0) {
            accountResult.actions.push(`stock_prices_refreshed: ${stockPositions.length}`)
            console.log("[cron]", "action", account.label, `stock_prices_refreshed: ${stockPositions.length}`)
          }
        }

        const { data: freshPositions } = await serviceClient
          .from("positions").select("*").eq("account_id", account.id)
        const { data: freshCash } = await serviceClient
          .from("cash_balances").select("*").eq("account_id", account.id)

        const posValue = (freshPositions || []).reduce((s: number, p: any) => {
          return s + getPositionValueEur(p)
        }, 0)
        const cashValue = (freshCash || []).reduce((s: number, c: any) => {
          const fx = Number(c.fx_rate_to_base) || 1
          return s + Number(c.amount) * fx
        }, 0)
        const nlvBase = posValue + cashValue

        await serviceClient.from("portfolio_snapshots").upsert({
          account_id: account.id,
          snapshot_date: today,
          nlv_base: nlvBase,
          capital_invested: account.capital_invested || null,
          cash_total: cashValue || null,
        }, { onConflict: "account_id,snapshot_date" })
        accountResult.actions.push(`snapshot_saved: ${nlvBase.toFixed(2)}`)
        console.log("[cron]", "action", account.label, `snapshot_saved: ${nlvBase.toFixed(2)}`)

        // Snapshot individual position prices into position_price_history
        let priceSnapCount = 0
        for (const p of (freshPositions || [])) {
          if (!p.market_price || Number(p.market_price) === 0) continue
          const source = p.coingecko_id ? "coingecko" : p.stooq_symbol ? "yahoo" : "manual"
          await serviceClient.from("position_price_history").upsert({
            ticker: normalizeTicker(p.ticker),
            asset_class: p.asset_class || "stock",
            price_date: today,
            market_price: p.market_price,
            currency: p.currency || "EUR",
            fx_rate_to_eur: p.fx_rate_to_base || null,
            source,
          }, { onConflict: "ticker,price_date" })
          priceSnapCount++
        }
        if (priceSnapCount > 0) {
          accountResult.actions.push(`price_history: ${priceSnapCount} tickers`)
          console.log("[cron]", "action", account.label, `price_history: ${priceSnapCount} tickers`)
        }

      } catch (e: any) {
        accountResult.actions.push(`error: ${e.message}`)
        console.log("[cron]", "action", account.label, `error: ${e.message}`)
      }
      results.push(accountResult)
    }

    try {
      const { data: qontoAcc } = await serviceClient
        .from("accounts").select("id").eq("broker", "Qonto").maybeSingle()
      if (qontoAcc) {
        const { data: txs } = await serviceClient
          .from("fhf_bank_transactions").select("amount, side")
        const balance = (txs || []).reduce((s: number, t: any) => {
          const amt = Math.abs(Number(t.amount))
          return s + (t.side === "credit" ? amt : -amt)
        }, 0)
        await serviceClient.from("portfolio_snapshots").upsert({
          account_id: qontoAcc.id, snapshot_date: today,
          nlv_base: balance, capital_invested: null, cash_total: balance,
        }, { onConflict: "account_id,snapshot_date" })
        results.push({ account: "Qonto FHF", broker: "Qonto", actions: [`snapshot_saved: ${balance.toFixed(2)}`] })
        console.log("[cron]", "action", "Qonto FHF", `snapshot_saved: ${balance.toFixed(2)}`)
      }
    } catch {}

    const durationMs = Date.now() - t0
    console.log("[cron]", "done", { durationMs, nb_results: results.length })
    return { success: true, date: today, durationMs, results }
  } catch (e: any) {
    const durationMs = Date.now() - t0
    console.log("[cron]", "error", { durationMs, error: e.message })
    return { success: false, date: today, durationMs, results, error: e.message }
  }
}

export async function syncIbkrTradesForAccount(
  client: SupabaseClient,
  account: { id: string; label: string },
  config: { flex_token: string; trades_query_id: string },
): Promise<{ inserted: number; updated: number }> {
  console.log("[ibkr-trades-sync]", account.label, "fetching flex report with query", config.trades_query_id)
  const data = await fetchFlexReport(config.flex_token, config.trades_query_id)
  console.log("[ibkr-trades-sync]", account.label, `got ${data.trades.length} trades from IBKR`)

  const parseFlexDate = (d: string | undefined): string | null => {
    if (!d || d.length !== 8) return null
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  }
  const parseFlexDateTime = (d: string | undefined, time: string | undefined): string | null => {
    const dateStr = parseFlexDate(d)
    if (!dateStr) return null
    if (time && time.length >= 6) {
      return `${dateStr}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
    }
    return dateStr
  }

  let inserted = 0, updated = 0
  for (const t of data.trades) {
    if (!t.tradeID) continue

    const row = {
      account_id: account.id,
      ibkr_trade_id: String(t.tradeID),
      trade_date: parseFlexDateTime(t.tradeDate, t.tradeTime) || parseFlexDate(t.tradeDate),
      settle_date: parseFlexDate(t.settleDateTarget),
      ticker: t.symbol,
      name: t.description || null,
      asset_class: t.assetCategory || null,
      currency: t.currency,
      exchange: t.exchange || null,
      side: t.buySell || (t.quantity < 0 ? "SELL" : "BUY"),
      quantity: Math.abs(t.quantity),
      price: t.tradePrice,
      proceeds: t.proceeds ?? null,
      commission: t.ibCommission != null ? Math.abs(t.ibCommission) : null,
      net_cash: t.netCash,
      realized_pnl: t.fifoPnlRealized ?? null,
      fx_rate_to_eur: t.fxRateToBase ?? null,
      source: "flex_query",
      raw_data: t,
    }

    const { data: existing } = await client
      .from("ibkr_trades")
      .select("id")
      .eq("account_id", account.id)
      .eq("ibkr_trade_id", String(t.tradeID))
      .maybeSingle()

    if (existing) {
      await client.from("ibkr_trades").update(row).eq("id", existing.id)
      updated++
    } else {
      await client.from("ibkr_trades").insert(row)
      inserted++
    }
  }

  // Dedup: remove SYNTH rows (flex_query_xml_import) that now have a real flex_query counterpart
  const { data: synthRows } = await client
    .from("ibkr_trades")
    .select("id, account_id, ticker, side, trade_date, realized_pnl")
    .eq("account_id", account.id)
    .eq("source", "flex_query_xml_import")

  if (synthRows && synthRows.length > 0) {
    const toDelete: string[] = []
    for (const synth of synthRows) {
      const synthDate = synth.trade_date ? synth.trade_date.slice(0, 10) : null
      if (!synthDate) continue
      const { data: realMatch } = await client
        .from("ibkr_trades")
        .select("id")
        .eq("account_id", synth.account_id)
        .eq("ticker", synth.ticker)
        .eq("side", synth.side)
        .eq("source", "flex_query")
        .gte("trade_date", synthDate)
        .lt("trade_date", synthDate + "T23:59:60")
        .eq("realized_pnl", synth.realized_pnl)
        .limit(1)
        .maybeSingle()
      if (realMatch) toDelete.push(synth.id)
    }
    if (toDelete.length > 0) {
      await client.from("ibkr_trades").delete().in("id", toDelete)
      console.log("[ibkr-trades-sync]", account.label, `dedup: removed ${toDelete.length} SYNTH rows`)
    }
  }

  console.log("[ibkr-trades-sync]", account.label, `done: ${inserted} inserted, ${updated} updated`)
  return { inserted, updated }
}

export function registerPortfolioRoutes(app: Express, supabase: SupabaseClient) {
  const auth = (req: Request, res: Response, next: NextFunction) => requireAuth(supabase, req, res, next)

  app.get("/api/accounts", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const { data, error } = await userClient
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ accounts: data })
  })

  app.post("/api/accounts", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const parse = insertAccountSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid body", details: parse.error.format() })
    }
    const payload = {
      user_id: userId,
      label: parse.data.label,
      broker: parse.data.broker,
      account_type: parse.data.accountType,
      currency_base: parse.data.currencyBase,
      ibkr_account_number: parse.data.ibkrAccountNumber,
      ...(parse.data.isActive !== undefined && { is_active: parse.data.isActive }),
      ...(parse.data.displayOrder !== undefined && { display_order: parse.data.displayOrder }),
    }
    const { data, error } = await userClient
      .from("accounts")
      .insert(payload)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ account: data })
  })

  app.put("/api/accounts/:id", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const accountId = req.params.id
    const parse = insertAccountSchema.partial().safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid body", details: parse.error.format() })
    }
    const { data, error } = await userClient
      .from("accounts")
      .update({
        ...(parse.data.label !== undefined && { label: parse.data.label }),
        ...(parse.data.broker !== undefined && { broker: parse.data.broker }),
        ...(parse.data.accountType !== undefined && { account_type: parse.data.accountType }),
        ...(parse.data.currencyBase !== undefined && { currency_base: parse.data.currencyBase }),
        ...(parse.data.ibkrAccountNumber !== undefined && { ibkr_account_number: parse.data.ibkrAccountNumber }),
        ...(parse.data.isActive !== undefined && { is_active: parse.data.isActive }),
        ...(parse.data.displayOrder !== undefined && { display_order: parse.data.displayOrder }),
      })
      .eq("id", accountId)
      .eq("user_id", userId)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: "Account not found" })
    return res.json({ account: data })
  })

  app.delete("/api/accounts/:id", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const accountId = req.params.id
    const { error } = await userClient
      .from("accounts")
      .delete()
      .eq("id", accountId)
      .eq("user_id", userId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  })

  app.put("/api/accounts/:id/ibkr", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const accountId = req.params.id
    const schema = z.object({
      queryId: z.string().min(1),
      flexToken: z.string().min(1),
    })
    const parse = schema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid body", details: parse.error.format() })
    }
    const { data: account } = await userClient
      .from("accounts")
      .select("id, broker")
      .eq("id", accountId)
      .eq("user_id", userId)
      .single()
    if (!account) return res.status(404).json({ error: "Account not found" })
    if (account.broker !== "IBKR") {
      return res.status(400).json({ error: "Account is not an IBKR account" })
    }
    const { data, error } = await userClient
      .from("ibkr_config")
      .upsert(
        {
          account_id: accountId,
          query_id: parse.data.queryId,
          flex_token: parse.data.flexToken,
        },
        { onConflict: "account_id" }
      )
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ config: { ...data, flex_token: "***" } })
  })

  app.post("/api/accounts/:id/sync", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const accountId = req.params.id
    const force = req.query.force === "true" || req.body?.force === true
    const { data: account, error: accErr } = await userClient
      .from("accounts")
      .select("*, ibkr_config(*)")
      .eq("id", accountId)
      .eq("user_id", userId)
      .single()
    if (accErr || !account) return res.status(404).json({ error: "Account not found" })
    const config = (account as any).ibkr_config?.[0] || (account as any).ibkr_config
    if (!config) return res.status(400).json({ error: "No IBKR config for this account" })
    const baseCurrency = account.currency_base || "EUR"
    const lastSyncAt = config.last_synced_at
    const COOLDOWN_MS = 15 * 60 * 1000
    const lastSyncDate = lastSyncAt ? new Date(lastSyncAt) : null
    const cooldownEndsAt = lastSyncDate ? new Date(lastSyncDate.getTime() + COOLDOWN_MS) : null
    const inCooldown = cooldownEndsAt ? Date.now() < cooldownEndsAt.getTime() : false

    console.log(`[ibkr-sync] start`, { source: force ? "user-force" : "user", accountId, lastSyncAt, cooldownEndsAt: cooldownEndsAt?.toISOString(), inCooldown, force })

    if (inCooldown && !force) {
      const agoMin = lastSyncDate ? Math.round((Date.now() - lastSyncDate.getTime()) / 60000) : 0
      const freeAt = cooldownEndsAt!.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      console.log(`[ibkr-sync] BLOCKED by app cooldown, retry in ${Math.round((cooldownEndsAt!.getTime() - Date.now()) / 60000)}min`)
      return res.status(429).json({
        error: `Dernier sync il y a ${agoMin}min. Prochain libre vers ${freeAt}, ou clique Forcer.`,
      })
    }

    if (force && inCooldown) {
      console.log(`[ibkr-sync] FORCE mode, skipping app cooldown`)
    }

    try {
      console.log(`[ibkr-sync] calling IBKR Flex...`)
      const data = await fetchFlexReport(config.flex_token, config.query_id)
      const nlv = calculateNlvInBase(data, baseCurrency)
      const now = new Date().toISOString()
      const today = new Date().toISOString().slice(0, 10)

      const hasRealPositions = data.openPositions.some(p => p.quantity !== 0)

      if (hasRealPositions) {
        await userClient.from("positions").delete().eq("account_id", accountId)
        const positionRows = data.openPositions.map((p) => ({
          account_id: accountId,
          ticker: p.symbol,
          name: p.description,
          quantity: p.quantity,
          currency: p.currency,
          avg_cost: p.openPrice,
          market_price: p.markPrice,
          unrealized_pnl: p.fifoPnlUnrealized,
          asset_class: p.assetCategory,
          fx_rate_to_base: p.fxRateToBase,
          last_synced_at: now,
        }))
        const { error: posErr } = await userClient.from("positions").insert(positionRows)
        if (posErr) throw new Error(`Failed to insert positions: ${posErr.message}`)
      } else {
        console.warn("[sync] All positions have quantity=0, keeping existing positions")
      }

      await userClient.from("cash_balances").delete().eq("account_id", accountId)
      if (data.cashBalances.length > 0) {
        const cashRows = data.cashBalances.map((c) => ({
          account_id: accountId,
          currency: c.currency,
          amount: c.endingCash,
          last_synced_at: now,
        }))
        const { error: cashErr } = await userClient.from("cash_balances").insert(cashRows)
        if (cashErr) throw new Error(`Failed to insert cash: ${cashErr.message}`)
      }

      const { error: snapErr } = await userClient
        .from("portfolio_snapshots")
        .upsert(
          {
            account_id: accountId,
            snapshot_date: today,
            nlv_base: nlv.nlvBase,
            unrealized_pnl: data.openPositions.reduce((s, p) => s + (p.fifoPnlUnrealized || 0), 0),
            cash_total: nlv.cashValueBase,
            fx_rate_eur_usd: nlv.fxEurUsd,
            raw_data: { whenGenerated: data.whenGenerated, fromDate: data.fromDate, toDate: data.toDate },
          },
          { onConflict: "account_id,snapshot_date" }
        )
      if (snapErr) throw new Error(`Failed to upsert snapshot: ${snapErr.message}`)

      await userClient
        .from("ibkr_config")
        .update({
          last_synced_at: now,
          last_sync_status: "success",
          last_sync_error: null,
        })
        .eq("account_id", accountId)

      console.log(`[ibkr-sync] OK`, { positionsCount: data.openPositions.length, cashCount: data.cashBalances.length, nlvBase: nlv.nlvBase })

      return res.json({
        success: true,
        syncedAt: now,
        positionsCount: data.openPositions.length,
        cashCount: data.cashBalances.length,
        nlvBase: nlv.nlvBase,
      })
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e)
      console.error(`[ibkr-sync] error:`, raw)

      await userClient
        .from("ibkr_config")
        .update({
          last_sync_status: "error",
          last_sync_error: raw,
        })
        .eq("account_id", accountId)

      let userMessage = raw
      if (raw.startsWith("IBKR_RATE_LIMIT:")) {
        const ibkrMsg = raw.replace(/^IBKR_RATE_LIMIT:\s*/, "")
        console.error(`[ibkr-sync] IBKR RATE LIMIT (code 1001): "${ibkrMsg}"`)
        userMessage = `Rate-limit IBKR (réponse serveur) : ${ibkrMsg}. Réessaie dans 15 min.`
      } else if (raw.includes("timed out") || raw.includes("Timeout") || raw.includes("timeout")) {
        userMessage = "Timeout réseau côté IBKR, réessaie dans quelques minutes."
      } else if (raw.startsWith("IBKR_API_ERROR_")) {
        userMessage = `IBKR Flex : ${raw.replace(/^IBKR_API_ERROR_\d+:\s*/, "")}`
      }

      return res.status(500).json({ error: userMessage })
    }
  })

  app.get("/api/accounts/:id/portfolio", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const accountId = req.params.id
    const { data: account } = await userClient
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", userId)
      .single()
    if (!account) return res.status(404).json({ error: "Account not found" })

    const [positionsRes, cashRes, snapshotRes, configRes, pricesAtRes] = await Promise.all([
      userClient.from("positions").select("*").eq("account_id", accountId).order("ticker"),
      userClient.from("cash_balances").select("*").eq("account_id", accountId).order("currency"),
      userClient
        .from("portfolio_snapshots")
        .select("*")
        .eq("account_id", accountId)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      userClient
        .from("ibkr_config")
        .select("last_synced_at, last_sync_status, last_sync_error")
        .eq("account_id", accountId)
        .maybeSingle(),
      userClient
        .from("positions")
        .select("last_synced_at")
        .eq("account_id", accountId)
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return res.json({
      account,
      positions: positionsRes.data || [],
      cashBalances: cashRes.data || [],
      latestSnapshot: snapshotRes.data,
      ibkrSync: configRes.data,
      pricesLastRefreshedAt: pricesAtRes.data?.last_synced_at || null,
    })
  })

  app.post("/api/accounts/:id/positions", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const accountId = req.params.id
    const schema = z.object({
      ticker: z.string().min(1),
      name: z.string().optional(),
      quantity: z.number(),
      currency: z.string().default("EUR"),
      avg_cost: z.number(),
      market_price: z.number().optional(),
      bucket: z.string().optional(),
      stooq_symbol: z.string().optional(),
    })
    const parse = schema.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: "Invalid body", details: parse.error.format() })

    let marketPrice = parse.data.market_price
    if (!marketPrice) {
      const stooqSym = parse.data.stooq_symbol || defaultStooqSymbol(parse.data.ticker, parse.data.currency)
      const fetched = await fetchStooqPrice(stooqSym)
      marketPrice = fetched || parse.data.avg_cost
    }

    const { data, error } = await userClient
      .from("positions")
      .insert({
        account_id: accountId,
        ticker: parse.data.ticker,
        name: parse.data.name,
        quantity: parse.data.quantity,
        currency: parse.data.currency,
        avg_cost: parse.data.avg_cost,
        market_price: marketPrice,
        bucket: parse.data.bucket,
        stooq_symbol: parse.data.stooq_symbol,
        asset_class: "STK",
        fx_rate_to_base: 1,
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ position: data })
  })

  app.put("/api/positions/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const positionId = req.params.id
    const schema = z.object({
      ticker: z.string().optional(),
      name: z.string().optional(),
      quantity: z.number().optional(),
      avg_cost: z.number().optional(),
      market_price: z.number().optional(),
      bucket: z.string().optional(),
      stooq_symbol: z.string().optional(),
    })
    const parse = schema.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: "Invalid body" })
    const { data, error } = await userClient
      .from("positions")
      .update(parse.data)
      .eq("id", positionId)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ position: data })
  })

  app.delete("/api/positions/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { error } = await userClient.from("positions").delete().eq("id", req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  })

  app.get("/api/snapshots/history", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const days = Math.min(Number(req.query.days) || 90, 365)
    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data: accounts } = await userClient
      .from("accounts").select("id, label, broker").eq("user_id", userId).eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.json({ snapshots: [], accounts: [] })

    const accountIds = accounts.map((a: any) => a.id)
    const { data: snapshots } = await userClient
      .from("portfolio_snapshots")
      .select("account_id, snapshot_date, nlv_base, capital_invested")
      .in("account_id", accountIds)
      .gte("snapshot_date", since.toISOString().slice(0, 10))
      .order("snapshot_date", { ascending: true })

    return res.json({ snapshots: snapshots || [], accounts })
  })

  // ── Timeseries: historical snapshots + live today point ──────
  const WINDOW_DAYS: Record<string, number> = { "24h": 2, "1S": 7, "1M": 30, "3M": 90, "6M": 180, "1A": 365 }
  const REFERENCE_DAYS: Record<string, number> = { "24h": 1, "1S": 7, "1M": 30, "3M": 90, "6M": 180, "1A": 365 }

  app.get("/api/portfolio/timeseries", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const tf = String(req.query.timeframe || "3M")
    const days = WINDOW_DAYS[tf] || 90

    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().slice(0, 10)
    const todayStr = new Date().toISOString().slice(0, 10)

    const { data: accounts } = await userClient
      .from("accounts").select("id, label, broker").eq("user_id", userId).eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.json({ series: [], variations: {} })

    const accountIds = accounts.map((a: any) => a.id)
    const brokerKey = (broker: string) => {
      if (broker === "IBKR") return "ibkr"
      if (broker === "Kraken") return "kraken"
      if (broker === "Qonto") return "qonto"
      if (broker === "Boursorama") return "pea"
      if (broker === "Crypto") return "crypto"
      return null
    }

    // 1. Historical snapshots
    const { data: snapshots } = await userClient
      .from("portfolio_snapshots")
      .select("account_id, snapshot_date, nlv_base")
      .in("account_id", accountIds)
      .gte("snapshot_date", sinceStr)
      .order("snapshot_date", { ascending: true })

    // Group by date → broker NLV
    const byDateBroker: Record<string, Record<string, number>> = {}
    for (const s of (snapshots || [])) {
      const acc = accounts.find((a: any) => a.id === s.account_id)
      if (!acc) continue
      const key = brokerKey(acc.broker)
      if (!key) continue
      const d = s.snapshot_date
      if (!byDateBroker[d]) byDateBroker[d] = {}
      byDateBroker[d][key] = (byDateBroker[d][key] || 0) + (Number(s.nlv_base) || 0)
    }

    // 2. Live point for today — compute NLV from positions + cash
    const live: Record<string, number> = { ibkr: 0, kraken: 0, qonto: 0, pea: 0, crypto_perso: 0, crypto_rf: 0 }

    for (const account of accounts) {
      const key = brokerKey(account.broker)
      if (!key) continue

      if (account.broker === "Qonto") {
        const { data: txs } = await userClient
          .from("fhf_bank_transactions").select("amount, side")
        live.qonto = (txs || []).reduce((s: number, t: any) => {
          const amt = Math.abs(Number(t.amount))
          return s + (t.side === "credit" ? amt : -amt)
        }, 0)
        continue
      }

      const [posRes, cashRes] = await Promise.all([
        userClient.from("positions").select("*").eq("account_id", account.id),
        userClient.from("cash_balances").select("*").eq("account_id", account.id),
      ])
      const positions = posRes.data || []
      const cash = cashRes.data || []
      const posValue = positions.reduce((s: number, p: any) => s + getPositionValueEur(p), 0)
      const cashValue = cash.reduce((s: number, c: any) => {
        const fx = Number(c.fx_rate_to_base) || 1
        return s + Number(c.amount) * fx
      }, 0)

      if (account.broker === "Crypto") {
        const persoVal = positions
          .filter((p: any) => (Number(p.ownership_pct) || 100) === 100)
          .reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.market_price), 0)
        const sharedVal = positions
          .filter((p: any) => (Number(p.ownership_pct) || 100) < 100)
          .reduce((s: number, p: any) => {
            const own = (Number(p.ownership_pct) || 100) / 100
            return s + Number(p.quantity) * Number(p.market_price) * own
          }, 0)
        live.crypto_perso = persoVal + cash.reduce((s: number, c: any) => {
          const fx = Number(c.fx_rate_to_base) || 1
          return s + Number(c.amount) * fx
        }, 0) * (persoVal / ((persoVal + sharedVal) || 1))
        live.crypto_rf = sharedVal + cashValue * (sharedVal / ((persoVal + sharedVal) || 1))
      } else {
        live[key] = (live[key] || 0) + posValue + cashValue
      }
    }

    // 3. Compute crypto perso ratio for historical split
    const cryptoTotal = live.crypto_perso + live.crypto_rf
    const persoRatio = cryptoTotal > 0 ? live.crypto_perso / cryptoTotal : 0.5

    // 4. Build timeseries with carry-forward
    const allDates = [...new Set(Object.keys(byDateBroker))].sort()
    // Remove today from historical if present (live replaces it)
    const historicalDates = allDates.filter(d => d !== todayStr)

    const KEYS = ["ibkr", "kraken", "qonto", "pea"] as const
    const lastKnown: Record<string, number> = {}
    const series: any[] = []

    for (const date of historicalDates) {
      const day = byDateBroker[date] || {}
      for (const k of [...KEYS, "crypto"]) {
        if (day[k] !== undefined) lastKnown[k] = day[k]
      }
      const cryptoNlv = lastKnown["crypto"] || 0
      const row: any = {
        date,
        ibkr: lastKnown["ibkr"] || 0,
        kraken: lastKnown["kraken"] || 0,
        qonto: lastKnown["qonto"] || 0,
        pea: lastKnown["pea"] || 0,
        crypto_perso: cryptoNlv * persoRatio,
        crypto_rf: cryptoNlv * (1 - persoRatio),
      }
      row.total = row.ibkr + row.kraken + row.qonto + row.pea + row.crypto_perso + row.crypto_rf
      series.push(row)
    }

    // 5. Append live today point
    const todayRow: any = { date: todayStr, ...live }
    todayRow.total = live.ibkr + live.kraken + live.qonto + live.pea + live.crypto_perso + live.crypto_rf
    series.push(todayRow)

    // 6. Compute variations — per-key carry-forward reference
    const refDays = REFERENCE_DAYS[tf] || 90
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - refDays)
    const targetStr = targetDate.toISOString().slice(0, 10)

    const last = series[series.length - 1] || todayRow

    function varForKey(key: string): { pct: number | null; abs: number; reference_date: string; reference_truncated: boolean } {
      const lastVal = Number((last as any)[key]) || 0
      // Carry-forward: latest row with date <= target AND non-zero value for this key
      let before: any = null
      for (const row of series) {
        if (row.date > targetStr) break
        if (Number((row as any)[key]) > 0) before = row
      }
      if (before) {
        const refVal = Number(before[key])
        return { pct: ((lastVal - refVal) / refVal) * 100, abs: lastVal - refVal, reference_date: before.date, reference_truncated: false }
      }
      // Fallback: first row with non-zero value (truncation)
      const after = series.find(row => Number((row as any)[key]) > 0)
      if (after) {
        const refVal = Number((after as any)[key])
        return { pct: ((lastVal - refVal) / refVal) * 100, abs: lastVal - refVal, reference_date: after.date, reference_truncated: true }
      }
      return { pct: null, abs: 0, reference_date: targetStr, reference_truncated: true }
    }

    const VAR_KEYS = ["ibkr", "kraken", "qonto", "pea", "crypto_perso", "crypto_rf"] as const
    const variations: Record<string, any> = {}
    for (const k of VAR_KEYS) {
      variations[k] = varForKey(k)
    }

    function varFromSubs(subKeys: string[]): { pct: number | null; abs: number; reference_date: string; reference_truncated: boolean } {
      const abs = subKeys.reduce((s, k) => s + (variations[k]?.abs || 0), 0)
      const todayVal = subKeys.reduce((s, k) => s + (Number((last as any)[k]) || 0), 0)
      const refVal = todayVal - abs
      const dates = subKeys.map(k => variations[k]?.reference_date).filter(Boolean).sort()
      const truncated = subKeys.some(k => variations[k]?.reference_truncated)
      return {
        pct: refVal > 0 ? (abs / refVal) * 100 : null,
        abs,
        reference_date: dates[0] || targetStr,
        reference_truncated: truncated,
      }
    }

    variations.fhf = varFromSubs(["ibkr", "kraken", "qonto"])
    variations.crypto_combined = varFromSubs(["crypto_perso", "crypto_rf"])
    variations.total = varFromSubs(["ibkr", "kraken", "qonto", "pea", "crypto_perso", "crypto_rf"])

    return res.json({ series, variations })
  })

  // ── IBKR Trades ────────────────────────────────────────────

  app.get("/api/ibkr/trades", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts").select("id").eq("user_id", userId).eq("broker", "IBKR").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.json({ trades: [], summary: null })

    let accountIds = accounts.map((a: any) => a.id)
    if (req.query.account_id) {
      const qid = String(req.query.account_id)
      if (accountIds.includes(qid)) accountIds = [qid]
      else return res.status(403).json({ error: "Account not found" })
    }

    let query = userClient.from("ibkr_trades").select("*").in("account_id", accountIds).order("trade_date", { ascending: false })
    if (req.query.from_date) query = query.gte("trade_date", String(req.query.from_date))
    if (req.query.to_date) query = query.lte("trade_date", String(req.query.to_date))
    if (req.query.ticker) query = query.eq("ticker", String(req.query.ticker))
    if (req.query.side) query = query.eq("side", String(req.query.side).toUpperCase())
    if (req.query.realized_only === "true") query = query.not("realized_pnl", "is", null)
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    query = query.limit(limit)

    const { data: trades, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    const safe = (trades || []).map((t: any) => {
      const { raw_data, ...rest } = t
      return rest
    })

    const fx = (t: any) => Number(t.fx_rate_to_eur) || 1
    const pnlEur = (t: any) => Number(t.realized_pnl) * fx(t)

    const realized = safe.filter((t: any) => t.realized_pnl != null)
    const winners = realized.filter((t: any) => Number(t.realized_pnl) > 0)
    const losers = realized.filter((t: any) => Number(t.realized_pnl) < 0)
    const sells = safe.filter((t: any) => t.side === "SELL")
    const sellsWithPnl = sells.filter((t: any) => t.realized_pnl != null)

    const best = realized.length > 0 ? realized.reduce((a: any, b: any) => pnlEur(b) > pnlEur(a) ? b : a) : null
    const worst = realized.length > 0 ? realized.reduce((a: any, b: any) => pnlEur(b) < pnlEur(a) ? b : a) : null

    const summary = {
      count: safe.length,
      realized_pnl_total_eur: realized.reduce((s: number, t: any) => s + pnlEur(t), 0),
      realized_pnl_winners_eur: winners.reduce((s: number, t: any) => s + pnlEur(t), 0),
      realized_pnl_losers_eur: losers.reduce((s: number, t: any) => s + pnlEur(t), 0),
      win_rate_pct: sellsWithPnl.length > 0 ? (winners.length / sellsWithPnl.length) * 100 : null,
      best_trade: best ? { ticker: best.ticker, realized_pnl: Number(best.realized_pnl), currency: best.currency, realized_pnl_eur: pnlEur(best), trade_date: best.trade_date } : null,
      worst_trade: worst ? { ticker: worst.ticker, realized_pnl: Number(worst.realized_pnl), currency: worst.currency, realized_pnl_eur: pnlEur(worst), trade_date: worst.trade_date } : null,
      total_commissions_eur: safe.reduce((s: number, t: any) => s + (Number(t.commission) || 0) * fx(t), 0),
      total_net_cash_eur: safe.reduce((s: number, t: any) => s + (Number(t.net_cash) || 0) * fx(t), 0),
    }

    return res.json({ trades: safe, summary })
  })

  app.post("/api/ibkr/trades/sync", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts").select("*, ibkr_config(*)").eq("user_id", userId).eq("broker", "IBKR").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.status(404).json({ error: "No IBKR accounts found" })

    let targets = accounts
    if (req.body?.account_id) {
      targets = accounts.filter((a: any) => a.id === req.body.account_id)
      if (targets.length === 0) return res.status(404).json({ error: "Account not found" })
    }

    const errors: string[] = []
    let totalInserted = 0
    let totalUpdated = 0
    let accountsSynced = 0

    for (const acc of targets) {
      const config = (acc as any).ibkr_config?.[0] || (acc as any).ibkr_config
      if (!config?.flex_token) { errors.push(`${acc.label}: no flex_token`); continue }
      const tradesQueryId = config.trades_query_id
      if (!tradesQueryId) { errors.push(`${acc.label}: no trades_query_id`); continue }

      try {
        const result = await syncIbkrTradesForAccount(userClient, acc, { flex_token: config.flex_token, trades_query_id: tradesQueryId })

        await userClient.from("ibkr_config").update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "success",
          last_sync_error: null,
        }).eq("id", config.id)

        totalInserted += result.inserted
        totalUpdated += result.updated
        accountsSynced++
      } catch (e: any) {
        console.error("[ibkr-trades-sync]", acc.label, "error:", e.message)
        errors.push(`${acc.label}: ${e.message}`)
        try {
          await userClient.from("ibkr_config").update({
            last_sync_status: "error",
            last_sync_error: e.message,
          }).eq("id", config.id)
        } catch { /* best-effort */ }
      }
    }

    const ok = errors.length === 0
    let error_code: string | undefined
    if (!ok && errors.length > 0) {
      const msg = errors.join(" ")
      if (/could not be generated|try again/i.test(msg) || /IBKR_RATE_LIMIT/i.test(msg)) error_code = "RATE_LIMIT"
      else if (/invalid.*token/i.test(msg)) error_code = "INVALID_TOKEN"
      else if (/invalid.*query/i.test(msg)) error_code = "QUERY_NOT_FOUND"
      else if (/timeout|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(msg)) error_code = "NETWORK"
      else if (/parse|xml|FlexQueryResponse/i.test(msg)) error_code = "PARSE_ERROR"
      else error_code = "UNKNOWN"
    }

    return res.json({
      ok,
      error: ok ? undefined : errors.join("; "),
      error_code,
      accounts_synced: accountsSynced,
      trades_inserted: totalInserted,
      trades_updated: totalUpdated,
    })
  })

  // ── Movers: top position moves vs historical price ──────────

  app.get("/api/portfolio/movers", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const tf = String(req.query.timeframe || "24h")
    const limit = Math.min(Number(req.query.limit) || 5, 30)
    const refDays = REFERENCE_DAYS[tf] || 1

    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - refDays)
    const targetStr = targetDate.toISOString().slice(0, 10)

    const { data: accounts } = await userClient
      .from("accounts").select("id, label, broker").eq("user_id", userId).eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.json({ by_eur: [], by_pct: [], reference_date: targetStr, reference_truncated: false })

    const accountIds = accounts.map((a: any) => a.id)
    const { data: positions } = await userClient
      .from("positions").select("*").in("account_id", accountIds)
    if (!positions || positions.length === 0) return res.json({ by_eur: [], by_pct: [], reference_date: targetStr, reference_truncated: false })

    const tickerSet = new Set(positions.map((p: any) => normalizeTicker(p.ticker)))
    const tickers = Array.from(tickerSet)

    const { data: histRows } = await userClient
      .from("position_price_history")
      .select("ticker, price_date, market_price")
      .in("ticker", tickers)
      .lte("price_date", targetStr)
      .order("price_date", { ascending: false })

    const refMap: Record<string, { price: number; date: string }> = {}
    for (const row of (histRows || [])) {
      if (!(row.ticker in refMap)) {
        refMap[row.ticker] = { price: Number(row.market_price), date: row.price_date }
      }
    }

    let actualRefDate = targetStr
    let truncated = false
    const refDates = Object.values(refMap).map(r => r.date)
    if (refDates.length > 0) {
      const earliest = refDates.sort()[0]
      if (earliest > targetStr) {
        actualRefDate = earliest
        truncated = true
      }
    }

    const accountMap = new Map(accounts.map((a: any) => [a.id, a]))

    const byTicker = new Map<string, any>()
    for (const p of positions) {
      const price = Number(p.market_price) || 0
      const qty = Number(p.quantity) || 0
      if (price <= 0 || qty <= 0) continue
      const nt = normalizeTicker(p.ticker)
      const ref = refMap[nt]
      if (!ref || ref.price <= 0) continue

      const pctChange = ((price - ref.price) / ref.price) * 100
      const fx = Number(p.fx_rate_to_base) || 1
      const own = (Number(p.ownership_pct) || 100) / 100
      const variationEur = (price - ref.price) * qty * fx * own
      const valueEur = qty * price * fx * own
      const acc = accountMap.get(p.account_id)

      const existing = byTicker.get(nt)
      if (!existing || Math.abs(valueEur) > Math.abs(existing.value_eur)) {
        byTicker.set(nt, {
          ticker: nt,
          name: p.name || nt,
          account_label: acc?.label || acc?.broker || "",
          asset_class: p.asset_class || "stock",
          today_price: price,
          reference_price: ref.price,
          pct_change: Math.round(pctChange * 100) / 100,
          variation_eur: Math.round(variationEur * 100) / 100,
          value_eur: Math.round(valueEur * 100) / 100,
        })
      }
    }

    const all = Array.from(byTicker.values())
    const byEur = [...all].sort((a, b) => Math.abs(b.variation_eur) - Math.abs(a.variation_eur)).slice(0, limit)
    const byPct = [...all].sort((a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change)).slice(0, limit)

    return res.json({ by_eur: byEur, by_pct: byPct, reference_date: actualRefDate, reference_truncated: truncated })
  })

  // ── Backfill: populate position_price_history with historical data ──
  app.post("/api/admin/backfill-prices", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    const cronSecret = process.env.CRON_SECRET
    let authorized = false
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      authorized = true
    } else if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "")
      const { data } = await supabase.auth.getUser(token)
      if (data?.user) authorized = true
    }
    if (!authorized) return res.status(401).json({ error: "Unauthorized" })

    const serviceClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const days = Math.min(Number(req.query.days) || 30, 90)
    const results: string[] = []

    const { data: allPositions } = await serviceClient
      .from("positions").select("ticker, coingecko_id, stooq_symbol, asset_class, currency, fx_rate_to_base")
    if (!allPositions || allPositions.length === 0) return res.json({ results: ["No positions found"] })

    // Deduplicate by normalized ticker
    const seen = new Set<string>()
    const uniquePositions: any[] = []
    for (const p of allPositions) {
      const nt = normalizeTicker(p.ticker)
      if (seen.has(nt)) continue
      seen.add(nt)
      uniquePositions.push({ ...p, normalizedTicker: nt })
    }

    const cryptoPositions = uniquePositions.filter(p => p.coingecko_id)
    for (const p of cryptoPositions) {
      try {
        const history = await fetchCoinGeckoHistory(p.coingecko_id, days)
        if (history.length === 0) {
          results.push(`${p.normalizedTicker}: 0 points — empty response (coingecko)`)
          console.log("[backfill]", p.normalizedTicker, "0 points — empty response")
        } else {
          for (const point of history) {
            await serviceClient.from("position_price_history").upsert({
              ticker: p.normalizedTicker,
              asset_class: p.asset_class || "crypto",
              price_date: point.date,
              market_price: point.price,
              currency: "EUR",
              fx_rate_to_eur: 1,
              source: "backfill",
            }, { onConflict: "ticker,price_date" })
          }
          results.push(`${p.normalizedTicker}: ${history.length} points (coingecko)`)
          console.log("[backfill]", p.normalizedTicker, `${history.length} points (coingecko)`)
        }
      } catch (e: any) {
        results.push(`${p.normalizedTicker}: failed — ${e.message}`)
        console.log("[backfill]", p.normalizedTicker, "error:", e.message)
      }
      await new Promise(r => setTimeout(r, 2500))
    }

    const stockPositions = uniquePositions.filter(p => !p.coingecko_id && p.stooq_symbol)
    for (const p of stockPositions) {
      try {
        const suffix = p.stooq_symbol?.endsWith(".fr") ? "PA"
          : p.stooq_symbol?.endsWith(".de") ? "DE"
          : p.stooq_symbol?.endsWith(".us") ? "" : "PA"
        const history = await fetchYahooHistory(p.ticker, suffix, days)
        if (history.length === 0) {
          results.push(`${p.normalizedTicker}: 0 points — empty response (yahoo/${suffix || "US"})`)
        } else {
          for (const point of history) {
            await serviceClient.from("position_price_history").upsert({
              ticker: p.normalizedTicker,
              asset_class: p.asset_class || "stock",
              price_date: point.date,
              market_price: point.price,
              currency: p.currency || "EUR",
              fx_rate_to_eur: p.fx_rate_to_base || null,
              source: "backfill",
            }, { onConflict: "ticker,price_date" })
          }
          results.push(`${p.normalizedTicker}: ${history.length} points (yahoo/${suffix || "US"})`)
        }
        console.log("[backfill]", p.normalizedTicker, `${history.length} points (yahoo/${suffix || "US"})`)
      } catch (e: any) {
        results.push(`${p.normalizedTicker}: failed — ${e.message}`)
        console.log("[backfill]", p.normalizedTicker, "error:", e.message)
      }
    }

    const usStockPositions = uniquePositions.filter(p => !p.coingecko_id && !p.stooq_symbol)
    for (const p of usStockPositions) {
      try {
        const history = await fetchYahooHistory(p.normalizedTicker, "", days)
        if (history.length === 0) {
          results.push(`${p.normalizedTicker}: 0 points — empty response (yahoo/US-raw)`)
        } else {
          for (const point of history) {
            await serviceClient.from("position_price_history").upsert({
              ticker: p.normalizedTicker,
              asset_class: p.asset_class || "STK",
              price_date: point.date,
              market_price: point.price,
              currency: p.currency || "USD",
              fx_rate_to_eur: p.fx_rate_to_base || null,
              source: "backfill",
            }, { onConflict: "ticker,price_date" })
          }
          results.push(`${p.normalizedTicker}: ${history.length} points (yahoo/US-raw)`)
        }
        console.log("[backfill]", p.normalizedTicker, `${history.length} points (yahoo/US-raw)`)
      } catch (e: any) {
        results.push(`${p.normalizedTicker}: failed — ${e.message}`)
        console.log("[backfill]", p.normalizedTicker, "error:", e.message)
      }
    }

    return res.json({ results })
  })

  app.get("/api/cron/daily", async (req: Request, res: Response) => {
    console.log("[cron-endpoint]", "headers", {
      authHeader_present: !!req.headers.authorization,
      authHeader_preview: req.headers.authorization?.slice(0, 20),
      vercel_id: req.headers["x-vercel-id"],
      vercel_cron: req.headers["x-vercel-cron"],
    })
    const authHeader = req.headers.authorization
    const cronSecret = process.env.CRON_SECRET
    console.log("[cron-endpoint]", "secret_check", {
      cronSecret_set: !!cronSecret,
      cronSecret_length: cronSecret?.length || 0,
      match: authHeader === `Bearer ${cronSecret}`,
    })
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" })
    }
    const serviceClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const result = await runDailySnapshot(serviceClient)
    return res.status(result.success ? 200 : 500).json(result)
  })

  // Deprecated: use POST /api/sync/all instead (includes COT + all steps)
  app.post("/api/admin/trigger-cron", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    console.log("[admin-trigger-cron]", "called by user", userId)
    const serviceClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const result = await runDailySnapshot(serviceClient)
    return res.status(result.success ? 200 : 500).json(result)
  })

  app.post("/api/admin/backfill-kraken-holding-fees", auth, async (req: Request, res: Response) => {
    const svcClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    try {
      const result = await syncKrakenHoldingFees(svcClient)
      return res.json({ ok: result.errors.length === 0, ...result })
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  })

  app.post("/api/admin/recompute-fx-historical", auth, async (req: Request, res: Response) => {
    const svcClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const FIAT_CURRENCIES = new Set(["EUR", "USD", "GBP", "CHF", "JPY", "ZEUR", "ZUSD", "ZGBP", "ZCHF", "ZJPY", "USDT", "USDC", "DAI"])
    const stats = {
      holding_fees_updated: 0,
      trades_updated: 0,
      crypto_fx_failures: [] as { currency: string; ts: string }[],
      errors: [] as string[],
    }

    try {
      // 1. Collect unique crypto (currency, date) pairs from holding fees
      const { data: cryptoFees } = await svcClient
        .from("kraken_holding_fees")
        .select("currency, ts")
      const cryptoDatesByCurrency: Record<string, Set<string>> = {}
      for (const row of (cryptoFees || [])) {
        if (FIAT_CURRENCIES.has(row.currency)) continue
        const day = String(row.ts).slice(0, 10)
        if (!cryptoDatesByCurrency[row.currency]) cryptoDatesByCurrency[row.currency] = new Set()
        cryptoDatesByCurrency[row.currency].add(day)
      }

      // Pre-warm crypto FX via per-date /history calls
      for (const [currency, datesSet] of Object.entries(cryptoDatesByCurrency)) {
        const dates = [...datesSet].sort()
        console.log(`[recompute-fx] pre-warming ${currency}: ${dates.length} unique dates`)
        const { failed } = await preWarmCryptoDates(currency, dates)
        for (const day of failed) {
          stats.crypto_fx_failures.push({ currency, ts: day })
        }
      }

      // 2. Recompute kraken_holding_fees
      const { data: fees } = await svcClient
        .from("kraken_holding_fees")
        .select("id, currency, ts, amount_native")
        .order("ts", { ascending: true })

      for (const fee of (fees || [])) {
        try {
          const fx = await getHistoricalFxToEur(fee.currency, fee.ts)
          if (fx !== null) {
            const amountEur = Math.abs(Number(fee.amount_native)) * fx
            await svcClient
              .from("kraken_holding_fees")
              .update({ fx_rate_to_eur: fx, amount_eur: amountEur })
              .eq("id", fee.id)
          } else {
            await svcClient
              .from("kraken_holding_fees")
              .update({ fx_rate_to_eur: null, amount_eur: null })
              .eq("id", fee.id)
          }
          stats.holding_fees_updated++
        } catch (e: any) {
          stats.errors.push(`fee ${fee.id}: ${e.message}`)
        }
      }

      // 3. Recompute kraken_trades
      const { data: trades } = await svcClient
        .from("kraken_trades")
        .select("id, quote_currency, trade_date")
        .order("trade_date", { ascending: true })

      for (const trade of (trades || [])) {
        try {
          const fx = await getHistoricalFxToEur(trade.quote_currency, trade.trade_date)
          await svcClient
            .from("kraken_trades")
            .update({ fx_rate_to_eur: fx })
            .eq("id", trade.id)
          stats.trades_updated++
        } catch (e: any) {
          stats.errors.push(`trade ${trade.id}: ${e.message}`)
        }
      }

      const ok = stats.errors.length === 0 && stats.crypto_fx_failures.length === 0
      return res.json({ ok, ...stats })
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message, ...stats })
    }
  })

  app.post("/api/accounts/:id/refresh-prices", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const accountId = req.params.id
    const { data: positions, error: getErr } = await userClient
      .from("positions")
      .select("*")
      .eq("account_id", accountId)
    if (getErr) return res.status(500).json({ error: getErr.message })
    if (!positions || positions.length === 0) return res.json({ updated: 0, failed: 0 })

    // 1. Fetch crypto en batch via CoinGecko
    const cryptoPositions = positions.filter((p: any) => p.coingecko_id)
    const stockPositions = positions.filter((p: any) => !p.coingecko_id)
    const cryptoIds = Array.from(new Set(cryptoPositions.map((p: any) => p.coingecko_id)))
    const cryptoPrices = await fetchCoinGeckoPrices(cryptoIds, ["eur", "usd"])

    // 2. Build results pour crypto + stock
    const results = await Promise.all([
      ...cryptoPositions.map(async (p: any) => {
        const coinPrices = cryptoPrices[p.coingecko_id]
        return {
          id: p.id, ticker: p.ticker,
          price: coinPrices?.eur ?? null,
          priceUsd: coinPrices?.usd ?? null,
        }
      }),
      ...stockPositions.map(async (p: any) => {
        const ticker = p.ticker as string
        const currency = (p.currency as string) || "USD"
        if (ticker.includes(".") || Number(p.quantity) === 0) {
          return { id: p.id, ticker, price: null, priceUsd: null as number | null }
        }

        let suffix = yahooSuffix(currency, ticker)
        if (suffix === null) {
          return { id: p.id, ticker, price: null, priceUsd: null as number | null }
        }
        if (currency === "EUR" && YAHOO_DE_TICKERS.has(ticker)) suffix = "DE"

        let price = await fetchYahooPrice(ticker, suffix)
        if (price === null && currency === "EUR" && suffix === "PA") {
          price = await fetchYahooPrice(ticker, "DE")
        }
        if (price === null && currency === "EUR" && suffix === "DE") {
          price = await fetchYahooPrice(ticker, "PA")
        }

        if (price === null || price === 0) {
          const stooqSym = (p.stooq_symbol as string) || defaultStooqSymbol(ticker, currency)
          price = await fetchStooqPrice(stooqSym).catch(() => null)
        }

        return { id: p.id, ticker, price, priceUsd: null as number | null }
      }),
    ])
    const updates = results.filter((r) => r.price !== null)
    const failed = results.filter((r) => r.price === null)

    await Promise.all(
      updates.map((u) =>
        userClient
          .from("positions")
          .update({
            market_price: u.price,
            market_price_usd: u.priceUsd,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", u.id)
      )
    )
    return res.json({
      updated: updates.length,
      failed: failed.length,
      failedTickers: failed.map((f) => f.ticker),
    })
  })

  app.get("/api/portfolio/refresh-prices", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const userId = (req as any).userId

    const { data: accounts, error: accErr } = await userClient
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
    if (accErr) return res.status(500).json({ error: accErr.message })
    if (!accounts || accounts.length === 0) return res.json({ updated: 0 })

    const { data: positions, error: posErr } = await userClient
      .from("positions")
      .select("*")
      .in("account_id", accounts.map((a: any) => a.id))
    if (posErr) return res.status(500).json({ error: posErr.message })
    const stockPositions = (positions || []).filter((p: any) =>
      !p.coingecko_id && (p.asset_class === "STK" || p.asset_class === "stock")
    )
    if (stockPositions.length === 0) return res.json({ updated: 0 })

    let updated = 0
    const touchedAccounts = new Set<string>()
    for (const p of stockPositions) {
      try {
        const ticker = p.ticker as string
        const currency = (p.currency as string) || "USD"
        if (ticker.includes(".") || Number(p.quantity) === 0) continue

        let suffix = yahooSuffix(currency, ticker)
        if (suffix === null) continue
        if (currency === "EUR" && YAHOO_DE_TICKERS.has(ticker)) suffix = "DE"

        let price = await fetchYahooPrice(ticker, suffix)
        if (price === null && currency === "EUR" && suffix === "PA") {
          price = await fetchYahooPrice(ticker, "DE")
        }
        if (price === null && currency === "EUR" && suffix === "DE") {
          price = await fetchYahooPrice(ticker, "PA")
        }

        if (price === null || price === 0) {
          const stooqSym = (p.stooq_symbol as string) || defaultStooqSymbol(ticker, currency)
          price = await fetchStooqPrice(stooqSym).catch(() => null)
        }
        if (price !== null) {
          await userClient.from("positions").update({
            market_price: price,
            last_synced_at: new Date().toISOString(),
          }).eq("id", p.id)
          updated++
          touchedAccounts.add(p.account_id)
        }
      } catch {}
    }

    const today = new Date().toISOString().slice(0, 10)
    for (const accountId of touchedAccounts) {
      try {
        const { data: accPos } = await userClient
          .from("positions").select("quantity, market_price, fx_rate_to_base, ownership_pct").eq("account_id", accountId)
        const { data: accCash } = await userClient
          .from("cash_balances").select("amount, fx_rate_to_base").eq("account_id", accountId)
        const posValue = (accPos || []).reduce((s: number, p: any) => {
          return s + getPositionValueEur(p)
        }, 0)
        const cashTotal = (accCash || []).reduce((s: number, c: any) => {
          return s + Number(c.amount) * (Number(c.fx_rate_to_base) || 1)
        }, 0)
        await userClient.from("portfolio_snapshots").upsert({
          account_id: accountId,
          snapshot_date: today,
          nlv_base: posValue + cashTotal,
          cash_total: cashTotal,
        }, { onConflict: "account_id,snapshot_date" })
      } catch {}
    }

    return res.json({ updated })
  })

  app.get("/api/notes", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { data, error } = await userClient
      .from("notes")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ notes: data })
  })

  app.post("/api/notes", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const schema = z.object({
      title: z.string().min(1).max(200),
      content: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
      images: z.array(z.string()).optional(),
      is_pinned: z.boolean().optional(),
    })
    const parse = schema.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: "Invalid body", details: parse.error.format() })
    const { data, error } = await userClient
      .from("notes")
      .insert({ user_id: userId, ...parse.data })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ note: data })
  })

  app.put("/api/notes/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const schema = z.object({
      title: z.string().min(1).max(200).optional(),
      content: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
      images: z.array(z.string()).optional(),
      is_pinned: z.boolean().optional(),
    })
    const parse = schema.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: "Invalid body" })
    const updates: any = { ...parse.data, updated_at: new Date().toISOString() }
    const { data, error } = await userClient
      .from("notes")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ note: data })
  })

  app.get("/api/market-events", async (_req: Request, res: Response) => {
    try {
      const events = await fetchHighImpactEvents()
      return res.json({ events })
    } catch (e: any) {
      return res.status(500).json({ error: e.message })
    }
  })

  app.delete("/api/notes/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { error } = await userClient.from("notes").delete().eq("id", req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  })

  // ── Position Notes (thesis) ──

  app.get("/api/position-notes", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { account_id, ticker } = req.query
    if (!account_id || !ticker) return res.status(400).json({ error: "account_id and ticker required" })
    const { data, error } = await userClient
      .from("position_notes")
      .select("*")
      .eq("account_id", account_id as string)
      .eq("ticker", ticker as string)
      .order("created_at", { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ notes: data })
  })

  app.post("/api/position-notes", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const schema = z.object({
      account_id: z.string().uuid(),
      ticker: z.string().min(1),
      position_id: z.string().uuid().nullable().optional(),
      thesis: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
      images: z.array(z.string()).optional(),
      target_price: z.number().nullable().optional(),
      stop_loss: z.number().nullable().optional(),
      horizon: z.enum(["swing", "position", "long-terme"]).nullable().optional(),
      status: z.enum(["active", "closed", "invalidated"]).optional(),
    })
    const parse = schema.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: "Invalid body", details: parse.error.format() })
    const { data, error } = await userClient
      .from("position_notes")
      .insert({ user_id: userId, ...parse.data })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ note: data })
  })

  app.put("/api/position-notes/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const schema = z.object({
      thesis: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
      images: z.array(z.string()).optional(),
      target_price: z.number().nullable().optional(),
      stop_loss: z.number().nullable().optional(),
      horizon: z.enum(["swing", "position", "long-terme"]).nullable().optional(),
      status: z.enum(["active", "closed", "invalidated"]).nullable().optional(),
    })
    const parse = schema.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: "Invalid body" })
    const { data, error } = await userClient
      .from("position_notes")
      .update({ ...parse.data, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ note: data })
  })

  app.delete("/api/position-notes/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { error } = await userClient.from("position_notes").delete().eq("id", req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  })

  // ── COT (Commitment of Traders) ─────────────────────────────────────

  app.get("/api/cron/cot", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" })
    }
    console.log("[cot-cron]", "starting COT sync")
    const serviceClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    try {
      const result = await syncCotReports(serviceClient)
      console.log("[cot-cron]", `fetched ${result.fetched} instruments`, result.errors.length > 0 ? `errors: ${result.errors.join("; ")}` : "")
      return res.json({ success: true, ...result })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[cot-cron]", "fatal", msg)
      return res.status(500).json({ success: false, error: msg })
    }
  })

  app.get("/api/cot/latest", async (_req: Request, res: Response) => {
    const serviceClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data, error } = await serviceClient
      .from("cot_reports")
      .select("instrument, report_date, net_large_specs, delta_7d, percentile_1y")
      .order("report_date", { ascending: false })

    if (error) return res.status(500).json({ error: error.message })

    const latestByInstrument: Record<string, any> = {}
    for (const row of data || []) {
      if (!latestByInstrument[row.instrument]) {
        latestByInstrument[row.instrument] = row
      }
    }

    const instruments = COT_INSTRUMENTS.map(inst => {
      const row = latestByInstrument[inst.key]
      if (!row) return { key: inst.key, label: inst.label, data: null }
      const net = Number(row.net_large_specs)
      const pct = row.percentile_1y !== null ? Number(row.percentile_1y) : null
      let biais: "haussier" | "baissier" | "neutre" = "neutre"
      if (net > 0 && pct !== null && pct >= 60) biais = "haussier"
      else if (net < 0 && pct !== null && pct <= 40) biais = "baissier"
      return {
        key: inst.key,
        label: inst.label,
        data: {
          report_date: row.report_date,
          net_large_specs: net,
          delta_7d: row.delta_7d !== null ? Number(row.delta_7d) : null,
          percentile_1y: pct,
          biais,
        },
      }
    })

    const latestDate = Object.values(latestByInstrument)[0]?.report_date || null
    return res.json({ instruments, latestDate })
  })
}
