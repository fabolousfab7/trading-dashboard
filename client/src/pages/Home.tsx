import { useEffect, useState, useMemo } from "react"
import { Link } from "wouter"
import { supabase } from "@/lib/supabase"
import { Plus, Pin, Trash2, Image, X } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import NotePanel from "@/components/NotePanel"
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerNote, setDrawerNote] = useState<any>(null)
  const [drawerTitle, setDrawerTitle] = useState("")
  const [fhfSim, setFhfSim] = useState<any>(null)
  const [bankBalance, setBankBalance] = useState<any>(null)
  const [marketEvents, setMarketEvents] = useState<any[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [cotData, setCotData] = useState<any>(null)

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
    fetch("/api/cot/latest")
      .then(r => r.ok ? r.json() : null)
      .then(d => setCotData(d))
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

  function openNoteDrawer(note: any | null) {
    setDrawerNote(note)
    setDrawerTitle(note?.title || "")
    setDrawerOpen(true)
  }

  async function handleNoteSave(text: string, images: string[]) {
    if (!drawerTitle.trim()) return
    const body = { title: drawerTitle, content: text || null, images }
    if (drawerNote?.id) {
      const r = await authFetch(`/api/notes/${drawerNote.id}`, { method: "PUT", body: JSON.stringify(body) })
      if (r.ok) {
        const { note } = await r.json()
        setNotes(prev => prev.map(n => n.id === note.id ? note : n))
        setDrawerNote(note)
      }
    } else {
      const r = await authFetch("/api/notes", { method: "POST", body: JSON.stringify(body) })
      if (r.ok) {
        const { note } = await r.json()
        setNotes(prev => [note, ...prev])
        setDrawerNote(note)
      }
    }
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
    <div style={{ minHeight: "100vh", background: "var(--at-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Connecte-toi sur <Link href="/analytics" style={{ color: "var(--at-accent)", textDecoration: "underline" }}>/analytics</Link></p>
    </div>
  )
  if (loading) return <div style={{ padding: 28, color: "var(--ink2)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Chargement...</div>

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

  const allMovers: { ticker: string; name: string; poche: string; value: number; pctChange: number }[] = []
  for (const p of (ibkr?.positions || []) as any[]) {
    const prevClose = Number(p.previous_close) || 0
    const price = Number(p.market_price) || 0
    if (prevClose > 0 && price > 0) {
      const fx = Number(p.fx_rate_to_base) || 1
      allMovers.push({ ticker: p.ticker, name: p.name || p.ticker, poche: "IBKR", value: Number(p.quantity) * price * fx, pctChange: ((price - prevClose) / prevClose) * 100 })
    }
  }
  for (const p of (pea?.positions || []) as any[]) {
    const prevClose = Number(p.previous_close) || 0
    const price = Number(p.market_price) || 0
    if (prevClose > 0 && price > 0) {
      allMovers.push({ ticker: p.ticker, name: p.name || p.ticker, poche: "PEA", value: Number(p.quantity) * price, pctChange: ((price - prevClose) / prevClose) * 100 })
    }
  }
  for (const p of cryptoPerso as any[]) {
    const prevClose = Number(p.previous_close) || 0
    const price = Number(p.market_price_usd) || Number(p.market_price) || 0
    if (prevClose > 0 && price > 0) {
      allMovers.push({ ticker: p.ticker, name: p.name || p.ticker, poche: "Crypto P", value: Number(p.quantity) * Number(p.market_price), pctChange: ((price - prevClose) / prevClose) * 100 })
    }
  }
  for (const p of cryptoShared as any[]) {
    const prevClose = Number(p.previous_close) || 0
    const price = Number(p.market_price_usd) || Number(p.market_price) || 0
    if (prevClose > 0 && price > 0) {
      const own = (Number(p.ownership_pct) || 100) / 100
      allMovers.push({ ticker: p.ticker.replace(/_R$/, ""), name: p.name || p.ticker, poche: "Crypto R+F", value: Number(p.quantity) * Number(p.market_price) * own, pctChange: ((price - prevClose) / prevClose) * 100 })
    }
  }
  const topMovers = allMovers.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange)).slice(0, 5)

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
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", fontWeight: 600, display: "flex", alignItems: "center" }}>
            Brut &middot; tous comptes
            <InfoTip text="FHF (IBKR + Kraken + Qonto) + PEA + Crypto Perso + Crypto R+F. Avant impôts, hors CCA." wide />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 48, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1, marginTop: 4, color: "var(--ink)" }}>
            {fmtEur(patrimoineBrut)}
          </div>
          {chartData.length > 1 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 6, fontVariantNumeric: "tabular-nums", color: chartVarAbs >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
              {chartVarAbs >= 0 ? "↑" : "↓"} {fmtEur(Math.abs(chartVarAbs))} sur {chartRange}j
            </div>
          )}
          <div style={{ marginTop: 16, padding: 12, background: "var(--at-surface)", border: "1px dotted var(--rule)" }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", fontWeight: 600, display: "flex", alignItems: "center" }}>
              Net après fiscalité estimée
              <InfoTip text="FHF equity (IS 15% + PS 17.2% sur PV) + PEA (30% sur PV) + Crypto (31.4% sur tout)." wide />
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, marginTop: 2, color: "var(--ink)" }}>
              {fmtEur(patrimoineNet)}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>
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
        <Link href="/analytics" style={{ display: "block", padding: "16px 22px", borderRight: "1px solid var(--rule)", cursor: "pointer", transition: "background 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--at-surface)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", fontWeight: 600 }}>Trading Actif</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>Journal tous comptes</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--ink3)" }}>P&L</span>
              <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: tradingProfit >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                {fmtEur(tradingProfit)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--ink3)" }}>Trades</span>
              <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{tradingCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--ink3)" }}>Win rate</span>
              <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{tradingWinRate.toFixed(0)}%</span>
            </div>
          </div>
          <div style={{ marginTop: 12, color: "var(--ink3)", fontSize: 13, fontFamily: "var(--font-mono)" }}>—</div>
        </Link>

        <PerfCard label="PEA Perso" sub="Boursobank"
          lines={[{ name: "Valeur", value: peaValue }]}
          total={peaValue} pctChange={peaPctChange} href="/pea" />
      </div>

      {/* ── 4. BOTTOM — Movers + Agenda + Notes ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28 }}>

        {/* Meilleurs movers */}
        <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Meilleurs movers</span>
            <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>Mouvements 24h</span>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {topMovers.length === 0 ? (
              <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "20px 0", lineHeight: 1.6 }}>
                Aucune donnée de variation 24h disponible. Les cours previous_close seront récupérés au prochain refresh.
              </p>
            ) : (
              topMovers.map((m) => (
                <div key={m.ticker + m.poche} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center",
                  padding: "8px 0", borderBottom: "1px dotted var(--rule)",
                }}>
                  <span style={{ fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>
                    {m.ticker}
                  </span>
                  <span style={{ fontStyle: "italic", color: "var(--ink3)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name} &middot; {m.poche}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink3)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                    {fmtEur(m.value)}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    color: m.pctChange >= 0 ? "var(--at-pos)" : "var(--at-neg)",
                  }}>
                    {m.pctChange >= 0 ? "+" : ""}{m.pctChange.toFixed(2)} %
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

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
            <button onClick={() => openNoteDrawer(null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--at-accent)", display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={13} /> Nouvelle note
            </button>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {notes.length === 0 && (
              <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>Aucune note.</p>
            )}
            {notes.map(note => {
              const imgs = note.images?.length > 0 ? note.images : (note.image_url ? [note.image_url] : [])
              return (
                <div key={note.id} onClick={() => openNoteDrawer(note)}
                  style={{
                    padding: "10px 12px", borderBottom: "1px dotted var(--rule)", cursor: "pointer",
                    borderLeft: note.is_pinned ? "3px solid var(--at-accent)" : "3px solid transparent",
                    transition: "background .15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--at-surface)" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {note.title}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginLeft: 8, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); togglePin(note) }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: note.is_pinned ? "var(--at-accent)" : "var(--ink3)", padding: 2 }}>
                        <Pin size={11} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteNote(note.id) }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--at-neg)", padding: 2 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  {note.content && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                      {note.content}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    {imgs.length > 0 && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink3)", display: "flex", alignItems: "center", gap: 3 }}>
                        <Image size={9} /> {imgs.length}
                      </span>
                    )}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink3)" }}>
                      {new Date(note.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 5. WIDGET COT ──────────────────────────────────── */}
      <div style={{ marginTop: 28, borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
        {(() => {
          const EXPOSED = ["BTC", "ETH", "SP500", "NASDAQ", "RUSSELL"]
          const cotInstruments = cotData?.instruments || []
          const latestDate = cotData?.latestDate

          if (cotInstruments.length === 0 || !cotInstruments.some((i: any) => i.data)) {
            return (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Rapport COT</span>
                  <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>CFTC</span>
                </div>
                <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "20px 0", lineHeight: 1.6 }}>
                  Rapport COT pas encore récupéré &middot; premier sync prévu samedi 02h UTC
                </p>
              </>
            )
          }

          const reportDate = latestDate ? new Date(latestDate + "T00:00:00") : null
          const tuesdayStr = reportDate
            ? `mardi ${reportDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
            : "—"
          const friday = reportDate ? new Date(reportDate.getTime() + 3 * 86400000) : null
          const fridayStr = friday
            ? `vendredi ${friday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
            : "—"

          function fmtNet(n: number): string {
            const abs = Math.abs(n)
            if (abs >= 1000) return `${n >= 0 ? "+" : ""}${(n / 1000).toFixed(0)} k`
            return `${n >= 0 ? "+" : ""}${n.toLocaleString("fr-FR")}`
          }

          return (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Rapport COT</span>
                <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
                  CFTC &middot; arrêté au {tuesdayStr} &middot; publié {fridayStr}
                </span>
              </div>

              <div style={{ border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--at-surface)" }}>
                      {["Instrument", "Net LS", "Δ 7j", "1Y %ile", "Biais"].map((h, i) => (
                        <th key={h} style={{
                          padding: "10px 14px",
                          textAlign: i === 0 ? "left" : "right",
                          fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
                          borderBottom: "1px solid var(--rule)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cotInstruments.map((inst: any) => {
                      const d = inst.data
                      const isExposed = EXPOSED.includes(inst.key)
                      const biaisColor = d?.biais === "haussier" ? "var(--at-pos)" : d?.biais === "baissier" ? "var(--at-neg)" : "var(--ink3)"
                      const biaisArrow = d?.biais === "haussier" ? "↑" : d?.biais === "baissier" ? "↓" : "→"

                      return (
                        <tr key={inst.key} style={{
                          borderBottom: "1px dotted var(--rule)",
                          background: isExposed ? "var(--at-surface)" : "transparent",
                        }}>
                          <td style={{ padding: "9px 14px", fontFamily: "var(--font-serif)", fontSize: 14, color: "var(--ink)" }}>
                            {inst.label}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
                            {d ? fmtNet(d.net_large_specs) : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: d?.delta_7d != null ? (d.delta_7d >= 0 ? "var(--at-pos)" : "var(--at-neg)") : "var(--ink3)" }}>
                            {d?.delta_7d != null ? fmtNet(d.delta_7d) : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink2)" }}>
                            {d?.percentile_1y != null ? `${d.percentile_1y.toFixed(0)} %` : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: biaisColor }}>
                            {d ? `${biaisArrow} ${d.biais}` : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 8 }}>
                Tu es exposé long sur les 5 premiers &middot; les autres sont info macro
              </div>
            </>
          )
        })()}
      </div>

      <NotePanel
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerNote(null) }}
        mode="drawer"
        header={
          <div style={{ padding: "20px 24px 16px", borderBottom: "2px solid var(--ink)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, marginRight: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                  {drawerNote ? "Modifier la note" : "Nouvelle note"}
                </div>
                <input
                  value={drawerTitle}
                  onChange={e => setDrawerTitle(e.target.value)}
                  placeholder="Titre de la note…"
                  style={{
                    width: "100%", boxSizing: "border-box", background: "transparent",
                    border: "none", borderBottom: "1px dotted var(--rule)",
                    fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "var(--ink)",
                    outline: "none", padding: "4px 0",
                  }}
                />
              </div>
              <button onClick={() => { setDrawerOpen(false); setDrawerNote(null) }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", padding: 4 }}>
                <X size={18} />
              </button>
            </div>
          </div>
        }
        initialText={drawerNote?.content || ""}
        initialImages={drawerNote?.images?.length > 0 ? drawerNote.images : (drawerNote?.image_url ? [drawerNote.image_url] : [])}
        textPlaceholder="Détails, niveaux, thèse…"
        onSave={handleNoteSave}
        updatedAt={drawerNote?.updated_at || null}
      />
    </div>
  )
}

function PerfCard({ label, sub, lines, total, pctChange, href }: {
  label: string; sub?: string; lines: { name: string; value: number }[]; total: number; pctChange: number | null; href: string
}) {
  return (
    <Link href={href} style={{ display: "block", padding: "16px 22px", borderRight: "1px solid var(--rule)", cursor: "pointer", transition: "background 0.2s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--at-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>{sub}</div>}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--ink3)" }}>{l.name}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{fmtEur(l.value)}</span>
          </div>
        ))}
        {lines.length > 1 && (
          <>
            <div style={{ borderTop: "1px dotted var(--rule)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
              <span style={{ color: "var(--ink2)" }}>Total</span>
              <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{fmtEur(total)}</span>
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: pctChange === null ? "var(--ink3)" : pctChange >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
          {pctChange === null ? "—" : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`}
        </div>
        {pctChange !== null && (
          <div style={{ height: 3, background: "var(--rule)", marginTop: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", background: pctChange >= 0 ? "var(--at-pos)" : "var(--at-neg)", width: `${Math.min(100, Math.abs(pctChange) * 2)}%` }} />
          </div>
        )}
      </div>
    </Link>
  )
}
