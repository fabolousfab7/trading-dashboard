import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { krakenPrivateRequest, normalizeKrakenTicker, KrakenConfig } from "./kraken-api.js"
import { recalcFifoForAccount } from "./fifo-pnl.js"
import { buildSignedRequest, callFutures, type KrakenFuturesConfig } from "./kraken-futures-api.js"

const QUASI_FIAT = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "USDT", "USDC", "DAI"])
const FIAT_LIKE_RAW = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "USDT", "USDC", "DAI", "ZEUR", "ZUSD", "ZGBP", "ZJPY", "ZCHF"])

const HARDCODED_FX: Record<string, number> = { EUR: 1, USD: 0.92, GBP: 1.17, CHF: 1.05, JPY: 0.006, USDT: 0.92, USDC: 0.92, DAI: 0.92 }

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

interface FuturesFill {
  fill_id: string
  side: string
  fillType?: string
  fillTime: string
  price: number
  size: number
  symbol: string
  fee?: number
  fee_currency?: string
  paidPnL?: number
  collateralCurrency?: string
}

async function fetchFuturesFillsV3(config: KrakenFuturesConfig): Promise<FuturesFill[]> {
  const since = new Date(Date.now() - 30 * 86400_000)
  console.log(`[kraken-futures-fills] trying /derivatives/api/v3/fills since ${since.toISOString()}`)
  const data = await callFutures("/derivatives/api/v3/fills", config, {
    lastFillTime: since.toISOString(),
  })
  const fills = (data.fills ?? []) as FuturesFill[]
  console.log(`[kraken-futures-fills] /fills returned ${fills.length} fills`)
  return fills
}

async function fetchFuturesExecutionsV2(config: KrakenFuturesConfig, sinceMs: number): Promise<FuturesFill[]> {
  const allFills: FuturesFill[] = []
  let continuationToken: string | undefined

  do {
    const params: Record<string, string> = {
      since: String(sinceMs),
      before: String(Date.now()),
      sort: "asc",
    }
    if (continuationToken) params.continuationToken = continuationToken

    const { url, headers } = buildSignedRequest("/api/history/v2/executions", params, config)
    console.log(`[kraken-futures-fills] calling /api/history/v2/executions (token=${continuationToken ?? "none"})`)
    const res = await fetch(url, { method: "GET", headers })
    const body = await res.text()

    if (!res.ok) {
      throw new Error(`Kraken Futures /api/history/v2/executions HTTP ${res.status}: ${body.slice(0, 300)}`)
    }

    const data = JSON.parse(body)
    const elements = (data.elements ?? []) as Array<Record<string, unknown>>
    for (const el of elements) {
      const exec = (el.event as Record<string, unknown>) ?? el
      allFills.push({
        fill_id: String(exec.uid ?? exec.executionId ?? el.uid ?? ""),
        side: String(exec.direction ?? exec.side ?? "").toLowerCase(),
        fillType: String(exec.fillType ?? exec.executionType ?? ""),
        fillTime: String(exec.timestamp ?? el.timestamp ?? ""),
        price: Number(exec.price) || 0,
        size: Number(exec.quantity ?? exec.size) || 0,
        symbol: String(exec.instrument ?? exec.symbol ?? ""),
        fee: Number(exec.fee) || 0,
        paidPnL: exec.realizedPnl != null ? Number(exec.realizedPnl) : undefined,
        collateralCurrency: exec.collateral ? String(exec.collateral) : undefined,
      })
    }

    continuationToken = data.continuationToken ?? undefined
    if (continuationToken) await new Promise(r => setTimeout(r, 500))
  } while (continuationToken)

  console.log(`[kraken-futures-fills] /executions returned ${allFills.length} fills total`)
  return allFills
}

async function fetchFuturesFills(config: KrakenFuturesConfig): Promise<FuturesFill[]> {
  const fillsById = new Map<string, FuturesFill>()

  try {
    const recentFills = await fetchFuturesFillsV3(config)
    for (const f of recentFills) fillsById.set(f.fill_id, f)
  } catch (primaryErr: any) {
    console.error("[kraken-futures-fills] /fills failed:", primaryErr.message)
  }

  const historySinceMs = Date.now() - 365 * 86400_000
  try {
    const histFills = await fetchFuturesExecutionsV2(config, historySinceMs)
    for (const f of histFills) {
      if (!fillsById.has(f.fill_id)) fillsById.set(f.fill_id, f)
    }
  } catch (histErr: any) {
    console.error("[kraken-futures-fills] /executions failed:", histErr.message)
  }

  if (fillsById.size === 0) {
    throw new Error("Kraken Futures: aucun fill récupéré (fills + executions échoués)")
  }

  return Array.from(fillsById.values())
}

