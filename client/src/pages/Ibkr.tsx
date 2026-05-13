import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { RefreshCw } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import PositionNoteModal from "@/components/PositionNoteModal"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55", "#9a988f", "#4a4540", "#d4a057", "#6b8f71", "#8b6b4a"]

const IBKR_SECTOR: Record<string, string> = {
  "AI": "Tech / IA",
  "BKKT": "Crypto / Fintech",
  "CRCL": "Crypto / Fintech",
  "FLUT": "Paris sportifs",
  "NIO": "Auto / EV",
  "PATH": "Tech / RPA",
  "PUBM": "Tech / AdTech",
  "RACE": "Auto / Luxe",
  "RIVN": "Auto / EV",
  "SBET": "Tech / iGaming",
  "SNOW": "Tech / Cloud",
  "EL": "Luxe",
  "P911": "Auto / Luxe",
  "RI": "Spiritueux",
  "UBI": "Tech / Gaming",
}

interface Position {
  id: string
  account_id: string
  ticker: string
  name: string
  quantity: string | number
  avg_cost: string | number
  market_price: string | number
  fx_rate_to_base?: string | number
  currency: string
  previous_close?: string | number
}

interface CashBalance {
  currency: string
  amount: string | number
  fx_rate_to_base?: string | number
}

interface IbkrSync {
  last_synced_at?: string
}

interface Account {
  id: string
  label: string
  broker: string
  ibkr_account_number?: string
  currency_base?: string
  capital_invested?: string | number
}

interface PortfolioData {
  positions: Position[]
  cashBalances: CashBalance[]
  latestSnapshot?: { capital_invested?: string | number }
  account?: { capital_invested?: string | number }
  ibkrSync?: IbkrSync
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

const tooltipStyle = {
  background: "var(--at-surface)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontFamily: "'Geist Mono', monospace",
  fontSize: 12,
  color: "var(--ink)",
}

export default function Ibkr() {
  const [account, setAccount] = useState<Account | null>(null)
  const [data, setData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [comptaCapital, setComptaCapital] = useState<number | null>(null)

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const r = await authFetch("/api/accounts")
      const { accounts } = await r.json()
      const fhf = accounts?.find((a: Account) => a.broker === "IBKR")
      if (!fhf) { setError("Aucun compte IBKR"); return }
      setAccount(fhf)
      const [r2, capR] = await Promise.all([
        authFetch(`/api/accounts/${fhf.id}/portfolio`),
        authFetch("/api/compta/capital-invested?category=512100"),
      ])
      setData(await r2.json())
      try {
        const capData = await capR.json()
        if (capData.capital_invested > 0) setComptaCapital(capData.capital_invested)
      } catch { /* ignore */ }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally { setLoading(false) }
  }

  async function refreshPrices() {
    setRefreshing(true); setRefreshError(null)
    try {
      const r = await authFetch("/api/portfolio/refresh-prices")
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || "Refresh failed")
      await loadData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setRefreshError(msg)
    } finally { setRefreshing(false) }
  }

  async function syncIbkr(force = false) {
    if (!account?.id) return
    setSyncing(true); setSyncError(null); setSyncSuccess(null)
    try {
      const url = `/api/accounts/${account.id}/sync${force ? "?force=true" : ""}`
      const r = await authFetch(url, { method: "POST" })
      const text = await r.text()
      let result: { error?: string; positionsCount?: number; syncedAt?: string }
      try {
        result = JSON.parse(text)
      } catch {
        if (text.includes("timed out") || text.includes("Timeout")) {
          throw new Error("Timeout réseau côté IBKR, réessaie dans quelques minutes.")
        }
        throw new Error(`Erreur serveur (HTTP ${r.status})`)
      }
      if (!r.ok) throw new Error(result.error || `Sync failed (HTTP ${r.status})`)
      const time = result.syncedAt
        ? new Date(result.syncedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      setSyncSuccess(`Sync OK · ${result.positionsCount ?? "?"} positions · ${time}`)
      await loadData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSyncError(msg)
    } finally { setSyncing(false) }
  }

  useEffect(() => { loadData() }, [])

  if (loading) return <div className="p-8 text-[--ink2] font-mono text-sm">Chargement...</div>
  if (error && !data) return <div className="p-8 text-[--at-neg] font-mono text-sm">Erreur : {error}</div>
  if (!data) return null

  const positions: Position[] = (data.positions || []).filter((p) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    return qty !== 0 && price !== 0
  })
  const cashBalances = data.cashBalances || []

