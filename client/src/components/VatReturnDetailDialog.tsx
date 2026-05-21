import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Pencil, Trash2, Link2, ExternalLink } from "lucide-react"
import type { VatReturn } from "@/lib/types-vat"
import { formatEur, getMonthLabel, fmtDate } from "@/lib/vat-format"
import { VatReturnWizardDialog } from "./VatReturnWizardDialog"
import { VatReturnLinkRefundDialog } from "./VatReturnLinkRefundDialog"
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
  color: "var(--ink3)", fontFamily: "var(--font-mono)",
}
const valueStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink)", fontWeight: 600,
}
const monoSm: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 }
const btnDanger: React.CSSProperties = {
  background: "none", border: "1px solid var(--at-neg)", borderRadius: 3,
  padding: "4px 12px", fontFamily: "var(--font-mono)", fontSize: 11,
  color: "var(--at-neg)", cursor: "pointer",
}
const btnSecondary: React.CSSProperties = {
  background: "none", border: "1px solid var(--rule)", borderRadius: 3,
  padding: "4px 12px", fontFamily: "var(--font-mono)", fontSize: 11,
  color: "var(--ink2)", cursor: "pointer",
}

interface Props {
  open: boolean
  onClose: () => void
  vatReturn: VatReturn
  onUpdated: () => void
  onDeleted: () => void
}