function futuresTickerFromSymbol(symbol: string): string {
  let s = symbol.toUpperCase()
  for (const prefix of ["PF_", "PI_", "FI_", "FF_"]) {
    if (s.startsWith(prefix)) s = s.slice(prefix.length)
  }
  for (const suffix of ["USD", "EUR", "GBP"]) {
    if (s.endsWith(suffix)) return s.slice(0, s.length - suffix.length)
  }
  return s
}

function futuresQuoteFromSymbol(symbol: string): string {
  const s = symbol.toUpperCase()
  for (const suffix of ["USD", "EUR", "GBP"]) {
    if (s.endsWith(suffix)) return suffix
  }
  return "USD"
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

  // ── POST /api/kraken/trades/sync ──────────────────────────
  app.post("/api/kraken/trades/sync", auth, async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)

    const { data: accounts } = await userClient
      .from("accounts").select("*, kraken_config(*), kraken_futures_config(*)").eq("user_id", userId).eq("broker", "Kraken").eq("is_active", true)
    if (!accounts || accounts.length === 0) return res.status(404).json({ error: "No Kraken account found" })
    const account = accounts[0]

    const spotResult = { inserted: 0, updated: 0, realized_recalc: 0 }
    const futuresResult = { inserted: 0, updated: 0 }
    const errors: string[] = []

    // ── Spot trades ──
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
          if (!QUASI_FIAT.has(parsed.quote)) continue
          if (QUASI_FIAT.has(parsed.ticker) || FIAT_LIKE_RAW.has(parsed.ticker)) continue

          const fxToEur = HARDCODED_FX[parsed.quote] ?? 1
          const side = (t.type || "").toLowerCase() === "sell" ? "SELL" : "BUY"
          const tradeTime = new Date(Number(t.time) * 1000).toISOString()

          const row = {
            account_id: account.id,
            kraken_trade_id: tradeId,
            market_type: "spot",
            trade_date: tradeTime,
            pair: t.pair,
            ticker: parsed.ticker,
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

    // ── Futures fills ──
    const futConfig = account.kraken_futures_config?.[0] || account.kraken_futures_config
    if (futConfig?.api_key && futConfig?.api_secret) {
      try {
        const fills = await fetchFuturesFills({ api_key: futConfig.api_key, api_secret: futConfig.api_secret })
        console.log(`[kraken-trades-sync] futures: fetched ${fills.length} fills`)

        for (const f of fills) {
          const ticker = futuresTickerFromSymbol(f.symbol)
          const quote = futuresQuoteFromSymbol(f.symbol)
          const pnlCurrency = f.collateralCurrency?.toUpperCase() || quote
          const fxToEur = HARDCODED_FX[pnlCurrency] ?? HARDCODED_FX[quote] ?? 1
          const rawSide = (f.side || "").toLowerCase()
          const fillType = (f.fillType || "").toLowerCase()
          const isClose = fillType === "close" || fillType === "liquidation"
          const side = isClose
            ? (rawSide === "buy" ? "CLOSE_SHORT" : "CLOSE_LONG")
            : (rawSide === "sell" ? "SELL" : "BUY")
          const cost = f.price * f.size
          const realizedPnl = isClose && f.paidPnL != null ? f.paidPnL : null

          const row = {
            account_id: account.id,
            kraken_trade_id: f.fill_id,
            market_type: "futures" as const,
            trade_date: f.fillTime || new Date().toISOString(),
            pair: f.symbol,
            ticker,
            quote_currency: quote,
            side,
            quantity: f.size,
            price: f.price,
            cost,
            fee: f.fee ?? 0,
            net_cash: rawSide === "sell" ? cost - (f.fee ?? 0) : -(cost + (f.fee ?? 0)),
            realized_pnl: realizedPnl,
            fx_rate_to_eur: fxToEur,
            source: "api_fills",
            raw_data: f,
          }

          const { data: existing } = await userClient
            .from("kraken_trades")
            .select("id")
            .eq("account_id", account.id)
            .eq("kraken_trade_id", f.fill_id)
            .maybeSingle()

          if (existing) {
            await userClient.from("kraken_trades").update(row).eq("id", existing.id)
            futuresResult.updated++
          } else {
            await userClient.from("kraken_trades").insert(row)
            futuresResult.inserted++
          }
        }
      } catch (e: any) {
        console.error("[kraken-trades-sync] futures error:", e.message)
        errors.push(`Futures: ${e.message}`)
      }
    } else {
      console.log("[kraken-trades-sync] skipping futures — no credentials")
    }

    const ok = errors.length === 0
    let error_code: string | undefined
    let user_message: string | undefined
    if (!ok) {
      const msg = errors.join(" ")
      error_code = classifyError(msg)
      if (error_code === "PERMISSION_DENIED") {
        user_message = "Activer 'Query Open Orders & Trades' sur la clé API Futures Kraken"
      }
    }

    return res.json({
      ok,
      error: ok ? undefined : errors.join("; "),
      error_code,
      user_message,
      spot: spotResult,
      futures: futuresResult,
    })
  })
}
