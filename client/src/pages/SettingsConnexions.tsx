import { useState, useEffect } from "react"
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, HelpCircle } from "lucide-react"
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
}

const STATUS_ICON: Record<string, any> = {
  green: CheckCircle,
  orange: AlertTriangle,
  red: XCircle,
  manual: HelpCircle,
}

const STATUS_COLORS: Record<string, string> = {
  green: "var(--at-pos)",
  orange: "#e8a317",
  red: "var(--at-neg)",
  manual: "var(--ink3)",
}

const STATUS_LABEL: Record<string, string> = {
  green: "Synchronisé",
  orange: "Sync > 24h",
  red: "Erreur",
  manual: "Manuel",
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function SettingsConnexions() {
  const [cards, setCards] = useState<SyncCard[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  function loadStatus() {
    authFetch("/api/sync/status")
      .then(r => r.ok ? r.json() : { cards: [] })
      .then(d => { setCards(d.cards || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadStatus() }, [])

  async function handleSyncAll() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await authFetch("/api/sync/all", { method: "POST" })
      const d = await r.json()
      setSyncResult(d)
      loadStatus()
    } catch (e: any) {
      setSyncResult({ ok: false, error: e.message })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div style={{ padding: 28, color: "var(--ink2)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Chargement...</div>

  return (
    <div style={{ padding: "28px 32px", maxWidth: 800 }}>
      <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: 10, marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
          Administration
        </div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
          Connexions &amp; synchronisation
        </h1>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          style={{
            padding: "8px 20px", fontSize: 12, fontFamily: "var(--font-mono)",
            borderRadius: 4, border: "1px solid var(--rule)", background: "var(--at-surface)",
            color: syncing ? "var(--ink3)" : "var(--ink)", cursor: syncing ? "wait" : "pointer",
            display: "flex", alignItems: "center", gap: 8, transition: "all .15s",
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Synchronisation en cours…" : "Tout synchroniser"}
        </button>
      </div>

      {syncResult && (
        <div style={{
          marginBottom: 24, padding: "10px 14px", borderRadius: 4,
          border: `1px solid ${syncResult.ok ? "var(--at-pos)" : "var(--at-neg)"}`,
          background: syncResult.ok ? "rgba(0,180,0,0.04)" : "rgba(200,0,0,0.04)",
          fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink2)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: syncResult.ok ? "var(--at-pos)" : "var(--at-neg)" }}>
              {syncResult.ok ? "Synchronisation terminée" : "Synchronisation partielle"}
            </span>
            <span>{syncResult.durationMs ? `${(syncResult.durationMs / 1000).toFixed(1)}s` : ""}</span>
          </div>
          {syncResult.steps?.map((s: any) => (
            <div key={s.step} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
              <span style={{ color: s.status === "ok" ? "var(--at-pos)" : s.status === "error" ? "var(--at-neg)" : "var(--ink3)", minWidth: 12 }}>
                {s.status === "ok" ? "✓" : s.status === "error" ? "✗" : "–"}
              </span>
              <span style={{ minWidth: 180 }}>{s.step.replace(/_/g, " ")}</span>
              <span style={{ color: "var(--ink3)" }}>{s.message || ""}</span>
              <span style={{ color: "var(--ink3)", marginLeft: "auto" }}>{s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cards.map(c => {
          const Icon = STATUS_ICON[c.status]
          const color = STATUS_COLORS[c.status]
          return (
            <div key={`${c.broker}-${c.type}`} style={{
              padding: "14px 18px", borderRadius: 4,
              border: "1px solid var(--rule)", background: "var(--at-surface)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon size={16} style={{ color }} />
                  <div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                      {c.label}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: 1 }}>
                      {c.broker} &middot; {c.type}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, fontWeight: 600 }}>
                    {STATUS_LABEL[c.status]}
                  </div>
                  {c.last_synced_at && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)" }}>
                      {fmtDate(c.last_synced_at)}
                    </div>
                  )}
                </div>
              </div>
              {c.last_sync_error && (
                <div style={{
                  marginTop: 8, padding: "4px 8px", borderRadius: 3,
                  background: "rgba(200,0,0,0.05)", fontSize: 10,
                  fontFamily: "var(--font-mono)", color: "var(--at-neg)",
                }}>
                  {c.last_sync_error}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {cards.length === 0 && (
        <div style={{ color: "var(--ink3)", fontFamily: "var(--font-serif)", fontSize: 13, fontStyle: "italic" }}>
          Aucun compte configuré.
        </div>
      )}
    </div>
  )
}
