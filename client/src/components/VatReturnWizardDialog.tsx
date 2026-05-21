import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { VatPreparation } from "@/lib/types-vat"
import { formatEur, getMonthLabel, previousMonth } from "@/lib/vat-format"
import { useToast } from "@/hooks/use-toast"

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
  color: "var(--ink3)", fontFamily: "var(--font-mono)", marginBottom: 4,
}
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 3,
  padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", outline: "none",
}
const readonlyStyle: React.CSSProperties = {
  ...inputStyle, background: "var(--at-surface)", color: "var(--ink2)", cursor: "default",
}
const monoSm: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 }
const btnPrimary: React.CSSProperties = {
  background: "var(--at-accent)", color: "#fff", border: "none", borderRadius: 3,
  padding: "6px 16px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, cursor: "pointer",
}
const btnSecondary: React.CSSProperties = {
  background: "none", border: "1px solid var(--rule)", borderRadius: 3,
  padding: "6px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)", cursor: "pointer",
}

interface Props {
  open: boolean
  onClose: () => void
  defaultMonth: string
  onSaved: () => void
  editData?: {
    id: string
    base_ventes_fr_taxable: number
    base_acquisitions_intracom: number
    base_achats_hors_ue: number
    vat_deductible_immo: number
    vat_deductible_other: number
    vat_other_deduction: number
    credit_action: string | null
    refund_requested_amount: number | null
    retroactive_periods: string[] | null
    retroactive_notes: string | null
    filing_reference: string | null
    submitted_at: string | null
    acknowledgment_url: string | null
    notes: string | null
    status: string
  }
}

