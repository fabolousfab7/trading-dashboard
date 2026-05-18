import { useEffect, useState, useMemo } from "react"
import { Link } from "wouter"
import { supabase } from "@/lib/supabase"
import { Plus, Pin, Trash2, Image, X } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import { getPositionValueEur, isDerivative } from "@/lib/portfolio-math"
import NotePanel from "@/components/NotePanel"
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

const RANGES = [
  { label: "24h", days: 1 },
  { label: "1S", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
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
  const [timeseries, setTimeseries] = useState<any[]>([])
  const [variations, setVariations] = useState<any>({})
  const [chartRange, setChartRange] = useState(90)
  const [notes, setNotes] = useState<any[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerNote, setDrawerNote] = useState<any>(null)
  const [drawerTitle, setDrawerTitle] = useState("")
  const [fhfSim, setFhfSim] = useState<any>(null)
  const [bankBalance, setBankBalance] = useState<any>(null)
  const [marketEvents, setMarketEvents] = useState<any[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [cotData, setCotData] = useState<any>(null)
  const [moversByEur, setMoversByEur] = useState<any[]>([])
  const [moversByPct, setMoversByPct] = useState<any[]>([])
  const [moversRef, setMoversRef] = useState<{ date: string; truncated: boolean }>({ date: "", truncated: false })
  const [moversLoading, setMoversLoading] = useState(false)

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
    const tf = RANGES.find(r => r.days === chartRange)?.label || "3M"
    authFetch(`/api/portfolio/timeseries?timeframe=${tf}`)
      .then(r => r.ok ? r.json() : { series: [], variations: {} })
      .then(d => {
        setTimeseries(Array.isArray(d.series) ? d.series : [])
        setVariations(d.variations || {})
      })
      .catch(() => {})
  }, [user, chartRange])

  useEffect(() => {
    if (!user) return
    const tf = RANGES.find(r => r.days === chartRange)?.label || "3M"
    setMoversLoading(true)
    authFetch(`/api/portfolio/movers?timeframe=${tf}&limit=5`)
      .then(r => r.ok ? r.json() : { by_eur: [], by_pct: [] })
      .then(d => {
        setMoversByEur(d.by_eur || [])
        setMoversByPct(d.by_pct || [])
        setMoversRef({ date: d.reference_date || "", truncated: !!d.reference_truncated })
      })
      .catch(() => {})
      .finally(() => setMoversLoading(false))
  }, [user, chartRange])

  const chartData = useMemo(() => {
    if (timeseries.length === 0) return []
    return timeseries.map((row: any) => ({
      date: new Date(row.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      IBKR: row.ibkr || 0,
      Kraken: row.kraken || 0,
      Qonto: row.qonto || 0,
      PEA: row.pea || 0,
      "Crypto Perso": row.crypto_perso || 0,
      "Crypto R+F": row.crypto_rf || 0,
      total: row.total || 0,
    }))
  }, [timeseries])

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
    return s + getPositionValueEur(p)
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
    if (isDerivative(p.asset_class)) return s
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

  const totalVar = variations.total || {}
  const fhfVar = variations.fhf || {}
  const cryptoCombined = variations.crypto_combined || {}
  const peaVar = variations.pea || {}
  const ibkrVar = variations.ibkr || {}
  const krakenVar = variations.kraken || {}
  const qontoVar = variations.qonto || {}
  const cryptoPersoVar = variations.crypto_perso || {}
  const cryptoRfVar = variations.crypto_rf || {}
  const chartVarAbs = totalVar.abs || 0
  const refTruncated = !!totalVar.reference_truncated
  const timeframeLabel = RANGES.find(r => r.days === chartRange)?.label || ""

  function fmtRefDate(dateStr: string | undefined) {
    if (!dateStr) return ""
    const d = new Date(dateStr + "T00:00:00")
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  }
  const refDateLabel = fmtRefDate(totalVar.reference_date)

  // Masthead
  const now = new Date()
  const editionNo = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

  return (
    <div style={{ padding: "28px 32px" }}>

      {/* ── 1. MASTHEAD ─────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid var(--ink)", paddingBottom: 14 }}>
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

      <div style={{ textAlign: "center", margin: "24px 0", color: "var(--ink3)", fontFamily: "var(--font-serif)", fontSize: 14 }}>&mdash; &#10086; &mdash;</div>

      {/* ── 2. LEAD — Brut + Courbe ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 32, paddingBottom: 28, borderBottom: "1px solid var(--rule)", marginBottom: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 13, letterSpacing: "0.05em", fontStyle: "italic", color: "var(--ink3)", fontFamily: "var(--font-serif)", display: "flex", alignItems: "center" }}>
            Brut &middot; tous comptes
            <InfoTip text="FHF (IBKR + Kraken + Qonto) + PEA + Crypto Perso + Crypto R+F. Avant impôts, hors CCA." wide />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 68, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, marginTop: 4, color: "var(--ink)" }}>
            {fmtEur(patrimoineBrut)}
          </div>
          {chartData.length > 1 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontVariantNumeric: "tabular-nums", color: chartVarAbs >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                {chartVarAbs >= 0 ? "↑" : "↓"} {fmtEur(Math.abs(chartVarAbs))} sur {refTruncated ? `depuis le ${refDateLabel}` : timeframeLabel}
              </div>
              {!refTruncated && refDateLabel && (
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 2 }}>
                  depuis le {refDateLabel}
                </div>
              )}
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
          {chartData.length > 1 ? (() => {
            const totals = chartData.map((d: any) => d.total as number)
            const yMin = Math.min(...totals)
            const yMax = Math.max(...totals)
            const yPad = (yMax - yMin) * 0.1 || 1000
            const yDomain: [number, number] = [
              Math.floor((yMin - yPad) / 1000) * 1000,
              Math.ceil((yMax + yPad) / 1000) * 1000,
            ]
            return (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--at-accent)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--at-accent)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--ink3)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={yDomain} tick={{ fontSize: 10, fill: "var(--ink3)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="total" stroke="var(--at-accent)" strokeWidth={2} fill="url(#totalGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )
          })() : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Pas encore de données
            </div>
          )}
        </div>
      </div>

      <div style={{ textAlign: "center", margin: "24px 0", color: "var(--ink3)", fontFamily: "var(--font-serif)", fontSize: 14 }}>&mdash; &#10086; &mdash;</div>

      {/* ── 3. PERFORMANCE CARDS ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 0 }}>
        <PerfCard label="Crypto"
          lines={[
            { name: "Perso", value: cryptoPersoValue, pct: cryptoPersoVar.pct ?? null, abs: cryptoPersoVar.abs ?? null },
            { name: "R+F (50%)", value: cryptoSharedValue, pct: cryptoRfVar.pct ?? null, abs: cryptoRfVar.abs ?? null },
          ]}
          total={cryptoPersoValue + cryptoSharedValue} pctChange={cryptoCombined.pct ?? null} absChange={cryptoCombined.abs ?? null}
          timeframe={timeframeLabel} truncated={refTruncated} refDate={refDateLabel} href="/crypto" />
        <PerfCard label="FHF"
          lines={[
            { name: "IBKR", value: ibkrNlv, pct: ibkrVar.pct ?? null, abs: ibkrVar.abs ?? null },
            { name: "Kraken", value: krakenNlv, pct: krakenVar.pct ?? null, abs: krakenVar.abs ?? null },
            { name: "Qonto", value: qontoBalance, pct: qontoVar.pct ?? null, abs: qontoVar.abs ?? null },
          ]}
          total={ibkrNlv + krakenNlv + qontoBalance} pctChange={fhfVar.pct ?? null} absChange={fhfVar.abs ?? null}
          timeframe={timeframeLabel} truncated={refTruncated} refDate={refDateLabel} href="/fhf" />
        <PerfCard label="PEA Perso"
          lines={[{ name: "Valeur", value: peaValue }]}
          total={peaValue} pctChange={peaVar.pct ?? null} absChange={peaVar.abs ?? null}
          timeframe={timeframeLabel} truncated={refTruncated} refDate={refDateLabel} href="/pea" />

        {/* Trading Actif — card spéciale */}
        <Link href="/analytics" style={{ display: "block", padding: "16px 22px", borderRight: "1px solid var(--rule)", cursor: "pointer", transition: "background 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--at-surface)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink2)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>Trading Actif</div>
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
      </div>

      <div style={{ textAlign: "center", margin: "24px 0", color: "var(--ink3)", fontFamily: "var(--font-serif)", fontSize: 14 }}>&mdash; &#10086; &mdash;</div>

      {/* ── 4. BOTTOM — Movers + Agenda + Notes ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28 }}>

        {/* Meilleurs movers — double colonne */}
        <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Meilleurs movers</span>
            <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
              {moversRef.truncated ? `depuis le ${fmtRefDate(moversRef.date)}` : timeframeLabel}
            </span>
          </div>
          {moversLoading ? (
            <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>Chargement...</p>
          ) : moversByEur.length === 0 && moversByPct.length === 0 ? (
            <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "20px 0", lineHeight: 1.6 }}>
              Aucun mouvement disponible &middot; historique en cours
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <MoversColumn title="Mouvements" items={moversByEur} sortKey="eur" />
              <MoversColumn title="Variations" items={moversByPct} sortKey="pct" />
            </div>
          )}
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

      {/* ── CITATION DU JOUR ──────────────────────────────── */}
      {(() => {
        const citations = [
          { text: "Le marché est un mécanisme de transfert d'argent des impatients vers les patients.", author: "Warren Buffett" },
          { text: "Sois craintif quand les autres sont avides, et avide quand les autres sont craintifs.", author: "Warren Buffett" },
          { text: "Le marché peut rester irrationnel plus longtemps que vous ne pouvez rester solvable.", author: "John Maynard Keynes" },
          { text: "Le risque vient du fait qu'on ne sait pas ce qu'on fait.", author: "Warren Buffett" },
          { text: "L'objectif d'un trader est de gagner de l'argent, pas d'avoir raison.", author: "Jack Schwager" },
          { text: "La discipline est plus importante que la conviction.", author: "William O'Neil" },
        ]
        const idx = Math.floor(Date.now() / 86400000) % citations.length
        const c = citations[idx]
        return (
          <div style={{ textAlign: "center", margin: "40px 0 24px", padding: "0 48px" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, fontStyle: "italic", color: "var(--ink3)", lineHeight: 1.7 }}>
              &laquo;&thinsp;{c.text}&thinsp;&raquo;
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink3)", marginTop: 6 }}>
              &mdash; {c.author}
            </div>
          </div>
        )
      })()}

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

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  const keys = ["IBKR", "Kraken", "Qonto", "PEA", "Crypto Perso", "Crypto R+F"]
  return (
    <div style={{ background: "var(--at-surface)", border: "1px solid var(--rule)", borderRadius: 4, padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11 }}>
      <div style={{ fontSize: 10, color: "var(--ink3)", marginBottom: 6 }}>{d.date}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>{fmtEur(d.total)}</div>
      {keys.map(k => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ink2)", lineHeight: 1.6 }}>
          <span>{k}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtEur(d[k] || 0)}</span>
        </div>
      ))}
    </div>
  )
}

