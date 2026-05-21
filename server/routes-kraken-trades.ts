import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { krakenPrivateRequest, normalizeKrakenTicker, KrakenConfig } from "./kraken-api.js"
import { recalcFifoForAccount } from "./fifo-pnl.js"
import { buildSignedRequest, callFutures, type KrakenFuturesConfig } from "./kraken-futures-api.js"
import { upsertCryptoCryptoSwap } from "./crypto-crypto-swaps.js"
import { getHistoricalFxToEur } from "./fx-historical.js"

const QUASI_FIAT = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "USDT", "USDC", "DAI"])
const FIAT_LIKE_RAW = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "USDT", "USDC", "DAI", "ZEUR", "ZUSD", "ZGBP", "ZJPY", "ZCHF"])

function normalizeTicker(raw: string): string {
  const REMAP: Record<string, string> = { XBT: "BTC" }
  return REMAP[raw] || raw
}

const FIAT_TICKERS = new Set(["EUR", "USD", "GBP", "JPY", "CHF"])

function isFiatFiatTrade(trade: any): boolean {
  return FIAT_TICKERS.has(trade.ticker) && QUASI_FIAT.has(trade.quote_currency)
}

function userScopedClient(userToken: string): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${userToken}` } } }
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

function parseKrakenPair(pair: string): { ticker: string; quote: string } | null {
  const KNOWN_QUOTES = ["ZEUR", "ZUSD", "ZGBP", "ZJPY", "EUR", "USD", "GBP", "JPY", "USDT", "USDC", "DAI"]
  for (const q of KNOWN_QUOTES) {
    if (pair.endsWith(q)) {
      const base = pair.slice(0, pair.length - q.length)
      if (base.length === 0) continue
      const ticker = normalizeKrakenTicker(base)
      const quote = normalizeKrakenTicker(q)
      return { ticker, quote }
    }
  }
  return null
}

function classifyError(msg: string): string {
  if (/rate.?limit|too many|EAPI:Rate|apiLimitExceeded/i.test(msg)) return "RATE_LIMIT"
  if (/invalid.?key|EAPI:Invalid key/i.test(msg)) return "INVALID_TOKEN"
  if (/authenticationError|permission|insufficientPermissions/i.test(msg)) return "PERMISSION_DENIED"
  if (/invalidArgument/i.test(msg)) return "PARSE_ERROR"
  if (/timeout|ECONNREFUSED|ENOTFOUND|fetch failed|nonceDuplicate/i.test(msg)) return "NETWORK"
  return "UNKNOWN"
}

// ── Futures helpers ──

function extractFuturesTicker(tradeable: string): string {
  const match = tradeable.match(/^(?:P[FI]|F[IF])_([A-Z]+?)(?:USD|EUR|GBP)(?:_.+)?$/)
  return normalizeTicker(match ? match[1] : tradeable)
}

function extractFuturesQuote(tradeable: string): string {
  const match = tradeable.match(/(USD|EUR|GBP)/)
  return match ? match[1] : "USD"
}

interface FuturesTradeRow {
  account_id: string
  kraken_trade_id: string
  market_type: "futures"
  trade_date: string
  pair: string
  ticker: string
  quote_currency: string
  side: string
  quantity: number
  price: number
  cost: number
  fee: number
  net_cash: number
  realized_pnl: number | null
  fx_rate_to_eur: number | null
  source: string
  raw_data: any
}

// ── V3 /fills mapper (flat structure) ──

async function fetchFuturesFillsV3(config: KrakenFuturesConfig): Promise<any[]> {
  const since = new Date(Date.now() - 30 * 86400_000)
  console.log(`[kraken-futures] trying /fills since ${since.toISOString()}`)
  const data = await callFutures("/derivatives/api/v3/fills", config, {
    lastFillTime: since.toISOString(),
  })
  const fills = data.fills ?? []
  console.log(`[kraken-futures] /fills returned ${(fills as any[]).length} fills`)
  return fills as any[]
}

function mapFillV3ToRow(fill: any, accountId: string): FuturesTradeRow | null {
  const ticker = extractFuturesTicker(fill.symbol || "")
  const quote = extractFuturesQuote(fill.symbol || "")
  const rawSide = String(fill.side || "").toUpperCase()
  if (rawSide !== "BUY" && rawSide !== "SELL") return null
  const quantity = Number(fill.size) || 0
  const price = Number(fill.price) || 0
  if (!quantity || !price || !fill.fill_id) return null

  const cost = price * quantity
  return {
    account_id: accountId,
    kraken_trade_id: String(fill.fill_id),
    market_type: "futures",
    trade_date: fill.fillTime || new Date().toISOString(),
    pair: fill.symbol,
    ticker,
    quote_currency: quote,
    side: rawSide,
    quantity,
    price,
    cost,
    fee: Number(fill.fee) || 0,
    net_cash: rawSide === "SELL" ? cost - (Number(fill.fee) || 0) : -(cost + (Number(fill.fee) || 0)),
    realized_pnl: fill.paidPnL != null ? Number(fill.paidPnL) : null,
    fx_rate_to_eur: 1,
    source: "api_fills",
    raw_data: fill,
  }
}

// ── V2 /executions mapper (nested structure: element.event.execution.execution) ──

async function fetchFuturesExecutionsV2Raw(config: KrakenFuturesConfig, sinceMs: number): Promise<any[]> {
  const allElements: any[] = []
  let continuationToken: string | undefined

  do {
    const params: Record<string, string> = {
      since: String(sinceMs),
      before: String(Date.now()),
      sort: "asc",
    }
    if (continuationToken) params.continuationToken = continuationToken

    const { url, headers } = buildSignedRequest("/api/history/v2/executions", params, config)
    const res = await fetch(url, { method: "GET", headers })
    const body = await res.text()

    if (!res.ok) {
      throw new Error(`Kraken Futures /executions HTTP ${res.status}: ${body.slice(0, 300)}`)
    }

    const data = JSON.parse(body)
    allElements.push(...(data.elements ?? []))

    continuationToken = data.continuationToken ?? undefined
    if (continuationToken) await new Promise(r => setTimeout(r, 500))
  } while (continuationToken)

  console.log(`[kraken-futures] /executions returned ${allElements.length} elements`)
  return allElements
}

function mapExecutionV2ToRow(element: any, accountId: string): FuturesTradeRow | null {
  const exec = element?.event?.execution?.execution
  const order = exec?.order
  if (!exec || !order) return null

  const tradeable = String(order.tradeable || "")
  const ticker = extractFuturesTicker(tradeable)
  const quote = extractFuturesQuote(tradeable)

  const ts = element.timestamp
  const tradeDate = new Date(typeof ts === "number" ? ts : Number(ts))
  if (isNaN(tradeDate.getTime())) return null
  const tradeDateIso = tradeDate.toISOString()

  const direction = String(order.direction || "").toUpperCase()
  if (direction !== "BUY" && direction !== "SELL") return null

  const quantity = parseFloat(exec.quantity || "0")
  const price = parseFloat(exec.price || "0")
  if (quantity === 0 || price === 0) return null

  const cost = parseFloat(exec.usdValue || "0") || quantity * price
  const fee = parseFloat(exec?.orderData?.fee || "0")

  return {
    account_id: accountId,
    kraken_trade_id: String(element.uid || ""),
    market_type: "futures",
    trade_date: tradeDateIso,
    pair: tradeable,
    ticker,
    quote_currency: quote,
    side: direction,
    quantity,
    price,
    cost,
    fee,
    net_cash: direction === "SELL" ? cost - fee : -(cost + fee),
    realized_pnl: null,
    fx_rate_to_eur: 1,
    source: "api_executions",
    raw_data: element,
  }
}

interface RoundTripOptions {
  allowShort?: boolean
  groupByQuote?: boolean
}

export function aggregateRoundTrips(fills: any[], options: RoundTripOptions = {}): {
  round_trips: any[]
  open_positions: any[]
  skipped_pre_window: number
} {
  const { allowShort = true, groupByQuote = false } = options

  const groups: Record<string, any[]> = {}
  for (const f of fills) {
    const key = groupByQuote ? `${f.ticker}|${f.quote_currency}` : (f.ticker || "")
    if (!groups[key]) groups[key] = []
    groups[key].push(f)
  }

  const trips: any[] = []
  const openPositions: any[] = []
  let skippedPreWindow = 0

  for (const [, groupFills] of Object.entries(groups)) {
    const sorted = [...groupFills].sort(
      (a, b) => +new Date(a.trade_date) - +new Date(b.trade_date)
    )

    let positionQty = 0
    let trip: any = null

    for (const fill of sorted) {
      const qty = Number(fill.quantity) || 0
      const signedQty = fill.side === "BUY" ? qty : -qty

      if (!allowShort) {
        // Position in short territory — skip fills until we recover to 0
        if (positionQty < -1e-8) {
          positionQty += signedQty
          if (positionQty > -1e-8) positionQty = 0
          skippedPreWindow++
          continue
        }
        // Sell would push position negative — track but skip
        if (signedQty < 0 && positionQty + signedQty < -1e-8) {
          positionQty += signedQty
          skippedPreWindow++
          continue
        }
      }

      if (Math.abs(positionQty) < 1e-8) positionQty = 0

      if (positionQty === 0) {
        const direction = signedQty > 0 ? "LONG" : "SHORT"
        if (!allowShort && direction === "SHORT") continue
        trip = {
          ticker: fill.ticker, pair: fill.pair,
          quote_currency: fill.quote_currency || "USD",
          direction,
          open_date: fill.trade_date, close_date: null,
          open_qty: 0, close_qty: 0,
          open_proceeds: 0, close_proceeds: 0,
          open_fees: 0, close_fees: 0,
          last_fx_rate: 1,
          fill_ids: [] as string[],
        }
      }
      if (!trip) continue

      const isOpening = (trip.direction === "LONG" && signedQty > 0)
                     || (trip.direction === "SHORT" && signedQty < 0)
      const proceeds = qty * (Number(fill.price) || 0)
      const fee = Number(fill.fee) || 0

      if (isOpening) {
        trip.open_qty += qty
        trip.open_proceeds += proceeds
        trip.open_fees += fee
      } else {
        trip.close_qty += qty
        trip.close_proceeds += proceeds
        trip.close_fees += fee
      }
      trip.fill_ids.push(fill.id || fill.kraken_trade_id)
      trip.last_fx_rate = Number(fill.fx_rate_to_eur) || 1
      positionQty += signedQty

      if (Math.abs(positionQty) < 1e-8) {
        trip.close_date = fill.trade_date
        const totalFees = trip.open_fees + trip.close_fees
        const grossPnl = trip.direction === "LONG"
          ? trip.close_proceeds - trip.open_proceeds
          : trip.open_proceeds - trip.close_proceeds
        const netPnl = grossPnl - totalFees
        const fxRate = trip.last_fx_rate

        trips.push({
          id: `${trip.ticker}-${trip.quote_currency}-${trip.open_date}`,
          ticker: trip.ticker, pair: trip.pair, direction: trip.direction,
          open_date: trip.open_date, close_date: trip.close_date,
          duration_hours: Math.round((+new Date(trip.close_date) - +new Date(trip.open_date)) / 3_600_000 * 10) / 10,
          qty: trip.open_qty,
          avg_open_price: trip.open_qty > 0 ? trip.open_proceeds / trip.open_qty : 0,
          avg_close_price: trip.close_qty > 0 ? trip.close_proceeds / trip.close_qty : 0,
          open_fees: trip.open_fees, close_fees: trip.close_fees, total_fees: totalFees,
          gross_pnl: grossPnl, realized_pnl_net: netPnl,
          gross_pnl_eur: grossPnl * fxRate,
          quote_currency: trip.quote_currency,
          fx_rate_to_eur: fxRate,
          realized_pnl_net_eur: netPnl * fxRate,
          nb_fills: trip.fill_ids.length,
          fill_ids: trip.fill_ids,
        })
        trip = null
        positionQty = 0
      }
    }

    if (trip && Math.abs(positionQty) >= 1e-8) {
      openPositions.push({
        ticker: trip.ticker, pair: trip.pair, direction: trip.direction,
        quote_currency: trip.quote_currency,
        open_date: trip.open_date,
        qty: Math.abs(positionQty),
        avg_open_price: trip.open_qty > 0 ? trip.open_proceeds / trip.open_qty : 0,
        open_fees: trip.open_fees,
        nb_fills: trip.fill_ids.length,
      })
    }
  }

  if (skippedPreWindow > 0) {
    console.log(`[round-trips] Skipped ${skippedPreWindow} fills without cost basis (pre-window)`)
  }

  return {
    round_trips: trips.sort((a, b) => +new Date(b.close_date) - +new Date(a.close_date)),
    open_positions: openPositions,
    skipped_pre_window: skippedPreWindow,
  }
}

export async function syncKrakenTradesForAccount(
  userClient: SupabaseClient,
  account: any,
): Promise<{
  spot: { inserted: number; updated: number; realized_recalc: number }
  futures: { inserted: number; updated: number }
  crypto_swaps: { inserted: number; updated: number; needs_review: number }
  errors: string[]
}> {
  const spotResult = { inserted: 0, updated: 0, realized_recalc: 0 }
  const futuresResult = { inserted: 0, updated: 0 }
  const cryptoSwapsResult = { inserted: 0, updated: 0, needs_review: 0 }
  const errors: string[] = []

  const spotConfig = account.kraken_config?.[0] || account.kraken_config
  if (spotConfig?.api_key && spotConfig?.api_secret) {
    try {
      const krakenCfg: KrakenConfig = { apiKey: spotConfig.api_key, apiSecret: spotConfig.api_secret }
      const now = Math.floor(Date.now() / 1000)
      const start = now - 365 * 86400
      let offset = 0
      let total = 0
      const allTrades: Array<{ id: string; data: any }> = []

      do {
        const result = await krakenPrivateRequest("TradesHistory", {
          start: String(start),
          end: String(now),
          ofs: String(offset),
        }, krakenCfg)

        const trades = result?.trades ?? {}
        const entries = Object.entries(trades)
        total = Number(result?.count) || 0

        for (const [tradeId, raw] of entries) {
          allTrades.push({ id: tradeId, data: raw })
        }

        offset += entries.length
        if (entries.length < 50) break
        await new Promise(r => setTimeout(r, 1500))
      } while (offset < total)

      console.log(`[kraken-trades-sync] spot: fetched ${allTrades.length} trades`)

      for (const { id: tradeId, data: t } of allTrades) {
        const parsed = parseKrakenPair(t.pair || "")
        if (!parsed) continue
        if (QUASI_FIAT.has(parsed.ticker) || FIAT_LIKE_RAW.has(parsed.ticker)) continue
        if (!QUASI_FIAT.has(parsed.quote)) {
          try {
            const r = await upsertCryptoCryptoSwap(userClient, account.id, tradeId, parsed, t)
            if (r.inserted) cryptoSwapsResult.inserted++
            if (r.updated) cryptoSwapsResult.updated++
            if (r.needs_review) cryptoSwapsResult.needs_review++
          } catch (e: any) {
            console.error("[kraken-trades-sync] crypto-crypto upsert error:", e.message)
            errors.push(`Crypto-swap ${tradeId}: ${e.message}`)
          }
          continue
        }

        const side = (t.type || "").toLowerCase() === "sell" ? "SELL" : "BUY"
        const tradeTime = new Date(Number(t.time) * 1000).toISOString()
        const fxToEur = await getHistoricalFxToEur(parsed.quote, tradeTime)

        const row = {
          account_id: account.id,
          kraken_trade_id: tradeId,
          market_type: "spot",
          trade_date: tradeTime,
          pair: t.pair,
          ticker: normalizeTicker(parsed.ticker),
          quote_currency: parsed.quote,
          side,
          quantity: Number(t.vol) || 0,
          price: Number(t.price) || 0,
          cost: Number(t.cost) || 0,
          fee: Number(t.fee) || 0,
          net_cash: side === "SELL"
            ? (Number(t.cost) || 0) - (Number(t.fee) || 0)
            : -((Number(t.cost) || 0) + (Number(t.fee) || 0)),
          fx_rate_to_eur: fxToEur,
          source: "api_trades_history",
          raw_data: t,
        }

        const { data: existing } = await userClient
          .from("kraken_trades")
          .select("id")
          .eq("account_id", account.id)
          .eq("kraken_trade_id", tradeId)
          .maybeSingle()

        if (existing) {
          await userClient.from("kraken_trades").update(row).eq("id", existing.id)
          spotResult.updated++
        } else {
          await userClient.from("kraken_trades").insert(row)
          spotResult.inserted++
        }
      }

      spotResult.realized_recalc = await recalcFifoForAccount(userClient, account.id)
      console.log(`[kraken-trades-sync] spot FIFO: ${spotResult.realized_recalc} sells recalculated`)
    } catch (e: any) {
      console.error("[kraken-trades-sync] spot error:", e.message)
      errors.push(`Spot: ${e.message}`)
    }
  } else {
    console.log("[kraken-trades-sync] skipping spot — no credentials")
  }

  const futConfig = account.kraken_futures_config?.[0] || account.kraken_futures_config
  if (futConfig?.api_key && futConfig?.api_secret) {
    try {
      const futCfg: KrakenFuturesConfig = { api_key: futConfig.api_key, api_secret: futConfig.api_secret }
      const allRows = new Map<string, FuturesTradeRow>()

      try {
        const fillsV3 = await fetchFuturesFillsV3(futCfg)
        for (const fill of fillsV3) {
          const row = mapFillV3ToRow(fill, account.id)
          if (row) allRows.set(row.kraken_trade_id, row)
        }
      } catch (e: any) {
        console.error("[kraken-futures] /fills failed:", e.message)
      }

      try {
        const elements = await fetchFuturesExecutionsV2Raw(futCfg, Date.now() - 365 * 86400_000)
        for (const el of elements) {
          const row = mapExecutionV2ToRow(el, account.id)
          if (row && !allRows.has(row.kraken_trade_id)) allRows.set(row.kraken_trade_id, row)
        }
      } catch (e: any) {
        console.error("[kraken-futures] /executions failed:", e.message)
      }

      if (allRows.size === 0) {
        throw new Error("Kraken Futures: aucun fill récupéré")
      }

      console.log(`[kraken-futures] ${allRows.size} unique rows to upsert`)

      for (const row of Array.from(allRows.values())) {
        row.fx_rate_to_eur = await getHistoricalFxToEur(row.quote_currency, row.trade_date)
        const { data: existing } = await userClient
          .from("kraken_trades")
          .select("id")
          .eq("account_id", account.id)
          .eq("kraken_trade_id", row.kraken_trade_id)
          .maybeSingle()

        if (existing) {
          const { error: updErr } = await userClient.from("kraken_trades").update(row).eq("id", existing.id)
          if (updErr) console.error("[kraken-futures] UPDATE error:", updErr.code, updErr.message)
          else futuresResult.updated++
        } else {
          const { error: insErr } = await userClient.from("kraken_trades").insert(row)
          if (insErr) console.error("[kraken-futures] INSERT error:", insErr.code, insErr.message)
          else futuresResult.inserted++
        }
      }
    } catch (e: any) {
      console.error("[kraken-trades-sync] futures error:", e.message)
      errors.push(`Futures: ${e.message}`)
    }
  } else {
    console.log("[kraken-trades-sync] skipping futures — no credentials")
  }

  return { spot: spotResult, futures: futuresResult, crypto_swaps: cryptoSwapsResult, errors }
}

export function registerKrakenTradesRoutes(app: Express, supabase: SupabaseClient) {
  const auth = (req: Request, res: Response, next: NextFunction) => requireAuth(supabase, req, res, next)

  // ── GET /api/kraken/trades ────────────────────────────────
  app.get("/api/kraken/trades", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts").select("id").eq("user_id", userId).eq("broker", "Kraken").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.json({ trades: [], summary: null })

    const accountIds = accounts.map((a: any) => a.id)

    let query = userClient.from("kraken_trades").select("*").in("account_id", accountIds).order("trade_date", { ascending: false })
    if (req.query.market_type) query = query.eq("market_type", String(req.query.market_type))
    if (req.query.from_date) query = query.gte("trade_date", String(req.query.from_date))
    if (req.query.to_date) query = query.lte("trade_date", String(req.query.to_date))
    if (req.query.ticker) query = query.eq("ticker", String(req.query.ticker))
    if (req.query.realized_only !== "false") query = query.not("realized_pnl", "is", null)
    const limit = Math.min(Number(req.query.limit) || 50, 500)
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

    const best = realized.length > 0 ? realized.reduce((a: any, b: any) => pnlEur(b) > pnlEur(a) ? b : a) : null
    const worst = realized.length > 0 ? realized.reduce((a: any, b: any) => pnlEur(b) < pnlEur(a) ? b : a) : null

    const summary = {
      count: realized.length,
      realized_pnl_total_eur: realized.reduce((s: number, t: any) => s + pnlEur(t), 0),
      realized_pnl_winners_eur: winners.reduce((s: number, t: any) => s + pnlEur(t), 0),
      realized_pnl_losers_eur: losers.reduce((s: number, t: any) => s + pnlEur(t), 0),
      win_rate_pct: realized.length > 0 ? (winners.length / realized.length) * 100 : null,
      best_trade: best ? { ticker: best.ticker, realized_pnl_eur: pnlEur(best), trade_date: best.trade_date } : null,
      worst_trade: worst ? { ticker: worst.ticker, realized_pnl_eur: pnlEur(worst), trade_date: worst.trade_date } : null,
      total_fees_eur: safe.reduce((s: number, t: any) => s + (Number(t.fee) || 0) * fx(t), 0),
    }

    return res.json({ trades: safe, summary })
  })

  // ── GET /api/kraken/trades/futures/round-trips ────────────
  app.get("/api/kraken/trades/futures/round-trips", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts").select("*, kraken_futures_config(*)").eq("user_id", userId).eq("broker", "Kraken").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.json({ round_trips: [], open_positions: [] })

    const account = accounts[0]
    const accountIds = accounts.map((a: any) => a.id)
    const { data: fills, error } = await userClient
      .from("kraken_trades")
      .select("*")
      .in("account_id", accountIds)
      .eq("market_type", "futures")
      .order("trade_date", { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    const result = aggregateRoundTrips(fills || [])

    return res.json(result)
  })

  // ── GET /api/kraken/trades/spot/round-trips ──────────────
  app.get("/api/kraken/trades/spot/round-trips", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const includeFiat = req.query.include_fiat === "true"

    const { data: accounts } = await userClient
      .from("accounts").select("*, kraken_config(*)").eq("user_id", userId).eq("broker", "Kraken").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.json({ round_trips: [], open_positions: [] })

    const account = accounts[0]
    const accountIds = accounts.map((a: any) => a.id)
    const { data: fills, error } = await userClient
      .from("kraken_trades")
      .select("*")
      .in("account_id", accountIds)
      .eq("market_type", "spot")
      .order("trade_date", { ascending: true })

    if (error) return res.status(500).json({ error: error.message })

    const filtered = includeFiat
      ? (fills || [])
      : (fills || []).filter((f: any) => !isFiatFiatTrade(f))

    const result = aggregateRoundTrips(filtered, { allowShort: false, groupByQuote: true })

    return res.json(result)
  })

  // ── POST /api/kraken/trades/sync ──────────────────────────
  app.post("/api/kraken/trades/sync", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts").select("*, kraken_config(*), kraken_futures_config(*)").eq("user_id", userId).eq("broker", "Kraken").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.status(404).json({ error: "No Kraken account found" })
    const account = accounts[0]

    const result = await syncKrakenTradesForAccount(userClient, account)

    const ok = result.errors.length === 0
    let error_code: string | undefined
    let user_message: string | undefined
    if (!ok) {
      const msg = result.errors.join(" ")
      error_code = classifyError(msg)
      if (error_code === "PERMISSION_DENIED") {
        user_message = "Activer 'Query Open Orders & Trades' sur la clé API Futures Kraken"
      }
    }

    return res.json({
      ok,
      error: ok ? undefined : result.errors.join("; "),
      error_code,
      user_message,
      spot: result.spot,
      futures: result.futures,
      crypto_swaps: result.crypto_swaps,
    })
  })

  // ── POST /api/compta/crypto-swaps/backfill ─────────────────
  app.post("/api/compta/crypto-swaps/backfill", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts").select("*, kraken_config(*)").eq("user_id", userId).eq("broker", "Kraken").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.status(404).json({ error: "No Kraken account found" })
    const account = accounts[0]

    const spotConfig = account.kraken_config?.[0] || account.kraken_config
    if (!spotConfig?.api_key || !spotConfig?.api_secret) {
      return res.status(400).json({ error: "Missing Kraken spot API credentials" })
    }

    const krakenCfg: KrakenConfig = { apiKey: spotConfig.api_key, apiSecret: spotConfig.api_secret }
    const now = Math.floor(Date.now() / 1000)
    const start = now - 365 * 86400
    let offset = 0
    let total = 0
    const allTrades: Array<{ id: string; data: any }> = []

    try {
      do {
        const result = await krakenPrivateRequest("TradesHistory", {
          start: String(start),
          end: String(now),
          ofs: String(offset),
        }, krakenCfg)

        const trades = result?.trades ?? {}
        const entries = Object.entries(trades)
        total = Number(result?.count) || 0

        for (const [tradeId, raw] of entries) {
          allTrades.push({ id: tradeId, data: raw })
        }

        offset += entries.length
        if (entries.length < 50) break
        await new Promise(r => setTimeout(r, 1500))
      } while (offset < total)
    } catch (e: any) {
      return res.status(500).json({ error: `Kraken API error: ${e.message}` })
    }

    const backfillResult = { inserted: 0, updated: 0, needs_review: 0, total_scanned: allTrades.length }
    const errors: string[] = []

    for (const { id: tradeId, data: t } of allTrades) {
      const parsed = parseKrakenPair(t.pair || "")
      if (!parsed) continue
      if (QUASI_FIAT.has(parsed.ticker) || FIAT_LIKE_RAW.has(parsed.ticker)) continue
      if (QUASI_FIAT.has(parsed.quote)) continue

      try {
        const r = await upsertCryptoCryptoSwap(userClient, account.id, tradeId, parsed, t)
        if (r.inserted) backfillResult.inserted++
        if (r.updated) backfillResult.updated++
        if (r.needs_review) backfillResult.needs_review++
      } catch (e: any) {
        console.error("[kraken-backfill] crypto-crypto upsert error:", e.message)
        errors.push(`Crypto-swap ${tradeId}: ${e.message}`)
      }
    }

    return res.json({ ok: errors.length === 0, ...backfillResult, errors })
  })

  // ── POST /api/admin/recompute-fifo-pnl ──────────────────
  app.post("/api/admin/recompute-fifo-pnl", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts").select("id, label").eq("user_id", userId).eq("broker", "Kraken").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.status(404).json({ error: "No Kraken account found" })

    const results: { account: string; recalculated: number }[] = []
    for (const account of accounts) {
      const recalculated = await recalcFifoForAccount(userClient, account.id)
      results.push({ account: account.label || account.id, recalculated })
    }
    return res.json({ ok: true, results })
  })
}
