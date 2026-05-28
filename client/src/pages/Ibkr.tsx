import { useEffect, useState } from "react"
import { parseISO, format } from "date-fns"
import { fr } from "date-fns/locale"
import { supabase } from "@/lib/supabase"
import InfoTip from "@/components/InfoTip"
import PositionNoteModal from "@/components/PositionNoteModal"
import AllocBar from "@/components/AllocBar"
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
  unrealized_pnl?: string | number | null
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
  pricesLastRefreshedAt?: string | null
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

const CCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", JPY: "¥" }
function fmtCcy(n: number, ccy: string) {
  const s = CCY_SYMBOL[ccy] || ccy
  return `${n >= 0 ? "" : "-"}${Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${s}`
}

function formatTradeDate(raw: string | null | undefined): { date: string; time: string } {
  if (!raw) return { date: "—", time: "" }
  let s = raw.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
  const d = parseISO(s)
  if (isNaN(d.getTime())) return { date: "—", time: "" }
  return { date: format(d, "dd/MM/yy", { locale: fr }), time: format(d, "HH:mm", { locale: fr }) }
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
  const [error, setError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [comptaCapital, setComptaCapital] = useState<number | null>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [tradesSummary, setTradesSummary] = useState<any>(null)
  const [tradesRange, setTradesRange] = useState("30J")
  const [tradesSyncing, setTradesSyncing] = useState(false)
  const [tradesSyncMsg, setTradesSyncMsg] = useState<string | null>(null)
  const [showAllFills, setShowAllFills] = useState(false)

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

  useEffect(() => { loadData() }, [])

  function loadTrades() {
    const now = new Date()
    let fromDate = ""
    if (tradesRange === "30J") {
      const d = new Date(now); d.setDate(d.getDate() - 30); fromDate = d.toISOString().slice(0, 10)
    } else if (tradesRange === "90J") {
      const d = new Date(now); d.setDate(d.getDate() - 90); fromDate = d.toISOString().slice(0, 10)
    } else if (tradesRange === "YTD") {
      fromDate = `${now.getFullYear()}-01-01`
    } else if (tradesRange === "1A") {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1); fromDate = d.toISOString().slice(0, 10)
    }
    const qs = fromDate ? `?from_date=${fromDate}&limit=100` : "?limit=100"
    authFetch(`/api/ibkr/trades${qs}`)
      .then(r => r.ok ? r.json() : { trades: [], summary: null })
      .then(d => { setTrades(d.trades || []); setTradesSummary(d.summary || null) })
      .catch(() => {})
  }
  useEffect(() => { loadTrades() }, [tradesRange])

  async function syncTrades() {
    setTradesSyncing(true); setTradesSyncMsg(null)
    try {
      const r = await authFetch("/api/ibkr/trades/sync", { method: "POST" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Sync failed")
      if (d.ok === false) {
        const friendly: Record<string, string> = {
          RATE_LIMIT: "Rate limit IBKR atteint. Réessaie dans 10-15 minutes.",
          INVALID_TOKEN: "Token Flex IBKR invalide. Vérifie ibkr_config.flex_token.",
          QUERY_NOT_FOUND: "Query ID Trades invalide. Vérifie le trades_query_id.",
          NETWORK: "Erreur réseau IBKR. Réessaie dans quelques minutes.",
          PARSE_ERROR: "Réponse IBKR illisible (XML invalide).",
        }
        throw new Error(friendly[d.error_code] || d.error || "Erreur inconnue")
      }
      setTradesSyncMsg(`${d.trades_inserted} nouveaux · ${d.trades_updated} mis à jour`)
      loadTrades()
    } catch (e: any) {
      setTradesSyncMsg(`⚠ ${e.message}`)
    } finally { setTradesSyncing(false) }
  }

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
    if (p.unrealized_pnl != null) {
      return s + Number(p.unrealized_pnl) * fx
    }
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    const cost = Number(p.avg_cost)
    return s + (qty * (price - cost)) * fx
  }, 0)
  const capital = comptaCapital || Number(data.account?.capital_invested) || Number(data.latestSnapshot?.capital_invested) || 0
  const totalPerf = capital ? nlv - capital : 0
  const totalPerfPct = capital ? (totalPerf / capital) * 100 : 0

  const lastSyncedAt = data.ibkrSync?.last_synced_at
  const pricesRefreshedAt = data.pricesLastRefreshedAt

  function formatSyncDate(iso: string | null | undefined): string | null {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    if (isToday) return `auj. ${time}`
    return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${time}`
  }

  function isPricesStale(iso: string | null | undefined): boolean {
    if (!iso) return true
    const age = Date.now() - new Date(iso).getTime()
    const day = new Date().getDay()
    const maxAge = (day === 0 || day === 1) ? 3 * 24 * 3600_000 : 24 * 3600_000
    return age > maxAge
  }

  const pricesStr = formatSyncDate(pricesRefreshedAt)
  const syncStr = formatSyncDate(lastSyncedAt)
  const pricesStale = isPricesStale(pricesRefreshedAt)

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
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", color: "var(--ink3)", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            {pricesStr && (
              <span style={{ color: pricesStale ? "var(--red)" : "var(--green, #3a6e3f)" }}>
                Prix MAJ : {pricesStr}
              </span>
            )}
            {syncStr && (
              <span style={{ color: "var(--ink3)" }}>
                Positions synced : {syncStr}
              </span>
            )}
            <span>base {account?.currency_base || "EUR"}</span>
          </div>
        </div>
      </div>

      {/* ── ERRORS ────────────────────────────────────────────── */}
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
                    {["Ticker", "Nom", "Poids", "Qté", "PRU", "Cours", "Valeur", "Var jour", "P&L latent"].map((h, i) => (
                      <th key={h} style={{
                        padding: "10px 12px",
                        textAlign: i < 3 ? "left" : "right",
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
                    const pnlEur = p.unrealized_pnl != null
                      ? Number(p.unrealized_pnl) * fx
                      : (value - cost) * fx
                    const pnlPct = cost === 0 ? 0 : ((price - pru) / pru) * 100
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
                        <td style={{ padding: "9px 12px" }}>
                          <AllocBar value={nlv > 0 ? (valueFx / nlv) * 100 : 0} />
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
                          <span style={{ color: pnlEur >= 0 ? "var(--at-pos)" : "var(--at-neg)", fontWeight: 600 }}>
                            {pnlEur >= 0 ? "+" : ""}{pnlEur.toFixed(0)} €
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

      {/* ── TRADES RÉCENTS ─────────────────────────────────────── */}
      <div style={{ marginTop: 32, borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "var(--font-sans)", color: "var(--ink2)", fontWeight: 600 }}>
            Trades récents
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 2 }}>
              {(["30J", "90J", "YTD", "1A", "Tout"] as const).map(r => (
                <button key={r} onClick={() => setTradesRange(r)}
                  style={{
                    padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", borderRadius: 3, cursor: "pointer", border: "none", transition: "all .15s",
                    background: tradesRange === r ? "var(--at-accent)" : "transparent",
                    color: tradesRange === r ? "var(--at-bg)" : "var(--ink2)",
                  }}>
                  {r}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
              {(["Clôturés", "Tous"] as const).map(label => {
                const active = label === "Clôturés" ? !showAllFills : showAllFills
                return (
                  <button key={label} onClick={() => setShowAllFills(label === "Tous")}
                    style={{
                      padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", borderRadius: 3, cursor: "pointer", border: "none", transition: "all .15s",
                      background: active ? "var(--at-accent)" : "transparent",
                      color: active ? "var(--at-bg)" : "var(--ink2)",
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>
            <button onClick={syncTrades} disabled={tradesSyncing}
              style={{
                padding: "4px 12px", fontSize: 10, fontFamily: "var(--font-mono)", borderRadius: 3, cursor: tradesSyncing ? "wait" : "pointer",
                border: "1px solid var(--rule)", background: "var(--at-surface)", color: "var(--ink2)", transition: "all .15s", opacity: tradesSyncing ? 0.6 : 1,
              }}>
              {tradesSyncing ? "Sync…" : "Sync trades"}
            </button>
            {tradesSyncMsg && (
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: tradesSyncMsg.startsWith("⚠") ? "var(--at-neg)" : "var(--at-pos)" }}>
                {tradesSyncMsg}
              </span>
            )}
          </div>
        </div>

        {(() => {
          const closedTrades = trades.filter((t: any) => t.side === "SELL" && t.realized_pnl != null && Number(t.realized_pnl) !== 0)
          const displayTrades = showAllFills ? trades : closedTrades
          if (displayTrades.length === 0) return (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink3)", textAlign: "center", padding: "28px 0", lineHeight: 1.7 }}>
              {trades.length === 0
                ? <>Aucun trade enregistré.<br />Configurez votre Flex Query Trades dans Settings pour syncer.</>
                : "Aucun trade clôturé sur la période."}
            </div>
          )
          const thStyle = (right?: boolean): React.CSSProperties => ({
            padding: "10px 12px", textAlign: right ? "right" : "left",
            fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
            borderBottom: "1px solid var(--rule)",
          })
          const tdNum: React.CSSProperties = { padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }
          const sells = trades.filter((t: any) => t.side === "SELL" && t.realized_pnl != null)
          const winners = sells.filter((t: any) => Number(t.realized_pnl) > 0)
          const statsLine = sells.length > 0 ? (() => {
            const wr = sells.length > 0 ? Math.round((winners.length / sells.length) * 100) : 0
            const sorted = [...sells].sort((a: any, b: any) => (Number(b.realized_pnl) * (Number(b.fx_rate_to_eur) || 1)) - (Number(a.realized_pnl) * (Number(a.fx_rate_to_eur) || 1)))
            const best = sorted[0]
            const worst = sorted[sorted.length - 1]
            const fmtP = (t: any) => fmtEur(Number(t.realized_pnl) * (Number(t.fx_rate_to_eur) || 1))
            return `${sells.length} clôture${sells.length > 1 ? "s" : ""} · ${wr}% gagnante${wr !== 1 ? "s" : ""} · meilleur : ${best.ticker} +${fmtP(best)} · pire : ${worst.ticker} ${fmtP(worst)}`
          })() : null
          return (
            <>
              <div style={{ border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--at-surface)" }}>
                      <th style={thStyle()}>Date</th>
                      <th style={thStyle()}>Heure</th>
                      <th style={thStyle()}>Ticker</th>
                      <th style={thStyle()}>Nom</th>
                      <th style={thStyle()}>Side</th>
                      <th style={thStyle(true)}>Qté</th>
                      <th style={thStyle(true)}>Prix</th>
                      <th style={thStyle(true)}>Net</th>
                      <th style={thStyle(true)}>Frais</th>
                      <th style={thStyle(true)}>PnL R.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTrades.map((t: any) => {
                      const pnl = t.realized_pnl != null ? Number(t.realized_pnl) : null
                      const pnlColor = pnl == null ? "var(--ink3)" : pnl > 0 ? "var(--at-pos)" : pnl < 0 ? "var(--at-neg)" : "var(--ink3)"
                      const isSell = t.side === "SELL"
                      const td = formatTradeDate(t.trade_date)
                      const ccy = t.currency || "EUR"
                      return (
                        <tr key={t.id || t.ibkr_trade_id} style={{ borderBottom: "1px dotted var(--rule)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--ink2)", whiteSpace: "nowrap" }}>{td.date}</td>
                          <td style={{ padding: "8px 12px", fontSize: 10, color: "var(--ink3)", whiteSpace: "nowrap" }}>{td.time || "—"}</td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)" }}>{t.ticker}</td>
                          <td style={{ padding: "8px 12px", fontStyle: "italic", color: "var(--ink3)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {(t.name || "").slice(0, 25)}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                              background: isSell ? "var(--at-neg)" : "var(--at-pos)", color: "var(--at-bg)",
                            }}>
                              {t.side}
                            </span>
                          </td>
                          <td style={tdNum}>{Number(t.quantity)}</td>
                          <td style={tdNum}>{fmtCcy(Number(t.price), ccy)}</td>
                          <td style={tdNum}>{t.net_cash != null ? fmtCcy(Number(t.net_cash), ccy) : "—"}</td>
                          <td style={{ ...tdNum, color: "var(--ink3)" }}>{t.commission != null ? fmtCcy(-Math.abs(Number(t.commission)), ccy) : "—"}</td>
                          <td style={{ ...tdNum, fontWeight: 600, color: pnlColor }}>
                            {pnl != null ? (pnl >= 0 ? "+" : "") + fmtCcy(pnl, ccy) : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {tradesSummary && (
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--ink)", background: "var(--at-surface)" }}>
                        <td colSpan={7} style={{ padding: "10px 12px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink2)" }}>
                          Total · en €
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--ink)" }}>
                          {tradesSummary.total_net_cash_eur != null ? (tradesSummary.total_net_cash_eur >= 0 ? "+" : "") + fmtEur(tradesSummary.total_net_cash_eur) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--ink3)" }}>
                          {tradesSummary.total_commissions_eur != null ? fmtEur(-Math.abs(tradesSummary.total_commissions_eur)) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: (tradesSummary.realized_pnl_total_eur ?? 0) >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                          {tradesSummary.realized_pnl_total_eur != null ? (tradesSummary.realized_pnl_total_eur >= 0 ? "+" : "") + fmtEur(tradesSummary.realized_pnl_total_eur) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {tradesSummary && (
                <div style={{ fontSize: 10, fontStyle: "italic", color: "var(--ink3)", fontFamily: "var(--font-serif)", marginTop: 6 }}>
                  Conversion EUR au taux FX du jour du trade
                </div>
              )}
              {statsLine && (
                <div style={{ fontSize: 11, fontStyle: "italic", color: "var(--ink2)", fontFamily: "var(--font-serif)", marginTop: 4 }}>
                  {statsLine}
                </div>
              )}
            </>
          )
        })()}
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
