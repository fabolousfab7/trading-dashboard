import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Wallet, RefreshCw, Plus, Trash2 } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import PositionNoteModal from "@/components/PositionNoteModal"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#06b6d4", "#e879f9", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#c084fc", "#fb923c", "#4ade80"]

const SECTOR_MAP: Record<string, string> = {
  "RMS": "Luxe",
  "MC": "Luxe",
  "EL": "Santé / Optique",
  "UBI": "Tech / Gaming",
  "ALCAP": "Immobilier",
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
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n)
}

export default function Pea() {
  const [account, setAccount] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ ticker: "", name: "", quantity: "", avg_cost: "", stooq_symbol: "" })
  const [selectedPosition, setSelectedPosition] = useState<any>(null)

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const r = await authFetch("/api/accounts")
      const { accounts } = await r.json()
      const pea = accounts?.find((a: any) => a.broker === "Boursorama")
      if (!pea) { setLoading(false); return }
      setAccount(pea)
      const r2 = await authFetch(`/api/accounts/${pea.id}/portfolio`)
      setData(await r2.json())
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  async function createPeaAccount() {
    setCreating(true); setError(null)
    try {
      const r = await authFetch("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          label: "PEA Boursorama",
          broker: "Boursorama",
          accountType: "personal",
          currencyBase: "EUR",
        }),
      })
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Failed") }
      await loadData()
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setCreating(false) }
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
      const r = await authFetch(`/api/accounts/${account.id}/positions`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Failed") }
      setForm({ ticker: "", name: "", quantity: "", avg_cost: "", stooq_symbol: "" })
      setShowAddForm(false)
      await loadData()
    } catch (e: any) { setError(String(e.message || e)) }
  }

  async function deletePosition(positionId: string) {
    if (!confirm("Supprimer cette position ?")) return
    try {
      await authFetch(`/api/positions/${positionId}`, { method: "DELETE" })
      await loadData()
    } catch (e: any) { setError(String(e.message || e)) }
  }

  async function refreshPrices() {
    if (!account) return
    setRefreshing(true); setError(null)
    try {
      const r = await authFetch(`/api/accounts/${account.id}/refresh-prices`, { method: "POST" })
      const result = await r.json()
      if (result.failed > 0 && result.failedTickers?.length) {
        setError(`Échec sur : ${result.failedTickers.join(", ")} — vérifie le stooq_symbol`)
      }
      await loadData()
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setRefreshing(false) }
  }

  if (loading) return <div className="p-8 text-zinc-400 font-mono text-sm">Chargement...</div>

  if (!account) {
    return (
      <div className="p-6 space-y-6">
        <div className="border-b border-cyan-500/20 pb-4">
          <div className="flex items-center gap-2 text-fuchsia-400 text-xs font-mono uppercase tracking-widest">
            <Wallet size={14} /> PEA Perso
          </div>
          <h1 className="text-3xl font-mono font-bold tracking-wider mt-1">
            <span className="text-cyan-400">PEA </span>
            <span className="text-fuchsia-500">Boursorama</span>
          </h1>
        </div>
        <div className="border border-cyan-500/20 bg-black/40 rounded p-12 text-center space-y-4">
          <p className="text-zinc-400 font-mono text-sm">Aucun compte PEA configuré</p>
          <button onClick={createPeaAccount} disabled={creating}
            className="px-4 py-2 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/20 transition rounded font-mono text-xs uppercase tracking-wider disabled:opacity-50">
            {creating ? "Création..." : "Créer le compte PEA"}
          </button>
          {error && <p className="text-red-400 font-mono text-xs">{error}</p>}
        </div>
      </div>
    )
  }

  const positions = (data?.positions || []).filter((p: any) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    return qty !== 0 && price !== 0
  })
  const cashBalances = data?.cashBalances || []
  const positionsValue = positions.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.market_price), 0)
  const cashTotal = cashBalances.reduce((s: number, c: any) => s + Number(c.amount), 0)
  const totalValue = positionsValue + cashTotal

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-4">
        <div>
          <div className="flex items-center gap-2 text-fuchsia-400 text-xs font-mono uppercase tracking-widest">
            <Wallet size={14} /> {account.label}
          </div>
          <h1 className="text-3xl font-mono font-bold tracking-wider mt-1">
            <span className="text-cyan-400">PEA </span>
            <span className="text-fuchsia-500">Boursorama</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-2 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 rounded font-mono text-xs uppercase tracking-wider flex items-center gap-2">
            <Plus size={14} />Position
          </button>
          <button onClick={refreshPrices} disabled={refreshing || positions.length === 0}
            className="px-3 py-2 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/20 rounded font-mono text-xs uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Sync..." : "Refresh cours"}
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-400 p-3 rounded font-mono text-xs">{error}</div>
      )}

      {showAddForm && (
        <div className="border border-cyan-500/30 bg-black/40 rounded p-4">
          <h3 className="text-xs font-mono uppercase tracking-widest text-cyan-400 mb-3">Ajouter une position</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input placeholder="Ticker (ex. EL)" value={form.ticker} onChange={(e) => setForm({...form, ticker: e.target.value})}
              className="bg-black border border-cyan-500/20 px-3 py-2 rounded font-mono text-xs text-white" />
            <input placeholder="Nom (opt)" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
              className="bg-black border border-cyan-500/20 px-3 py-2 rounded font-mono text-xs text-white" />
            <input type="number" step="any" placeholder="Qté" value={form.quantity} onChange={(e) => setForm({...form, quantity: e.target.value})}
              className="bg-black border border-cyan-500/20 px-3 py-2 rounded font-mono text-xs text-white" />
            <input type="number" step="any" placeholder="PRU €" value={form.avg_cost} onChange={(e) => setForm({...form, avg_cost: e.target.value})}
              className="bg-black border border-cyan-500/20 px-3 py-2 rounded font-mono text-xs text-white" />
            <input placeholder="Stooq (ex. el.fr)" value={form.stooq_symbol} onChange={(e) => setForm({...form, stooq_symbol: e.target.value})}
              className="bg-black border border-cyan-500/20 px-3 py-2 rounded font-mono text-xs text-white" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addPosition} disabled={!form.ticker || !form.quantity || !form.avg_cost}
              className="px-3 py-1.5 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/20 rounded font-mono text-xs uppercase tracking-wider disabled:opacity-50">
              Ajouter
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 border border-zinc-500/30 text-zinc-400 hover:bg-zinc-500/10 rounded font-mono text-xs uppercase tracking-wider">
              Annuler
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 font-mono mt-2">
            Stooq = symbole sur stooq.com (ex: el.fr, ri.fr, ubi.fr, p911.de). Si vide, on devine via Euronext Paris (.fr).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border border-cyan-500/30 bg-black/40 rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2 flex items-center">VALEUR TOTALE<InfoTip text="Somme de (quantité × cours) pour toutes les positions PEA. Cours rafraîchis quotidiennement via Stooq (fallback Yahoo Finance)." /></div>
          <div className="text-2xl font-mono font-bold text-cyan-400">{fmtEur(totalValue)}</div>
          <div className="text-xs font-mono mt-1">
            <span className="text-cyan-400">Titres {fmtEur(positionsValue)}</span>
            <span className="text-zinc-600 mx-1">·</span>
            <span className="text-fuchsia-400">Cash {fmtEur(cashTotal)}</span>
          </div>
        </div>
        <div className="border border-zinc-500/30 bg-black/40 rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">CAPITAL INVESTI</div>
          <div className="text-2xl font-mono font-bold text-zinc-300">{fmtEur(Number(account?.capital_invested) || 0)}</div>
        </div>
        {(() => {
          const cap = Number(account?.capital_invested) || 0
          const perf = totalValue - cap
          const perfPct = cap ? (perf / cap) * 100 : 0
          return (
            <div className={`border ${perf >= 0 ? "border-green-500/30" : "border-red-500/30"} bg-black/40 rounded p-4`}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2 flex items-center">PERF TOTALE<InfoTip text="(Valeur totale − Capital investi) / Capital investi × 100. Le PEA est exonéré d'IR après 5 ans (seuls les PS 17,6% restent)." /></div>
              <div className={`text-2xl font-mono font-bold ${perf >= 0 ? "text-green-400" : "text-red-400"}`}>
                {perf >= 0 ? "+" : ""}{fmtEur(perf)}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-1">{perfPct >= 0 ? "+" : ""}{perfPct.toFixed(2)}%</div>
            </div>
          )
        })()}
        <div className="border border-cyan-500/30 bg-black/40 rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">TITRES</div>
          <div className="text-2xl font-mono font-bold text-cyan-400">{positions.length}</div>
        </div>
      </div>

      {positions.length > 0 && (() => {
        const allocationData = positions
          .map((p: any) => ({ name: p.ticker, value: Number(p.quantity) * Number(p.market_price) }))
          .filter((d: any) => d.value > 0)
          .sort((a: any, b: any) => b.value - a.value)
        const allocTotal = allocationData.reduce((s: number, d: any) => s + d.value, 0)
        const threshold = allocTotal * 0.02
        const tickerSlices = allocationData.filter((d: any) => d.value >= threshold)
        const tickerOthers = allocationData.filter((d: any) => d.value < threshold).reduce((s: number, d: any) => s + d.value, 0)
        if (tickerOthers > 0) tickerSlices.push({ name: "Autres", value: tickerOthers })

        const sectorAgg: Record<string, number> = {}
        for (const p of positions) {
          const sector = SECTOR_MAP[p.ticker] || "Autre"
          const val = Number(p.quantity) * Number(p.market_price)
          sectorAgg[sector] = (sectorAgg[sector] || 0) + val
        }
        const sectorSlices = Object.entries(sectorAgg)
          .map(([name, value]) => ({ name, value }))
          .filter(d => d.value > 0)
          .sort((a, b) => b.value - a.value)
        const sectorTotal = sectorSlices.reduce((s, d) => s + d.value, 0)

        const cashVsPos = [
          { name: "Positions", value: positionsValue },
          { name: "Cash", value: cashTotal },
        ].filter(d => d.value > 0)
        const cashVsTotal = cashVsPos.reduce((s, d) => s + d.value, 0)
        const CASH_COLORS = ["#06b6d4", "#e879f9"]

        const tooltipStyle = { background: "#1a1a2e", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8, fontFamily: "monospace", fontSize: 12, color: "#ffffff" }

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-cyan-500/20 rounded bg-black/40 p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400 mb-2">Allocation</h2>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={tickerSlices} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#09090b">
                      {tickerSlices.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#a1a1aa" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1">
                  {tickerSlices.map((d: any, i: number) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-zinc-400">{d.name}</span>
                      <span className="text-white ml-auto">{((d.value / allocTotal) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-fuchsia-500/20 rounded bg-black/40 p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-fuchsia-400 mb-2">Par secteur</h2>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={sectorSlices} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#09090b">
                      {sectorSlices.map((_: any, i: number) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#a1a1aa" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1">
                  {sectorSlices.map((d: any, i: number) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }} />
                      <span className="text-zinc-400">{d.name}</span>
                      <span className="text-white ml-auto">{((d.value / sectorTotal) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-cyan-500/20 rounded bg-black/40 p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400 mb-2">Cash vs Positions</h2>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={cashVsPos} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#09090b">
                      {cashVsPos.map((_: any, i: number) => <Cell key={i} fill={CASH_COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#a1a1aa" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1">
                  {cashVsPos.map((d: any, i: number) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm font-mono">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CASH_COLORS[i] }} />
                      <span className={`font-bold ${i === 0 ? "text-cyan-400" : "text-fuchsia-400"}`}>{d.name}</span>
                      <span className="text-white ml-auto">{fmtEur(d.value)}</span>
                      <span className="text-zinc-500">{((d.value / cashVsTotal) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <div className="border border-cyan-500/20 rounded bg-black/40">
        <div className="border-b border-cyan-500/20 p-3">
          <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400">Positions PEA · {positions.length}</h2>
        </div>
        {positions.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 font-mono text-sm">
            Aucune position. Clique "Position" pour en ajouter une.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-black/60 text-zinc-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left p-3">Ticker</th>
                  <th className="text-left p-3">Nom</th>
                  <th className="text-right p-3">Qté</th>
                  <th className="text-right p-3">PRU</th>
                  <th className="text-right p-3">Cours</th>
                  <th className="text-right p-3">Valeur</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {[...positions].sort((a: any, b: any) => Number(b.quantity) * Number(b.market_price) - Number(a.quantity) * Number(a.market_price)).map((p: any) => {
                  const qty = Number(p.quantity), pru = Number(p.avg_cost), price = Number(p.market_price)
                  const value = qty * price, cost = qty * pru
                  const ppnl = value - cost
                  const ppnlPct = cost ? (ppnl / cost) * 100 : 0
                  return (
                    <tr key={p.id} className="border-t border-cyan-500/10 hover:bg-cyan-500/5 cursor-pointer transition"
                      onClick={() => setSelectedPosition(p)}>
                      <td className="p-3 text-fuchsia-400 font-bold">{p.ticker}</td>
                      <td className="p-3 text-zinc-400 truncate max-w-[200px]">{p.name || "—"}</td>
                      <td className="p-3 text-right text-zinc-300">{qty}</td>
                      <td className="p-3 text-right text-zinc-500">{pru.toFixed(2)} €</td>
                      <td className="p-3 text-right text-cyan-300">{price.toFixed(2)} €</td>
                      <td className="p-3 text-right text-zinc-300">{value.toFixed(2)} €</td>
                      <td className={`p-3 text-right ${ppnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {ppnl >= 0 ? "+" : ""}{ppnl.toFixed(2)} ({ppnlPct >= 0 ? "+" : ""}{ppnlPct.toFixed(1)}%)
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); deletePosition(p.id) }} className="text-zinc-600 hover:text-red-400 transition">
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
