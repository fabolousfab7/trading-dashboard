import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { syncKrakenFuturesAccount } from "./kraken-futures-api.js"

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

export function registerKrakenFuturesRoutes(app: Express, supabase: SupabaseClient) {
  const auth = (req: Request, res: Response, next: NextFunction) => requireAuth(supabase, req, res, next)

  app.get("/api/kraken-futures/config", auth, async (req: Request, res: Response) => {
    const accountId = req.query.account_id as string
    if (!accountId) return res.status(400).json({ error: "account_id requis" })

    const userClient = userScopedClient((req as any).userToken)
    const { data: account } = await userClient.from("accounts").select("id").eq("id", accountId).maybeSingle()
    if (!account) return res.status(404).json({ error: "Account not found" })

    const { data, error } = await userClient
      .from("kraken_futures_config")
      .select("account_id, api_key, last_synced_at, last_sync_status, last_sync_error")
      .eq("account_id", accountId)
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (data?.api_key) data.api_key = "••••" + data.api_key.slice(-4)
    res.json(data ?? null)
  })

  app.put("/api/kraken-futures/config", auth, async (req: Request, res: Response) => {
    const { account_id, api_key, api_secret } = req.body
    if (!account_id || !api_key || !api_secret) {
      return res.status(400).json({ error: "account_id, api_key, api_secret requis" })
    }

    const userClient = userScopedClient((req as any).userToken)
    const { data: account } = await userClient.from("accounts").select("id").eq("id", account_id).maybeSingle()
    if (!account) return res.status(404).json({ error: "Account not found" })

    const { error } = await userClient
      .from("kraken_futures_config")
      .upsert({
        account_id,
        api_key,
        api_secret,
        updated_at: new Date().toISOString(),
      }, { onConflict: "account_id" })

    if (error) return res.status(500).json({ error: error.message })
    res.json({ ok: true })
  })

  app.post("/api/kraken-futures/sync", auth, async (req: Request, res: Response) => {
    const accountId = req.body.account_id as string
    if (!accountId) return res.status(400).json({ error: "account_id requis" })

    const userClient = userScopedClient((req as any).userToken)
    const { data: account } = await userClient.from("accounts").select("id").eq("id", accountId).maybeSingle()
    if (!account) return res.status(404).json({ error: "Account not found" })

    const serviceClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
      const result = await syncKrakenFuturesAccount(serviceClient, accountId)
      res.json({ ok: true, ...result })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await serviceClient
        .from("kraken_futures_config")
        .update({ last_sync_status: "error", last_sync_error: msg })
        .eq("account_id", accountId)
      res.status(500).json({ error: msg })
    }
  })
}
