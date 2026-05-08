import { useEffect, useState } from "react"
import { Link } from "wouter"
import { supabase } from "@/lib/supabase"
import { BarChart3, Briefcase, Wallet, ArrowRight, Bitcoin } from "lucide-react"

async function authFetch(url: string) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
}

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [ibkr, setIbkr] = useState<any>(null)
  const [pea, setPea] = useState<any>(null)
  const [crypto, setCrypto] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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

  if (!user) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-zinc-500 font-mono">Connecte-toi sur <Link href="/analytics"><a className="text-cyan-400 underline">/analytics</a></Link></p>
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
        <div className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-400 mb-2">Patrimoine total (EUR)</div>
        <div className="text-5xl font-mono font-bold text-cyan-400">{fmtEur(patrimoineTotal)}</div>
        <div className="text-xs font-mono text-zinc-500 mt-2">
          IBKR · {fmtEur(ibkrNlv)} <span className="text-zinc-700">·</span> PEA · {fmtEur(peaValue)} <span className="text-zinc-700">·</span> Crypto · {fmtEur(cryptoValue)}
        </div>
      </div>

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
    <Link href={link}>
      <a className={`block border ${border} bg-black/40 rounded p-4 transition cursor-pointer group`}>
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
      </a>
    </Link>
  )
}
