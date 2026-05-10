import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { krakenPrivateRequest, syncKrakenAccount, KrakenConfig } from "./kraken-api.js"

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

export function registerKrakenRoutes(app: Express, supabase: SupabaseClient) {
  const auth = (req: Request, res: Response, next: NextFunction) => requireAuth(supabase, req, res, next)

  app.get("/api/kraken/portfolio", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    try {
      const { data: accounts } = await userClient
        .from("accounts").select("*, kraken_config(*)").eq("broker", "Kraken")
      const account = accounts?.[0]
      if (!account) return res.json({ account: null, positions: [], cashBalances: [], synced: false })

      const { data: positions } = await userClient
        .from("positions").select("*").eq("account_id", account.id)
      const { data: cashBalances } = await userClient
        .from("cash_balances").select("*").eq("account_id", account.id)

      const config = account.kraken_config?.[0] || account.kraken_config
      const hasCreds = config?.api_key && config?.api_secret

      res.json({
        account,
        positions: (positions || []).filter((p: any) => Number(p.quantity) !== 0),
        cashBalances: cashBalances || [],
        synced: !!config?.last_synced_at,
        lastSyncedAt: config?.last_synced_at,
        hasCredentials: !!hasCreds,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.put("/api/kraken/config", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { accountId, apiKey, apiSecret } = req.body
    try {
      const { data: account } = await userClient
        .from("accounts").select("id").eq("id", accountId).single()
      if (!account) return res.status(404).json({ error: "Account not found" })

      const { data, error } = await userClient
        .from("kraken_config")
        .upsert({ account_id: accountId, api_key: apiKey, api_secret: apiSecret }, { onConflict: "account_id" })
        .select()
        .single()
      if (error) throw error
      res.json(data)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post("/api/kraken/sync", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    try {
      const { data: accounts } = await userClient
        .from("accounts").select("*, kraken_config(*)").eq("broker", "Kraken")
      const account = accounts?.[0]
      if (!account) return res.status(404).json({ error: "No Kraken account found" })

      const config = account.kraken_config?.[0] || account.kraken_config
      if (!config?.api_key || !config?.api_secret) {
        return res.status(400).json({ error: "Kraken API credentials not configured" })
      }

      const krakenCfg: KrakenConfig = { apiKey: config.api_key, apiSecret: config.api_secret }
      const result = await syncKrakenAccount(userClient, account, krakenCfg)

      res.json({
        ok: true,
        ...result,
        message: `Synced ${result.positions} crypto + ${result.fiat} fiat balances`,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get("/api/kraken/fees", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    try {
      const { data: accounts } = await userClient
        .from("accounts").select("*, kraken_config(*)").eq("broker", "Kraken")
      const account = accounts?.[0]
      if (!account) return res.json({ fees: 0, entries: [] })

      const config = account.kraken_config?.[0] || account.kraken_config
      if (!config?.api_key || !config?.api_secret) return res.json({ fees: 0, entries: [] })

      const krakenCfg: KrakenConfig = { apiKey: config.api_key, apiSecret: config.api_secret }

      const year = (req.query.year as string) || String(new Date().getFullYear())
      const start = Math.floor(new Date(`${year}-01-01`).getTime() / 1000)
      const end = Math.floor(new Date(`${year}-12-31T23:59:59`).getTime() / 1000)

      const result = await krakenPrivateRequest("Ledgers", {
        type: "trade",
        start: String(start),
        end: String(end),
      }, krakenCfg)

      const ledger = result?.ledger ? Object.values(result.ledger) : []
      const totalFees = (ledger as any[]).reduce((s, e) => s + Math.abs(Number(e.fee || 0)), 0)

      res.json({ fees: totalFees, count: ledger.length })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })
}
