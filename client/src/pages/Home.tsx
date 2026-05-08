import { useEffect, useState, useMemo } from "react"
import { Link } from "wouter"
import { supabase } from "@/lib/supabase"
import { BarChart3, Briefcase, Wallet, ArrowRight, Bitcoin } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

async function authFetch(url: string) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
}

const ALLOC_COLORS = ["#e879f9", "#06b6d4", "#a78bfa"]

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [ibkr, setIbkr] = useState<any>(null)
  const [pea, setPea] = useState<any>(null)
  const [crypto, setCrypto] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [snapshotAccounts, setSnapshotAccounts] = useState<any[]>([])
  const [chartRange, setChartRange] = useState(90)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
  }, [])

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      authFetch("/api/trades/stats").then((r) => r.ok ? r.json() : null).catch(() => null),
      authFetch("/api/accounts").then(async (r) => {
        if (!r.ok) return { ibkr: null, pea: null, crypto: null }
        const { accounts } = await r.json()
        const fhf = accounts?.find((a: any) => a.broker === "IBKR")
        const peaAcc = accounts?.find((a: any) => a.broker === "Boursorama")
        const [ibkrPortfolio, peaPortfolio, cryptoPortfolio] = await Promise.all([
          fhf ? authFetch(`/api/accounts/${fhf.id}/portfolio`).then((r) => r.ok ? r.json() : null) : null,
          peaAcc ? authFetch(`/api/accounts/${peaAcc.id}/portfolio`).then((r) => r.ok ? r.json() : null) : null,
          accounts?.find((a: any) => a.broker === "Crypto")
            ? authFetch(`/api/accounts/${accounts.find((a: any) => a.broker === "Crypto").id}/portfolio`).then((r) => r.ok ? r.json() : null)
            : null,
        ])
        return { ibkr: ibkrPortfolio, pea: peaPortfolio, crypto: cryptoPortfolio }
      }).catch(() => ({ ibkr: null, pea: null, crypto: null })),
    ]).then(([s, portfolios]: any) => { setStats(s); setIbkr(portfolios?.ibkr); setPea(portfolios?.pea); setCrypto(portfolios?.crypto); setLoading(false) })
  }, [user])

  useEffect(() => {
    if (!user) return
    authFetch(`/api/snapshots/history?days=${chartRange}`)
      .then(r => r.ok ? r.json() : { snapshots: [], accounts: [] })
      .then(({ snapshots: snaps, accounts: accs }) => {
        setSnapshots(snaps || [])
        setSnapshotAccounts(accs || [])
      })
      .catch(() => {})
  }, [user, chartRange])

  const chartData = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {}
    for (const s of snapshots) {
      const acc = snapshotAccounts.find((a: any) => a.id === s.account_id)
      if (!acc) continue
      if (!byDate[s.snapshot_date]) byDate[s.snapshot_date] = {}
      byDate[s.snapshot_date][acc.broker] = Number(s.nlv_base) || 0
    }
    const dates = Object.keys(byDate).sort()
    const brokers = [...new Set(snapshotAccounts.map((a: any) => a.broker))]
    const lastKnown: Record<string, number> = {}
    return dates.map(date => {
      const row: any = { date: new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) }
      for (const b of brokers) {
        if (byDate[date][b] !== undefined) lastKnown[b] = byDate[date][b]
        row[b] = lastKnown[b] || 0
      }
      row.total = brokers.reduce((s, b) => s + (row[b] || 0), 0)
      return row
    })
  }, [snapshots, snapshotAccounts])

  if (!user) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-zinc-500 font-mono">Connecte-toi sur <Link href="/analytics" className="text-cyan-400 underline">/analytics</Link></p>
    </div>
  )
  if (loading) return <div className="p-8 text-zinc-400 font-mono text-sm">Chargement...</div>

  const tradingProfit = stats?.totalProfit || 0
  const tradingCount = stats?.count || 0
  const tradingWinRate = stats?.winRate || 0

  const positions = ibkr?.positions || []
  const cashBalances = ibkr?.cashBalances || []
  const ibkrPositionsBase = positions.reduce((s: number, p: any) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    return s + Number(p.quantity) * Number(p.market_price) * fx
  }, 0)
  const ibkrCashBase = cashBalances.reduce((s: number, c: any) => {
    const fx = c.fx_rate_to_base ? Number(c.fx_rate_to_base) : 1
    return s + Number(c.amount) * fx
  }, 0)
  const ibkrNlv = ibkrPositionsBase + ibkrCashBase
  const ibkrSnapshot = ibkr?.latestSnapshot
  const ibkrCapital = ibkrSnapshot ? Number(ibkrSnapshot.capital_invested) || 0 : 0
  const ibkrPerfPct = ibkrCapital ? ((ibkrNlv - ibkrCapital) / ibkrCapital) * 100 : 0

  const peaPositions = pea?.positions || []
  const peaPositionsValue = peaPositions.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.market_price), 0)
  const peaCashTotal = (pea?.cashBalances || []).reduce((s: number, c: any) => s + Number(c.amount), 0)
  const peaValue = peaPositionsValue + peaCashTotal
  const peaCapital = Number(pea?.account?.capital_invested) || 0
  const peaPerfPct = peaCapital ? ((peaValue - peaCapital) / peaCapital) * 100 : 0

  const cryptoPositions = crypto?.positions || []
  const cryptoValue = cryptoPositions.reduce((s: number, p: any) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * Number(p.market_price) * own
  }, 0)
  const cryptoCost = cryptoPositions.reduce((s: number, p: any) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * Number(p.avg_cost) * own
  }, 0)
  const cryptoPerfPct = cryptoCost ? ((cryptoValue - cryptoCost) / cryptoCost) * 100 : 0

  const patrimoineTotal = ibkrNlv + peaValue + cryptoValue

  const allocationData = [
    { name: "FHF IBKR", value: ibkrNlv, color: "#e879f9" },
    { name: "PEA", value: peaValue, color: "#06b6d4" },
    { name: "Crypto", value: cryptoValue, color: "#a78bfa" },
  ].filter(d => d.value > 0)

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-cyan-500/20 pb-4">
        <div className="text-fuchsia-400 text-xs font-mono uppercase tracking-widest">Patrimoine consolidé</div>
        <h1 className="text-4xl font-mono font-bold tracking-wider mt-1">
          <span className="text-cyan-400">F.H.F </span>
          <span className="text-fuchsia-500">Patrimoine</span>
        </h1>
      </div>

      <div className="border border-fuchsia-500/30 bg-black/60 rounded p-6 shadow-[0_0_25px_rgba(217,70,239,0.1)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-400 mb-2">Patrimoine total (EUR)</div>
            <div className="text-5xl font-mono font-bold text-cyan-400">{fmtEur(patrimoineTotal)}</div>
            <div className="text-xs font-mono text-zinc-500 mt-2">
              IBKR · {fmtEur(ibkrNlv)} <span className="text-zinc-700">·</span> PEA · {fmtEur(peaValue)} <span className="text-zinc-700">·</span> Crypto · {fmtEur(cryptoValue)}
            </div>
          </div>
          {allocationData.length > 0 && (
            <div className="hidden md:block">
              <PieChart width={130} height={130}>
                <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={55} innerRadius={25} strokeWidth={1} stroke="#09090b">
                  {allocationData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #06b6d4", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}
                  formatter={(value: number) => [fmtEur(value), ""]}
                />
              </PieChart>
            </div>
          )}
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="border border-cyan-500/20 rounded bg-black/40 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400">
              Évolution patrimoine
            </h2>
            <div className="flex gap-1">
              {[30, 90, 365].map(d => (
                <button key={d} onClick={() => setChartRange(d)}
                  className={`px-3 py-1 text-[10px] font-mono uppercase rounded transition ${
                    chartRange === d
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                  }`}>
                  {d === 365 ? "1Y" : `${d}J`}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradIBKR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e879f9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#e879f9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPEA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCrypto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #06b6d4", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value: number, name: string) => [
                  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value),
                  name
                ]}
              />
              <Area type="monotone" dataKey="IBKR" stackId="1" stroke="#e879f9" fill="url(#gradIBKR)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="Boursorama" stackId="1" stroke="#06b6d4" fill="url(#gradPEA)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="Crypto" stackId="1" stroke="#a78bfa" fill="url(#gradCrypto)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SubCard icon={BarChart3} title="Trading Actif" subtitle="Journal de trades"
          mainValue={fmtEur(tradingProfit)} mainLabel="Profit total"
          stats={[{ label: "Trades", value: String(tradingCount) }, { label: "Win rate", value: `${tradingWinRate.toFixed(0)}%` }]}
          link="/analytics" accent="cyan" />
        <SubCard icon={Briefcase} title="FHF / IBKR" subtitle="Portefeuille société"
          mainValue={fmtEur(ibkrNlv)} mainLabel="NLV"
          stats={[
            { label: "Perf", value: `${ibkrPerfPct >= 0 ? "+" : ""}${ibkrPerfPct.toFixed(1)}%`, color: ibkrPerfPct >= 0 ? "green" : "red" },
            { label: "Positions", value: String(positions.length) },
          ]}
          link="/ibkr" accent="fuchsia" />
        <SubCard icon={Wallet} title="PEA Perso" subtitle="Boursorama"
          mainValue={fmtEur(peaValue)} mainLabel="Valeur"
          stats={[
            { label: "Perf", value: `${peaPerfPct >= 0 ? "+" : ""}${peaPerfPct.toFixed(1)}%`, color: peaPerfPct >= 0 ? "green" : "red" },
            { label: "Positions", value: String(peaPositions.length) },
          ]}
          link="/pea" accent="zinc" />
        <SubCard icon={Bitcoin} title="Crypto LT" subtitle="Long terme"
          mainValue={cryptoPositions.length > 0 ? fmtEur(cryptoValue) : "—"}
          mainLabel={cryptoPositions.length > 0 ? "Valeur" : "Pas connecté"}
          stats={cryptoPositions.length > 0 ? [
            { label: "Perf", value: `${cryptoPerfPct >= 0 ? "+" : ""}${cryptoPerfPct.toFixed(1)}%`, color: cryptoPerfPct >= 0 ? "green" : "red" },
            { label: "Positions", value: String(cryptoPositions.length) },
          ] : [{ label: "Statut", value: "À configurer" }]}
          link="/crypto" accent={cryptoPositions.length > 0 ? "fuchsia" : "zinc"} />
      </div>
    </div>
  )
}

