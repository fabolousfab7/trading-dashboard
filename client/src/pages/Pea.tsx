import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { RefreshCw, Plus, Trash2 } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import PositionNoteModal from "@/components/PositionNoteModal"
import AllocBar from "@/components/AllocBar"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55", "#9a988f", "#4a4540", "#d4a057", "#6b8f71", "#8b6b4a"]

const SECTOR_MAP: Record<string, string> = {
  "RMS": "Luxe",
  "MC": "Luxe",
  "EL": "Santé / Optique",
  "UBI": "Tech / Gaming",
  "ALCAP": "Immobilier",
}


interface Position {
  id: string
  account_id: string
  ticker: string
  name: string
  quantity: string | number
  avg_cost: string | number
  market_price: string | number
  currency: string
  previous_close?: string | number
}

interface CashBalance {
  currency: string
  amount: string | number
}

interface Account {
  id: string
  label: string
  broker: string
  currency_base?: string
  capital_invested?: string | number
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

export default function Pea() {
  const [account, setAccount] = useState<Account | null>(null)
  const [data, setData] = useState<{ positions: Position[]; cashBalances: CashBalance[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ ticker: "", name: "", quantity: "", avg_cost: "", stooq_symbol: "" })
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const r = await authFetch("/api/accounts")
      const { accounts } = await r.json()
      const pea = accounts?.find((a: Account) => a.broker === "Boursorama")
      if (!pea) { setLoading(false); return }
      setAccount(pea)
      const r2 = await authFetch(`/api/accounts/${pea.id}/portfolio`)
      setData(await r2.json())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  async function createPeaAccount() {
    setCreating(true); setError(null)
    try {
      const r = await authFetch("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ label: "PEA Boursorama", broker: "Boursorama", accountType: "personal", currencyBase: "EUR" }),
      })
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Failed") }
      await loadData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally { setCreating(false) }
  }

  async function addPosition() {
    if (!account) return
    setError(null)
    try {
      const body = {
        ticker: form.ticker.toUpperCase(),
        name: form.name || undefined,
        quantity: parseFloat(form.quantity),
        currency: "EUR",
        avg_cost: parseFloat(form.avg_cost),
        stooq_symbol: form.stooq_symbol || undefined,
      }
      const r = await authFetch(`/api/accounts/${account.id}/positions`, { method: "POST", body: JSON.stringify(body) })
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Failed") }
      setForm({ ticker: "", name: "", quantity: "", avg_cost: "", stooq_symbol: "" })
      setShowAddForm(false)
      await loadData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }

  async function deletePosition(positionId: string) {
    if (!confirm("Supprimer cette position ?")) return
    try {
      await authFetch(`/api/positions/${positionId}`, { method: "DELETE" })
      await loadData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }

  async function refreshPrices() {
    setRefreshing(true); setError(null)
    try {
      const r = await authFetch("/api/portfolio/refresh-prices")
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || "Refresh failed")
      await loadData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally { setRefreshing(false) }
  }

  if (loading) return <div className="p-8 text-[--ink2] font-mono text-sm">Chargement...</div>

  if (!account) {
    return (
      <div style={{ padding: "28px 32px" }}>
        <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            PEA Perso &middot; Boursorama
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Le PEA, en clair.
          </h1>
        </div>
        <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", borderRadius: 4, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--ink2)", fontFamily: "var(--font-mono)", fontSize: 13, marginBottom: 16 }}>Aucun compte PEA configuré</p>
          <button onClick={createPeaAccount} disabled={creating}
            style={{
              padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
              background: "var(--at-accent)", color: "var(--at-bg)", border: "none", borderRadius: 3,
              cursor: creating ? "wait" : "pointer", opacity: creating ? 0.5 : 1,
            }}>
            {creating ? "Création…" : "Créer le compte PEA"}
          </button>
          {error && <p style={{ color: "var(--at-neg)", fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>
      </div>
    )
  }

  const positions: Position[] = (data?.positions || []).filter((p) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    return qty !== 0 && price !== 0
  })
  const cashBalances: CashBalance[] = data?.cashBalances || []
  const positionsValue = positions.reduce((s, p) => s + Number(p.quantity) * Number(p.market_price), 0)
  const cashTotal = cashBalances.reduce((s, c) => s + Number(c.amount), 0)
  const totalValue = positionsValue + cashTotal

  const capitalInvested = Number(account.capital_invested) || 0
  const totalPerf = totalValue - capitalInvested
  const totalPerfPct = capitalInvested ? (totalPerf / capitalInvested) * 100 : 0

  const unrealizedPnl = positions.reduce((s, p) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    const cost = Number(p.avg_cost)
    return s + qty * (price - cost)
  }, 0)


  const sortedPositions = [...positions].sort((a, b) =>
    (Number(b.quantity) * Number(b.market_price)) - (Number(a.quantity) * Number(a.market_price))
  )

  const sectorMap: Record<string, number> = {}
  for (const p of positions) {
    const sector = SECTOR_MAP[p.ticker] || "Autre"
    const value = Number(p.quantity) * Number(p.market_price)
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
            PEA Perso &middot; Boursorama
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Le PEA, en clair.
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowAddForm(!showAddForm)}
              style={{
                padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                background: "var(--at-surface)", border: "1px solid var(--rule)", color: "var(--ink)", borderRadius: 3,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--at-bg)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--at-surface)" }}>
              <Plus size={12} />
              Position
            </button>
            <button onClick={refreshPrices} disabled={refreshing || positions.length === 0}
              style={{
                padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                background: "var(--at-accent)", border: "1px solid var(--at-accent)", color: "var(--at-bg)", borderRadius: 3,
                cursor: refreshing ? "wait" : "pointer", opacity: (refreshing || positions.length === 0) ? 0.5 : 1,
                display: "flex", alignItems: "center", gap: 6, transition: "opacity .15s",
              }}>
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              Rafraîchir prix
            </button>
          </div>
        </div>
      </div>

      {/* ── ERRORS ────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: "color-mix(in srgb, var(--at-neg) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--at-neg) 30%, transparent)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--at-neg)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{error}</span>
          <button onClick={() => setError(null)} style={{ color: "var(--at-neg)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* ── ADD FORM ──────────────────────────────────────────── */}
      {showAddForm && (
        <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", borderRadius: 4, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", marginBottom: 12 }}>
            Ajouter une position
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {[
              { placeholder: "Ticker (ex. EL)", key: "ticker" as const },
              { placeholder: "Nom (opt)", key: "name" as const },
              { placeholder: "Qté", key: "quantity" as const, type: "number" },
              { placeholder: "PRU €", key: "avg_cost" as const, type: "number" },
              { placeholder: "Stooq (ex. el.fr)", key: "stooq_symbol" as const },
            ].map(f => (
              <input key={f.key} type={f.type || "text"} step="any" placeholder={f.placeholder}
                value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                style={{
                  background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 3,
                  padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", outline: "none",
                }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={addPosition} disabled={!form.ticker || !form.quantity || !form.avg_cost}
              style={{
                padding: "6px 14px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                background: "var(--at-accent)", color: "var(--at-bg)", border: "none", borderRadius: 3,
                cursor: "pointer", opacity: (!form.ticker || !form.quantity || !form.avg_cost) ? 0.4 : 1,
              }}>
              Ajouter
            </button>
            <button onClick={() => setShowAddForm(false)}
              style={{
                padding: "6px 14px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                background: "transparent", border: "1px solid var(--rule)", color: "var(--ink2)", borderRadius: 3, cursor: "pointer",
              }}>
              Annuler
            </button>
          </div>
          <p style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "var(--font-mono)", marginTop: 8 }}>
            Stooq = symbole sur stooq.com (ex: el.fr, ri.fr, ubi.fr, p911.de). Si vide, on devine via Euronext Paris (.fr).
          </p>
        </div>
      )}

      {/* ── KPI ROW ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        {/* Valeur portefeuille */}
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Valeur portefeuille
            <InfoTip text="Somme (quantité × cours) + cash. Cours via Stooq / Yahoo Finance." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtEur(totalValue)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            Titres {fmtEur(positionsValue)} &middot; Cash {fmtEur(cashTotal)}
          </div>
        </div>

        {/* Perf totale */}
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Perf totale
            <InfoTip text="(Valeur − Capital versé) / Capital versé × 100. PEA exonéré d'IR après 5 ans (PS 17,2% restent)." />
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

        {/* Cash dispo */}
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Cash dispo
            <InfoTip text="Liquidités EUR immédiatement déployables sur le PEA." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtEur(cashTotal)}
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
              Aucune position. Clique "+ Position" pour en ajouter.
            </div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto", border: "1px solid var(--rule)", borderRadius: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--at-surface)", zIndex: 1 }}>
                    {["Ticker", "Nom", "Poids", "Qté", "PRU", "Cours", "Valeur", "Var jour", "P&L", ""].map((h, i) => (
                      <th key={h + i} style={{
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
                    const value = qty * price
                    const cost = qty * pru
                    const pnl = value - cost
                    const pnlPct = cost === 0 ? 0 : (pnl / cost) * 100
                    const weight = totalValue > 0 ? (value / totalValue) * 100 : 0

                    // TODO: brancher prev close dans l'API (regularMarketPreviousClose)
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
                          {p.name || "—"}
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <AllocBar value={weight} />
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {qty}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>
                          {pru.toFixed(2)} €
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {price.toFixed(2)} €
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {value.toFixed(2)} €
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: dayVar === null ? "var(--ink3)" : dayVar >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                          {dayVar === null ? "—" : `${dayVar >= 0 ? "+" : ""}${dayVar.toFixed(2)} %`}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          <span style={{ color: pnl >= 0 ? "var(--at-pos)" : "var(--at-neg)", fontWeight: 600 }}>
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(0)} €
                          </span>
                          <span style={{ color: "var(--ink3)", marginLeft: 6, fontSize: 10 }}>
                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right" }}>
                          <button onClick={e => { e.stopPropagation(); deletePosition(p.id) }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", transition: "color .15s" }}
                            onMouseEnter={e => { e.currentTarget.style.color = "var(--at-neg)" }}
                            onMouseLeave={e => { e.currentTarget.style.color = "var(--ink3)" }}>
                            <Trash2 size={12} />
                          </button>
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
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--ink)" }} labelStyle={{ color: "var(--ink2)" }}
                    formatter={(value: number, name: string) => [fmtEur(value), name]} />
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
          currency="EUR"
        />
      )}
    </div>
  )
}
