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

    try {
      const data = await fetchFlexReport(config.flex_token, config.query_id)
      const nlv = calculateNlvInBase(data, baseCurrency)
      const now = new Date().toISOString()
      const today = new Date().toISOString().slice(0, 10)

      await userClient.from("positions").delete().eq("account_id", accountId)
      if (data.openPositions.length > 0) {
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

      return res.json({
        success: true,
        syncedAt: now,
        positionsCount: data.openPositions.length,
        cashCount: data.cashBalances.length,
        nlvBase: nlv.nlvBase,
      })
    } catch (e: any) {
      await userClient
        .from("ibkr_config")
        .update({
          last_sync_status: "error",
          last_sync_error: String(e.message || e),
        })
        .eq("account_id", accountId)
      return res.status(500).json({ error: String(e.message || e) })
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
    const baseCcy = cryptoPositions[0]?.currency?.toLowerCase() || "eur"
    const cryptoPrices = await fetchCoinGeckoPrices(cryptoIds, baseCcy)

    // 2. Build results pour crypto + stock
    const results = await Promise.all([
      ...cryptoPositions.map(async (p: any) => ({
        id: p.id, ticker: p.ticker, price: cryptoPrices[p.coingecko_id] ?? null,
      })),
      ...stockPositions.map(async (p: any) => {
        const stooqSym = p.stooq_symbol || defaultStooqSymbol(p.ticker, p.currency)
        const price = await fetchStooqPrice(stooqSym).catch(() => null)
        return { id: p.id, ticker: p.ticker, price }
      }),
    ])
    const updates = results.filter((r) => r.price !== null)
    const failed = results.filter((r) => r.price === null)

    await Promise.all(
      updates.map((u) =>
        userClient
          .from("positions")
          .update({ market_price: u.price, last_synced_at: new Date().toISOString() })
          .eq("id", u.id)
      )
    )
    return res.json({
      updated: updates.length,
      failed: failed.length,
      failedTickers: failed.map((f) => f.ticker),
    })
  })
}