export function VatReturnDetailDialog({ open, onClose, vatReturn, onUpdated, onDeleted }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const { toast } = useToast()
  const r = vatReturn

  async function handleDelete() {
    try {
      const res = await authFetch(`/api/compta/vat-returns/${r.id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "CA3 supprimee" })
        onDeleted()
      } else {
        const data = await res.json()
        toast({ title: "Erreur", description: data.error || "Echec de la suppression" })
      }
    } catch (err: unknown) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur reseau" })
    }
  }

  const creditActionLabel: Record<string, string> = {
    reported: "Reporte sur declaration suivante",
    refund_requested: "Remboursement demande",
    to_pay: "TVA a payer",
    na: "Pas d'action",
  }

  const statusLabel: Record<string, string> = {
    draft: "Brouillon",
    submitted: "Deposee",
    refund_pending: "Remboursement en attente",
    refund_received: "Remboursement recu",
    closed: "Cloturee",
  }

  function Row({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ ...monoSm, color: "var(--ink3)" }}>{label}</span>
        <span style={{ ...valueStyle, color: color || "var(--ink)" }}>{value}</span>
      </div>
    )
  }

  return (
    <>
      <Dialog open={open && !wizardOpen && !refundOpen} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent style={{ maxWidth: 560, maxHeight: "90vh", overflow: "auto" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", color: "var(--ink)" }}>
              CA3 &mdash; {getMonthLabel(r.period_month)}
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <span style={{
              display: "inline-flex", padding: "2px 8px", borderRadius: 4,
              fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600,
              background: r.status === "submitted" ? "var(--ink)" : r.status === "refund_received" ? "var(--at-pos)" : "var(--at-surface)",
              color: r.status === "submitted" || r.status === "refund_received" ? "#fff" : "var(--ink2)",
              border: r.status === "draft" ? "1px solid var(--rule)" : "none",
            }}>
              {statusLabel[r.status] || r.status}
            </span>
            {r.filing_reference && (
              <span style={{ ...monoSm, color: "var(--ink3)", lineHeight: "24px" }}>
                Ref : {r.filing_reference}
              </span>
            )}
          </div>

          {r.submitted_at && (
            <div style={{ ...monoSm, color: "var(--ink2)", marginBottom: 12 }}>
              Depose le {fmtDate(r.submitted_at)} a {new Date(r.submitted_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Bases HT</div>
            <Row label="Ventes FR taxables" value={formatEur(Number(r.base_ventes_fr_taxable || 0))} />
            <Row label="Acquisitions intracom" value={formatEur(Number(r.base_acquisitions_intracom || 0))} />
            <Row label="Prestations hors UE" value={formatEur(Number(r.base_achats_hors_ue || 0))} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>TVA</div>
            <Row label="TVA brute due" value={formatEur(Number(r.vat_brute_due || 0))} />
            <Row label="dont intracom" value={formatEur(Number(r.vat_intracom || 0))} />
            <Row label="Deductible immobilisations" value={formatEur(Number(r.vat_deductible_immo || 0))} />
            <Row label="Deductible autres" value={formatEur(Number(r.vat_deductible_other || 0))} />
            <Row label="Autre deduction (rattrapage)" value={formatEur(Number(r.vat_other_deduction || 0))} />
            <Row label="Total deductible" value={formatEur(Number(r.vat_deductible_total || 0))} />
            {Number(r.vat_credit || 0) > 0 && (
              <Row label="Credit" value={formatEur(Number(r.vat_credit))} color="var(--at-pos)" />
            )}
            {Number(r.vat_to_pay || 0) > 0 && (
              <Row label="A payer" value={formatEur(Number(r.vat_to_pay))} color="var(--at-neg)" />
            )}
          </div>

          {r.credit_action && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Action sur le credit</div>
              <div style={{ ...monoSm, color: "var(--ink)", marginTop: 2 }}>
                {creditActionLabel[r.credit_action] || r.credit_action}
                {r.credit_action === "refund_requested" && r.refund_requested_amount && (
                  <span> &mdash; {formatEur(Number(r.refund_requested_amount))}</span>
                )}
              </div>
            </div>
          )}

          {r.refund_transaction && (
            <div style={{
              border: "1px solid var(--at-pos)", borderRadius: 4, padding: "8px 12px",
              background: "#f0f7f0", marginBottom: 12,
            }}>
              <div style={{ ...monoSm, color: "var(--at-pos)", fontWeight: 600, marginBottom: 2 }}>
                Remboursement recu
              </div>
              <div style={monoSm}>
                {fmtDate(r.refund_transaction.settlement_date)} &mdash; {formatEur(Number(r.refund_transaction.amount))}
                <span style={{ color: "var(--ink3)" }}> ({r.refund_transaction.counterparty_name})</span>
              </div>
            </div>
          )}

          {Array.isArray(r.retroactive_periods) && r.retroactive_periods.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Periodes rattrapees</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                {r.retroactive_periods.map(p => (
                  <span key={p} style={{
                    display: "inline-block", padding: "1px 6px", borderRadius: 3,
                    border: "1px solid var(--rule)", ...monoSm, color: "var(--ink2)",
                  }}>
                    {getMonthLabel(p)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {r.notes && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Notes</div>
              <div style={{ ...monoSm, color: "var(--ink2)", marginTop: 2, whiteSpace: "pre-wrap" }}>{r.notes}</div>
            </div>
          )}

          {r.acknowledgment_url && (
            <div style={{ marginBottom: 12 }}>
              <a
                href={r.acknowledgment_url} target="_blank" rel="noopener noreferrer"
                style={{ ...monoSm, color: "var(--at-accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <ExternalLink size={12} /> Accuse de reception
              </a>
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setWizardOpen(true)} style={btnSecondary}>
                <Pencil size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Modifier
              </button>
              {r.status === "refund_pending" && !r.refund_bank_transaction_id && (
                <button onClick={() => setRefundOpen(true)} style={btnSecondary}>
                  <Link2 size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Lier un remboursement
                </button>
              )}
            </div>

            <div>
              {confirmDelete ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ ...monoSm, color: "var(--at-neg)" }}>Confirmer ?</span>
                  <button onClick={handleDelete} style={{ ...btnDanger, fontWeight: 700 }}>Oui</button>
                  <button onClick={() => setConfirmDelete(false)} style={btnSecondary}>Non</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} style={btnDanger}>
                  <Trash2 size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Supprimer
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VatReturnWizardDialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        defaultMonth={String(r.period_month).slice(0, 7)}
        onSaved={() => { setWizardOpen(false); onUpdated() }}
        editData={{
          id: r.id,
          base_ventes_fr_taxable: Number(r.base_ventes_fr_taxable || 0),
          base_acquisitions_intracom: Number(r.base_acquisitions_intracom || 0),
          base_achats_hors_ue: Number(r.base_achats_hors_ue || 0),
          vat_deductible_immo: Number(r.vat_deductible_immo || 0),
          vat_deductible_other: Number(r.vat_deductible_other || 0),
          vat_other_deduction: Number(r.vat_other_deduction || 0),
          credit_action: r.credit_action,
          refund_requested_amount: r.refund_requested_amount ? Number(r.refund_requested_amount) : null,
          retroactive_periods: r.retroactive_periods,
          retroactive_notes: r.retroactive_notes,
          filing_reference: r.filing_reference,
          submitted_at: r.submitted_at,
          acknowledgment_url: r.acknowledgment_url,
          notes: r.notes,
          status: r.status,
        }}
      />

      <VatReturnLinkRefundDialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        vatReturnId={r.id}
        refundAmount={Number(r.refund_requested_amount || r.vat_credit || 0)}
        onLinked={() => { setRefundOpen(false); onUpdated() }}
      />
    </>
  )
}
