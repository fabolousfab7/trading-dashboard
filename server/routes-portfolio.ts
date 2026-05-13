import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  insertAccountSchema,
} from "../shared/schema.js"
import { fetchFlexReport, calculateNlvInBase } from "./ibkr-flex.js"
import { fetchStooqPrice, defaultStooqSymbol } from "./stooq.js"
import { fetchCoinGeckoPrices } from "./coingecko.js"
import { fetchYahooPrice } from "./yahoo-finance.js"
import { fetchHighImpactEvents } from "./forex-factory.js"
import { syncKrakenAccount, KrakenConfig } from "./kraken-api.js"
import { syncCotReports, INSTRUMENTS as COT_INSTRUMENTS } from "./cot-cftc.js"

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
        }

        if (account.broker === "IBKR") {
          console.log("[cron]", "ibkr_skip_position_sync", account.label, "(positions managed manually)")
          accountResult.actions.push("ibkr_positions_skipped (managed manually)")
        }

        const { data: positions } = await serviceClient
          .from("positions")
          .select("*")
          .eq("account_id", account.id)

        if (positions && positions.length > 0) {
          const cryptoPositions = positions.filter((p: any) => p.coingecko_id)
          const stockPositions = positions.filter((p: any) => !p.coingecko_id && p.stooq_symbol)

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
              let price = await fetchStooqPrice(p.stooq_symbol)
              if (price === null && p.stooq_symbol) {
                if (p.stooq_symbol.endsWith(".fr")) {
                  price = await fetchYahooPrice(p.ticker, "PA")
                } else if (p.stooq_symbol.endsWith(".de")) {
                  price = await fetchYahooPrice(p.ticker, "DE")
                } else if (p.stooq_symbol.endsWith(".us")) {
                  price = await fetchYahooPrice(p.ticker, "")
                }
              }
              if (price) {
                await serviceClient.from("positions").update({
                  market_price: price,
                  last_synced_at: new Date().toISOString(),
                }).eq("id", p.id)
              }
            } catch {}
          }
          if (stockPositions.length > 0) {
            accountResult.actions.push(`stooq_refreshed: ${stockPositions.length}`)
            console.log("[cron]", "action", account.label, `stooq_refreshed: ${stockPositions.length}`)
          }
        }

        const { data: freshPositions } = await serviceClient
          .from("positions").select("*").eq("account_id", account.id)
        const { data: freshCash } = await serviceClient
          .from("cash_balances").select("*").eq("account_id", account.id)

        const posValue = (freshPositions || []).reduce((s: number, p: any) => {
          const qty = Number(p.quantity), price = Number(p.market_price)
          const fx = Number(p.fx_rate_to_base) || 1
          const own = (Number(p.ownership_pct) || 100) / 100
          return qty !== 0 && price !== 0 ? s + qty * price * fx * own : s
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

    const [positionsRes, cashRes, snapshotRes, configRes] = await Promise.all([
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
    ])

    return res.json({
      account,
      positions: positionsRes.data || [],
      cashBalances: cashRes.data || [],
      latestSnapshot: snapshotRes.data,
      ibkrSync: configRes.data,
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
        const stooqSym = p.stooq_symbol || defaultStooqSymbol(p.ticker, p.currency)
        let price = await fetchStooqPrice(stooqSym).catch(() => null)
        if (price === null) {
          if (stooqSym.endsWith(".fr")) {
            price = await fetchYahooPrice(p.ticker, "PA")
          } else if (stooqSym.endsWith(".de")) {
            price = await fetchYahooPrice(p.ticker, "DE")
          } else if (stooqSym.endsWith(".us")) {
            price = await fetchYahooPrice(p.ticker, "")
          }
        }
        return { id: p.id, ticker: p.ticker, price, priceUsd: null as number | null }
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
      .not("stooq_symbol", "is", null)
    if (posErr) return res.status(500).json({ error: posErr.message })
    if (!positions || positions.length === 0) return res.json({ updated: 0 })

    let updated = 0
    const touchedAccounts = new Set<string>()
    for (const p of positions) {
      try {
        let price: number | null = null
        if (p.stooq_symbol.endsWith(".fr")) {
          price = await fetchYahooPrice(p.ticker, "PA")
        } else if (p.stooq_symbol.endsWith(".de")) {
          price = await fetchYahooPrice(p.ticker, "DE")
        } else if (p.stooq_symbol.endsWith(".us")) {
          price = await fetchYahooPrice(p.ticker, "")
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
          const fx = Number(p.fx_rate_to_base) || 1
          const own = (Number(p.ownership_pct) || 100) / 100
          return s + Number(p.quantity) * Number(p.market_price) * fx * own
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
