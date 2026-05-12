import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Briefcase, RefreshCw } from "lucide-react"
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

export default function Ibkr() {
  const [account, setAccount] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<any>(null)

  const [comptaCapital, setComptaCapital] = useState<number | null>(null)

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const r = await authFetch("/api/accounts")
      const { accounts } = await r.json()
      const fhf = accounts?.find((a: any) => a.broker === "IBKR")
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
      } catch {}
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setLoading(false) }
  }

  async function refreshPrices() {
    setRefreshing(true); setRefreshError(null)
    try {
      const r = await authFetch("/api/portfolio/refresh-prices")
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || "Refresh failed")
      await loadData()
    } catch (e: any) { setRefreshError(String(e.message || e)) }
    finally { setRefreshing(false) }
  }

  async function syncIbkr() {
    if (!account?.id) return
    setSyncing(true); setSyncError(null)
    try {
      const r = await authFetch(`/api/accounts/${account.id}/sync`, { method: "POST" })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || "Sync failed")
      await loadData()
    } catch (e: any) { setSyncError(String(e.message || e)) }
    finally { setSyncing(false) }
  }

  useEffect(() => { loadData() }, [])

  if (loading) return <div className="p-8 text-[--ink2] font-mono text-sm">Chargement...</div>
  if (error && !data) return <div className="p-8 text-[--at-neg] font-mono text-sm">Erreur : {error}</div>
  if (!data) return null

  const positions = (data?.positions || []).filter((p: any) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    return qty !== 0 && price !== 0
  })
  const cashBalances = data.cashBalances || []
  const snapshot = data.latestSnapshot

  const positionsBase = positions.reduce((s: number, p: any) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    return s + Number(p.quantity) * Number(p.market_price) * fx
  }, 0)
  const cashBase = cashBalances.reduce((s: number, c: any) => {
    const fx = c.fx_rate_to_base ? Number(c.fx_rate_to_base) : 1
    return s + Number(c.amount) * fx
  }, 0)
  const nlv = positionsBase + cashBase
  const unrealizedPnl = positions.reduce((s: number, p: any) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    const cost = Number(p.avg_cost)
    return s + (qty * (price - cost)) * fx
  }, 0)
  const capital = comptaCapital || Number(data.account?.capital_invested) || Number(snapshot?.capital_invested) || 0
  const totalPerf = capital ? nlv - capital : 0
  const totalPerfPct = capital ? (totalPerf / capital) * 100 : 0

  const tooltipStyle = { background: "#fbf8f1", border: "1px solid #d9d3c4", borderRadius: 8, fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "#1a1814" }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-[--rule] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[--at-accent] text-xs font-mono uppercase tracking-widest">
            <Briefcase size={14} /> {account?.label}
          </div>
          <h1 className="text-3xl font-mono font-bold tracking-wider mt-1">
            <span className="text-[--at-accent]">Portefeuille </span>
            <span className="text-[--at-accent]">FHF</span>
          </h1>
          <p className="text-[10px] text-[--ink3] font-mono uppercase tracking-wider mt-1">
            {account?.ibkr_account_number} · Base {account?.currency_base}
            {data.ibkrSync?.last_synced_at && <> · Sync {new Date(data.ibkrSync.last_synced_at).toLocaleString("fr-FR")}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={refreshPrices} disabled={refreshing}
            className="px-4 py-2 bg-[--at-accent]/10 border border-[--rule] text-[--at-accent] hover:bg-[--at-accent]/20 transition rounded font-mono text-xs uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refresh..." : "Rafraîchir"}
          </button>
          <button onClick={syncIbkr} disabled={syncing}
            className="px-4 py-2 bg-[--at-accent] text-white border border-[--at-accent] hover:opacity-90 transition rounded font-mono text-xs uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sync..." : "Sync IBKR (Flex)"}
          </button>
        </div>
      </div>

      {refreshError && (
        <div className="bg-[--at-neg]/10 border border-[--at-neg]/30 rounded p-3 flex items-center justify-between">
          <span className="text-[--at-neg] text-xs font-mono">{refreshError}</span>
          <button onClick={() => setRefreshError(null)} className="text-[--at-neg] hover:text-[--at-neg] text-xs font-mono">✕</button>
        </div>
      )}
      {syncError && (
        <div className="bg-[--at-neg]/10 border border-[--at-neg]/30 rounded p-3 flex items-center justify-between">
          <span className="text-[--at-neg] text-xs font-mono">Sync : {syncError}</span>
          <button onClick={() => setSyncError(null)} className="text-[--at-neg] hover:text-[--at-neg] text-xs font-mono">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border border-[--rule] bg-[--at-surface] rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2 flex items-center">NLV TOTALE<InfoTip text="Net Liquidation Value = Cash + Valeur marchande des positions. Sync IBKR Flex Query quotidienne 22h UTC." /></div>
          <div className="text-2xl font-mono font-bold text-[--at-accent]">{fmtEur(nlv)}</div>
          <div className="text-xs font-mono mt-1">
            <span className="text-[--at-accent]">Positions {fmtEur(positionsBase)}</span>
            <span className="text-[--ink3] mx-1">·</span>
            <span className="text-[--at-accent]">Cash {fmtEur(cashBase)}</span>
          </div>
        </div>
        <div className={`border ${totalPerf >= 0 ? "border-[--at-pos]/30" : "border-[--at-neg]/30"} bg-[--at-surface] rounded p-4`}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2 flex items-center">PERF TOTALE<InfoTip text="(NLV actuelle − Capital investi) / Capital investi × 100. Inclut P&L réalisé + latent + dividendes − commissions." /></div>
          <div className={`text-2xl font-mono font-bold ${totalPerf >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
            {totalPerf >= 0 ? "+" : ""}{fmtEur(totalPerf)}
          </div>
          <div className="text-[10px] font-mono text-[--ink3] mt-1">
            {totalPerfPct >= 0 ? "+" : ""}{totalPerfPct.toFixed(2)}%
          </div>
        </div>
        <div className={`border ${unrealizedPnl >= 0 ? "border-[--at-pos]/30" : "border-[--at-neg]/30"} bg-[--at-surface] rounded p-4`}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2">P&L LATENT</div>
          <div className={`text-2xl font-mono font-bold ${unrealizedPnl >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
            {unrealizedPnl >= 0 ? "+" : ""}{fmtEur(unrealizedPnl)}
          </div>
        </div>
        <div className="border border-[--rule] bg-[--at-surface] rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2">CASH NET</div>
          <div className="text-2xl font-mono font-bold text-[--at-accent]">{fmtEur(cashBase)}</div>
          <div className="text-[10px] font-mono text-[--ink3] mt-1">
            {cashBalances.map((c: any) => `${Number(c.amount).toFixed(0)} ${c.currency}`).join(" · ")}
          </div>
        </div>
      </div>

      {(() => {
        const allocationData = positions
          .map((p: any) => {
            const qty = Number(p.quantity)
            const price = Number(p.market_price)
            const fx = Number(p.fx_rate_to_base) || 1
            return { name: p.ticker, value: qty * price * fx }
          })
          .filter((d: any) => d.value > 0)
          .sort((a: any, b: any) => b.value - a.value)

        const allocTotal = allocationData.reduce((s: number, d: any) => s + d.value, 0)
        const threshold = allocTotal * 0.02
        const mainSlices = allocationData.filter((d: any) => d.value >= threshold)
        const othersValue = allocationData.filter((d: any) => d.value < threshold).reduce((s: number, d: any) => s + d.value, 0)
        if (othersValue > 0) mainSlices.push({ name: "Autres", value: othersValue })

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
        const sectorThreshold = sectorTotal * 0.02
        const sectorSlices = sectorData.filter(d => d.value >= sectorThreshold)
        const sectorOthers = sectorData.filter(d => d.value < sectorThreshold).reduce((s, d) => s + d.value, 0)
        if (sectorOthers > 0) sectorSlices.push({ name: "Autres", value: sectorOthers })

        const cashVsPos = [
          { name: "Positions", value: positionsBase },
          { name: "Cash", value: cashBase },
        ].filter(d => d.value > 0)
        const cashVsTotal = cashVsPos.reduce((s, d) => s + d.value, 0)
        const CASH_COLORS = ["#7d2b1d", "#cfb88f"]

        if (allocationData.length === 0) return null
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-2">Allocation</h2>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={mainSlices} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#fbf8f1">
                    {mainSlices.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#1a1814" }} labelStyle={{ color: "#4a4540" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {mainSlices.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[--ink2]">{d.name}</span>
                    <span className="text-[--ink] ml-auto">{((d.value / allocTotal) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-2">Par secteur</h2>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={sectorSlices} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#fbf8f1">
                    {sectorSlices.map((_: any, i: number) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#1a1814" }} labelStyle={{ color: "#4a4540" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {sectorSlices.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }} />
                    <span className="text-[--ink2]">{d.name}</span>
                    <span className="text-[--ink] ml-auto">{((d.value / sectorTotal) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-2">Cash vs Positions</h2>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={cashVsPos} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#fbf8f1">
                    {cashVsPos.map((_: any, i: number) => <Cell key={i} fill={CASH_COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#1a1814" }} labelStyle={{ color: "#4a4540" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {cashVsPos.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CASH_COLORS[i] }} />
                    <span className={i === 0 ? "text-[--at-accent] font-bold" : "text-[--at-accent] font-bold"}>{d.name}</span>
                    <span className="text-[--ink2] ml-auto">{fmtEur(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      <div className="border border-[--rule] rounded bg-[--at-surface]">
        <div className="border-b border-[--rule] p-3">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent]">
            Positions ouvertes · {positions.length}
          </h2>
        </div>
        {positions.length === 0 ? (
          <div className="p-6 text-center text-[--ink3] text-xs font-mono">Aucune position ouverte · Données du dernier sync disponibles</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-[--at-surface] text-[--ink3] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left p-3">Ticker</th>
                  <th className="text-left p-3">Nom</th>
                  <th className="text-right p-3">Qté</th>
                  <th className="text-right p-3">PRU</th>
                  <th className="text-right p-3">Cours</th>
                  <th className="text-right p-3">Valeur</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="text-right p-3">%</th>
                </tr>
              </thead>
              <tbody>
                {[...positions].sort((a: any, b: any) => {
                  const fxA = Number(a.fx_rate_to_base) || 1, fxB = Number(b.fx_rate_to_base) || 1
                  return (Number(b.quantity) * Number(b.market_price) * fxB) - (Number(a.quantity) * Number(a.market_price) * fxA)
                }).map((p: any) => {
                  const qty = Number(p.quantity), pru = Number(p.avg_cost), price = Number(p.market_price)
                  const value = qty * price, cost = qty * pru
                  const pnl = value - cost
                  const pnlPct = cost === 0 ? 0 : (pnl / cost) * 100
                  const sym = p.currency === "USD" ? "$" : "€"
                  return (
                    <tr key={p.id} className="border-t border-[--rule] hover:bg-[--at-accent]/5 cursor-pointer transition"
                      onClick={() => setSelectedPosition(p)}>
                      <td className="p-3 text-[--at-accent] font-bold">{p.ticker}</td>
                      <td className="p-3 text-[--ink2] truncate max-w-[200px]">{p.name}</td>
                      <td className="p-3 text-right text-[--ink]">{qty}</td>
                      <td className="p-3 text-right text-[--ink3]">{pru.toFixed(2)} {sym}</td>
                      <td className="p-3 text-right text-[--at-accent]">{price.toFixed(2)} {sym}</td>
                      <td className="p-3 text-right text-[--ink]">{value.toFixed(2)} {sym}</td>
                      <td className={`p-3 text-right ${pnl >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                      </td>
                      <td className={`p-3 text-right ${pnlPct >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
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
          currency={selectedPosition.currency || "EUR"}
        />
      )}
    </div>
  )
}
