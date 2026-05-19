import { useState, useEffect } from "react"
import { RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

interface SyncCard {
  id: string
  label: string
  broker: string
  type: string
  status: "green" | "orange" | "red" | "manual"
  last_synced_at: string | null
  last_sync_error: string | null
  prices_refreshed_at?: string | null
}

const STATUS_COLORS: Record<string, string> = {
  green: "var(--at-pos)",
  orange: "#e8a317",
  red: "var(--at-neg)",
  manual: "var(--ink3)",
}

const CARD_LABELS: Record<string, string> = {
  "IBKR|positions": "IBKR",
  "Kraken|spot": "Kraken Spot",
  "Kraken|futures": "Kraken Futures",
  "Qonto|bank": "Qonto",
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function SyncStatusRow() {
  const [cards, setCards] = useState<SyncCard[]>([])
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    authFetch("/api/sync/status")
      .then(r => r.ok ? r.json() : { cards: [] })
      .then(d => setCards(d.cards || []))
      .catch(() => {})
  }, [])

  async function handleSyncAll() {
    setSyncing(true)
    setResult(null)
    try {
      const r = await authFetch("/api/sync/all", { method: "POST" })
      const d = await r.json()
      setResult(d)
      authFetch("/api/sync/status")
        .then(r => r.ok ? r.json() : { cards: [] })
        .then(d => setCards(d.cards || []))
        .catch(() => {})
    } catch (e: any) {
      setResult({ ok: false, error: e.message })
    } finally {
      setSyncing(false)
    }
  }

  if (cards.length === 0 && !syncing) return null

  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          style={{
            padding: "5px 14px", fontSize: 11, fontFamily: "var(--font-mono)",
            borderRadius: 3, border: "1px solid var(--rule)", background: "var(--at-surface)",
            color: syncing ? "var(--ink3)" : "var(--ink)", cursor: syncing ? "wait" : "pointer",
            display: "flex", alignItems: "center", gap: 6, transition: "all .15s",
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Synchronisation…" : "Tout synchroniser"}
        </button>

        {cards.map(c => {
          const key = `${c.broker}|${c.type}`
          const label = CARD_LABELS[key] || `${c.broker} ${c.type}`
          const color = STATUS_COLORS[c.status]
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 3,
              border: "1px solid var(--rule)", background: "var(--at-surface)",
              fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink2)",
            }}
            title={c.prices_refreshed_at
              ? `Positions figées (${c.last_sync_error || "rate limit"}) mais prix actualisés à ${new Date(c.prices_refreshed_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
              : c.last_sync_error || undefined}
            >
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: color, display: "inline-block", flexShrink: 0,
              }} />
              <span>{label}</span>
              {c.last_synced_at && (
                <span style={{ color: "var(--ink3)" }}>{fmtAgo(c.last_synced_at)}</span>
              )}
              {!c.last_synced_at && c.status === "manual" && (
                <span style={{ color: "var(--ink3)" }}>manuel</span>
              )}
            </div>
          )
        })}
      </div>

      {result && (
        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 3,
          border: `1px solid ${result.ok ? "var(--at-pos)" : "var(--at-neg)"}`,
          background: result.ok ? "rgba(0,180,0,0.04)" : "rgba(200,0,0,0.04)",
          fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink2)",
          display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        }}>
          <span style={{ color: result.ok ? "var(--at-pos)" : "var(--at-neg)", fontWeight: 600 }}>
            {result.ok ? "Sync OK" : "Sync partiel"}
          </span>
          {result.durationMs && <span>{(result.durationMs / 1000).toFixed(1)}s</span>}
          {result.steps?.map((s: any) => (
            <span key={s.step} style={{ color: s.status === "ok" ? "var(--at-pos)" : s.status === "error" ? "var(--at-neg)" : "var(--ink3)" }}>
              {s.step.replace(/_/g, " ")}: {s.status === "ok" ? s.message : s.status === "error" ? s.message?.slice(0, 60) : "skip"}
            </span>
          ))}
          <button onClick={() => setResult(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 10, marginLeft: "auto" }}>✕</button>
        </div>
      )}
    </div>
  )
}