  const positionsBase = positions.reduce((s, p) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    return s + Number(p.quantity) * Number(p.market_price) * fx
  }, 0)
  const cashBase = cashBalances.reduce((s, c) => {
    const fx = c.fx_rate_to_base ? Number(c.fx_rate_to_base) : 1
    return s + Number(c.amount) * fx
  }, 0)
  const nlv = positionsBase + cashBase
  const unrealizedPnl = positions.reduce((s, p) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    const cost = Number(p.avg_cost)
    return s + (qty * (price - cost)) * fx
  }, 0)
  const capital = comptaCapital || Number(data.account?.capital_invested) || Number(data.latestSnapshot?.capital_invested) || 0
  const totalPerf = capital ? nlv - capital : 0
  const totalPerfPct = capital ? (totalPerf / capital) * 100 : 0

  const lastSyncedAt = data.ibkrSync?.last_synced_at
  const syncTimeStr = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null

  const sortedPositions = [...positions].sort((a, b) => {
    const fxA = Number(a.fx_rate_to_base) || 1
    const fxB = Number(b.fx_rate_to_base) || 1
    return (Number(b.quantity) * Number(b.market_price) * fxB) - (Number(a.quantity) * Number(a.market_price) * fxA)
  })

  const sectorMap: Record<string, number> = {}
  for (const p of positions) {
    const sector = IBKR_SECTOR[p.ticker] || "Autres"
    const fx = Number(p.fx_rate_to_base) || 1
    const value = Number(p.quantity) * Number(p.market_price) * fx
    sectorMap[sector] = (sectorMap[sector] || 0) + value
  }
  const sectorData = Object.entries(sectorMap)
    .map(([name, value]) => ({ name, value }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
  const sectorTotal = sectorData.reduce((s, d) => s + d.value, 0)

  return (
    <div style={{ padding: "28px 32px" }}>

      {/* ── MASTHEAD ──────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            Société FHF &middot; compte titres IBKR
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Le carnet d'ordres.
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={refreshPrices} disabled={refreshing}
              style={{
                padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                background: "var(--at-surface)", border: "1px solid var(--rule)", color: "var(--ink)", borderRadius: 3,
                cursor: refreshing ? "wait" : "pointer", opacity: refreshing ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6,
                transition: "background .15s",
              }}
              onMouseEnter={e => { if (!refreshing) e.currentTarget.style.background = "var(--at-bg)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--at-surface)" }}>
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              Rafraîchir prix
            </button>
            <button onClick={() => syncIbkr(false)} disabled={syncing}
              style={{
                padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                background: "var(--at-accent)", border: "1px solid var(--at-accent)", color: "var(--at-bg)", borderRadius: 3,
                cursor: syncing ? "wait" : "pointer", opacity: syncing ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6,
                transition: "opacity .15s",
              }}>
              <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
              Sync IBKR Flex
            </button>
            <button onClick={() => syncIbkr(true)} disabled={syncing}
              style={{
                padding: "8px 10px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                background: "transparent", border: "1px solid var(--rule)", color: "var(--ink2)", borderRadius: 3,
                cursor: syncing ? "wait" : "pointer", opacity: syncing ? 0.5 : 1,
                transition: "background .15s",
              }}
              onMouseEnter={e => { if (!syncing) e.currentTarget.style.background = "var(--at-bg)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
              Forcer
            </button>
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", color: "var(--ink3)", marginTop: 6 }}>
            {syncing
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <RefreshCw size={10} className="animate-spin" style={{ color: "var(--ink3)" }} />
                  Synchronisation…
                </span>
              : syncTimeStr
                ? <>Synced à {syncTimeStr} &middot; base {account?.currency_base || "EUR"}</>
                : <>base {account?.currency_base || "EUR"}</>
            }
          </div>
        </div>
      </div>

      {/* ── ERRORS ────────────────────────────────────────────── */}
      {refreshError && (
        <div style={{ background: "color-mix(in srgb, var(--at-neg) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--at-neg) 30%, transparent)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--at-neg)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{refreshError}</span>
          <button onClick={() => setRefreshError(null)} style={{ color: "var(--at-neg)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12 }}>✕</button>
        </div>
      )}
      {syncError && (
        <div style={{ background: "color-mix(in srgb, var(--at-neg) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--at-neg) 30%, transparent)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--at-neg)", fontSize: 12, fontFamily: "var(--font-mono)" }}>Sync : {syncError}</span>
          <button onClick={() => setSyncError(null)} style={{ color: "var(--at-neg)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12 }}>✕</button>
        </div>
      )}
      {syncSuccess && (
        <div style={{ background: "color-mix(in srgb, var(--at-pos) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--at-pos) 30%, transparent)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--at-pos)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{syncSuccess}</span>
          <button onClick={() => setSyncSuccess(null)} style={{ color: "var(--at-pos)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* ── KPI ROW ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        {/* NLV */}
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            NLV totale
            <InfoTip text="Net Liquidation Value = Cash + Valeur marchande des positions. Sync IBKR Flex Query quotidienne 22h UTC." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtEur(nlv)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            Positions {fmtEur(positionsBase)} &middot; Cash {fmtEur(cashBase)}
          </div>
        </div>

        {/* Perf totale */}
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Perf totale
            <InfoTip text="(NLV actuelle − Capital investi) / Capital investi × 100. Inclut P&L réalisé + latent + dividendes − commissions." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: totalPerf >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {totalPerf >= 0 ? "+" : ""}{fmtEur(totalPerf)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            {totalPerfPct >= 0 ? "+" : ""}{totalPerfPct.toFixed(2)} %
          </div>
        </div>

        {/* P&L latent */}
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
            P&L latent
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: unrealizedPnl >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {unrealizedPnl >= 0 ? "+" : ""}{fmtEur(unrealizedPnl)}
          </div>
        </div>

        {/* Cash net */}
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
            Cash net
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtEur(cashBase)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            {cashBalances.map((c) => `${Number(c.amount).toFixed(0)} ${c.currency}`).join(" · ")}
          </div>
        </div>
      </div>

      {/* ── GRID 2:1 — TABLE + DONUT ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "2.1fr 1fr", gap: 28, alignItems: "start" }}>

        {/* LEFT — Positions table */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>
              Positions ouvertes
            </span>
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
              {positions.length} lignes &middot; classées par valeur
            </span>
          </div>

          {positions.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Aucune position ouverte
            </div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto", border: "1px solid var(--rule)", borderRadius: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--at-surface)", zIndex: 1 }}>
                    {["Ticker", "Nom", "Qté", "PRU", "Cours", "Valeur", "Var jour", "P&L latent"].map((h, i) => (
                      <th key={h} style={{
                        padding: "10px 12px",
                        textAlign: i < 2 ? "left" : "right",
                        fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
                        borderBottom: "1px solid var(--rule)",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((p) => {
                    const qty = Number(p.quantity)
                    const pru = Number(p.avg_cost)
                    const price = Number(p.market_price)
                    const fx = Number(p.fx_rate_to_base) || 1
                    const value = qty * price
                    const valueFx = value * fx
                    const cost = qty * pru
                    const pnl = value - cost
                    const pnlPct = cost === 0 ? 0 : (pnl / cost) * 100
                    const sym = p.currency === "USD" ? "$" : "€"

                    // TODO: brancher prev close dans l'API (regularMarketPreviousClose depuis Yahoo)
                    const prevClose = p.previous_close ? Number(p.previous_close) : null
                    const dayVar = prevClose && prevClose > 0
                      ? ((price - prevClose) / prevClose) * 100
                      : null

                    return (
                      <tr key={p.id}
                        onClick={() => setSelectedPosition(p)}
                        style={{ borderBottom: "1px dotted var(--rule)", cursor: "pointer", transition: "background .15s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--at-accent) 5%, transparent)" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
                        <td style={{ padding: "9px 12px", fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)" }}>
                          {p.ticker}
                        </td>
                        <td style={{ padding: "9px 12px", fontStyle: "italic", color: "var(--ink3)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {qty}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>
                          {pru.toFixed(2)} {sym}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {price.toFixed(2)} {sym}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {value.toFixed(2)} {sym}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: dayVar === null ? "var(--ink3)" : dayVar >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                          {dayVar === null ? "—" : `${dayVar >= 0 ? "+" : ""}${dayVar.toFixed(2)} %`}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          <span style={{ color: pnl >= 0 ? "var(--at-pos)" : "var(--at-neg)", fontWeight: 600 }}>
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(0)} {sym}
                          </span>
                          <span style={{ color: "var(--ink3)", marginLeft: 6, fontSize: 10 }}>
                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT — Sector allocation donut */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>
              Allocation
            </span>
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
              Par secteur
            </span>
          </div>

          {sectorData.length > 0 && (
            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={sectorData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={70} innerRadius={48} strokeWidth={1.5} stroke="var(--at-bg)">
                    {sectorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: "var(--ink)" }}
                    labelStyle={{ color: "var(--ink2)" }}
                    formatter={(value: number, name: string) => [fmtEur(value), name]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                {sectorData.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-serif)", color: "var(--ink2)", flex: 1 }}>{d.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                      {((d.value / sectorTotal) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── POSITION NOTE MODAL ───────────────────────────────── */}
      {selectedPosition && (
        <PositionNoteModal
          isOpen={!!selectedPosition}
          onClose={() => setSelectedPosition(null)}
          ticker={selectedPosition.ticker}
          accountId={selectedPosition.account_id}
          positionId={selectedPosition.id}
          currency={selectedPosition.currency || "EUR"}
        />
      )}
    </div>
  )
}
