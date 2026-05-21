import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { AlertTriangle, Plus, Eye, FileText } from "lucide-react"
import type { VatReturn, VatPreparation } from "@/lib/types-vat"
import { formatEur, getMonthLabel, getShortMonthLabel, daysUntil, previousMonth, currentYearMonth } from "@/lib/vat-format"
import { VatReturnWizardDialog } from "./VatReturnWizardDialog"
import { VatReturnDetailDialog } from "./VatReturnDetailDialog"

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--rule)", borderRadius: 4, padding: 20,
  background: "var(--at-surface)", marginBottom: 28,
}
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700,
  color: "var(--ink)", letterSpacing: -0.2,
}
const labelStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
  color: "var(--ink3)", fontFamily: "var(--font-mono)",
}
const valueStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700,
  color: "var(--ink)", marginTop: 4,
}
const monoSm: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 12,
}

interface MonthRow {
  month: string
  status: "submitted" | "refund_pending" | "refund_received" | "draft" | "closed" | "retroactive" | "to_declare" | "neant"
  vatReturn?: VatReturn
  retroOnMonth?: string
  credit: number
  creditAction: string | null
  deductibleTotal: number
}

function StatusBadge({ row }: { row: MonthRow }) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 8px", borderRadius: 4, fontSize: 11,
    fontFamily: "var(--font-mono)", fontWeight: 600, whiteSpace: "nowrap",
  }

  switch (row.status) {
    case "submitted":
      return <span style={{ ...base, background: "var(--ink)", color: "var(--at-bg)" }}>Envoyee</span>
    case "refund_pending":
      return <span style={{ ...base, background: "var(--at-accent)", color: "#fff" }}>Remb. en attente</span>
    case "refund_received":
      return <span style={{ ...base, background: "var(--at-pos)", color: "#fff" }}>Remb. recu</span>
    case "draft":
      return <span style={{ ...base, border: "1px solid var(--rule)", color: "var(--ink2)" }}>Brouillon</span>
    case "closed":
      return <span style={{ ...base, background: "var(--ink2)", color: "var(--at-bg)" }}>Cloturee</span>
    case "retroactive":
      return <span style={{ ...base, border: "1px solid var(--rule)", color: "var(--ink3)", fontStyle: "italic" }}>Rattrape sur {row.retroOnMonth ? getShortMonthLabel(row.retroOnMonth) : "?"}</span>
    case "to_declare":
      return <span style={{ ...base, background: "#fef3cd", color: "#856404", border: "1px solid #ffc107" }}>A declarer</span>
    default:
      return <span style={{ ...base, border: "1px solid var(--rule)", color: "var(--ink3)", opacity: 0.5 }}>Neant</span>
  }
}

function CreditActionLabel({ action }: { action: string | null }) {
  switch (action) {
    case "reported": return <span style={{ ...monoSm, color: "var(--ink2)" }}>Report</span>
    case "refund_requested": return <span style={{ ...monoSm, color: "var(--at-accent)" }}>Remb. demande</span>
    case "to_pay": return <span style={{ ...monoSm, color: "var(--at-neg)" }}>A payer</span>
    default: return <span style={{ ...monoSm, color: "var(--ink3)" }}>&mdash;</span>
  }
}

