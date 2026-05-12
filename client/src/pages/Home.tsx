import { useEffect, useState, useMemo } from "react"
import { Link } from "wouter"
import { supabase } from "@/lib/supabase"
import { Plus, Pin, Trash2, Edit3, Image, X } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import { AreaChart, Area, LineChart, Line, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

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

const RANGES = [
  { label: "24h", days: 1 },
  { label: "1S", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
]

const CHART_LEGEND_VALUE = [
  { label: "IBKR", color: "#2d5a27" },
  { label: "Kraken", color: "#3a6e3f" },
  { label: "Qonto", color: "#6b9f71" },
  { label: "PEA", color: "#7d2b1d" },
  { label: "Crypto P", color: "#b8944a" },
  { label: "R+F", color: "#cfb88f" },
]

const CHART_LEGEND_PERF = [
  { label: "FHF", color: "#2d5a27" },
  { label: "PEA", color: "#7d2b1d" },
  { label: "Crypto P", color: "#b8944a" },
  { label: "Crypto R+F", color: "#cfb88f" },
  { label: "Trading", color: "#5b5a55" },
]

const FLAG: Record<string, string> = { USD: "\u{1F1FA}\u{1F1F8}", EUR: "\u{1F1EA}\u{1F1FA}", GBP: "\u{1F1EC}\u{1F1E7}", JPY: "\u{1F1EF}\u{1F1F5}", CAD: "\u{1F1E8}\u{1F1E6}", AUD: "\u{1F1E6}\u{1F1FA}", NZD: "\u{1F1F3}\u{1F1FF}", CHF: "\u{1F1E8}\u{1F1ED}", CNY: "\u{1F1E8}\u{1F1F3}" }

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [ibkr, setIbkr] = useState<any>(null)
  const [pea, setPea] = useState<any>(null)
  const [crypto, setCrypto] = useState<any>(null)
  const [kraken, setKraken] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [snapshotAccounts, setSnapshotAccounts] = useState<any[]>([])
  const [chartRange, setChartRange] = useState(90)
  const [chartMode, setChartMode] = useState<"value" | "perf">("value")
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
  const [bankBalance, setBankBalance] = useState<any>(null)
  const [marketEvents, setMarketEvents] = useState<any[]>([])
  const [marketLoading, setMarketLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
  }, [])

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      authFetch("/api/trades/stats?exclude=Kraken,FTMO").then((r) => r.ok ? r.json() : null).catch(() => null),
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
    authFetch("/api/kraken/portfolio")
      .then(r => r.ok ? r.json() : null)
      .then(d => setKraken(d))
      .catch(() => {})
    authFetch("/api/trades")
      .then(r => r.ok ? r.json() : [])
      .then(d => setTrades(Array.isArray(d) ? d.filter((t: any) => !["Kraken", "FTMO"].includes(t.compte)) : []))
      .catch(() => {})
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
    authFetch("/api/compta/bank-balance")
      .then(r => r.ok ? r.json() : null)
      .then(d => setBankBalance(d))
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
    const cryptoPositions = crypto?.positions || []
    const persoVal = cryptoPositions.filter((p: any) => (Number(p.ownership_pct) || 100) === 100)
      .reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.market_price), 0)
    const sharedVal = cryptoPositions.filter((p: any) => (Number(p.ownership_pct) || 100) < 100)
      .reduce((s: number, p: any) => {
        const own = (Number(p.ownership_pct) || 100) / 100
        return s + Number(p.quantity) * Number(p.market_price) * own
      }, 0)
    const persoRatio = (persoVal + sharedVal) > 0 ? persoVal / (persoVal + sharedVal) : 0.5

    const byDateBroker: Record<string, Record<string, number>> = {}
    for (const s of snapshots) {
      const acc = snapshotAccounts.find((a: any) => a.id === s.account_id)
      if (!acc) continue
      const d = s.snapshot_date
      if (!byDateBroker[d]) byDateBroker[d] = {}
      byDateBroker[d][acc.broker] = (byDateBroker[d][acc.broker] || 0) + (Number(s.nlv_base) || 0)
    }
    const allDates = Object.keys(byDateBroker).sort()
    if (allDates.length === 0) return []

    const lastKnown: Record<string, number> = {}
    return allDates.map(date => {
      const day = byDateBroker[date]
      for (const broker of Object.keys(day)) {
        lastKnown[broker] = day[broker]
      }
      const cryptoNlv = lastKnown["Crypto"] || 0
      return {
        date: new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        IBKR: lastKnown["IBKR"] || 0,
        Kraken: lastKnown["Kraken"] || 0,
        Qonto: lastKnown["Qonto"] || 0,
        PEA: lastKnown["Boursorama"] || 0,
        "Crypto Perso": cryptoNlv * persoRatio,
        "Crypto R+F": cryptoNlv * (1 - persoRatio),
      }
    })
  }, [snapshots, snapshotAccounts, crypto])

  const perfData = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {}
    const brokerBuckets: Record<string, string[]> = { IBKR: ["FHF"], Kraken: ["FHF"], Qonto: ["FHF"], Boursorama: ["PEA"], Crypto: ["Crypto P", "Crypto R+F"] }
    for (const s of snapshots) {
      const acc = snapshotAccounts.find((a: any) => a.id === s.account_id)
      if (!acc) continue
      const buckets = brokerBuckets[acc.broker]
      if (!buckets) continue
      if (!byDate[s.snapshot_date]) byDate[s.snapshot_date] = {}
      for (const b of buckets) {
        byDate[s.snapshot_date][b] = (byDate[s.snapshot_date][b] || 0) + (Number(s.nlv_base) || 0)
      }
    }
    const dates = Object.keys(byDate).sort()
    if (dates.length < 2) return []

    const periodStart = dates[0]
    const tradePnlByDate: Record<string, number> = {}
    const periodTrades = trades
      .filter(t => t.date && t.date >= periodStart)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
    let cumPnl = 0
    for (const t of periodTrades) {
      cumPnl += Number(t.profit) || 0
      tradePnlByDate[t.date.slice(0, 10)] = cumPnl
    }

    const portfolioBuckets = ["FHF", "PEA", "Crypto P", "Crypto R+F"]
    const lastKnown: Record<string, number> = {}
    const first: Record<string, number> = {}
    let lastTradingPnl = 0
    return dates.map((date, i) => {
      const row: any = { date: new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) }
      for (const b of portfolioBuckets) {
        if (byDate[date]?.[b] !== undefined) lastKnown[b] = byDate[date][b]
        const val = lastKnown[b] || 0
        if (i === 0) first[b] = val
        row[b] = val - (first[b] || 0)
      }
      if (tradePnlByDate[date] !== undefined) lastTradingPnl = tradePnlByDate[date]
      row["Trading"] = lastTradingPnl
      return row
    })
  }, [snapshots, snapshotAccounts, trades])

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

  // IBKR
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

  // Kraken
  const krakenPositions = kraken?.positions || []
  const krakenPositionsValue = krakenPositions.reduce((s: number, p: any) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    return s + Number(p.quantity) * Number(p.market_price) * fx
  }, 0)
  const krakenCashValue = (kraken?.cashBalances || []).reduce((s: number, c: any) => {
    const fx = c.fx_rate_to_base ? Number(c.fx_rate_to_base) : 1
    return s + Number(c.amount) * fx
  }, 0)
  const krakenNlv = krakenPositionsValue + krakenCashValue

  // FHF consolidated (IBKR + Kraken)
  const fhfNlvTotal = ibkrNlv + krakenNlv

  // PEA
  const peaPositions = pea?.positions || []
  const peaPositionsValue = peaPositions.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.market_price), 0)
  const peaCashTotal = (pea?.cashBalances || []).reduce((s: number, c: any) => s + Number(c.amount), 0)
  const peaValue = peaPositionsValue + peaCashTotal
  const peaInvested = peaPositions.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.avg_cost), 0)

  // Crypto Perso (ownership 100%)
  const cryptoPositions = crypto?.positions || []
  const cryptoPerso = cryptoPositions.filter((p: any) => (Number(p.ownership_pct) || 100) === 100)
  const cryptoShared = cryptoPositions.filter((p: any) => (Number(p.ownership_pct) || 100) < 100)

  const cryptoPersoValue = cryptoPerso.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.market_price), 0)

  // Crypto R+F (shared, ownership < 100%)
  const cryptoSharedValue = cryptoShared.reduce((s: number, p: any) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * Number(p.market_price) * own
  }, 0)

  // Patrimoine (sans CCA)
  const qontoBalance = bankBalance?.balance || 0
  const patrimoineBrut = fhfNlvTotal + qontoBalance + peaValue + cryptoPersoValue + cryptoSharedValue

  // Fiscalité pour le net
  const ccaNet = fhfSim?.cca_balance || 0
  const fhfEquity = Math.max(0, fhfNlvTotal - ccaNet)
  const ibkrCost = positions.reduce((s: number, p: any) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    return s + Number(p.quantity) * Number(p.avg_cost) * fx
  }, 0)
  const krakenCost = krakenPositions.reduce((s: number, p: any) => {
    const fx = p.fx_rate_to_base ? Number(p.fx_rate_to_base) : 1
    return s + Number(p.quantity) * Number(p.avg_cost) * fx
  }, 0)
  const fhfPv = Math.max(0, fhfEquity - ibkrCost - krakenCost)
  const fhfNetApresIs = fhfEquity - fhfPv * 0.15
  const fhfDistribuableNet = fhfNetApresIs - fhfPv * 0.85 * 0.172

  const peaPv = Math.max(0, peaValue - peaInvested - peaCashTotal)
  const peaNet = peaValue - Math.max(0, peaPv) * 0.30
  const cryptoPersoNet = cryptoPersoValue * (1 - 0.314)
  const cryptoSharedNet = cryptoSharedValue * (1 - 0.314)
  const patrimoineNet = fhfDistribuableNet + qontoBalance + peaNet + cryptoPersoNet + cryptoSharedNet

  // Chart variation
  const chartKeys = ["IBKR", "Kraken", "Qonto", "PEA", "Crypto Perso", "Crypto R+F"]
  const sumRow = (row: any) => chartKeys.reduce((s, k) => s + (row[k] || 0), 0)
  const chartFirst = chartData.length > 0 ? sumRow(chartData[0]) : 0
  const chartLast = chartData.length > 0 ? sumRow(chartData[chartData.length - 1]) : 0
  const chartVarAbs = chartLast - chartFirst

  // % evolution on selected timeframe (from snapshots)
  function calcPctChange(broker: string): number | null {
    const accountSnaps = snapshots.filter(s => {
      const acc = snapshotAccounts.find((a: any) => a.id === s.account_id)
      return acc?.broker === broker
    })
    if (accountSnaps.length < 2) return null
    const sorted = [...accountSnaps].sort((a: any, b: any) =>
      new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
    )
    const oldest = Number(sorted[0].nlv_base) || 0
    const newest = Number(sorted[sorted.length - 1].nlv_base) || 0
    if (oldest === 0) return null
    return ((newest - oldest) / oldest) * 100
  }

  const fhfPctChange = (() => {
    const pcts = [
      { pct: calcPctChange("IBKR"), val: ibkrNlv },
      { pct: calcPctChange("Kraken"), val: krakenNlv },
      { pct: calcPctChange("Qonto"), val: qontoBalance },
    ].filter(p => p.pct !== null) as { pct: number; val: number }[]
    if (pcts.length === 0) return null
    const totalVal = pcts.reduce((s, p) => s + p.val, 0) || 1
    return pcts.reduce((s, p) => s + p.pct * (p.val / totalVal), 0)
  })()
  const cryptoPctChange = calcPctChange("Crypto")
  const peaPctChange = calcPctChange("Boursorama")

  // Masthead
  const now = new Date()
  const editionNo = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

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
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 32, paddingBottom: 28, borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div className="text-[10px] tracking-[0.15em] text-[--ink2] uppercase font-semibold flex items-center">
            Brut &middot; tous comptes
            <InfoTip text="FHF (IBKR + Kraken + Qonto) + PEA + Crypto Perso + Crypto R+F. Avant impôts, hors CCA." wide />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 48, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1, marginTop: 4 }} className="text-[--ink]">
            {fmtEur(patrimoineBrut)}
          </div>
          {chartData.length > 1 && (
            <div style={{ fontFamily: "var(--font-mono)" }} className={`text-xs mt-1.5 tabular-nums ${chartVarAbs >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
              {chartVarAbs >= 0 ? "↑" : "↓"} {fmtEur(Math.abs(chartVarAbs))} sur {chartRange}j
            </div>
          )}
          <div className="mt-4 p-3 bg-[--at-surface] border border-dotted border-[--rule] rounded">
            <div className="text-[9px] tracking-[0.15em] text-[--ink2] uppercase font-semibold flex items-center">
              Net après fiscalité estimée
              <InfoTip text="FHF equity (IS 15% + PS 17.2% sur PV) + PEA (30% sur PV) + Crypto (31.4% sur tout)." wide />
            </div>
            <div style={{ fontFamily: "var(--font-serif)" }} className="text-xl font-bold mt-0.5 text-[--ink]">
              {fmtEur(patrimoineNet)}
            </div>
            <div style={{ fontFamily: "var(--font-serif)" }} className="text-[10px] italic text-[--ink3] mt-0.5">
              IS société &middot; PFU crypto &middot; PS PEA sur PV
            </div>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 14 }}>
              {(chartMode === "value" ? CHART_LEGEND_VALUE : CHART_LEGEND_PERF).map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink2)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 1, background: l.color, display: "inline-block" }} />
                  {l.label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              {([{ label: "Patrimoine", mode: "value" as const }, { label: "Performance", mode: "perf" as const }]).map(m => (
                <button key={m.mode} onClick={() => setChartMode(m.mode)}
                  style={{
                    padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", borderRadius: 3, cursor: "pointer", border: "none", transition: "all .15s",
                    background: chartMode === m.mode ? "var(--at-accent)" : "transparent",
                    color: chartMode === m.mode ? "var(--at-bg)" : "var(--ink2)",
                  }}>
                  {m.label}
                </button>
              ))}
              <div style={{ width: 1, background: "var(--rule)", margin: "0 4px" }} />
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
          {chartMode === "value" && chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--ink3)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--ink3)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "var(--at-surface)", border: "1px solid var(--rule)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)" }}
                  formatter={(value: number, name: string) => [fmtEur(value), name]}
                />
                <Area type="monotone" dataKey="Qonto" stackId="1" stroke="#6b9f71" fill="#6b9f71" fillOpacity={0.85} />
                <Area type="monotone" dataKey="Kraken" stackId="1" stroke="#3a6e3f" fill="#3a6e3f" fillOpacity={0.85} />
                <Area type="monotone" dataKey="IBKR" stackId="1" stroke="#2d5a27" fill="#2d5a27" fillOpacity={0.85} />
                <Area type="monotone" dataKey="PEA" stackId="1" stroke="#7d2b1d" fill="#7d2b1d" fillOpacity={0.85} />
                <Area type="monotone" dataKey="Crypto R+F" stackId="1" stroke="#cfb88f" fill="#cfb88f" fillOpacity={0.85} />
                <Area type="monotone" dataKey="Crypto Perso" stackId="1" stroke="#b8944a" fill="#b8944a" fillOpacity={0.85} />
              </AreaChart>
            </ResponsiveContainer>
          ) : chartMode === "perf" && perfData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={perfData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--ink3)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--ink3)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}€`} />
                <Tooltip
                  contentStyle={{ background: "var(--at-surface)", border: "1px solid var(--rule)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)" }}
                  formatter={(value: number, name: string) => [`${value >= 0 ? "+" : ""}${fmtEur(value)}`, name]}
                />
                <ReferenceLine y={0} stroke="var(--ink)" strokeWidth={1} />
                <Line type="monotone" dataKey="FHF" stroke="#2d5a27" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="PEA" stroke="#7d2b1d" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Crypto P" stroke="#b8944a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Crypto R+F" stroke="#cfb88f" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Trading" stroke="#5b5a55" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Pas encore de données
            </div>
          )}
        </div>
      </div>

      {/* ── 3. PERFORMANCE CARDS ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        <PerfCard label="FHF" sub="Société"
          lines={[{ name: "IBKR", value: ibkrNlv }, { name: "Kraken", value: krakenNlv }, { name: "Qonto", value: qontoBalance }]}
          total={ibkrNlv + krakenNlv + qontoBalance} pctChange={fhfPctChange} href="/fhf" />
        <PerfCard label="Crypto"
          lines={[{ name: "Perso", value: cryptoPersoValue }, { name: "R+F (50%)", value: cryptoSharedValue }]}
          total={cryptoPersoValue + cryptoSharedValue} pctChange={cryptoPctChange} href="/crypto" />

        {/* Trading Actif — card spéciale */}
        <Link href="/analytics" className="block" style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)", cursor: "pointer", transition: "background 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--at-surface)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <div className="text-[10px] tracking-[0.15em] text-[--ink2] uppercase font-semibold">Trading Actif</div>
          <div style={{ fontFamily: "var(--font-serif)" }} className="text-[10px] italic text-[--ink3] mt-0.5">Journal tous comptes</div>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[--ink3]">P&L</span>
              <span style={{ fontFamily: "var(--font-mono)" }} className={`tabular-nums font-semibold ${tradingProfit >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
                {fmtEur(tradingProfit)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[--ink3]">Trades</span>
              <span style={{ fontFamily: "var(--font-mono)" }} className="tabular-nums">{tradingCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[--ink3]">Win rate</span>
              <span style={{ fontFamily: "var(--font-mono)" }} className="tabular-nums">{tradingWinRate.toFixed(0)}%</span>
            </div>
          </div>
          <div className="mt-3 text-[--ink3] text-sm" style={{ fontFamily: "var(--font-mono)" }}>—</div>
        </Link>

        <PerfCard label="PEA Perso" sub="Boursobank"
          lines={[{ name: "Valeur", value: peaValue }]}
          total={peaValue} pctChange={peaPctChange} href="/pea" />
      </div>

      {/* ── 4. BOTTOM — Agenda + Notes ──────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>

        {/* Agenda du marché */}
        <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Agenda du marché</span>
            <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>High Impact</span>
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
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Notes & Idées</span>
              <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>Carnet</span>
            </div>
            <button onClick={() => { resetNoteForm(); setShowNoteForm(true) }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--at-accent)", display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={13} /> Nouvelle note
            </button>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {showNoteForm && (
              <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 16, marginBottom: 12, background: "var(--at-surface)" }} onPaste={handleImagePaste}>
                <input type="text" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} onPaste={handleImagePaste}
                  placeholder="Titre (ex: Setup EUR/USD H4, Idée long NVDA...)"
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--rule)", borderRadius: 3, padding: "8px 12px", fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--ink)", outline: "none", boxSizing: "border-box" }} />
                <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} onPaste={handleImagePaste}
                  placeholder="Détails, niveaux, thèse... (Ctrl+V pour coller un chart)" rows={3}
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--rule)", borderRadius: 3, padding: "8px 12px", fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--ink)", outline: "none", resize: "none", marginTop: 8, boxSizing: "border-box" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", border: "1px solid var(--rule)", borderRadius: 3, color: "var(--ink2)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                    <Image size={12} /> {noteImagePreview ? "Changer" : "Ajouter chart"}
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) { setNoteImage(f); setNoteImagePreview(URL.createObjectURL(f)) } }} />
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
              <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>Aucune note.</p>
            )}
            {notes.map(note => (
              <div key={note.id}>
                <div onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                  style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px dotted var(--rule)", cursor: "pointer" }}>
                  {note.image_url && <img src={note.image_url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title}</div>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--ink3)", textTransform: "uppercase", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                      {new Date(note.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  {note.is_pinned && <Pin size={11} style={{ color: "var(--at-accent)", flexShrink: 0, marginTop: 4 }} />}
                </div>
                {expandedNote === note.id && (
                  <div style={{ padding: "10px 0 10px 50px", borderBottom: "1px dotted var(--rule)" }}>
                    {note.content && <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink2)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{note.content}</div>}
                    {note.image_url && (
                      <img src={note.image_url} alt="chart" style={{ maxWidth: "100%", maxHeight: 300, marginTop: 8, borderRadius: 4, cursor: "zoom-in" }}
                        onClick={(e) => { e.stopPropagation(); window.open(note.image_url, "_blank") }} />
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={(e) => { e.stopPropagation(); togglePin(note) }}
                        style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: note.is_pinned ? "var(--at-accent)" : "var(--ink3)", cursor: "pointer", background: "none", border: "none" }}>
                        {note.is_pinned ? "Désépingler" : "Épingler"}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); startEditNote(note) }}
                        style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink3)", cursor: "pointer", background: "none", border: "none" }}>Modifier</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}
                        style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--at-neg)", cursor: "pointer", background: "none", border: "none" }}>Supprimer</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PerfCard({ label, sub, lines, total, pctChange, href }: {
  label: string; sub?: string; lines: { name: string; value: number }[]; total: number; pctChange: number | null; href: string
}) {
  return (
    <Link href={href} className="block" style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)", cursor: "pointer", transition: "background 0.2s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--at-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <div className="text-[10px] tracking-[0.15em] text-[--ink2] uppercase font-semibold">{label}</div>
      {sub && <div style={{ fontFamily: "var(--font-serif)" }} className="text-[10px] italic text-[--ink3] mt-0.5">{sub}</div>}
      <div className="mt-3 space-y-1.5">
        {lines.map((l, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-[--ink3]">{l.name}</span>
            <span style={{ fontFamily: "var(--font-mono)" }} className="tabular-nums">{fmtEur(l.value)}</span>
          </div>
        ))}
        {lines.length > 1 && (
          <>
            <div className="border-t border-dotted border-[--rule]" />
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-[--ink2]">Total</span>
              <span style={{ fontFamily: "var(--font-mono)" }} className="tabular-nums">{fmtEur(total)}</span>
            </div>
          </>
        )}
      </div>
      <div className="mt-3">
        <div style={{ fontFamily: "var(--font-mono)" }}
          className={`text-sm font-bold tabular-nums ${pctChange === null ? "text-[--ink3]" : pctChange >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
          {pctChange === null ? "—" : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`}
        </div>
        {pctChange !== null && (
          <div className="h-1 bg-[--rule-soft] mt-1 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pctChange >= 0 ? "bg-[--at-pos]" : "bg-[--at-neg]"}`}
              style={{ width: `${Math.min(100, Math.abs(pctChange) * 2)}%` }} />
          </div>
        )}
      </div>
    </Link>
  )
}
