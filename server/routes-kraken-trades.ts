import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { krakenPrivateRequest, normalizeKrakenTicker, KrakenConfig } from "./kraken-api.js"
import { recalcFifoForAccount } from "./fifo-pnl.js"

const QUASI_FIAT = new Set(["EUR", "USD", "GBP", "JPY", "USDT", "USDC", "DAI"])

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
  if (/rate.?limit|too many|EAPI:Rate/i.test(msg)) return "RATE_LIMIT"
  if (/invalid.?key|permission|EAPI:Invalid key/i.test(msg)) return "INVALID_TOKEN"
  if (/timeout|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(msg)) return "NETWORK"
  return "UNKNOWN"
}

interface FuturesFill {
  fill_id: string
  side: string
  fillTime: string
  price: number
  size: number
  symbol: string
  fee?: number
  fee_currency?: string
}

async function fetchFuturesFills(config: { api_key: string; api_secret: string }): Promise<FuturesFill[]> {
  const { default: crypto } = await import("crypto")
  const endpoint = "/derivatives/api/v3/fills"
  const nonce = Date.now().toString()
  const postData = ""
  const sigPath = "/api/v3/fills"
  const message = postData + nonce + sigPath
  const sha256Hash = crypto.createHash("sha256").update(message).digest()
  const hmac = crypto.createHmac("sha512", Buffer.from(config.api_secret, "base64"))
  hmac.update(sha256Hash)
  const signature = hmac.digest("base64")

  const now = new Date()
  const since = new Date(now.getTime() - 365 * 86400_000)

  const url = `https://futures.kraken.com${endpoint}?lastFillTime=${since.toISOString()}`
  const res = await fetch(url, {
    method: "GET",
    headers: { APIKey: config.api_key, Nonce: nonce, Authent: signature, Accept: "application/json" },
  })
  if (!res.ok) throw new Error(`Kraken Futures fills HTTP ${res.status}`)
  const data = await res.json()
  if (data.result === "error" || data.error) {
    throw new Error(`Kraken Futures API error: ${JSON.stringify(data.error ?? data)}`)
  }
  return (data.fills ?? []) as FuturesFill[]
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
          const fxToEur = HARDCODED_FX[quote] ?? 1
          const side = (f.side || "").toLowerCase() === "sell" ? "SELL" : "BUY"
          const cost = f.price * f.size

          const row = {
            account_id: account.id,
            kraken_trade_id: f.fill_id,
            market_type: "futures",
            trade_date: f.fillTime || new Date().toISOString(),
            pair: f.symbol,
            ticker,
            quote_currency: quote,
            side,
            quantity: f.size,
            price: f.price,
            cost,
            fee: f.fee ?? 0,
            net_cash: side === "SELL" ? cost - (f.fee ?? 0) : -(cost + (f.fee ?? 0)),
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
    if (!ok) {
      const msg = errors.join(" ")
      error_code = classifyError(msg)
    }

    return res.json({
      ok,
      error: ok ? undefined : errors.join("; "),
      error_code,
      spot: spotResult,
      futures: futuresResult,
    })
  })
}