export function VatReturnsBlock() {
  const [returns, setReturns] = useState<VatReturn[]>([])
  const [preparations, setPreparations] = useState<Record<string, VatPreparation>>({})
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardMonth, setWizardMonth] = useState("")
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailReturn, setDetailReturn] = useState<VatReturn | null>(null)

  const year = new Date().getFullYear()
  const curMonth = currentYearMonth()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const returnsRes = await authFetch(`/api/compta/vat-returns?year=${year}`)
      const returnsData = await returnsRes.json()
      const vatReturns: VatReturn[] = returnsData.returns || []
      setReturns(vatReturns)

      const curMonthNum = new Date().getMonth() + 1
      const months: string[] = []
      for (let m = 1; m <= curMonthNum; m++) {
        months.push(`${year}-${String(m).padStart(2, "0")}`)
      }

      const prepResults = await Promise.all(
        months.map(m =>
          authFetch(`/api/compta/vat-returns/preparation?month=${m}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      )

      const prepMap: Record<string, VatPreparation> = {}
      months.forEach((m, i) => {
        if (prepResults[i]) prepMap[m] = prepResults[i]
      })
      setPreparations(prepMap)
    } catch (err: unknown) {
      console.error("[vat-returns-block]", err instanceof Error ? err.message : err)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { loadData() }, [loadData])

  const returnsByMonth: Record<string, VatReturn> = {}
  for (const r of returns) {
    returnsByMonth[String(r.period_month).slice(0, 7)] = r
  }

  const retroactiveMap: Record<string, string> = {}
  for (const r of returns) {
    if (r.status !== "draft" && Array.isArray(r.retroactive_periods)) {
      for (const p of r.retroactive_periods) {
        retroactiveMap[String(p).slice(0, 7)] = String(r.period_month).slice(0, 7)
      }
    }
  }

  const curMonthNum = new Date().getMonth() + 1
  const displayMonths: string[] = []
  for (let m = 1; m <= curMonthNum; m++) {
    displayMonths.push(`${year}-${String(m).padStart(2, "0")}`)
  }

  const rows: MonthRow[] = displayMonths.map(m => {
    const ret = returnsByMonth[m]
    const prep = preparations[m]

    if (ret && ret.status !== "draft") {
      return {
        month: m,
        status: ret.status as MonthRow["status"],
        vatReturn: ret,
        credit: Number(ret.vat_credit || 0),
        creditAction: ret.credit_action,
        deductibleTotal: Number(ret.vat_deductible_total || 0),
      }
    }

    if (retroactiveMap[m]) {
      return {
        month: m,
        status: "retroactive" as const,
        retroOnMonth: retroactiveMap[m],
        credit: 0,
        creditAction: null,
        deductibleTotal: 0,
      }
    }

    if (ret && ret.status === "draft") {
      return {
        month: m,
        status: "draft" as const,
        vatReturn: ret,
        credit: Number(ret.vat_credit || 0),
        creditAction: ret.credit_action,
        deductibleTotal: Number(ret.vat_deductible_total || 0),
      }
    }

    const deductible = prep?.computed?.vat_deductible_total || 0
    if (deductible > 0) {
      return {
        month: m,
        status: "to_declare" as const,
        credit: 0,
        creditAction: null,
        deductibleTotal: deductible,
      }
    }

    return {
      month: m,
      status: "neant" as const,
      credit: 0,
      creditAction: null,
      deductibleTotal: 0,
    }
  }).reverse()

  const creditRefundPending = returns
    .filter(r => r.status === "refund_pending" && !r.refund_received_at)
    .reduce((s, r) => s + Number(r.vat_credit || 0), 0)

  const lastSubmitted = returns
    .filter(r => r.status !== "draft")
    .sort((a, b) => b.period_month.localeCompare(a.period_month))[0]
  const creditReported = lastSubmitted?.credit_action === "reported"
    ? Number(lastSubmitted.vat_credit || 0)
    : 0

  const prevMonth = previousMonth(curMonth)
  const prevRet = returnsByMonth[prevMonth]
  const prevPrep = preparations[prevMonth]
  const prevRetroactive = !!retroactiveMap[prevMonth]
  const todayDay = new Date().getDate()
  const showAlert = todayDay >= 1 && todayDay <= 24
    && (!prevRet || prevRet.status === "draft")
    && !prevRetroactive
    && (prevPrep?.computed?.vat_deductible_total || 0) > 0

  function openWizard(month: string) {
    setWizardMonth(month)
    setWizardOpen(true)
  }

  function openDetail(r: VatReturn) {
    setDetailReturn(r)
    setDetailOpen(true)
  }

  const isEmpty = returns.length === 0 && !loading

  return (
    <div style={sectionStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <span style={titleStyle}>TVA &mdash; Suivi des declarations {year}</span>
        <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
          CA3
        </span>
      </div>

      {showAlert && prevPrep && (
        <div style={{
          border: "1px solid var(--at-neg)", borderRadius: 4, padding: "12px 16px",
          background: "#fdf2f2", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <AlertTriangle size={18} style={{ color: "var(--at-neg)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--at-neg)", fontSize: 13, marginBottom: 4 }}>
              Tu n'as pas encore enregistre ta CA3 de {getMonthLabel(prevMonth)}.
            </div>
            <div style={{ ...monoSm, color: "var(--ink2)", marginBottom: 6 }}>
              Deadline DGFIP : {prevPrep.filing_deadline} (J-{daysUntil(prevPrep.filing_deadline)}).
              Calcul auto : {formatEur(prevPrep.computed.vat_deductible_total)} de TVA a declarer.
            </div>
            <button
              onClick={() => openWizard(prevMonth)}
              style={{
                background: "var(--at-accent)", color: "#fff", border: "none", borderRadius: 3,
                padding: "4px 12px", fontFamily: "var(--font-mono)", fontSize: 11,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Preparer ma CA3 &rarr;
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ ...monoSm, color: "var(--ink3)", padding: 20, textAlign: "center" }}>Chargement...</div>
      ) : isEmpty ? (
        <div style={{ textAlign: "center", padding: "30px 0" }}>
          <FileText size={32} style={{ color: "var(--ink3)", marginBottom: 8 }} />
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "var(--ink2)", marginBottom: 12 }}>
            Aucune declaration CA3 enregistree pour {year}.
          </div>
          <button
            onClick={() => openWizard(prevMonth)}
            style={{
              background: "var(--at-accent)", color: "#fff", border: "none", borderRadius: 3,
              padding: "6px 16px", fontFamily: "var(--font-mono)", fontSize: 12,
              fontWeight: 600, cursor: "pointer",
            }}
          >
            <Plus size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
            Enregistrer ta premiere CA3
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: "12px 16px", background: "var(--at-bg)" }}>
              <div style={labelStyle}>Credit en attente de remboursement</div>
              <div style={{ ...valueStyle, color: creditRefundPending > 0 ? "var(--at-accent)" : "var(--ink3)" }}>
                {formatEur(creditRefundPending)}
              </div>
            </div>
            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: "12px 16px", background: "var(--at-bg)" }}>
              <div style={labelStyle}>Credit reporte sur declaration suivante</div>
              <div style={{ ...valueStyle, color: creditReported > 0 ? "var(--at-pos)" : "var(--ink3)" }}>
                {formatEur(creditReported)}
              </div>
            </div>
          </div>

          {/* Desktop table */}
          <div className="vat-table-desktop" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--rule)" }}>
                  {["Periode", "Statut", "Credit", "Action credit", ""].map(h => (
                    <th key={h} style={{ ...labelStyle, padding: "6px 8px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.month} style={{ borderBottom: "1px solid var(--rule)" }}>
                    <td style={{ padding: "8px 8px", fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--ink)" }}>
                      {getMonthLabel(row.month)}
                    </td>
                    <td style={{ padding: "8px 8px" }}><StatusBadge row={row} /></td>
                    <td style={{ padding: "8px 8px", ...monoSm, color: row.credit > 0 ? "var(--at-pos)" : "var(--ink3)" }}>
                      {row.credit > 0 ? formatEur(row.credit) : "—"}
                    </td>
                    <td style={{ padding: "8px 8px" }}><CreditActionLabel action={row.creditAction} /></td>
                    <td style={{ padding: "8px 8px", textAlign: "right" }}>
                      {row.vatReturn && row.status !== "draft" && (
                        <button
                          onClick={() => openDetail(row.vatReturn!)}
                          style={{
                            background: "none", border: "1px solid var(--rule)", borderRadius: 3,
                            padding: "2px 8px", cursor: "pointer", color: "var(--ink2)",
                            fontFamily: "var(--font-mono)", fontSize: 11,
                          }}
                        >
                          <Eye size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Detail
                        </button>
                      )}
                      {row.status === "to_declare" && (
                        <button
                          onClick={() => openWizard(row.month)}
                          style={{
                            background: "var(--at-accent)", color: "#fff", border: "none", borderRadius: 3,
                            padding: "2px 8px", cursor: "pointer",
                            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                          }}
                        >
                          Preparer
                        </button>
                      )}
                      {row.status === "draft" && row.vatReturn && (
                        <button
                          onClick={() => openDetail(row.vatReturn!)}
                          style={{
                            background: "none", border: "1px solid var(--rule)", borderRadius: 3,
                            padding: "2px 8px", cursor: "pointer", color: "var(--ink2)",
                            fontFamily: "var(--font-mono)", fontSize: 11,
                          }}
                        >
                          Reprendre
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="vat-table-mobile" style={{ display: "none" }}>
            {rows.map(row => (
              <div key={row.month} style={{
                border: "1px solid var(--rule)", borderRadius: 4, padding: "10px 12px",
                background: "var(--at-bg)", marginBottom: 8,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--ink)" }}>
                    {getShortMonthLabel(row.month)}
                  </div>
                  <StatusBadge row={row} />
                </div>
                <div style={{ textAlign: "right" }}>
                  {row.credit > 0 && (
                    <div style={{ ...monoSm, color: "var(--at-pos)" }}>{formatEur(row.credit)}</div>
                  )}
                  {row.vatReturn && (
                    <button
                      onClick={() => openDetail(row.vatReturn!)}
                      style={{
                        background: "none", border: "1px solid var(--rule)", borderRadius: 3,
                        padding: "2px 6px", cursor: "pointer", color: "var(--ink2)",
                        fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 4,
                      }}
                    >
                      Detail
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, textAlign: "right" }}>
            <button
              onClick={() => openWizard(prevMonth)}
              style={{
                background: "none", border: "1px solid var(--rule)", borderRadius: 3,
                padding: "4px 12px", cursor: "pointer", color: "var(--ink2)",
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
              }}
            >
              <Plus size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
              Enregistrer une CA3
            </button>
          </div>
        </>
      )}

      <VatReturnWizardDialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        defaultMonth={wizardMonth}
        onSaved={() => { setWizardOpen(false); loadData() }}
      />

      {detailReturn && (
        <VatReturnDetailDialog
          open={detailOpen}
          onClose={() => { setDetailOpen(false); setDetailReturn(null) }}
          vatReturn={detailReturn}
          onUpdated={loadData}
          onDeleted={() => { setDetailOpen(false); setDetailReturn(null); loadData() }}
        />
      )}

      <style>{`
        @media (max-width: 640px) {
          .vat-table-desktop { display: none !important; }
          .vat-table-mobile { display: block !important; }
        }
      `}</style>
    </div>
  )
}
