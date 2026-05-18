import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { RefreshCw, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Link } from "wouter"
import InfoTip from "@/components/InfoTip"
import { useToast } from "@/hooks/use-toast"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55", "#9a988f", "#4a4540", "#d4a057", "#6b8f71", "#8b6b4a"]
const CASH_COLORS = ["#7d2b1d", "#cfb88f"]
const STABLECOINS = ["USDT", "USDC", "DAI", "BUSD", "TUSD", "UST"]

const tooltipStyle = {
  background: "var(--at-surface)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--ink)",
}

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n)
}

export default function Kraken() {
  const { toast } = useToast()
  const [portfolio, setPortfolio] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comptaCapital, setComptaCapital] = useState<number>(0)
  const [showConfig, setShowConfig] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [savingConfig, setSavingConfig] = useState(false)

  const [futuresConfig, setFuturesConfig] = useState<any>(null)
  const [futuresSyncing, setFuturesSyncing] = useState(false)
  const [showFuturesConfig, setShowFuturesConfig] = useState(false)
  const [futuresApiKey, setFuturesApiKey] = useState("")
  const [futuresApiSecret, setFuturesApiSecret] = useState("")
  const [savingFuturesConfig, setSavingFuturesConfig] = useState(false)

  async function fetchPortfolio() {
    setLoading(true); setError(null)
    try {
      const [r, capR] = await Promise.all([
        authFetch("/api/kraken/portfolio"),
        authFetch("/api/compta/capital-invested?category=512200"),
      ])
      const data = await r.json()
      setPortfolio(data)
      if (!data.hasCredentials) setShowConfig(true)

      if (data.account?.id) {
        try {
          const fR = await authFetch(`/api/kraken-futures/config?account_id=${data.account.id}`)
          const fData = await fR.json()
          setFuturesConfig(fData)
          if (!fData) setShowFuturesConfig(true)
        } catch {}
      }

      try {
        const capData = await capR.json()
        if (capData.capital_invested > 0) setComptaCapital(capData.capital_invested)
      } catch {}
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setLoading(false) }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const r = await authFetch("/api/kraken/sync", { method: "POST" })
      if (!r.ok) {
        const err = await r.json()
        toast({ title: "Erreur sync Spot", description: err.error })
      } else {
        const data = await r.json()
        toast({ title: "Sync Spot OK", description: data.message })
        fetchPortfolio()
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message })
    } finally { setSyncing(false) }
  }

  async function saveConfig() {
    if (!portfolio?.account) return
    setSavingConfig(true)
    try {
      const r = await authFetch("/api/kraken/config", {
        method: "PUT",
        body: JSON.stringify({ accountId: portfolio.account.id, apiKey, apiSecret }),
      })
      if (!r.ok) {
        const err = await r.json()
        toast({ title: "Erreur", description: err.error })
      } else {
        toast({ title: "Config sauvegardee", description: "Credentials API Kraken Spot enregistrees" })
        setShowConfig(false)
        fetchPortfolio()
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message })
    } finally { setSavingConfig(false) }
  }

  async function handleFuturesSync() {
    if (!portfolio?.account?.id) return
    setFuturesSyncing(true)
    try {
      const r = await authFetch("/api/kraken-futures/sync", {
        method: "POST",
        body: JSON.stringify({ account_id: portfolio.account.id }),
      })
      if (!r.ok) {
        const err = await r.json()
        toast({ title: "Erreur sync Futures", description: err.error })
      } else {
        toast({ title: "Sync Futures OK", description: "Positions et balances mises a jour" })
        fetchPortfolio()
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message })
    } finally { setFuturesSyncing(false) }
  }

  async function saveFuturesConfig() {
    if (!portfolio?.account?.id) return
    setSavingFuturesConfig(true)
    try {
      const r = await authFetch("/api/kraken-futures/config", {
        method: "PUT",
        body: JSON.stringify({ account_id: portfolio.account.id, api_key: futuresApiKey, api_secret: futuresApiSecret }),
      })
      if (!r.ok) {
        const err = await r.json()
        toast({ title: "Erreur", description: err.error })
      } else {
        toast({ title: "Config Futures sauvegardee" })
        setShowFuturesConfig(false)
        setFuturesApiKey("")
        setFuturesApiSecret("")
        fetchPortfolio()
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message })
    } finally { setSavingFuturesConfig(false) }
  }

  useEffect(() => { fetchPortfolio() }, [])

  if (loading) return <div style={{ padding: "28px 32px", color: "var(--ink2)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Chargement...</div>
  if (error) return <div style={{ padding: "28px 32px", color: "var(--at-neg)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Erreur : {error}</div>
  if (!portfolio?.account) {
    return (
      <div style={{ padding: "28px 32px", display: "flex", justifyContent: "center", paddingTop: 80 }}>
        <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", borderRadius: 4, padding: 24, textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Aucun compte Kraken</div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink3)" }}>
            Creez un compte avec le broker "Kraken" dans les parametres pour activer cette page.
          </p>
        </div>
      </div>
    )
  }

  const positions = portfolio.positions || []
  const cashBalances = portfolio.cashBalances || []

  const spotPositions = positions.filter((p: any) => p.asset_class !== "crypto_perp")
  const futuresPositions = positions.filter((p: any) => p.asset_class === "crypto_perp")
  const spotCash = cashBalances.filter((c: any) => !c.currency.startsWith("FUT:"))
  const futuresCash = cashBalances.filter((c: any) => c.currency.startsWith("FUT:"))

  const spotPositionsValue = spotPositions.reduce((s: number, p: any) => {
    const fx = Number(p.fx_rate_to_base) || 1
    return s + Number(p.quantity) * Number(p.market_price) * fx
  }, 0)
  const spotCashValue = spotCash.reduce((s: number, c: any) => {
    const fx = Number(c.fx_rate_to_base) || 1
    return s + Number(c.amount) * fx
  }, 0)
  const spotTotal = spotPositionsValue + spotCashValue

  const futuresPositionsValue = futuresPositions.reduce((s: number, p: any) => {
    const pnl = Number(p.unrealized_pnl) || 0
    const fx = Number(p.fx_rate_to_base) || 1
    return s + pnl * fx
  }, 0)
  const futuresCashValue = futuresCash.reduce((s: number, c: any) => {
    const fx = Number(c.fx_rate_to_base) || 1
    return s + Number(c.amount) * fx
  }, 0)
  const futuresTotal = futuresPositionsValue + futuresCashValue

  const nlv = spotTotal + futuresTotal
  const capital = comptaCapital || 0
  const pnl = capital > 0 ? nlv - capital : 0
  const perf = capital > 0 ? (pnl / capital) * 100 : 0

  const hasFuturesCreds = !!futuresConfig?.api_key

  return (
    <div style={{ padding: "28px 32px" }}>

      {/* MASTHEAD */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            Societe FHF &middot; Kraken Business
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Le carnet Kraken.
          </h1>
          {portfolio.lastSyncedAt && (
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
              Spot sync {new Date(portfolio.lastSyncedAt).toLocaleString("fr-FR")}
              {futuresConfig?.last_synced_at && (
                <> &middot; Futures sync {new Date(futuresConfig.last_synced_at).toLocaleString("fr-FR")}</>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSync} disabled={syncing || !portfolio.hasCredentials}
            style={{
              padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
              background: "var(--at-accent)", border: "1px solid var(--at-accent)", color: "var(--at-bg)", borderRadius: 3,
              cursor: syncing ? "wait" : "pointer", opacity: (syncing || !portfolio.hasCredentials) ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 6, transition: "opacity .15s",
            }}>
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sync..." : "Sync Spot"}
          </button>
          <button onClick={handleFuturesSync} disabled={futuresSyncing || !hasFuturesCreds}
            style={{
              padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
              background: "none", border: "1px solid var(--at-accent)", color: "var(--at-accent)", borderRadius: 3,
              cursor: futuresSyncing ? "wait" : "pointer", opacity: (futuresSyncing || !hasFuturesCreds) ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 6, transition: "opacity .15s",
            }}>
            <RefreshCw size={12} className={futuresSyncing ? "animate-spin" : ""} />
            {futuresSyncing ? "Sync..." : "Sync Futures"}
          </button>
        </div>
      </div>

      {/* CONSOLIDATED KPI — SPOT + FUTURES + TOTAL */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 28, border: "1px solid var(--rule)", borderRadius: 4, background: "var(--at-surface)" }}>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>Spot Wallet</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{fmtEur(spotTotal)}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>
            Crypto {fmtEur(spotPositionsValue)} &middot; Fiat {fmtEur(spotCashValue)}
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>Futures Wallet</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{fmtEur(futuresTotal)}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>
            Positions {fmtEur(futuresPositionsValue)} &middot; Cash {fmtEur(futuresCashValue)}
          </div>
        </div>
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>Total Kraken FHF</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--at-accent)", marginTop: 4 }}>{fmtEur(nlv)}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>
            Spot + Futures consolide
          </div>
        </div>
      </div>

      {/* SPOT CONFIG PANEL */}
      <div style={{ border: "1px solid var(--rule)", borderRadius: 4, background: "var(--at-surface)", marginBottom: 14 }}>
        <button onClick={() => setShowConfig(!showConfig)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: 12, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase",
            color: "var(--ink2)", background: "none", border: "none", cursor: "pointer",
          }}>
          <span>Configuration API Spot</span>
          {showConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showConfig && (
          <div style={{ padding: "0 16px 16px", borderTop: "1px dotted var(--rule)" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)", marginTop: 12, marginBottom: 12 }}>
              Creez une API key read-only sur kraken.com/u/security/api. Permissions requises : Query Funds.
            </p>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>API Key</label>
              <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Votre API key Kraken Spot"
                style={{ width: "100%", boxSizing: "border-box", background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 3, padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", outline: "none" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>API Secret</label>
              <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Votre API secret (base64)"
                style={{ width: "100%", boxSizing: "border-box", background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 3, padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", outline: "none" }} />
            </div>
            <button onClick={saveConfig} disabled={savingConfig || !apiKey || !apiSecret}
              style={{
                padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                background: "var(--at-accent)", border: "1px solid var(--at-accent)", color: "var(--at-bg)", borderRadius: 3,
                cursor: (savingConfig || !apiKey || !apiSecret) ? "wait" : "pointer", opacity: (savingConfig || !apiKey || !apiSecret) ? 0.5 : 1,
              }}>
              {savingConfig ? "..." : "Sauvegarder"}
            </button>
          </div>
        )}
      </div>

      {/* FUTURES CONFIG PANEL */}
      <div style={{ border: "1px solid var(--rule)", borderRadius: 4, background: "var(--at-surface)", marginBottom: 28 }}>
        <button onClick={() => setShowFuturesConfig(!showFuturesConfig)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: 12, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase",
            color: "var(--ink2)", background: "none", border: "none", cursor: "pointer",
          }}>
          <span>
            Configuration API Futures
            {futuresConfig?.api_key && (
              <span style={{ marginLeft: 8, fontSize: 10, color: "var(--ink3)", textTransform: "none", letterSpacing: 0 }}>
                ({futuresConfig.api_key})
              </span>
            )}
          </span>
          {showFuturesConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showFuturesConfig && (
          <div style={{ padding: "0 16px 16px", borderTop: "1px dotted var(--rule)" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)", marginTop: 12, marginBottom: 12 }}>
              Creez une API key Futures sur futures.kraken.com. C'est une paire separee de la Spot.
            </p>
            {futuresConfig?.last_sync_status && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: futuresConfig.last_sync_status === "success" ? "var(--at-pos)" : "var(--at-neg)", marginBottom: 12 }}>
                Dernier sync : {futuresConfig.last_sync_status}
                {futuresConfig.last_sync_error && ` — ${futuresConfig.last_sync_error}`}
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>API Key Futures</label>
              <input type="text" value={futuresApiKey} onChange={e => setFuturesApiKey(e.target.value)} placeholder="Votre API key Kraken Futures"
                style={{ width: "100%", boxSizing: "border-box", background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 3, padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", outline: "none" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>API Secret Futures</label>
              <input type="password" value={futuresApiSecret} onChange={e => setFuturesApiSecret(e.target.value)} placeholder="Votre API secret Futures (base64)"
                style={{ width: "100%", boxSizing: "border-box", background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 3, padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveFuturesConfig} disabled={savingFuturesConfig || !futuresApiKey || !futuresApiSecret}
                style={{
                  padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                  background: "var(--at-accent)", border: "1px solid var(--at-accent)", color: "var(--at-bg)", borderRadius: 3,
                  cursor: (savingFuturesConfig || !futuresApiKey || !futuresApiSecret) ? "wait" : "pointer",
                  opacity: (savingFuturesConfig || !futuresApiKey || !futuresApiSecret) ? 0.5 : 1,
                }}>
                {savingFuturesConfig ? "..." : "Enregistrer"}
              </button>
              {hasFuturesCreds && (
                <button onClick={handleFuturesSync} disabled={futuresSyncing}
                  style={{
                    padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                    background: "none", border: "1px solid var(--at-accent)", color: "var(--at-accent)", borderRadius: 3,
                    cursor: futuresSyncing ? "wait" : "pointer", opacity: futuresSyncing ? 0.5 : 1,
                  }}>
                  {futuresSyncing ? "..." : "Tester la connexion"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* KPI ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            NLV Kraken<InfoTip text="Net Liquidation Value = Spot + Futures consolide en EUR." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtEur(nlv)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            Spot {fmtEur(spotTotal)} &middot; Futures {fmtEur(futuresTotal)}
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Capital investi<InfoTip text="Montant total vire vers Kraken (compte comptable 512200)." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtEur(capital)}
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            P&L total<InfoTip text="NLV actuelle - Capital investi. Inclut Spot + Futures." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: pnl >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {pnl >= 0 ? "+" : ""}{fmtEur(pnl)}
          </div>
        </div>
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
            Perf totale
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: perf >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {perf >= 0 ? "+" : ""}{perf.toFixed(2)}%
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            P&L / Capital investi
          </div>
        </div>
      </div>

      {/* CHARTS — 3 donuts (Spot data) */}
      {spotPositions.length > 0 && (() => {
        const allocationData = spotPositions
          .map((p: any) => {
            const fx = Number(p.fx_rate_to_base) || 1
            return { name: p.ticker, value: Number(p.quantity) * Number(p.market_price) * fx }
          })
          .filter((d: any) => d.value > 0)
          .sort((a: any, b: any) => b.value - a.value)

        const allocTotal = allocationData.reduce((s: number, d: any) => s + d.value, 0)
        const threshold = allocTotal * 0.02
        const mainSlices = allocationData.filter((d: any) => d.value >= threshold)
        const othersValue = allocationData.filter((d: any) => d.value < threshold).reduce((s: number, d: any) => s + d.value, 0)
        if (othersValue > 0) mainSlices.push({ name: "Autres", value: othersValue })

        const stableValue = spotPositions.reduce((s: number, p: any) => {
          if (STABLECOINS.includes(p.ticker)) {
            const fx = Number(p.fx_rate_to_base) || 1
            return s + Number(p.quantity) * Number(p.market_price) * fx
          }
          return s
        }, 0)
        const nonStableValue = spotPositionsValue - stableValue
        const stableData = [
          { name: "Non-stable", value: nonStableValue },
          { name: "Stablecoins", value: stableValue },
        ].filter(d => d.value > 0)

        const cryptoVsFiat = [
          { name: "Crypto", value: spotPositionsValue },
          { name: "Fiat", value: spotCashValue },
        ].filter(d => d.value > 0)

        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, marginBottom: 28 }}>
            <DonutCard title="Allocation" subtitle="Par actif" data={mainSlices} colors={COLORS} total={allocTotal} showPct />
            <DonutCard title="Stables vs Crypto" subtitle="Repartition" data={stableData} colors={CASH_COLORS} total={0} />
            <DonutCard title="Fiat vs Crypto" subtitle="Liquidite" data={cryptoVsFiat} colors={[COLORS[2], COLORS[3]]} total={0} />
          </div>
        )
      })()}

      {/* SPOT POSITIONS TABLE */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Positions Spot</span>
          <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>{spotPositions.length} lignes</span>
        </div>
        {spotPositions.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
            {portfolio.hasCredentials ? "Aucune position Spot - Lancez un sync" : "Configurez vos API keys Spot puis lancez un sync"}
          </div>
        ) : (
          <div style={{ maxHeight: 520, overflowY: "auto", border: "1px solid var(--rule)", borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "var(--at-surface)", zIndex: 1 }}>
                  {["Ticker", "Nom", "Quantite", "Prix (USD)", "Valeur (EUR)", "P&L (EUR)", "% alloc"].map((h, i) => (
                    <th key={h} style={{
                      padding: "10px 12px", textAlign: i < 2 ? "left" : "right",
                      fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
                      borderBottom: "1px solid var(--rule)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...spotPositions].sort((a: any, b: any) => {
                  const fxA = Number(a.fx_rate_to_base) || 1, fxB = Number(b.fx_rate_to_base) || 1
                  return (Number(b.quantity) * Number(b.market_price) * fxB) - (Number(a.quantity) * Number(a.market_price) * fxA)
                }).map((p: any) => {
                  const qty = Number(p.quantity)
                  const price = Number(p.market_price)
                  const fx = Number(p.fx_rate_to_base) || 1
                  const valueEur = qty * price * fx
                  const pru = Number(p.avg_cost)
                  const pnlEur = (price - pru) * qty * fx
                  const allocPct = spotPositionsValue > 0 ? (valueEur / (spotPositionsValue + spotCashValue)) * 100 : 0
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px dotted var(--rule)", transition: "background .15s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--at-accent) 5%, transparent)" }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
                      <td style={{ padding: "9px 12px", fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)" }}>{p.ticker}</td>
                      <td style={{ padding: "9px 12px", fontStyle: "italic", color: "var(--ink3)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                        {qty < 1 ? qty.toFixed(6) : qty < 100 ? qty.toFixed(4) : qty.toFixed(2)}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>{fmtUsd(price)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtEur(valueEur)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: pnlEur >= 0 ? "var(--at-pos)" : "var(--at-neg)", fontWeight: 600 }}>
                        {pnlEur >= 0 ? "+" : ""}{fmtEur(pnlEur)}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>{allocPct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SPOT CASH BALANCES */}
      {spotCash.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Cash Spot</span>
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>{spotCash.length} devises</span>
          </div>
          <div style={{ border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "var(--at-surface)", zIndex: 1 }}>
                  {["Devise", "Montant", "Equivalent EUR"].map((h, i) => (
                    <th key={h} style={{
                      padding: "10px 12px", textAlign: i === 0 ? "left" : "right",
                      fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
                      borderBottom: "1px solid var(--rule)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spotCash.map((c: any) => {
                  const fx = Number(c.fx_rate_to_base) || 1
                  const eurValue = Number(c.amount) * fx
                  return (
                    <tr key={c.id || c.currency} style={{ borderBottom: "1px dotted var(--rule)" }}>
                      <td style={{ padding: "9px 12px", fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)" }}>{c.currency}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{Number(c.amount).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtEur(eurValue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* FUTURES WALLET SECTION                                */}
      {/* ══════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 20, marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <div>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Futures Wallet</span>
            {futuresConfig?.last_synced_at && (
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginLeft: 12 }}>
                Sync {new Date(futuresConfig.last_synced_at).toLocaleString("fr-FR")}
                {futuresConfig.last_sync_status === "error" && (
                  <span style={{ color: "var(--at-neg)" }}> — erreur</span>
                )}
              </span>
            )}
          </div>
          {!hasFuturesCreds && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink3)" }}>
              Configurez vos API keys Futures ci-dessus
            </span>
          )}
        </div>

        {/* Futures Positions */}
        {futuresPositions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Positions Ouvertes</span>
              <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>{futuresPositions.length} contrats</span>
            </div>
            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--at-surface)", zIndex: 1 }}>
                    {["Symbole", "Side", "Taille", "Prix Mark", "Prix Entree", "P&L Latent"].map((h, i) => (
                      <th key={h} style={{
                        padding: "10px 12px", textAlign: i < 2 ? "left" : "right",
                        fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
                        borderBottom: "1px solid var(--rule)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {futuresPositions.map((p: any) => {
                    const qty = Number(p.quantity)
                    const side = qty > 0 ? "Long" : "Short"
                    const size = Math.abs(qty)
                    const markPrice = Number(p.market_price)
                    const entryPrice = Number(p.avg_cost)
                    const pnlVal = (markPrice - entryPrice) * qty
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px dotted var(--rule)", transition: "background .15s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--at-accent) 5%, transparent)" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
                        <td style={{ padding: "9px 12px", fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)" }}>{p.ticker}</td>
                        <td style={{ padding: "9px 12px", color: qty > 0 ? "var(--at-pos)" : "var(--at-neg)", fontWeight: 600 }}>{side}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {size < 1 ? size.toFixed(6) : size.toFixed(4)}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>{fmtUsd(markPrice)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>{fmtUsd(entryPrice)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: pnlVal >= 0 ? "var(--at-pos)" : "var(--at-neg)", fontWeight: 600 }}>
                          {pnlVal >= 0 ? "+" : ""}{fmtUsd(pnlVal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Futures Cash Balances */}
        {futuresCash.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Cash Futures</span>
              <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>{futuresCash.length} devises</span>
            </div>
            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--at-surface)", zIndex: 1 }}>
                    {["Devise", "Montant", "Equivalent EUR"].map((h, i) => (
                      <th key={h} style={{
                        padding: "10px 12px", textAlign: i === 0 ? "left" : "right",
                        fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
                        borderBottom: "1px solid var(--rule)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {futuresCash.map((c: any) => {
                    const fx = Number(c.fx_rate_to_base) || 1
                    const eurValue = Number(c.amount) * fx
                    const displayCurrency = c.currency.replace("FUT:", "")
                    return (
                      <tr key={c.id || c.currency} style={{ borderBottom: "1px dotted var(--rule)" }}>
                        <td style={{ padding: "9px 12px", fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)" }}>{displayCurrency}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{Number(c.amount).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtEur(eurValue)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {futuresPositions.length === 0 && futuresCash.length === 0 && hasFuturesCreds && (
          <div style={{ padding: 32, textAlign: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, border: "1px solid var(--rule)", borderRadius: 4 }}>
            Aucune donnee Futures. Cliquez "Sync Futures" pour charger.
          </div>
        )}
      </div>

      {/* TRADING ACTIF LINK */}
      <div style={{ borderTop: "1px dotted var(--rule)", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Trading Actif</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>
            Les trades court terme Kraken sont suivis dans la page Trading Actif.
          </div>
        </div>
        <Link href="/analytics" style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--at-accent)", textDecoration: "none" }}>
          Voir <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  )
}

function DonutCard({ title, subtitle, data, colors, total, showPct }: {
  title: string; subtitle: string; data: { name: string; value: number }[]; colors: string[]; total: number; showPct?: boolean
}) {
  return (
    <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>{title}</span>
        <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>{subtitle}</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            outerRadius={65} innerRadius={38} strokeWidth={1.5} stroke="var(--at-bg)">
            {data.map((_: any, i: number) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [fmtEur(value), name]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        {data.map((d: any, i: number) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-serif)", color: "var(--ink2)", flex: 1 }}>{d.name}</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {showPct && total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : fmtEur(d.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
