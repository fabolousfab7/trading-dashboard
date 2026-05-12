import { useEffect, useState, useMemo } from "react"
import { Link } from "wouter"
import { supabase } from "@/lib/supabase"
import { BarChart3, Briefcase, Wallet, ArrowRight, Bitcoin, Plus, Pin, Trash2, Edit3, Image, X, ChevronDown, ChevronUp, Zap } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

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
  const [notes, setNotes] = useState<any[]>([])
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [editingNote, setEditingNote] = useState<any>(null)
  const [noteTitle, setNoteTitle] = useState("")
  const [noteContent, setNoteContent] = useState("")
  const [noteImage, setNoteImage] = useState<File | null>(null)
  const [noteImagePreview, setNoteImagePreview] = useState<string | null>(null)
  const [noteSaving, setNoteSaving] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(true)
  const [fhfSim, setFhfSim] = useState<any>(null)
  const [marketEvents, setMarketEvents] = useState<any[]>([])
  const [marketLoading, setMarketLoading] = useState(false)

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
    authFetch("/api/notes")
      .then(r => r.ok ? r.json() : { notes: [] })
      .then(({ notes: n }) => setNotes(n || []))
      .catch(() => {})
    setMarketLoading(true)
    fetch("/api/market-events")
      .then(r => r.ok ? r.json() : { events: [] })
      .then(({ events }) => setMarketEvents(events || []))
      .catch(() => {})
      .finally(() => setMarketLoading(false))
    authFetch("/api/fhf/simulation")
      .then(r => r.ok ? r.json() : null)
      .then(d => setFhfSim(d))
      .catch(() => {})
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

  async function saveNote() {
    if (!noteTitle.trim()) return
    setNoteSaving(true)
    try {
      let imageUrl = editingNote?.image_url || null
      if (noteImage) {
        const { data: session } = await supabase.auth.getSession()
        const userId = session.session?.user?.id
        const ext = noteImage.name.split('.').pop()
        const fileName = `${userId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('note-images')
          .upload(fileName, noteImage, { contentType: noteImage.type })
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from('note-images')
            .getPublicUrl(fileName)
          imageUrl = urlData.publicUrl
        }
      }
      const body = { title: noteTitle, content: noteContent || null, image_url: imageUrl }
      if (editingNote) {
        const r = await authFetch(`/api/notes/${editingNote.id}`, { method: "PUT", body: JSON.stringify(body) })
        if (r.ok) {
          const { note } = await r.json()
          setNotes(prev => prev.map(n => n.id === note.id ? note : n))
        }
      } else {
        const r = await authFetch("/api/notes", { method: "POST", body: JSON.stringify(body) })
        if (r.ok) {
          const { note } = await r.json()
          setNotes(prev => [note, ...prev])
        }
      }
      resetNoteForm()
    } catch (e) { console.error(e) }
    finally { setNoteSaving(false) }
  }

  function resetNoteForm() {
    setShowNoteForm(false)
    setEditingNote(null)
    setNoteTitle("")
    setNoteContent("")
    setNoteImage(null)
    setNoteImagePreview(null)
  }

  function startEditNote(note: any) {
    setEditingNote(note)
    setNoteTitle(note.title)
    setNoteContent(note.content || "")
    setNoteImagePreview(note.image_url || null)
    setShowNoteForm(true)
  }

  async function deleteNote(id: string) {
    const r = await authFetch(`/api/notes/${id}`, { method: "DELETE" })
    if (r.ok) setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function togglePin(note: any) {
    const r = await authFetch(`/api/notes/${note.id}`, {
      method: "PUT",
      body: JSON.stringify({ is_pinned: !note.is_pinned }),
    })
    if (r.ok) {
      const { note: updated } = await r.json()
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n)
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }))
    }
  }

  function handleImagePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          setNoteImage(file)
          setNoteImagePreview(URL.createObjectURL(file))
        }
        return
      }
    }
  }

  const FLAG: Record<string, string> = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿", CHF: "🇨🇭", CNY: "🇨🇳" }

  function eventTimeStr(ev: any) {
    if (!ev.date) return ""
    const d = new Date(ev.date)
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  }

  function eventDateStr(ev: any) {
    if (!ev.date) return ""
    const d = new Date(ev.date)
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })
  }

  function isPast(ev: any) {
    if (ev.actual && ev.actual.trim()) return true
    if (!ev.date) return false
    return new Date(ev.date) < new Date()
  }

  if (!user) return (
    <div className="min-h-screen bg-[--at-bg] flex items-center justify-center">
      <p className="text-[--ink3] font-mono">Connecte-toi sur <Link href="/analytics" className="text-[--at-accent] underline">/analytics</Link></p>
    </div>
  )
  if (loading) return <div className="p-8 text-[--ink2] font-mono text-sm">Chargement...</div>

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
  const cryptoPerso = cryptoPositions.filter((p: any) => (Number(p.ownership_pct) || 100) === 100)
  const cryptoShared = cryptoPositions.filter((p: any) => (Number(p.ownership_pct) || 100) < 100)

  const cryptoPersoValue = cryptoPerso.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.market_price), 0)
  const cryptoPersoValueUsd = cryptoPerso.reduce((s: number, p: any) => s + Number(p.quantity) * (Number(p.market_price_usd) || 0), 0)
  const cryptoPersoCost = cryptoPerso.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.avg_cost), 0)
  const cryptoPersoPerfPct = cryptoPersoCost ? ((cryptoPersoValue - cryptoPersoCost) / cryptoPersoCost) * 100 : 0

  const cryptoSharedValue = cryptoShared.reduce((s: number, p: any) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * Number(p.market_price) * own
  }, 0)
  const ccaNet = fhfSim?.cca_balance || 0
  const fhfEquity = Math.max(0, ibkrNlv - ccaNet)

  const ibkrCost = positions.reduce((s: number, p: any) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    return s + Number(p.quantity) * Number(p.avg_cost) * fx
  }, 0)
  const ibkrPv = Math.max(0, fhfEquity - ibkrCost)
  const fhfNetApresIs = fhfEquity - ibkrPv * 0.15
  const fhfDistribuableNet = fhfNetApresIs - ibkrPv * 0.85 * 0.172

  const peaCost = peaPositions.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.avg_cost), 0)
  const peaPv = Math.max(0, peaValue - peaCost)
  const peaNet = peaValue - peaPv * 0.30

  const patrimoineBrut = ccaNet + fhfEquity + peaValue + cryptoPersoValue + cryptoSharedValue

  const cryptoPersoNet = cryptoPersoValue * (1 - 0.314)
  const cryptoSharedNet = cryptoSharedValue * (1 - 0.314)

  const patrimoineNet = ccaNet + fhfDistribuableNet + peaNet + cryptoPersoNet + cryptoSharedNet

  const ALLOC_COLORS_5 = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55"]
  const allocationData = [
    { name: "CCA", value: ccaNet, color: ALLOC_COLORS_5[0] },
    { name: "FHF IBKR", value: fhfEquity, color: ALLOC_COLORS_5[1] },
    { name: "PEA", value: peaValue, color: ALLOC_COLORS_5[2] },
    { name: "Crypto Perso", value: cryptoPersoValue, color: ALLOC_COLORS_5[3] },
    { name: "Crypto R+F", value: cryptoSharedValue, color: ALLOC_COLORS_5[4] },
  ].filter(d => d.value > 0)

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-[--rule] pb-4">
        <div className="text-[--at-accent] text-xs font-mono uppercase tracking-widest">Patrimoine consolidé</div>
        <h1 className="text-4xl font-mono font-bold tracking-wider mt-1">
          <span className="text-[--at-accent]">F.H.F </span>
          <span className="text-[--at-accent]">Patrimoine</span>
        </h1>
      </div>

      <div className="border border-[--rule] bg-[--at-surface] rounded p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[--at-accent] mb-2 flex items-center">
              Patrimoine brut (EUR)
              <InfoTip text="Patrimoine brut = CCA + Equity FHF (NLV IBKR - CCA) + PEA + Crypto Perso + Crypto R+F. Avant impôts sur les plus-values." wide />
            </div>
            <div className="text-4xl font-mono font-bold text-[--at-accent]">{fmtEur(patrimoineBrut)}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mt-3 flex items-center">
              Net estimé (après impôts)
              <InfoTip text="Patrimoine net = CCA (100%) + FHF equity (IS 15% + PS 17.2% sur PV) + PEA (30% sur PV) + Crypto (31.4% sur tout). Estimation si liquidation totale." wide />
            </div>
            <div className="text-xl font-mono font-bold text-[--ink2]">{fmtEur(patrimoineNet)}</div>
          </div>
          {allocationData.length > 0 && (
            <div className="hidden md:block">
              <PieChart width={130} height={130}>
                <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={55} innerRadius={25} strokeWidth={1} stroke="#fbf8f1">
                  {allocationData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#fbf8f1", border: "1px solid #d9d3c4", borderRadius: 8, fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "#1a1814" }}
                  itemStyle={{ color: "#1a1814" }}
                  labelStyle={{ color: "#4a4540" }}
                  formatter={(value: number, name: string) => [fmtEur(value), name]}
                />
              </PieChart>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5 pt-4 border-t border-[--rule]">
          <MiniCard label="CCA" value={fmtEur(ccaNet)} taxLabel="100%" tip="Compte courant d'associé. Récupérable sans impôt." />
          <MiniCard label="FHF Equity" value={fmtEur(fhfEquity)} taxLabel={ibkrPv > 0 ? `-IS 15% -PS 17.2% sur PV ${fmtEur(ibkrPv)}` : "Pas d'impôt (MV)"}
            netValue={fmtEur(fhfDistribuableNet)} tip="Equity = NLV IBKR - CCA. IS 15% puis PS 17.2% sur la plus-value uniquement. Taux réduit PME." />
          <MiniCard label="PEA" value={fmtEur(peaValue)} taxLabel={peaPv > 0 ? `-30% sur PV ${fmtEur(peaPv)}` : "Pas d'impôt (MV)"}
            netValue={fmtEur(peaNet)} tip="Flat tax 30% sur la plus-value uniquement. Si en moins-value, pas d'impôt." />
          <MiniCard label="Crypto Perso" value={fmtEur(cryptoPersoValue)} taxLabel="-31.4%"
            netValue={fmtEur(cryptoPersoNet)} tip="Flat tax 31.4% sur la valeur totale." />
          <MiniCard label="Crypto R+F" value={fmtEur(cryptoSharedValue)} taxLabel="-31.4%"
            netValue={fmtEur(cryptoSharedNet)} tip="Part Fabien (50%). Flat tax 31.4% sur la valeur totale." />
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent]">
              Évolution patrimoine
            </h2>
            <div className="flex gap-1">
              {[30, 90, 365].map(d => (
                <button key={d} onClick={() => setChartRange(d)}
                  className={`px-3 py-1 text-[10px] font-mono uppercase rounded transition ${
                    chartRange === d
                      ? "bg-[--at-accent]/10 text-[--at-accent] border border-[--at-accent]/40"
                      : "text-[--ink3] hover:text-[--ink] border border-transparent"
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
                  <stop offset="5%" stopColor="#7d2b1d" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7d2b1d" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPEA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#cfb88f" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#cfb88f" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCrypto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3a6e3f" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3a6e3f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4a4540", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#4a4540", fontFamily: "monospace" }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip
                contentStyle={{ background: "#fbf8f1", border: "1px solid #d9d3c4", borderRadius: 8, fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "#1a1814" }}
                itemStyle={{ color: "#1a1814" }}
                labelStyle={{ color: "#4a4540" }}
                formatter={(value: number, name: string) => [fmtEur(value), name]}
              />
              <Area type="monotone" dataKey="IBKR" stackId="1" stroke="#7d2b1d" fill="url(#gradIBKR)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="Boursorama" stackId="1" stroke="#cfb88f" fill="url(#gradPEA)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="Crypto" stackId="1" stroke="#3a6e3f" fill="url(#gradCrypto)" strokeWidth={1.5} />
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
        <SubCard icon={Bitcoin} title="Crypto Perso" subtitle="100% détenu"
          mainValue={cryptoPerso.length > 0 ? fmtEur(cryptoPersoValue) : "—"}
          mainLabel={cryptoPerso.length > 0 ? "Valeur" : "Pas connecté"}
          subValue={cryptoPerso.length > 0 && cryptoPersoValueUsd > 0 ? fmtUsd(cryptoPersoValueUsd) : undefined}
          stats={cryptoPerso.length > 0 ? [
            { label: "Perf", value: `${cryptoPersoPerfPct >= 0 ? "+" : ""}${cryptoPersoPerfPct.toFixed(1)}%`, color: cryptoPersoPerfPct >= 0 ? "green" : "red" },
            { label: "Positions", value: String(cryptoPerso.length) },
          ] : [{ label: "Statut", value: "À configurer" }]}
          link="/crypto" accent={cryptoPerso.length > 0 ? "fuchsia" : "zinc"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Events */}
        <div className="border border-[--rule] rounded bg-[--at-surface]">
          <div className="border-b border-[--rule] p-4 flex items-center gap-2">
            <Zap size={14} className="text-[--at-accent]" />
            <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent]">
              Marché · High Impact · Aujourd'hui
            </h2>
          </div>
          <div className="p-3 space-y-1 max-h-[500px] overflow-y-auto">
            {marketLoading && <p className="text-[--ink3] text-xs font-mono text-center py-4">Chargement...</p>}
            {!marketLoading && marketEvents.length === 0 && (
              <p className="text-[--ink3] text-xs font-mono text-center py-4">Aucun événement high impact aujourd'hui</p>
            )}
            {marketEvents.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-1 text-[9px] font-mono text-[--ink3] uppercase tracking-wider">
                <div className="text-base shrink-0 invisible">{"\u{1F3F3}\u{FE0F}"}</div>
                <div className="text-[--ink3] w-16 shrink-0 text-right">Heure</div>
                <div className="flex-1 min-w-0">Événement</div>
                <div className="w-12 text-center">Prévu</div>
                <div className="w-12 text-center">Préc.</div>
                <div className="w-12 text-center">Réel</div>
              </div>
            )}
            {marketEvents.map((ev, i) => {
              const past = isPast(ev)
              return (
                <div key={i} className={`flex items-center gap-3 px-3 py-1.5 rounded text-xs font-mono ${past ? "opacity-40" : "hover:bg-[--at-accent]/5"}`}>
                  <span className="text-base shrink-0">{FLAG[ev.country] || ev.country}</span>
                  <span className="text-[--ink3] w-16 shrink-0 text-right">{eventTimeStr(ev)}</span>
                  <span className="text-[--ink] flex-1 truncate min-w-0">{ev.title}</span>
                  <span className="text-[--ink3] w-12 text-center shrink-0">{ev.forecast || "—"}</span>
                  <span className="text-[--ink3] w-12 text-center shrink-0">{ev.previous || "—"}</span>
                  <span className={`w-12 text-center shrink-0 ${ev.actual ? "text-[--at-accent] font-bold" : "text-[--ink3]"}`}>{ev.actual || "—"}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Notes & Idées */}
        <div className="border border-[--rule] rounded bg-[--at-surface]">
          <div className="border-b border-[--rule] p-4 flex items-center justify-between">
            <button onClick={() => setNotesExpanded(!notesExpanded)}
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[--at-accent] hover:text-[--at-accent] transition">
              {notesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Notes & Idées · {notes.length}
            </button>
            <button onClick={() => { resetNoteForm(); setShowNoteForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[--at-accent]/10 border border-[--rule] text-[--at-accent] hover:bg-[--at-accent]/20 transition rounded font-mono text-[10px] uppercase tracking-wider">
              <Plus size={12} /> Nouvelle note
            </button>
          </div>

          {notesExpanded && (
            <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
              {showNoteForm && (
                <div className="border border-[--rule] rounded p-4 bg-[--at-surface] space-y-3" onPaste={handleImagePaste}>
                  <input
                    type="text" value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
                    onPaste={handleImagePaste}
                    placeholder="Titre (ex: Setup EUR/USD H4, Idée long NVDA...)"
                    className="w-full bg-transparent border border-[--rule] rounded px-3 py-2 text-sm font-mono text-[--ink] placeholder:text-[--ink3] focus:outline-none focus:border-[--at-accent]/40"
                  />
                  <textarea
                    value={noteContent} onChange={e => setNoteContent(e.target.value)}
                    onPaste={handleImagePaste}
                    placeholder="Détails, niveaux, thèse... (Ctrl+V pour coller un chart)"
                    rows={3}
                    className="w-full bg-transparent border border-[--rule] rounded px-3 py-2 text-sm font-mono text-[--ink] placeholder:text-[--ink3] focus:outline-none focus:border-[--at-accent]/40 resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 px-3 py-1.5 border border-[--rule] rounded text-[--ink2] hover:text-[--ink] hover:border-[--at-accent]/40 transition cursor-pointer font-mono text-[10px] uppercase tracking-wider">
                      <Image size={12} /> {noteImagePreview ? "Changer" : "Ajouter chart"}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) { setNoteImage(f); setNoteImagePreview(URL.createObjectURL(f)) }
                        }} />
                    </label>
                    {noteImagePreview && (
                      <div className="relative">
                        <img src={noteImagePreview} alt="preview" className="h-16 rounded border border-[--rule]" />
                        <button onClick={() => { setNoteImage(null); setNoteImagePreview(null) }}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full p-0.5">
                          <X size={10} className="text-[--ink]" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={resetNoteForm}
                      className="px-3 py-1.5 text-[--ink3] hover:text-[--ink] font-mono text-[10px] uppercase tracking-wider transition">
                      Annuler
                    </button>
                    <button onClick={saveNote} disabled={noteSaving || !noteTitle.trim()}
                      className="px-4 py-1.5 bg-[--at-accent]/20 border border-[--at-accent]/40 text-[--at-accent] hover:bg-[--at-accent]/30 transition rounded font-mono text-[10px] uppercase tracking-wider disabled:opacity-40">
                      {noteSaving ? "..." : editingNote ? "Modifier" : "Ajouter"}
                    </button>
                  </div>
                </div>
              )}

              {notes.length === 0 && !showNoteForm && (
                <p className="text-[--ink3] text-xs font-mono text-center py-6">
                  Aucune note. Clique "Nouvelle note" pour commencer.
                </p>
              )}
              {notes.map(note => (
                <div key={note.id}
                  className={`border ${note.is_pinned ? "border-[--at-accent]/30 bg-[--at-accent]/5" : "border-[--rule] bg-[--at-surface]"} rounded p-3 group`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {note.is_pinned && <Pin size={11} className="text-[--at-accent] shrink-0" />}
                        <h3 className="text-sm font-mono font-bold text-[--ink] truncate">{note.title}</h3>
                      </div>
                      {note.content && (
                        <p className="text-xs font-mono text-[--ink2] mt-1 whitespace-pre-wrap line-clamp-3">{note.content}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button onClick={() => togglePin(note)} title={note.is_pinned ? "Désépingler" : "Épingler"}
                        className={`p-1.5 rounded hover:bg-[--at-surface] ${note.is_pinned ? "text-[--at-accent]" : "text-[--ink3]"}`}>
                        <Pin size={12} />
                      </button>
                      <button onClick={() => startEditNote(note)} className="p-1.5 rounded hover:bg-[--at-surface] text-[--ink3] hover:text-[--at-accent]">
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => deleteNote(note.id)} className="p-1.5 rounded hover:bg-[--at-surface] text-[--ink3] hover:text-[--at-neg]">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  {note.image_url && (
                    <img src={note.image_url} alt="chart"
                      className="mt-2 rounded border border-[--rule] max-h-48 w-full object-contain cursor-pointer hover:border-[--at-accent]/30 transition"
                      onClick={() => window.open(note.image_url, '_blank')} />
                  )}
                  <div className="text-[9px] font-mono text-[--ink3] mt-2">
                    {new Date(note.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniCard({ label, value, taxLabel, netValue, tip }: { label: string; value: string; taxLabel: string; netValue?: string; tip: string }) {
  return (
    <div className="border border-[--rule] rounded p-3 bg-[--at-surface]">
      <div className="text-[9px] font-mono uppercase tracking-widest text-[--ink3] flex items-center">
        {label}<InfoTip text={tip} />
      </div>
      <div className="text-sm font-mono font-bold text-[--ink] mt-1">{value}</div>
      <div className="text-[9px] font-mono text-[--ink3] mt-0.5">{taxLabel}</div>
      {netValue && <div className="text-[10px] font-mono text-[--ink3] mt-0.5">Net: {netValue}</div>}
    </div>
  )
}

function SubCard({ icon: Icon, title, subtitle, mainValue, mainLabel, subValue, stats, link, accent }: any) {
  const border = accent === "cyan" ? "border-[--rule] hover:border-[--at-accent]/40" : accent === "fuchsia" ? "border-[--at-accent]/30 hover:border-[--at-accent]/60" : "border-[--rule] hover:border-[--at-accent]/40"
  const titleColor = accent === "cyan" ? "text-[--at-accent]" : accent === "fuchsia" ? "text-[--at-accent]" : "text-[--ink3]"
  return (
    <Link href={link} className={`block border ${border} bg-[--at-surface] rounded p-4 transition cursor-pointer group`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 ${titleColor} text-xs font-mono uppercase tracking-wider`}>
          <Icon size={14} />{title}
        </div>
        <ArrowRight size={14} className="text-[--ink3] group-hover:text-[--ink2] transition" />
      </div>
      <div className="text-[10px] font-mono text-[--ink3] uppercase tracking-wider mb-3">{subtitle}</div>
      <div className="text-3xl font-mono font-bold text-[--ink]">{mainValue}</div>
      {subValue && <div className="text-xs font-mono text-[--ink3] mt-0.5">{subValue}</div>}
      <div className="text-[10px] font-mono uppercase tracking-wider text-[--ink3] mt-1">{mainLabel}</div>
      <div className="border-t border-[--rule] mt-4 pt-3 flex justify-between text-xs font-mono">
        {stats.map((s: any, i: number) => (
          <div key={i}>
            <div className="text-[--ink3] uppercase text-[9px] tracking-wider">{s.label}</div>
            <div className={`mt-0.5 ${s.color === "green" ? "text-[--at-pos]" : s.color === "red" ? "text-[--at-neg]" : "text-[--ink]"}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </Link>
  )
}
