import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatEur, fmtDate } from "@/lib/vat-format"
import { useToast } from "@/hooks/use-toast"

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

const monoSm: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 }
const labelStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
  color: "var(--ink3)", fontFamily: "var(--font-mono)", marginBottom: 6,
}
const btnPrimary: React.CSSProperties = {
  background: "var(--at-accent)", color: "#fff", border: "none", borderRadius: 3,
  padding: "6px 16px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, cursor: "pointer",
}
const btnSecondary: React.CSSProperties = {
  background: "none", border: "1px solid var(--rule)", borderRadius: 3,
  padding: "6px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)", cursor: "pointer",
}

interface BankTx {
  id: string
  settlement_date: string
  amount: number
  counterparty_name: string
  side: string
  reference: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  vatReturnId: string
  refundAmount: number
  onLinked: () => void
}

const REFUND_KEYWORDS = ["TVA", "DGFIP", "TRESOR", "FINANCES", "IMPOT"]

export function VatReturnLinkRefundDialog({ open, onClose, vatReturnId, refundAmount, onLinked }: Props) {
  const [transactions, setTransactions] = useState<BankTx[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setLoading(true)
    authFetch("/api/compta/bank-transactions?status=unmatched")
      .then(r => r.ok ? r.json() : { transactions: [] })
      .then(data => {
        const txs: BankTx[] = data.transactions || []
        const filtered = txs.filter(tx => {
          const name = (tx.counterparty_name || "").toUpperCase()
          const nameMatch = REFUND_KEYWORDS.some(kw => name.includes(kw))
          const amtMatch = refundAmount > 0 && Math.abs(Number(tx.amount) - refundAmount) / refundAmount < 0.05
          return nameMatch || amtMatch
        })
        setTransactions(filtered.length > 0 ? filtered : txs.slice(0, 20))
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false))
  }, [open, refundAmount])

  async function handleLink() {
    if (!selected) return
    setSaving(true)
    try {
      const res = await authFetch(`/api/compta/vat-returns/${vatReturnId}`, {
        method: "PUT",
        body: JSON.stringify({ refund_bank_transaction_id: selected }),
      })
      if (res.ok) {
        toast({ title: "Remboursement lie" })
        onLinked()
      } else {
        const data = await res.json()
        toast({ title: "Erreur", description: data.error || "Echec" })
      }
    } catch (err: unknown) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur reseau" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent style={{ maxWidth: 520, maxHeight: "90vh", overflow: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-serif)", color: "var(--ink)" }}>
            Lier un remboursement TVA
          </DialogTitle>
        </DialogHeader>

        {refundAmount > 0 && (
          <div style={{ ...monoSm, color: "var(--ink2)", marginBottom: 12 }}>
            Montant attendu : <strong>{formatEur(refundAmount)}</strong>
          </div>
        )}

        <div style={labelStyle}>Transactions bancaires disponibles</div>

        {loading ? (
          <div style={{ ...monoSm, color: "var(--ink3)", padding: 20, textAlign: "center" }}>Chargement...</div>
        ) : transactions.length === 0 ? (
          <div style={{ ...monoSm, color: "var(--ink3)", padding: 20, textAlign: "center" }}>
            Aucune transaction non rapprochee trouvee.
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {transactions.map(tx => {
              const isSelected = selected === tx.id
              const amtClose = refundAmount > 0 && Math.abs(Number(tx.amount) - refundAmount) / refundAmount < 0.05
              return (
                <label
                  key={tx.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                    borderRadius: 4, marginBottom: 4, cursor: "pointer",
                    border: isSelected ? "2px solid var(--at-accent)" : "1px solid var(--rule)",
                    background: isSelected ? "var(--at-bg)" : "transparent",
                  }}
                >
                  <input
                    type="radio" name="refund_tx" value={tx.id}
                    checked={isSelected}
                    onChange={() => setSelected(tx.id)}
                    style={{ accentColor: "var(--at-accent)" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ ...monoSm, color: "var(--ink)", fontWeight: 600 }}>{tx.counterparty_name}</span>
                      <span style={{ ...monoSm, color: amtClose ? "var(--at-pos)" : "var(--ink)", fontWeight: amtClose ? 700 : 400 }}>
                        {formatEur(Number(tx.amount))}
                      </span>
                    </div>
                    <div style={{ ...monoSm, color: "var(--ink3)", fontSize: 10 }}>
                      {fmtDate(tx.settlement_date)} &mdash; {tx.side === "credit" ? "Credit" : "Debit"}
                      {tx.reference && <span> &mdash; {tx.reference}</span>}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={btnSecondary}>Annuler</button>
          <button
            onClick={handleLink}
            disabled={!selected || saving}
            style={{ ...btnPrimary, opacity: !selected || saving ? 0.5 : 1 }}
          >
            {saving ? "..." : "Lier"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