export function VatReturnWizardDialog({ open, onClose, defaultMonth, onSaved, editData }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [month, setMonth] = useState(defaultMonth)
  const [prep, setPrep] = useState<VatPreparation | null>(null)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const { toast } = useToast()

  const [baseVentesFr, setBaseVentesFr] = useState(0)
  const [baseIntracom, setBaseIntracom] = useState(0)
  const [baseHorsUe, setBaseHorsUe] = useState(0)
  const [vatDeductibleImmo, setVatDeductibleImmo] = useState(0)
  const [vatDeductibleOther, setVatDeductibleOther] = useState(0)
  const [vatOtherDeduction, setVatOtherDeduction] = useState(0)
  const [selectedRetroactive, setSelectedRetroactive] = useState<Set<string>>(new Set())

  const [creditAction, setCreditAction] = useState<string>("reported")
  const [refundAmount, setRefundAmount] = useState(0)

  const [filingReference, setFilingReference] = useState("")
  const [submittedAt, setSubmittedAt] = useState("")
  const [submittedTime, setSubmittedTime] = useState("")
  const [acknowledgmentUrl, setAcknowledgmentUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [statusChoice, setStatusChoice] = useState<"submitted" | "draft">("submitted")

  useEffect(() => {
    if (!open) return
    setStep(1)
    setErrors([])
    setMonth(defaultMonth)
    setSelectedRetroactive(new Set())

    if (editData) {
      setBaseVentesFr(editData.base_ventes_fr_taxable || 0)
      setBaseIntracom(editData.base_acquisitions_intracom || 0)
      setBaseHorsUe(editData.base_achats_hors_ue || 0)
      setVatDeductibleImmo(editData.vat_deductible_immo || 0)
      setVatDeductibleOther(editData.vat_deductible_other || 0)
      setVatOtherDeduction(editData.vat_other_deduction || 0)
      setCreditAction(editData.credit_action || "reported")
      setRefundAmount(editData.refund_requested_amount || 0)
      setFilingReference(editData.filing_reference || "")
      setAcknowledgmentUrl(editData.acknowledgment_url || "")
      setNotes(editData.notes || "")
      setStatusChoice(editData.status === "draft" ? "draft" : "submitted")
      if (editData.submitted_at) {
        const dt = new Date(editData.submitted_at)
        setSubmittedAt(dt.toISOString().slice(0, 10))
        setSubmittedTime(dt.toISOString().slice(11, 16))
      } else {
        setSubmittedAt(new Date().toISOString().slice(0, 10))
        setSubmittedTime(new Date().toISOString().slice(11, 16))
      }
      if (editData.retroactive_periods) {
        setSelectedRetroactive(new Set(editData.retroactive_periods.map(p => String(p).slice(0, 7))))
      }
    } else {
      const now = new Date()
      setSubmittedAt(now.toISOString().slice(0, 10))
      setSubmittedTime(now.toISOString().slice(11, 16))
      setFilingReference("")
      setAcknowledgmentUrl("")
      setNotes("")
      setStatusChoice("submitted")
      setCreditAction("reported")
      setRefundAmount(0)
    }
  }, [open, defaultMonth, editData])

  useEffect(() => {
    if (!open || !month) return
    setLoading(true)
    authFetch(`/api/compta/vat-returns/preparation?month=${month}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: VatPreparation | null) => {
        setPrep(data)
        if (data && !editData) {
          setBaseVentesFr(data.computed.base_ventes_fr)
          setBaseIntracom(data.computed.base_acquisitions_intracom)
          setBaseHorsUe(data.computed.base_achats_hors_ue)
          const autoliq = data.computed.vat_deductible_autoliq
          setVatDeductibleOther(Math.round((data.computed.vat_deductible_fr + autoliq) * 100) / 100)
          setVatDeductibleImmo(0)
          setVatOtherDeduction(0)
          setSelectedRetroactive(new Set())
        }
      })
      .catch(() => setPrep(null))
      .finally(() => setLoading(false))
  }, [open, month, editData])

  const vatBruteDue = Math.round((baseIntracom + baseHorsUe) * 0.20 * 100) / 100
  const vatIntracom = Math.round(baseIntracom * 0.20 * 100) / 100
  const vatDeductibleTotal = Math.round((vatDeductibleImmo + vatDeductibleOther + vatOtherDeduction) * 100) / 100
  const netAmount = vatDeductibleTotal - vatBruteDue
  const vatCredit = Math.max(0, netAmount)
  const vatToPay = Math.max(0, -netAmount)
  const isCredit = netAmount >= 0

  const retroactiveDeductibleSum = (prep?.retroactive_available || [])
    .filter(r => selectedRetroactive.has(String(r.period_month).slice(0, 7)))
    .reduce((s, r) => s + r.vat_deductible_fr_missed, 0)

  function toggleRetroactive(periodMonth: string) {
    const m = periodMonth.slice(0, 7)
    const next = new Set(selectedRetroactive)
    if (next.has(m)) next.delete(m); else next.add(m)
    setSelectedRetroactive(next)

    const sum = (prep?.retroactive_available || [])
      .filter(r => next.has(String(r.period_month).slice(0, 7)))
      .reduce((s, r) => s + r.vat_deductible_fr_missed, 0)
    setVatOtherDeduction(Math.round(sum * 100) / 100)
  }

  const monthOptions: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  async function handleSave() {
    setErrors([])
    const submittedIso = statusChoice === "submitted" && submittedAt
      ? `${submittedAt}T${submittedTime || "12:00"}:00Z` : null

    const retroPeriods = Array.from(selectedRetroactive).map(m => `${m}-01`)

    const payload = {
      period_month: `${month}-01`,
      base_ventes_fr_taxable: baseVentesFr,
      base_acquisitions_intracom: baseIntracom,
      base_achats_hors_ue: baseHorsUe,
      vat_brute_due: vatBruteDue,
      vat_intracom: vatIntracom,
      vat_deductible_immo: vatDeductibleImmo,
      vat_deductible_other: vatDeductibleOther,
      vat_other_deduction: vatOtherDeduction,
      vat_deductible_total: vatDeductibleTotal,
      vat_to_pay: vatToPay,
      vat_credit: vatCredit,
      credit_action: isCredit ? creditAction : "to_pay",
      refund_requested_amount: creditAction === "refund_requested" ? refundAmount : null,
      retroactive_periods: retroPeriods.length > 0 ? retroPeriods : null,
      retroactive_notes: retroPeriods.length > 0
        ? `Rattrapage TVA: ${retroPeriods.map(p => getMonthLabel(p)).join(", ")}`
        : null,
      submitted_at: submittedIso,
      filing_reference: filingReference || null,
      acknowledgment_url: acknowledgmentUrl || null,
      notes: notes || null,
      status: statusChoice,
    }

    try {
      const url = editData
        ? `/api/compta/vat-returns/${editData.id}`
        : "/api/compta/vat-returns"
      const method = editData ? "PUT" : "POST"
      const res = await authFetch(url, { method, body: JSON.stringify(payload) })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 400 && data.errors) {
          setErrors(data.errors)
        } else if (res.status === 409) {
          setErrors(["Une declaration pour ce mois existe deja. Modifie-la depuis le detail."])
        } else {
          setErrors([data.error || "Erreur serveur"])
        }
        return
      }

      toast({ title: editData ? "CA3 mise a jour" : "CA3 enregistree" })
      onSaved()
    } catch (err: unknown) {
      setErrors([err instanceof Error ? err.message : "Erreur reseau"])
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent style={{ maxWidth: 680, maxHeight: "90vh", overflow: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-serif)", color: "var(--ink)" }}>
            {editData ? "Modifier la CA3" : "Enregistrer une CA3"} &mdash; Etape {step}/3
          </DialogTitle>
        </DialogHeader>

        {errors.length > 0 && (
          <div style={{ border: "1px solid var(--at-neg)", borderRadius: 4, padding: "8px 12px", background: "#fdf2f2", marginBottom: 12 }}>
            {errors.map((e, i) => <div key={i} style={{ ...monoSm, color: "var(--at-neg)" }}>{e}</div>)}
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Mois concerne</div>
              <select
                value={month}
                onChange={e => setMonth(e.target.value)}
                style={inputStyle}
              >
                {monthOptions.map(m => (
                  <option key={m} value={m}>{getMonthLabel(m)}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div style={{ ...monoSm, color: "var(--ink3)", padding: 20, textAlign: "center" }}>Chargement...</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
                    Bases HT
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={labelStyle}>Ventes / prestations FR taxables</div>
                    <input type="number" step="0.01" value={baseVentesFr} onChange={e => setBaseVentesFr(Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={labelStyle}>Acquisitions intracom UE</div>
                    <input type="number" step="0.01" value={baseIntracom} onChange={e => setBaseIntracom(Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={labelStyle}>Prestations hors UE BtoB</div>
                    <input type="number" step="0.01" value={baseHorsUe} onChange={e => setBaseHorsUe(Number(e.target.value))} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
                    TVA
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={labelStyle}>TVA brute due (20% auto)</div>
                    <input type="text" readOnly value={formatEur(vatBruteDue)} style={readonlyStyle} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={labelStyle}>TVA deductible immobilisations</div>
                    <input type="number" step="0.01" value={vatDeductibleImmo} onChange={e => setVatDeductibleImmo(Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={labelStyle}>TVA deductible autres biens/services</div>
                    <input type="number" step="0.01" value={vatDeductibleOther} onChange={e => setVatDeductibleOther(Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={labelStyle}>Autre TVA a deduire (rattrapage)</div>
                    <input type="number" step="0.01" value={vatOtherDeduction} onChange={e => setVatOtherDeduction(Number(e.target.value))} style={inputStyle} />
                  </div>

                  {(prep?.retroactive_available || []).length > 0 && (
                    <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: "8px 10px", background: "var(--at-bg)", marginBottom: 10 }}>
                      <div style={{ ...labelStyle, marginBottom: 6 }}>Rattrapages disponibles</div>
                      {(prep?.retroactive_available || []).map(r => {
                        const m = String(r.period_month).slice(0, 7)
                        const checked = selectedRetroactive.has(m)
                        return (
                          <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRetroactive(r.period_month)}
                              style={{ accentColor: "var(--at-accent)" }}
                            />
                            <span style={monoSm}>
                              {getMonthLabel(m)} &mdash; {formatEur(r.vat_deductible_fr_missed)} TVA FR
                              {r.base_intracom_missed > 0 && ` + ${formatEur(r.base_intracom_missed)} intracom`}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 10, marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", ...monoSm, marginBottom: 4 }}>
                      <span style={{ color: "var(--ink3)" }}>Total TVA deductible</span>
                      <span style={{ fontWeight: 700, color: "var(--ink)" }}>{formatEur(vatDeductibleTotal)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", ...monoSm }}>
                      <span style={{ color: "var(--ink3)" }}>{isCredit ? "Credit du mois" : "TVA a payer"}</span>
                      <span style={{ fontWeight: 700, color: isCredit ? "var(--at-pos)" : "var(--at-neg)" }}>
                        {formatEur(isCredit ? vatCredit : vatToPay)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={btnSecondary}>Annuler</button>
              <button onClick={() => setStep(2)} style={btnPrimary}>Suivant &rarr;</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            {isCredit ? (
              <>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "var(--ink)", marginBottom: 16 }}>
                  Credit du mois : <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--at-pos)" }}>{formatEur(vatCredit)}</span>
                </div>

                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12, cursor: "pointer" }}>
                  <input
                    type="radio" name="credit_action" value="reported"
                    checked={creditAction === "reported"}
                    onChange={() => setCreditAction("reported")}
                    style={{ marginTop: 3, accentColor: "var(--at-accent)" }}
                  />
                  <div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--ink)" }}>
                      Reporter sur la declaration suivante
                    </div>
                    <div style={{ ...monoSm, color: "var(--ink3)" }}>Case 22 du formulaire suivant</div>
                  </div>
                </label>

                <label style={{
                  display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12,
                  cursor: vatCredit < 760 ? "not-allowed" : "pointer",
                  opacity: vatCredit < 760 ? 0.5 : 1,
                }}>
                  <input
                    type="radio" name="credit_action" value="refund_requested"
                    checked={creditAction === "refund_requested"}
                    onChange={() => setCreditAction("refund_requested")}
                    disabled={vatCredit < 760}
                    style={{ marginTop: 3, accentColor: "var(--at-accent)" }}
                  />
                  <div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--ink)" }}>
                      Demander le remboursement
                    </div>
                    <div style={{ ...monoSm, color: "var(--ink3)" }}>
                      Case 21 &mdash; formulaire 3519
                      {vatCredit < 760 && " (disponible a partir de 760 €)"}
                    </div>
                    {creditAction === "refund_requested" && vatCredit >= 760 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={labelStyle}>Montant demande</div>
                        <input
                          type="number" step="0.01"
                          value={refundAmount || vatCredit}
                          onChange={e => setRefundAmount(Number(e.target.value))}
                          style={{ ...inputStyle, width: 160 }}
                        />
                      </div>
                    )}
                  </div>
                </label>
              </>
            ) : (
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "var(--ink)", marginBottom: 8 }}>
                  TVA a payer : <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--at-neg)" }}>{formatEur(vatToPay)}</span>
                </div>
                <div style={{ ...monoSm, color: "var(--ink3)" }}>
                  Mode de paiement a effectuer sur impots.gouv.fr (prelevement SEPA).
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button onClick={() => setStep(1)} style={btnSecondary}>&larr; Retour</button>
              <button onClick={() => setStep(3)} style={btnPrimary}>Suivant &rarr;</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--ink2)", marginBottom: 16 }}>
              Une fois ta CA3 deposee sur impots.gouv.fr, complete ces infos :
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={labelStyle}>Date de depot</div>
                <input type="date" value={submittedAt} onChange={e => setSubmittedAt(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Heure de depot</div>
                <input type="time" value={submittedTime} onChange={e => setSubmittedTime(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Numero de depot</div>
              <input
                type="text" value={filingReference}
                onChange={e => setFilingReference(e.target.value)}
                placeholder="TVA-2026XXX-XXXXXXXXXXXXXXXXX"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>URL de l'accuse (optionnel)</div>
              <input
                type="text" value={acknowledgmentUrl}
                onChange={e => setAcknowledgmentUrl(e.target.value)}
                placeholder="Lien drive"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Notes internes</div>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Statut</div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
                <input
                  type="radio" name="status" value="submitted"
                  checked={statusChoice === "submitted"}
                  onChange={() => setStatusChoice("submitted")}
                  style={{ accentColor: "var(--at-accent)" }}
                />
                <span style={monoSm}>Deposee</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="radio" name="status" value="draft"
                  checked={statusChoice === "draft"}
                  onChange={() => setStatusChoice("draft")}
                  style={{ accentColor: "var(--at-accent)" }}
                />
                <span style={monoSm}>Brouillon (pas encore deposee)</span>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setStep(2)} style={btnSecondary}>&larr; Retour</button>
              <button onClick={onClose} style={btnSecondary}>Annuler</button>
              <button onClick={handleSave} style={btnPrimary}>Enregistrer</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