function PerfCard({ label, lines, total, pctChange, absChange, timeframe, truncated, refDate, href }: {
  label: string; lines: { name: string; value: number; pct?: number | null; abs?: number | null }[]; total: number
  pctChange: number | null; absChange: number | null; timeframe: string; truncated: boolean; refDate: string; href: string
}) {
  const hasVar = pctChange !== null || absChange !== null
  const color = hasVar ? ((absChange || 0) >= 0 ? "var(--at-pos)" : "var(--at-neg)") : "var(--ink3)"
  const tfDisplay = truncated ? `depuis ${refDate}` : timeframe
  function lineColor(v: number | null | undefined) {
    if (v == null || v === 0) return "var(--ink3)"
    return v > 0 ? "var(--at-pos)" : "var(--at-neg)"
  }
  return (
    <Link href={href} style={{ display: "block", padding: "16px 22px", borderRight: "1px solid var(--rule)", cursor: "pointer", transition: "background 0.2s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--at-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink2)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>{label}</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12 }}>
            <span style={{ color: "var(--ink3)", flexShrink: 0 }}>{l.name}</span>
            <div style={{ display: "flex", gap: 6, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
              <span>{fmtEur(l.value)}</span>
              {l.pct != null ? (
                <span style={{ fontSize: 10, color: lineColor(l.abs), minWidth: 42, textAlign: "right" }}>
                  {l.pct >= 0 ? "+" : ""}{l.pct.toFixed(1)}%
                </span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--ink3)", minWidth: 42, textAlign: "right" }}>&mdash;</span>
              )}
              {l.abs != null ? (
                <span style={{ fontSize: 10, color: lineColor(l.abs), minWidth: 50, textAlign: "right" }}>
                  {l.abs >= 0 ? "+" : ""}{fmtEur(Math.round(l.abs))}
                </span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--ink3)", minWidth: 50, textAlign: "right" }}>0 &euro;</span>
              )}
            </div>
          </div>
        ))}
        {lines.length > 1 && (
          <>
            <div style={{ borderTop: "1px dotted var(--rule)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, fontWeight: 600 }}>
              <span style={{ color: "var(--ink2)" }}>Total</span>
              <div style={{ display: "flex", gap: 6, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                <span>{fmtEur(total)}</span>
                {pctChange != null && (
                  <span style={{ fontSize: 10, color, minWidth: 42, textAlign: "right" }}>
                    {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                  </span>
                )}
                {absChange != null && (
                  <span style={{ fontSize: 10, color, minWidth: 50, textAlign: "right" }}>
                    {absChange >= 0 ? "+" : ""}{fmtEur(Math.round(absChange))}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontSize: 9, color: "var(--ink3)" }} title={!truncated && refDate ? `depuis le ${refDate}` : undefined}>{tfDisplay}</span>
        {hasVar && (
          <div style={{ height: 3, background: "var(--rule)", marginTop: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", background: color, width: `${Math.min(100, Math.abs(pctChange || 0) * 2)}%` }} />
          </div>
        )}
      </div>
    </Link>
  )
}

function MoversColumn({ title, items, sortKey }: { title: string; items: any[]; sortKey: "eur" | "pct" }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)", fontWeight: 600, marginBottom: 8 }}>
        {title}
      </div>
      {items.map((m) => {
        const color = (sortKey === "eur" ? m.variation_eur : m.pct_change) >= 0 ? "var(--at-pos)" : "var(--at-neg)"
        return (
          <div key={m.ticker} style={{ padding: "6px 0", borderBottom: "1px dotted var(--rule)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, flex: 1 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)", fontSize: 12, flexShrink: 0 }}>{m.ticker}</span>
                <span style={{ fontStyle: "italic", color: "var(--ink3)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 8, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color }}>
                  {m.pct_change >= 0 ? "+" : ""}{m.pct_change.toFixed(1)}%
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color }}>
                  {m.variation_eur >= 0 ? "+" : ""}{fmtEur(Math.round(m.variation_eur))}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
