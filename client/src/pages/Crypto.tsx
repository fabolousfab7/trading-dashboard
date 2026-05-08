import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Bitcoin, RefreshCw } from "lucide-react"
import PositionNoteModal from "@/components/PositionNoteModal"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#06b6d4", "#e879f9", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#c084fc", "#fb923c", "#4ade80"]

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

function calcStats(pos: any[]) {
  const value = pos.reduce((s, p) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * Number(p.market_price) * own
  }, 0)
  const cost = pos.reduce((s, p) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * Number(p.avg_cost) * own
  }, 0)
  const pnl = value - cost
  const pct = cost ? (pnl / cost) * 100 : 0
  return { value, cost, pnl, pct }
}

export default function Crypto() {
  const [account, setAccount] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<any>(null)

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const r = await authFetch("/api/accounts")
      const { accounts } = await r.json()
      const crypto = accounts?.find((a: any) => a.broker === "Crypto")
      if (!crypto) { setLoading(false); return }
      setAccount(crypto)
      const r2 = await authFetch(`/api/accounts/${crypto.id}/portfolio`)
      setData(await r2.json())
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  async function refreshPrices() {
    if (!account) return
    setRefreshing(true); setError(null)
    try {
      const r = await authFetch(`/api/accounts/${account.id}/refresh-prices`, { method: "POST" })
      const result = await r.json()
      if (result.failed > 0 && result.failedTickers?.length) {
        setError(`Échec : ${result.failedTickers.join(", ")} — vérifie les coingecko_id`)
      }
      await loadData()
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setRefreshing(false) }
  }

  if (loading) return <div className="p-8 text-zinc-400 font-mono text-sm">Chargement...</div>
  if (!account) return <div className="p-8 text-zinc-500 font-mono">Aucun compte Crypto</div>

  const positions = (data?.positions || []).filter((p: any) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    return qty !== 0 && price !== 0
  })
  const persoPositions = positions.filter((p: any) => (Number(p.ownership_pct) || 100) === 100)
  const sharedPositions = positions.filter((p: any) => (Number(p.ownership_pct) || 100) < 100)

  const persoStats = calcStats(persoPositions)
  const sharedStats = calcStats(sharedPositions)
  const total = {
    value: persoStats.value + sharedStats.value,
    cost: persoStats.cost + sharedStats.cost,
    pnl: persoStats.pnl + sharedStats.pnl,
    pct: (persoStats.cost + sharedStats.cost) ? ((persoStats.pnl + sharedStats.pnl) / (persoStats.cost + sharedStats.cost)) * 100 : 0,
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-4">
        <div>
          <div className="flex items-center gap-2 text-fuchsia-400 text-xs font-mono uppercase tracking-widest">
            <Bitcoin size={14} /> Crypto LT
          </div>
          <h1 className="text-3xl font-mono font-bold tracking-wider mt-1">
            <span className="text-cyan-400">Crypto </span>
            <span className="text-fuchsia-500">Long Terme</span>
          </h1>
        </div>
        <button onClick={refreshPrices} disabled={refreshing}
          className="px-4 py-2 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/20 transition rounded font-mono text-xs uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Sync..." : "Refresh cours"}
        </button>
      </div>

      {error && <div className="border border-red-500/30 bg-red-500/10 text-red-400 p-3 rounded font-mono text-xs">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border border-cyan-500/30 bg-black/40 rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">VALEUR TOTALE</div>
          <div className="text-2xl font-mono font-bold text-cyan-400">{fmtEur(total.value)}</div>
        </div>
        <div className="border border-zinc-500/30 bg-black/40 rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">COST BASIS</div>
          <div className="text-2xl font-mono font-bold text-zinc-300">{fmtEur(total.cost)}</div>
        </div>
        <div className={`border ${total.pnl >= 0 ? "border-green-500/30" : "border-red-500/30"} bg-black/40 rounded p-4`}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">PERF TOTALE</div>
          <div className={`text-2xl font-mono font-bold ${total.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {total.pnl >= 0 ? "+" : ""}{fmtEur(total.pnl)}
          </div>
          <div className="text-[10px] font-mono text-zinc-500 mt-1">{total.pct >= 0 ? "+" : ""}{total.pct.toFixed(2)}%</div>
        </div>
        <div className="border border-cyan-500/30 bg-black/40 rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">POSITIONS</div>
          <div className="text-2xl font-mono font-bold text-cyan-400">{positions.length}</div>
        </div>
      </div>

      {(() => {
        const merged: Record<string, number> = {}
        for (const p of positions) {
          const ticker = p.ticker.replace(/_R$/, "")
          const own = (Number(p.ownership_pct) || 100) / 100
          const value = Number(p.quantity) * Number(p.market_price) * own
          merged[ticker] = (merged[ticker] || 0) + value
        }
        const allocationData = Object.entries(merged)
          .map(([name, value]) => ({ name, value }))
          .filter(d => d.value > 0)
          .sort((a, b) => b.value - a.value)

        const allocTotal = allocationData.reduce((s, d) => s + d.value, 0)
        const threshold = allocTotal * 0.02
        const mainSlices = allocationData.filter(d => d.value >= threshold)
        const othersValue = allocationData.filter(d => d.value < threshold).reduce((s, d) => s + d.value, 0)
        if (othersValue > 0) mainSlices.push({ name: "Autres", value: othersValue })

        if (allocationData.length === 0) return null
        return (
          <div className="border border-cyan-500/20 rounded bg-black/40 p-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400 mb-2">Allocation</h2>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie data={mainSlices} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={80} innerRadius={35} strokeWidth={1} stroke="#09090b">
                    {mainSlices.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #06b6d4", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}
                    formatter={(value: number) => [fmtEur(value), ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5">
                {mainSlices.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-zinc-400">{d.name}</span>
                    <span className="text-zinc-600 ml-auto">{((d.value / allocTotal) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      <PortfolioSection title="Portefeuille Perso" subtitle="Détenu à 100%"
        positions={persoPositions} stats={persoStats} accent="cyan" onPositionClick={setSelectedPosition} />
      <PortfolioSection title="Raph + Fab" subtitle="Détenu à 50% (part Fabien)"
        positions={sharedPositions} stats={sharedStats} accent="fuchsia" onPositionClick={setSelectedPosition} />

      {selectedPosition && (
        <PositionNoteModal
          isOpen={!!selectedPosition}
          onClose={() => setSelectedPosition(null)}
          ticker={selectedPosition.ticker.replace(/_R$/, "")}
          accountId={selectedPosition.account_id}
          positionId={selectedPosition.id}
          currency="EUR"
        />
      )}
    </div>
  )
}

function PortfolioSection({ title, subtitle, positions, stats, accent, onPositionClick }: any) {
  const titleColor = accent === "cyan" ? "text-cyan-400" : "text-fuchsia-400"
  const borderColor = accent === "cyan" ? "border-cyan-500/30" : "border-fuchsia-500/30"
  if (positions.length === 0) return null
  return (
    <div className={`border ${borderColor} rounded bg-black/40`}>
      <div className={`border-b ${borderColor} p-4 flex items-center justify-between`}>
        <div>
          <h2 className={`text-sm font-mono font-bold uppercase tracking-widest ${titleColor}`}>{title}</h2>
          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{subtitle}</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="text-[10px] text-zinc-600 font-mono uppercase">Valeur</div>
            <div className="text-base font-mono font-bold text-cyan-300">{fmtEur(stats.value)}</div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-600 font-mono uppercase">Perf</div>
            <div className={`text-base font-mono font-bold ${stats.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {stats.pnl >= 0 ? "+" : ""}{stats.pct.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead className="bg-black/60 text-zinc-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left p-3">Coin</th>
              <th className="text-right p-3">Qté</th>
              <th className="text-right p-3">PRU</th>
              <th className="text-right p-3">Cours</th>
              <th className="text-right p-3">Valeur</th>
              <th className="text-right p-3">P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p: any) => {
              const own = (Number(p.ownership_pct) || 100) / 100
              const qty = Number(p.quantity) * own
              const pru = Number(p.avg_cost), price = Number(p.market_price)
              const value = qty * price
              const cost = qty * pru
              const ppnl = value - cost
              const ppnlPct = cost ? (ppnl / cost) * 100 : 0
              return (
                <tr key={p.id} className="border-t border-cyan-500/10 hover:bg-cyan-500/5 cursor-pointer transition"
                  onClick={() => onPositionClick?.(p)}>
                  <td className="p-3">
                    <div className="text-fuchsia-400 font-bold">{p.ticker.replace(/_R$/, "")}</div>
                    <div className="text-zinc-500 text-[10px] truncate max-w-[200px]">{(p.name || "").replace(/\s*\([^)]+\)\s*/g, "").trim()}</div>
                  </td>
                  <td className="p-3 text-right text-zinc-300">{qty.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}</td>
                  <td className="p-3 text-right text-zinc-500">{pru < 1 ? pru.toFixed(6) : pru.toFixed(2)} €</td>
                  <td className="p-3 text-right text-cyan-300">{price < 1 ? price.toFixed(6) : price.toFixed(2)} €</td>
                  <td className="p-3 text-right text-zinc-300">{fmtEur(value)}</td>
                  <td className={`p-3 text-right ${ppnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {ppnl >= 0 ? "+" : ""}{fmtEur(ppnl)} ({ppnlPct >= 0 ? "+" : ""}{ppnlPct.toFixed(1)}%)
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
