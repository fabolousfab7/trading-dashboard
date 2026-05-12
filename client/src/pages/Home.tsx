import { useEffect, useState, useMemo } from "react"
import { Link } from "wouter"
import { supabase } from "@/lib/supabase"
import { Plus, Pin, Trash2, Edit3, Image, X } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

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

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`
}

const RANGES = [
  { label: "1S", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
]

const CHART_LEGEND = [
  { label: "FHF", color: "#7d2b1d" },
  { label: "PEA", color: "#cfb88f" },
  { label: "Crypto", color: "#3a6e3f" },
]

const FLAG: Record<string, string> = { USD: "\u{1F1FA}\u{1F1F8}", EUR: "\u{1F1EA}\u{1F1FA}", GBP: "\u{1F1EC}\u{1F1E7}", JPY: "\u{1F1EF}\u{1F1F5}", CAD: "\u{1F1E8}\u{1F1E6}", AUD: "\u{1F1E6}\u{1F1FA}", NZD: "\u{1F1F3}\u{1F1FF}", CHF: "\u{1F1E8}\u{1F1ED}", CNY: "\u{1F1E8}\u{1F1F3}" }

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
  const [expandedNote, setExpandedNote] = useState<string | null>(null)
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

  function eventTimeStr(ev: any) {
    if (!ev.date) return ""
    const d = new Date(ev.date)
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
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

  // ── Computed values ──────────────────────────────────────────
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
  const cryptoSharedCost = cryptoShared.reduce((s: number, p: any) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * Number(p.avg_cost) * own
  }, 0)
  const cryptoSharedPerfPct = cryptoSharedCost ? ((cryptoSharedValue - cryptoSharedCost) / cryptoSharedCost) * 100 : 0

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

  // Chart period variation
  const chartFirst = chartData.length > 0 ? chartData[0].total : 0
  const chartLast = chartData.length > 0 ? chartData[chartData.length - 1].total : 0
  const chartVarAbs = chartLast - chartFirst
  const chartVarPct = chartFirst > 0 ? (chartVarAbs / chartFirst) * 100 : 0

  // Masthead
  const now = new Date()
  const editionNo = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

  const buckets = [
    { label: "CCA", sub: "Compte courant associé", value: ccaNet, perf: null as number | null },
    { label: "FHF Equity", sub: "Capital + résultat", value: fhfEquity, perf: ibkrPerfPct },
    { label: "PEA Perso", sub: `Plafond ${fmtEur(150000)}`, value: peaValue, perf: peaPerfPct },
    { label: "Crypto Perso", sub: "100 % détenu", value: cryptoPersoValue, perf: cryptoPersoPerfPct },
    { label: "Crypto R+F", sub: "Part Fabien · 50 %", value: cryptoSharedValue, perf: cryptoSharedPerfPct },
  ]

  const infoCards = [
    { label: "Trading Actif", value: tradingProfit, perf: tradingWinRate, perfLabel: `${tradingWinRate.toFixed(0)} % WR`, sub: `${tradingCount} trades`, link: "/analytics", alloc: 0 },
    { label: "FHF IBKR", value: ibkrNlv, perf: ibkrPerfPct, perfLabel: fmtPct(ibkrPerfPct), sub: `${positions.length} positions`, link: "/ibkr", alloc: patrimoineBrut > 0 ? (fhfEquity / patrimoineBrut) * 100 : 0 },
    { label: "PEA Perso", value: peaValue, perf: peaPerfPct, perfLabel: fmtPct(peaPerfPct), sub: `${peaPositions.length} positions`, link: "/pea", alloc: patrimoineBrut > 0 ? (peaValue / patrimoineBrut) * 100 : 0 },
    { label: "Crypto Perso", value: cryptoPersoValue, perf: cryptoPersoPerfPct, perfLabel: fmtPct(cryptoPersoPerfPct), sub: cryptoPersoValueUsd > 0 ? fmtUsd(cryptoPersoValueUsd) : `${cryptoPerso.length} positions`, link: "/crypto", alloc: patrimoineBrut > 0 ? (cryptoPersoValue / patrimoineBrut) * 100 : 0 },
  ]

  return (
    <div style={{ padding: "28px 32px" }}>

      {/* ── 1. MASTHEAD ─────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            Patrimoine consolidé &middot; N&deg;&thinsp;{editionNo}
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            La situation, en bref.
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontStyle: "italic", color: "var(--ink2)", textTransform: "capitalize" }}>
            {dateStr}
          </div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
            Édition {timeStr}
          </div>
        </div>
      </div>

      {/* ── 2. LEAD — Brut + Courbe ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 32, paddingBottom: 28, borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>

        {/* Left: patrimoine brut */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Brut &middot; tous comptes
            <InfoTip text="CCA + Equity FHF (NLV IBKR - CCA) + PEA + Crypto Perso + Crypto R+F. Avant impôts." wide />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 52, fontWeight: 700, letterSpacing: -2, color: "var(--ink)", lineHeight: 1.1, marginTop: 8 }}>
            {fmtEur(patrimoineBrut)}
          </div>
          {chartData.length > 1 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, marginTop: 8, color: chartVarAbs >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
              {chartVarAbs >= 0 ? "+" : ""}{fmtEur(chartVarAbs)} / {fmtPct(chartVarPct)}
            </div>
          )}
          <div style={{ marginTop: 24, padding: 16, background: "var(--at-surface)", border: "1px dotted var(--rule)", borderRadius: 4 }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
              Net après fiscalité estimée
              <InfoTip text="CCA (100%) + FHF equity (IS 15% + PS 17.2% sur PV) + PEA (30% sur PV) + Crypto (31.4% sur tout)." wide />
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 6 }}>
              {fmtEur(patrimoineNet)}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
              IS société &middot; PFU crypto &middot; PS PEA sur PV uniquement
            </div>
          </div>
        </div>

        {/* Right: chart */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 14 }}>
              {CHART_LEGEND.map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink2)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 1, background: l.color, display: "inline-block" }} />
                  {l.label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              {RANGES.map(r => (
                <button key={r.days} onClick={() => setChartRange(r.days)}
                  style={{
                    padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", borderRadius: 3, cursor: "pointer", border: "none", transition: "all .15s",
                    background: chartRange === r.days ? "var(--at-accent)" : "transparent",
                    color: chartRange === r.days ? "var(--at-bg)" : "var(--ink2)",
                  }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={240}>
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
          ) : (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Pas encore de données
            </div>
          )}
        </div>
      </div>

      {/* ── 3. BUCKETS ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 28 }}>
        {buckets.map((b, i) => (
          <div key={b.label} style={{ padding: "16px 18px", borderRight: i < 4 ? "1px solid var(--rule)" : "none" }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {b.label}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>
              {b.sub}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: "var(--ink)", marginTop: 8 }}>
              {fmtEur(b.value)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 4, color: b.perf === null ? "var(--ink3)" : b.perf >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
              {b.perf === null ? "—" : fmtPct(b.perf)}
            </div>
          </div>
        ))}
      </div>

      {/* ── 4. BOTTOM — Agenda + Notes ──────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 28 }}>

        {/* Agenda du marché */}
        <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
              Agenda du marché
            </span>
            <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
              High Impact
            </span>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {marketLoading && <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>Chargement...</p>}
            {!marketLoading && marketEvents.length === 0 && (
              <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>Aucun événement high impact aujourd'hui</p>
            )}
            {marketEvents.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0", fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ink3)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px dotted var(--rule)" }}>
                <span style={{ width: 20, flexShrink: 0 }}>&nbsp;</span>
                <span style={{ width: 44, flexShrink: 0, textAlign: "right" }}>Heure</span>
                <span style={{ flex: 1, minWidth: 0 }}>Événement</span>
                <span style={{ width: 44, textAlign: "center" }}>Prévu</span>
                <span style={{ width: 44, textAlign: "center" }}>Préc.</span>
                <span style={{ width: 44, textAlign: "center" }}>Réel</span>
              </div>
            )}
            {marketEvents.map((ev, i) => {
              const past = isPast(ev)
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", fontSize: 12, fontFamily: "var(--font-mono)", opacity: past ? 0.35 : 1, borderBottom: "1px dotted var(--rule)" }}>
                  <span style={{ fontSize: 14, flexShrink: 0, width: 20 }}>{FLAG[ev.country] || ev.country}</span>
                  <span style={{ color: "var(--ink3)", width: 44, flexShrink: 0, textAlign: "right" }}>{eventTimeStr(ev)}</span>
                  <span style={{ color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                  <span style={{ color: "var(--ink3)", width: 44, textAlign: "center", flexShrink: 0 }}>{ev.forecast || "—"}</span>
                  <span style={{ color: "var(--ink3)", width: 44, textAlign: "center", flexShrink: 0 }}>{ev.previous || "—"}</span>
                  <span style={{ width: 44, textAlign: "center", flexShrink: 0, color: ev.actual ? "var(--at-accent)" : "var(--ink3)", fontWeight: ev.actual ? 700 : 400 }}>{ev.actual || "—"}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Notes & Idées */}
        <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
                Notes & Idées
              </span>
              <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
                Carnet
              </span>
            </div>
            <button onClick={() => { resetNoteForm(); setShowNoteForm(true) }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--at-accent)", display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={13} /> Nouvelle note
            </button>
          </div>

          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {showNoteForm && (
              <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 16, marginBottom: 12, background: "var(--at-surface)" }} onPaste={handleImagePaste}>
                <input
                  type="text" value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
                  onPaste={handleImagePaste}
                  placeholder="Titre (ex: Setup EUR/USD H4, Idée long NVDA...)"
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--rule)", borderRadius: 3, padding: "8px 12px", fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--ink)", outline: "none", boxSizing: "border-box" }}
                />
                <textarea
                  value={noteContent} onChange={e => setNoteContent(e.target.value)}
                  onPaste={handleImagePaste}
                  placeholder="Détails, niveaux, thèse... (Ctrl+V pour coller un chart)"
                  rows={3}
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--rule)", borderRadius: 3, padding: "8px 12px", fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--ink)", outline: "none", resize: "none", marginTop: 8, boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", border: "1px solid var(--rule)", borderRadius: 3, color: "var(--ink2)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                    <Image size={12} /> {noteImagePreview ? "Changer" : "Ajouter chart"}
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) { setNoteImage(f); setNoteImagePreview(URL.createObjectURL(f)) }
                      }} />
                  </label>
                  {noteImagePreview && (
                    <div style={{ position: "relative" }}>
                      <img src={noteImagePreview} alt="preview" style={{ height: 40, borderRadius: 3, border: "1px solid var(--rule)" }} />
                      <button onClick={() => { setNoteImage(null); setNoteImagePreview(null) }}
                        style={{ position: "absolute", top: -6, right: -6, background: "var(--at-neg)", borderRadius: "50%", border: "none", padding: 2, cursor: "pointer", lineHeight: 0 }}>
                        <X size={10} color="white" />
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                  <button onClick={resetNoteForm}
                    style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)" }}>
                    Annuler
                  </button>
                  <button onClick={saveNote} disabled={noteSaving || !noteTitle.trim()}
                    style={{ padding: "5px 14px", background: "var(--at-accent)", color: "var(--at-bg)", border: "none", borderRadius: 3, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, opacity: (noteSaving || !noteTitle.trim()) ? 0.4 : 1 }}>
                    {noteSaving ? "..." : editingNote ? "Modifier" : "Ajouter"}
                  </button>
                </div>
              </div>
            )}

            {notes.length === 0 && !showNoteForm && (
              <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
                Aucune note.
              </p>
            )}

            {notes.map(note => (
              <div key={note.id}>
                <div
                  onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                  style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px dotted var(--rule)", cursor: "pointer" }}>
                  {note.image_url && (
                    <img src={note.image_url} alt=""
                      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {note.title}
                    </div>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--ink3)", textTransform: "uppercase", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                      {new Date(note.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  {note.is_pinned && <Pin size={11} style={{ color: "var(--at-accent)", flexShrink: 0, marginTop: 4 }} />}
                </div>

                {expandedNote === note.id && (
                  <div style={{ padding: "10px 0 10px 50px", borderBottom: "1px dotted var(--rule)" }}>
                    {note.content && (
                      <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink2)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{note.content}</div>
                    )}
                    {note.image_url && (
                      <img src={note.image_url} alt="chart"
                        style={{ maxWidth: "100%", maxHeight: 300, marginTop: 8, borderRadius: 4, cursor: "zoom-in" }}
                        onClick={(e) => { e.stopPropagation(); window.open(note.image_url, "_blank") }} />
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={(e) => { e.stopPropagation(); togglePin(note) }}
                        style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: note.is_pinned ? "var(--at-accent)" : "var(--ink3)", cursor: "pointer", background: "none", border: "none" }}>
                        {note.is_pinned ? "Désépingler" : "Épingler"}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); startEditNote(note) }}
                        style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink3)", cursor: "pointer", background: "none", border: "none" }}>
                        Modifier
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}
                        style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--at-neg)", cursor: "pointer", background: "none", border: "none" }}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5. INFO CARDS ───────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {infoCards.map(c => (
          <Link key={c.label} href={c.link}
            style={{ display: "block", padding: 18, border: "1px solid var(--rule)", borderRadius: 4, background: "var(--at-surface)", cursor: "pointer", textDecoration: "none", transition: "border-color .15s" }}
            className="hover:!border-[--at-accent]/40">
            <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink2)" }}>
              {c.label}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginTop: 6 }}>
              {fmtEur(c.value)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginTop: 4, color: c.perf >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
              {c.perfLabel}
            </div>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink3)", marginTop: 2 }}>{c.sub}</div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--rule)", marginTop: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, background: "var(--at-accent)", width: `${Math.min(c.alloc, 100)}%`, transition: "width .3s" }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