function SubCard({ icon: Icon, title, subtitle, mainValue, mainLabel, stats, link, accent }: any) {
  const border = accent === "cyan" ? "border-cyan-500/30 hover:border-cyan-500/60" : accent === "fuchsia" ? "border-fuchsia-500/30 hover:border-fuchsia-500/60" : "border-zinc-700/30 hover:border-zinc-500/60"
  const titleColor = accent === "cyan" ? "text-cyan-400" : accent === "fuchsia" ? "text-fuchsia-400" : "text-zinc-500"
  return (
    <Link href={link} className={`block border ${border} bg-black/40 rounded p-4 transition cursor-pointer group`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 ${titleColor} text-xs font-mono uppercase tracking-wider`}>
          <Icon size={14} />{title}
        </div>
        <ArrowRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition" />
      </div>
      <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">{subtitle}</div>
      <div className="text-3xl font-mono font-bold text-white">{mainValue}</div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mt-1">{mainLabel}</div>
      <div className="border-t border-zinc-800 mt-4 pt-3 flex justify-between text-xs font-mono">
        {stats.map((s: any, i: number) => (
          <div key={i}>
            <div className="text-zinc-600 uppercase text-[9px] tracking-wider">{s.label}</div>
            <div className={`mt-0.5 ${s.color === "green" ? "text-green-400" : s.color === "red" ? "text-red-400" : "text-zinc-300"}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </Link>
  )
}
