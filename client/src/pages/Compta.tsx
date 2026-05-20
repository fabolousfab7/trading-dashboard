import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { Upload, FileText, RefreshCw, X, Check, Eye, Pencil, Trash2, Link2Off, Ban, UserMinus, Briefcase, Bitcoin } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import InfoTip from "@/components/InfoTip"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"

const COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55", "#9a988f", "#4a4540", "#d4a057", "#6b8f71", "#8b6b4a"]

const CATEGORIES = [
  { code: "618100", label: "Logiciels & data" },
  { code: "617000", label: "FTMO" },
  { code: "626100", label: "Télécom" },
  { code: "627000", label: "Frais bancaires" },
  { code: "627100", label: "Frais d'actes" },
  { code: "606300", label: "Fournitures" },
  { code: "625100", label: "Déplacements" },
  { code: "625600", label: "Missions" },
  { code: "681000", label: "Amortissements" },
  { code: "708000", label: "Produits divers" },
  { code: "101000", label: "Capital social" },
  { code: "455000", label: "Compte courant associé" },
  { code: "512100", label: "Virement IBKR" },
  { code: "512200", label: "Virement Kraken" },
  { code: "471000", label: "Compte d'attente" },
]

const NON_CHARGE_CATS = ["101000", "455000", "512100", "512200"]
const IS_NON_CHARGE = (cat: string) => NON_CHARGE_CATS.includes(cat)

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.code, c.label]))
const VAT_RATES = [0, 5.5, 10, 20]
const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

const tooltipStyle = {
  background: "var(--at-surface)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--ink)",
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 3,
  padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", outline: "none",
}

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  if (!d) return ""
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

type Tab = "all" | "unmatched" | "matched"

export default function Compta() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [bankTxs, setBankTxs] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [vatSummary, setVatSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("all")
  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [ocrLoading, setOcrLoading] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [reconcileResult, setReconcileResult] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalData, setModalData] = useState<any>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [matchingTxId, setMatchingTxId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [bankBalance, setBankBalance] = useState<{ balance: number; lastDate: string | null; nbTransactions: number } | null>(null)
  const [swapsData, setSwapsData] = useState<{ rows: any[]; total_eur: number; needs_review_count: number } | null>(null)
  const [swapsLoading, setSwapsLoading] = useState(false)
  const [swapOverrides, setSwapOverrides] = useState<Record<string, { override: string; note: string }>>({})
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const monthParam = selectedMonth ? `?month=${selectedMonth}` : ""
      const [invR, txR, statsR, vatR, sugR] = await Promise.all([
        authFetch(`/api/compta/invoices${monthParam}`),
        authFetch(`/api/compta/bank-transactions${monthParam}`),
        authFetch("/api/compta/stats"),
        authFetch("/api/compta/vat-summary"),
        authFetch("/api/compta/reconcile/suggestions"),
      ])
      const invD = await invR.json()
      const txD = await txR.json()
      setInvoices(invD.invoices || [])
      setBankTxs(txD.transactions || [])
      setStats(await statsR.json())
      setVatSummary(await vatR.json())
      const sugD = await sugR.json()
      setSuggestions(sugD.suggestions || [])
      authFetch("/api/compta/bank-balance")
        .then(r => r.ok ? r.json() : null)
        .then(d => setBankBalance(d))
        .catch(() => {})
      const ytdFrom = `${new Date().getFullYear()}-01-01`
      const ytdTo = new Date().toISOString().slice(0, 10)
      authFetch(`/api/compta/crypto-swaps?from=${ytdFrom}&to=${ytdTo}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          setSwapsData(d)
          if (d?.rows) {
            const init: Record<string, { override: string; note: string }> = {}
            for (const r of d.rows) init[r.id] = { override: r.valuation_eur_override ?? "", note: r.override_note ?? "" }
            setSwapOverrides(init)
          }
        })
        .catch(() => {})
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [selectedMonth])

  useEffect(() => { loadData() }, [loadData])

  const currentYear = new Date().getFullYear()
  const currentMonthIdx = new Date().getMonth()
  const monthOptions = Array.from({ length: currentMonthIdx + 1 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0")
    return { value: `${currentYear}-${m}`, label: `${MONTH_NAMES[i]} ${currentYear}` }
  })

  async function handleInvoiceDrop(e: React.DragEvent | React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault()
    const files = "dataTransfer" in e ? e.dataTransfer.files : (e.target as HTMLInputElement).files
    if (!files?.length) return
    const file = files[0]
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Format non supporté. Utilisez une image ou un PDF.")
      return
    }
    setOcrLoading(true)
    setError(null)
    try {
      const base64 = await fileToBase64(file)
      const r = await authFetch("/api/compta/invoices/ocr", {
        method: "POST",
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      })
      const data = await r.json()
      if (data.error && !data.party_name) {
        setError(`OCR échouée : ${data.error}`)
      } else {
        setEditingId(null)
        const currency = data.currency || "EUR"
        const invoiceDate = data.invoice_date || new Date().toISOString().slice(0, 10)
        let ht = data.amount_ht || 0, vat = data.amount_vat || 0, ttc = data.amount_ttc || 0
        let fxInfo: any = null

        if (currency !== "EUR") {
          try {
            const fxR = await authFetch(`/api/compta/fx-rate?from=${currency}&to=EUR&date=${invoiceDate}`)
            const fxData = await fxR.json()
            if (fxData.rate) {
              fxInfo = { original_currency: currency, original_ht: ht, original_vat: vat, original_ttc: ttc, fx_rate: fxData.rate, fx_date: fxData.date }
              ht = Math.round(ht * fxData.rate * 100) / 100
              vat = Math.round(vat * fxData.rate * 100) / 100
              ttc = Math.round(ttc * fxData.rate * 100) / 100
            }
          } catch (fxErr: any) {
            console.error("[FX] Conversion failed:", fxErr)
          }
        }

        setModalData({
          direction: "expense",
          party_name: data.party_name || "",
          invoice_number: data.invoice_number || "",
          invoice_date: invoiceDate,
          amount_ht: ht,
          amount_vat: vat,
          amount_ttc: ttc,
          vat_rate: data.vat_rate || 20,
          party_vat_number: data.party_vat_number || "",
          party_country: data.party_country || "FR",
          vat_reverse_charge: data.party_country && data.party_country !== "FR",
          vat_deductible: true,
          category: "618100",
          description: data.description || "",
          notes: "",
          _fxInfo: fxInfo,
        })
        setModalOpen(true)
      }
    } catch (e: any) { setError(e.message) }
    finally { setOcrLoading(false) }
  }

  async function handleCsvDrop(e: React.DragEvent | React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault()
    const files = "dataTransfer" in e ? e.dataTransfer.files : (e.target as HTMLInputElement).files
    if (!files?.length) return
    const file = files[0]
    setError(null)
    setImportResult(null)
    try {
      const text = await file.text()
      const r = await authFetch("/api/compta/bank-import", {
        method: "POST",
        body: JSON.stringify({ csv: text }),
      })
      const data = await r.json()
      if (data.error) { setError(data.error); return }
      const skippedMsg = data.skipped ? ` · ${data.skipped} doublons ignorés` : ""
      setImportResult(data.imported > 0
        ? `${data.imported} transactions importées (${data.dateRange.from} → ${data.dateRange.to})${skippedMsg}`
        : data.message || "Aucune nouvelle transaction")
      await loadData()
    } catch (e: any) { setError(e.message) }
  }

  async function handleReconcile() {
    setReconcileResult(null)
    try {
      const r = await authFetch("/api/compta/reconcile", { method: "POST" })
      const data = await r.json()
      setReconcileResult(`${data.matched} matchés, ${data.ambiguous} ambigus, ${data.unmatched} non matchés`)
      await loadData()
    } catch (e: any) { setError(e.message) }
  }

  async function handleSaveInvoice() {
    try {
      const url = editingId ? `/api/compta/invoices/${editingId}` : "/api/compta/invoices"
      const method = editingId ? "PUT" : "POST"
      const { _fxInfo, ...invoiceFields } = modalData
      const body = _fxInfo ? { ...invoiceFields, notes: invoiceFields.notes || "", raw_fx: _fxInfo } : invoiceFields
      const r = await authFetch(url, { method, body: JSON.stringify(body) })
      const data = await r.json()
      if (r.status === 409) {
        toast({ title: "Doublon détecté", description: data.detail || data.error }); return
      }
      if (data.error) { setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error)); return }
      setModalOpen(false)
      await loadData()
    } catch (e: any) { setError(e.message) }
  }

  async function handleDeleteInvoice(id: string) {
    if (!confirm("Supprimer cette facture ?")) return
    const r = await authFetch(`/api/compta/invoices/${id}`, { method: "DELETE" })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast({ title: "Erreur suppression", description: err.error || "Echec de la suppression" }); return
    }
    toast({ title: "Facture supprimee" })
    await loadData()
  }

  async function handleManualMatch(invoiceId: string, bankTxId: string) {
    const r = await authFetch("/api/compta/reconcile/manual", {
      method: "POST",
      body: JSON.stringify({ invoiceId, bankTransactionId: bankTxId }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast({ title: "Erreur rapprochement", description: err.error || "Echec du rapprochement" }); return
    }
    setMatchingTxId(null)
    await loadData()
  }

  async function handleUnmatch(invoiceId: string) {
    const r = await authFetch(`/api/compta/reconcile/unmatch/${invoiceId}`, { method: "POST" })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast({ title: "Erreur", description: err.error || "Echec de la dissociation" }); return
    }
    await loadData()
  }

  async function handleIgnore(txId: string) {
    await authFetch(`/api/compta/bank-transactions/${txId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "ignored" }),
    })
    await loadData()
  }

  async function handleUnignore(txId: string) {
    await authFetch(`/api/compta/bank-transactions/${txId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "unmatched" }),
    })
    await loadData()
  }

  async function patchSwap(id: string, body: any) {
    try {
      const r = await authFetch(`/api/compta/crypto-swaps/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
      if (!r.ok) { const err = await r.json().catch(() => ({})); toast({ title: "Erreur", description: err.error || "Echec du PATCH" }); return }
      const ytdFrom = `${new Date().getFullYear()}-01-01`
      const ytdTo = new Date().toISOString().slice(0, 10)
      const refR = await authFetch(`/api/compta/crypto-swaps?from=${ytdFrom}&to=${ytdTo}`)
      if (refR.ok) {
        const d = await refR.json()
        setSwapsData(d)
      }
    } catch (e: any) { toast({ title: "Erreur", description: e.message }) }
  }

  async function handleBackfill() {
    if (!confirm("Lancer le backfill rétroactif crypto-crypto ? Cela va re-scanner 365 jours de trades Kraken.")) return
    setSwapsLoading(true)
    try {
      const r = await authFetch("/api/compta/crypto-swaps/backfill", { method: "POST" })
      const d = await r.json()
      if (!r.ok) { toast({ title: "Erreur backfill", description: d.error || "Echec" }); return }
      toast({ title: "Backfill terminé", description: `${d.inserted} insérés, ${d.updated} mis à jour, ${d.needs_review} à vérifier` })
      await loadData()
    } catch (e: any) { toast({ title: "Erreur", description: e.message }) }
    finally { setSwapsLoading(false) }
  }

  async function handleQuickCategory(tx: any, category: string, labelDebit: string, labelCredit: string) {
    try {
      const amount = Math.abs(Number(tx.amount))
      const isCredit = tx.side === "credit"
      const direction = isCredit ? "revenue" : "expense"
      const description = isCredit ? labelCredit : labelDebit
      const catLabel = CAT_LABEL[category] || category
      const r = await authFetch("/api/compta/invoices", {
        method: "POST",
        body: JSON.stringify({
          direction,
          party_name: tx.counterparty_name,
          invoice_date: tx.settlement_date,
          amount_ht: amount,
          amount_vat: 0,
          amount_ttc: amount,
          vat_rate: 0,
          vat_deductible: false,
          vat_reverse_charge: false,
          category,
          description,
          party_country: "FR",
          status: "validated",
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        toast({ title: "Erreur", description: err.error || err.detail || "Echec de la creation" }); return
      }
      const inv = await r.json()
      const r2 = await authFetch("/api/compta/reconcile/manual", {
        method: "POST",
        body: JSON.stringify({ invoiceId: inv.id, bankTransactionId: tx.id }),
      })
      if (!r2.ok) {
        const err = await r2.json().catch(() => ({}))
        toast({ title: "Erreur rapprochement", description: err.error || "Echec du rapprochement" }); return
      }
      toast({ title: `${category} ${catLabel}`, description: `${tx.counterparty_name} — ${fmtEur(amount)} → ${category}` })
      await loadData()
    } catch (e: any) { setError(e.message) }
  }

  function openEditModal(inv: any) {
    setEditingId(inv.id)
    setModalData({
      direction: inv.direction,
      party_name: inv.party_name,
      invoice_number: inv.invoice_number || "",
      invoice_date: inv.invoice_date,
      payment_date: inv.payment_date || "",
      amount_ht: Number(inv.amount_ht),
      amount_vat: Number(inv.amount_vat),
      amount_ttc: Number(inv.amount_ttc),
      vat_rate: Number(inv.vat_rate) || 20,
      party_vat_number: inv.party_vat_number || "",
      party_country: inv.party_country || "FR",
      vat_reverse_charge: inv.vat_reverse_charge || false,
      vat_deductible: inv.vat_deductible ?? true,
      category: inv.category || "471000",
      description: inv.description || "",
      notes: inv.notes || "",
    })
    setModalOpen(true)
  }

  function updateModalField(field: string, value: any) {
    setModalData((prev: any) => {
      const next = { ...prev, [field]: value }
      if (field === "category" && IS_NON_CHARGE(value)) {
        next.direction = "expense"
        next.vat_deductible = false
        next.vat_rate = 0
        next.amount_vat = 0
        next.amount_ttc = Number(next.amount_ht) || 0
        next.vat_reverse_charge = false
        return next
      }
      if (field === "category" && IS_NON_CHARGE(prev.category) && !IS_NON_CHARGE(value)) {
        next.vat_rate = 20
        const ht = Number(next.amount_ht) || 0
        next.amount_vat = Math.round(ht * 20) / 100
        next.amount_ttc = Math.round((ht + next.amount_vat) * 100) / 100
        next.vat_deductible = true
      }
      const isCCA = IS_NON_CHARGE(next.category)
      if ((field === "amount_ht" || field === "vat_rate") && !isCCA) {
        const ht = field === "amount_ht" ? Number(value) : Number(prev.amount_ht)
        const rate = field === "vat_rate" ? Number(value) : Number(prev.vat_rate)
        next.amount_vat = Math.round(ht * rate) / 100
        next.amount_ttc = Math.round((ht + next.amount_vat) * 100) / 100
      }
      if (field === "amount_ht" && isCCA) {
        next.amount_vat = 0
        next.amount_ttc = Number(value) || 0
      }
      if (field === "amount_ttc" && isCCA) {
        next.amount_ht = Number(value) || 0
        next.amount_vat = 0
      }
      if (field === "party_country") {
        next.vat_reverse_charge = value !== "FR"
      }
      return next
    })
  }

  type Row = { id: string; date: string; counterparty: string; amount: number; type: "bank" | "invoice"; status: string; original: any; linkedInvoice?: any }
  const rows: Row[] = []
  for (const tx of bankTxs) {
    const linked = tx.invoice_id ? invoices.find(i => i.id === tx.invoice_id) : null
    rows.push({ id: `tx-${tx.id}`, date: tx.settlement_date, counterparty: tx.counterparty_name, amount: Math.abs(Number(tx.amount)), type: "bank", status: tx.status, original: tx, linkedInvoice: linked })
  }
  for (const inv of invoices) {
    if (!inv.bank_transaction_id) {
      const status = inv.reconciled_at ? "settled_cca" : "pending_payment"
      rows.push({ id: `inv-${inv.id}`, date: inv.invoice_date, counterparty: inv.party_name, amount: Number(inv.amount_ttc), type: "invoice", status, original: inv })
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date))

  const filteredRows = tab === "all" ? rows : tab === "unmatched" ? rows.filter(r => r.status === "unmatched" || r.status === "pending_payment") : rows.filter(r => r.status === "matched" || r.status === "settled_cca")
  const unmatchedCount = rows.filter(r => r.status === "unmatched" || r.status === "pending_payment").length
  const matchedCount = rows.filter(r => r.status === "matched" || r.status === "settled_cca").length

  const unreconciledInvoices = invoices.filter(i => !i.bank_transaction_id)

  const vatMonth = selectedMonth || `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}`
  const vatData = vatSummary?.months?.find((m: any) => m.month === vatMonth)

  if (loading) return <div style={{ padding: "28px 32px", color: "var(--ink2)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Chargement…</div>

  return (
    <div style={{ padding: "28px 32px" }}>

      {/* ── MASTHEAD ──────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            Société FHF &middot; Rapprochement & TVA
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Comptabilité, en clair.
          </h1>
        </div>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          style={{ ...inputStyle, width: "auto", padding: "6px 12px", background: "var(--at-surface)" }}>
          <option value="">Tous les mois</option>
          {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ background: "color-mix(in srgb, var(--at-neg) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--at-neg) 30%, transparent)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--at-neg)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{error}</span>
          <button onClick={() => setError(null)} style={{ color: "var(--at-neg)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* ── KPI ROW ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Charges HT YTD<InfoTip text="Total des factures dépenses HT de l'année en cours. Exclut les mouvements bilan (CCA 455000, IBKR 512100, Kraken 512200, Capital 101000)." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>{fmtEur(stats?.charges_ht_ytd || 0)}</div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            TVA déductible YTD<InfoTip text="TVA payée sur les achats pro (logiciels, abonnements, matériel). Récupérable via la déclaration CA3 mensuelle. Source : factures avec vat_deductible = true." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtEur((vatSummary?.months || []).reduce((s: number, m: any) => s + m.tva_deductible_fr + m.tva_autoliquidee_intracom, 0))}
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>Factures</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {stats?.reconciled_count || 0} <span style={{ color: "var(--ink3)" }}>/ {stats?.invoices_count || 0}</span>
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>rapprochées</div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Compte courant associé<InfoTip text="Compte Courant Associé 455000. Positif = FHF doit à Fabien. Calculé depuis les factures catégorie 455000." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: (stats?.cca_balance || 0) >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtEur(Math.abs(stats?.cca_balance || 0))}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            {(stats?.cca_balance || 0) >= 0 ? "FHF te doit" : "Tu dois à FHF"}
          </div>
        </div>
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Solde Qonto<InfoTip text="Solde calculé depuis les relevés CSV importés. Entrées − Sorties depuis la 1ère transaction. Dernier mouvement importé affiché en dessous." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {bankBalance ? fmtEur(bankBalance.balance) : "—"}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            {bankBalance?.lastDate ? `Relevé au ${new Date(bankBalance.lastDate).toLocaleDateString("fr-FR")}` : "Aucun relevé importé"}
          </div>
        </div>
      </div>

      {/* ── UPLOAD ZONES ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 28 }}>
        {/* Invoice upload */}
        <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <FileText size={14} style={{ color: "var(--ink2)" }} />
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Upload facture</span>
          </div>
          <div onDragOver={e => e.preventDefault()} onDrop={handleInvoiceDrop}
            style={{ border: "2px dashed var(--rule)", borderRadius: 4, padding: 32, textAlign: "center", cursor: "pointer", transition: "border .15s" }}>
            {ocrLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--at-accent)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <RefreshCw size={16} className="animate-spin" /> Analyse OCR en cours…
              </div>
            ) : (
              <>
                <Upload size={24} style={{ color: "var(--ink3)", margin: "0 auto 8px" }} />
                <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Glissez une facture (image/PDF)</p>
                <label style={{ display: "inline-block", marginTop: 12, padding: "6px 16px", background: "var(--at-surface)", border: "1px solid var(--rule)", color: "var(--at-accent)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
                  Sélectionner un fichier
                  <input type="file" accept="image/*,application/pdf" onChange={handleInvoiceDrop} style={{ display: "none" }} />
                </label>
              </>
            )}
          </div>
          <button onClick={() => { setEditingId(null); setModalData({ direction: "expense", party_name: "", invoice_number: "", invoice_date: new Date().toISOString().slice(0, 10), amount_ht: 0, amount_vat: 0, amount_ttc: 0, vat_rate: 20, party_vat_number: "", party_country: "FR", vat_reverse_charge: false, vat_deductible: true, category: "618100", description: "", notes: "" }); setModalOpen(true) }}
            style={{ width: "100%", marginTop: 12, padding: "8px 16px", background: "var(--at-surface)", border: "1px solid var(--rule)", color: "var(--at-accent)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
            + Saisie manuelle
          </button>
        </div>

        {/* CSV upload */}
        <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Upload size={14} style={{ color: "var(--ink2)" }} />
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Import relevé Qonto</span>
          </div>
          <div onDragOver={e => e.preventDefault()} onDrop={handleCsvDrop}
            style={{ border: "2px dashed var(--rule)", borderRadius: 4, padding: 32, textAlign: "center", cursor: "pointer", transition: "border .15s" }}>
            <Upload size={24} style={{ color: "var(--ink3)", margin: "0 auto 8px" }} />
            <p style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Glissez un export CSV Qonto</p>
            <label style={{ display: "inline-block", marginTop: 12, padding: "6px 16px", background: "var(--at-surface)", border: "1px solid var(--rule)", color: "var(--at-accent)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
              Sélectionner un CSV
              <input type="file" accept=".csv" onChange={handleCsvDrop} style={{ display: "none" }} />
            </label>
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 8 }}>
            {bankBalance?.lastDate ? `Dernier mouvement importé : ${new Date(bankBalance.lastDate).toLocaleDateString("fr-FR")} · ${bankBalance.nbTransactions} transactions` : "Aucun relevé importé"}
          </div>
          {importResult && <div style={{ marginTop: 8, color: "var(--at-pos)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{importResult}</div>}
          <button onClick={handleReconcile}
            style={{ width: "100%", marginTop: 12, padding: "8px 16px", background: "var(--at-surface)", border: "1px solid var(--rule)", color: "var(--at-accent)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <RefreshCw size={12} /> Lancer le rapprochement
          </button>
          {reconcileResult && <div style={{ marginTop: 8, color: "var(--at-accent)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{reconcileResult}</div>}
        </div>
      </div>

      {/* ── MATCH SUGGESTIONS ─────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Suggestions de rapprochement</span>
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>{suggestions.length}</span>
          </div>
          {suggestions.map(s => (
            <div key={`${s.invoice_id}-${s.bank_tx_id}`} style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--rule)", borderRadius: 4, padding: 10, marginBottom: 8, transition: "background .15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--at-accent) 5%, transparent)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--at-accent)" }}>Facture</span>
                  <span style={{ color: "var(--ink)" }}>{s.invoice_party}</span>
                  <span style={{ color: "var(--ink3)" }}>({fmtEur(s.invoice_amount)}, {fmtDate(s.invoice_date)})</span>
                  <span style={{ color: "var(--ink3)" }}>↔</span>
                  <span style={{ color: "var(--at-accent)" }}>Banque</span>
                  <span style={{ color: "var(--ink)" }}>{s.bank_counterparty}</span>
                  <span style={{ color: "var(--ink3)" }}>({fmtEur(s.bank_amount)}, {fmtDate(s.bank_date)})</span>
                </div>
                {s.confidence === "approx" && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#c08a4d", marginTop: 2 }}>écart {fmtEur(s.amount_diff)} (valeur facture conservée)</div>}
                {s.confidence === "exact" && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--at-pos)", marginTop: 2 }}>montant exact</div>}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={async () => { await handleManualMatch(s.invoice_id, s.bank_tx_id); setSuggestions(prev => prev.filter(x => x.invoice_id !== s.invoice_id && x.bank_tx_id !== s.bank_tx_id)); toast({ title: "Rapproché", description: `${s.invoice_party} ↔ ${s.bank_counterparty}` }) }}
                  style={{ padding: "4px 10px", background: "color-mix(in srgb, var(--at-pos) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--at-pos) 30%, transparent)", color: "var(--at-pos)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
                  Valider
                </button>
                <button onClick={() => setSuggestions(prev => prev.filter(x => x.invoice_id !== s.invoice_id || x.bank_tx_id !== s.bank_tx_id))}
                  style={{ padding: "4px 10px", border: "1px solid var(--rule)", color: "var(--ink3)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", background: "none" }}>
                  Ignorer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── RECONCILIATION TABLE ──────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Rapprochement</span>
          <div style={{ display: "flex", gap: 4 }}>
            {([["all", "Tout", rows.length], ["unmatched", "À traiter", unmatchedCount], ["matched", "Rapprochés", matchedCount]] as const).map(([t, label, count]) => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: "4px 10px", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", transition: "all .15s",
                  background: tab === t ? "var(--at-accent)" : "transparent",
                  color: tab === t ? "var(--at-bg)" : "var(--ink3)",
                  border: tab === t ? "1px solid var(--at-accent)" : "1px solid transparent",
                }}>
                {label} ({count})
              </button>
            ))}
          </div>
        </div>
        {filteredRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Aucune donnée</div>
        ) : (
          <div style={{ maxHeight: 600, overflowY: "auto", border: "1px solid var(--rule)", borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "var(--at-surface)", zIndex: 1 }}>
                  {["Date", "Contrepartie", "Montant TTC", "Type", "Statut", "Facture liée", "Actions"].map((h, i) => (
                    <th key={h} style={{
                      padding: "10px 12px", textAlign: [2, 6].includes(i) ? "right" : [3, 4].includes(i) ? "center" : "left",
                      fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
                      borderBottom: "1px solid var(--rule)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id} style={{ borderBottom: "1px dotted var(--rule)", transition: "background .15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--at-accent) 5%, transparent)" }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
                    <td style={{ padding: "9px 12px", color: "var(--ink)" }}>{fmtDate(row.date)}</td>
                    <td style={{ padding: "9px 12px", color: "var(--ink)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.counterparty}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.type === "bank" && row.original.side === "credit" ? "var(--at-pos)" : "var(--ink)" }}>
                      {row.type === "bank" && row.original.side === "credit" ? "+" : "-"}{fmtEur(row.amount)}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "center" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: "color-mix(in srgb, var(--at-accent) 10%, transparent)", color: "var(--at-accent)" }}>
                        {row.type === "bank" ? "Banque" : "Facture"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "center" }}>
                      {row.status === "matched" && row.linkedInvoice?.category === "455000" && <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: "color-mix(in srgb, #c08a4d 15%, transparent)", color: "#c08a4d", border: "1px solid color-mix(in srgb, #c08a4d 30%, transparent)" }}>CCA</span>}
                      {row.status === "matched" && row.linkedInvoice?.category === "512100" && <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: "color-mix(in srgb, var(--at-accent) 10%, transparent)", color: "var(--at-accent)", border: "1px solid var(--rule)" }}>IBKR</span>}
                      {row.status === "matched" && row.linkedInvoice?.category === "512200" && <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: "color-mix(in srgb, #9a988f 15%, transparent)", color: "#9a988f", border: "1px solid color-mix(in srgb, #9a988f 30%, transparent)" }}>KRK</span>}
                      {row.status === "matched" && !NON_CHARGE_CATS.includes(row.linkedInvoice?.category) && <span style={{ color: "var(--at-pos)" }}>✓</span>}
                      {row.status === "settled_cca" && <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: "color-mix(in srgb, #c08a4d 15%, transparent)", color: "#c08a4d", border: "1px solid color-mix(in srgb, #c08a4d 30%, transparent)" }}>CCA</span>}
                      {row.status === "unmatched" && <span style={{ color: "#c08a4d" }}>●</span>}
                      {row.status === "pending_payment" && <span style={{ color: "var(--ink3)" }}>○</span>}
                      {row.status === "ignored" && <span style={{ color: "var(--ink3)", fontSize: 10 }}>ignoré</span>}
                    </td>
                    <td style={{ padding: "9px 12px", color: "var(--ink3)", fontSize: 10, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.linkedInvoice && <span>{row.linkedInvoice.party_name} — {row.linkedInvoice.invoice_number || "N/A"}</span>}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                        {row.type === "bank" && row.status === "unmatched" && (
                          <>
                            {matchingTxId === row.original.id ? (
                              <select style={{ ...inputStyle, width: "auto", maxWidth: 120, fontSize: 10, padding: "2px 4px" }}
                                onChange={e => { if (e.target.value) handleManualMatch(e.target.value, row.original.id) }} defaultValue="">
                                <option value="">Choisir facture…</option>
                                {unreconciledInvoices.map(inv => (
                                  <option key={inv.id} value={inv.id}>{inv.party_name} — {fmtEur(Number(inv.amount_ttc))}</option>
                                ))}
                              </select>
                            ) : (
                              <button onClick={() => setMatchingTxId(row.original.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--at-accent)", padding: 4 }} title="Matcher"><Check size={12} /></button>
                            )}
                            <button onClick={() => handleQuickCategory(row.original, "455000", "Dépense personnelle — avance CCA", "Apport personnel — CCA")} style={{ background: "none", border: "none", cursor: "pointer", color: "#c08a4d", padding: 4 }} title="CCA (455000)"><UserMinus size={12} /></button>
                            <button onClick={() => handleQuickCategory(row.original, "512100", "Virement vers Interactive Brokers", "Rapatriement depuis Interactive Brokers")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--at-accent)", padding: 4 }} title="IBKR (512100)"><Briefcase size={12} /></button>
                            <button onClick={() => handleQuickCategory(row.original, "512200", "Virement vers Kraken Pro Futures", "Rapatriement depuis Kraken Pro Futures")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink2)", padding: 4 }} title="Kraken (512200)"><Bitcoin size={12} /></button>
                            <button onClick={() => handleIgnore(row.original.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", padding: 4 }} title="Ignorer"><Ban size={12} /></button>
                          </>
                        )}
                        {row.type === "bank" && row.status === "matched" && row.linkedInvoice && (
                          <button onClick={() => handleUnmatch(row.linkedInvoice.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", padding: 4 }} title="Défaire"><Link2Off size={12} /></button>
                        )}
                        {row.type === "bank" && row.status === "ignored" && (
                          <button onClick={() => handleUnignore(row.original.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", padding: 4 }} title="Restaurer"><RefreshCw size={12} /></button>
                        )}
                        {row.type === "invoice" && (
                          <>
                            {row.original.attachment_url && <button onClick={() => window.open(row.original.attachment_url, "_blank")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", padding: 4 }} title="Voir"><Eye size={12} /></button>}
                            <button onClick={() => openEditModal(row.original)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", padding: 4 }} title="Modifier"><Pencil size={12} /></button>
                            <button onClick={() => handleDeleteInvoice(row.original.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--at-neg)", padding: 4 }} title="Supprimer"><Trash2 size={12} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── TVA ────────────────────────────────────────────────── */}
      <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)", marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>TVA</span>
          <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
            {monthOptions.find(m => m.value === vatMonth)?.label || vatMonth}
          </span>
        </div>
        {vatData ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>TVA déductible (FR)</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{fmtEur(vatData.tva_deductible_fr)}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)", marginTop: 2 }}>Base HT : {fmtEur(vatData.base_ht_achats_fr)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>TVA autoliquidée (intracom)</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{fmtEur(vatData.tva_autoliquidee_intracom)}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)", marginTop: 2 }}>Base HT : {fmtEur(vatData.base_ht_achats_intracom)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>TVA collectée (ventes)</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{fmtEur(vatData.tva_collectee)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>TVA nette</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: vatData.tva_nette >= 0 ? "var(--at-neg)" : "var(--at-pos)", marginTop: 4 }}>
                {vatData.tva_nette >= 0 ? "" : "Crédit "}{fmtEur(Math.abs(vatData.tva_nette))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Aucune donnée TVA pour ce mois</div>
        )}
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 12 }}>Ces montants sont indicatifs. Valide avec ta CA3 sur impots.gouv.</div>
      </div>

      {/* ── CHARTS ─────────────────────────────────────────────── */}
      {stats && (stats.charges_by_category?.length > 0 || stats.monthly_by_category?.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 28 }}>
          {stats.charges_by_category?.length > 0 && (
            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Charges par catégorie</span>
                <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>YTD</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stats.charges_by_category} dataKey="total_ht" nameKey="category" cx="50%" cy="50%"
                    outerRadius={70} innerRadius={40} strokeWidth={1.5} stroke="var(--at-bg)">
                    {stats.charges_by_category.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [fmtEur(value), CAT_LABEL[name] || name]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                {stats.charges_by_category.map((d: any, i: number) => (
                  <div key={d.category} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-serif)", color: "var(--ink2)", flex: 1 }}>{CAT_LABEL[d.category] || d.category}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{fmtEur(d.total_ht)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.monthly_by_category?.length > 0 && (() => {
            const usedCats: string[] = Array.from(new Set(stats.monthly_by_category.flatMap((m: any) => Object.keys(m).filter((k: string) => k !== "month"))))
            return (
              <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Charges mensuelles</span>
                  <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>YTD</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.monthly_by_category}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--ink3)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false}
                      tickFormatter={(v: string) => { const [, m] = v.split("-"); return MONTH_NAMES[parseInt(m) - 1]?.slice(0, 3) || v }} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--ink3)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => [fmtEur(value), CAT_LABEL[name] || name]}
                      labelFormatter={(label: string) => { const [, m] = label.split("-"); return MONTH_NAMES[parseInt(m) - 1] || label }} />
                    {usedCats.map((cat: string, i: number) => (
                      <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} name={CAT_LABEL[cat] || cat} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── ÉVÈNEMENTS IMPOSABLES CRYPTO-CRYPTO ────────────── */}
      {swapsData && (
        <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
                Évènements imposables FHF — swaps crypto-crypto
                <span style={{ marginLeft: 10, fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", verticalAlign: "middle" }}>YTD {new Date().getFullYear()}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)", marginTop: 4 }}>
                Cas 2 doc 04 / art. 38-2 CGI — chaque échange crypto-crypto = événement imposable au bilan
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={async () => {
                const ytdFrom = `${new Date().getFullYear()}-01-01`
                const ytdTo = new Date().toISOString().slice(0, 10)
                try {
                  const r = await authFetch(`/api/compta/crypto-swaps/export.csv?from=${ytdFrom}&to=${ytdTo}`)
                  if (!r.ok) { toast({ title: "Erreur export" }); return }
                  const blob = await r.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url; a.download = `evenements_imposables_fhf_${ytdFrom}_${ytdTo}.csv`; a.click()
                  URL.revokeObjectURL(url)
                } catch (e: any) { toast({ title: "Erreur", description: e.message }) }
              }} style={{ padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", background: "var(--at-bg)", border: "1px solid var(--rule)", color: "var(--ink2)", borderRadius: 3, cursor: "pointer" }}>
                Exporter CSV
              </button>
              <button onClick={handleBackfill} disabled={swapsLoading}
                style={{ padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", background: "var(--at-bg)", border: "1px solid var(--rule)", color: "var(--ink2)", borderRadius: 3, cursor: "pointer", opacity: swapsLoading ? 0.5 : 1 }}>
                {swapsLoading ? "Backfill..." : "Backfill historique"}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderRight: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>Total EUR YTD</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{fmtEur(swapsData.total_eur)}</div>
            </div>
            <div style={{ padding: "12px 16px", borderRight: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>Lignes</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{swapsData.rows.length}</div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>À vérifier</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: swapsData.needs_review_count > 0 ? "var(--at-neg)" : "var(--ink)", marginTop: 4 }}>{swapsData.needs_review_count}</div>
            </div>
          </div>

          {swapsData.rows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--ink)" }}>
                    {["Date", "Paire", "Side", "Qty", "Quote remise", "Valo EUR snap", "Valo EUR override", "Note", ""].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {swapsData.rows.map((r: any) => {
                    const local = swapOverrides[r.id] || { override: r.valuation_eur_override ?? "", note: r.override_note ?? "" }
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmtDate(r.trade_date)}</td>
                        <td style={{ padding: "6px 8px" }}>{r.pair}</td>
                        <td style={{ padding: "6px 8px", color: r.side === "BUY" ? "var(--at-pos)" : "var(--at-neg)" }}>{r.side}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{Number(r.quantity).toFixed(6)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.cost_quote != null ? `${Number(r.cost_quote).toFixed(4)} ${r.ticker_quote}` : "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--ink2)" }}>{r.valuation_eur_snapshot != null ? fmtEur(r.valuation_eur_snapshot) : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="number" step="0.01" placeholder="—"
                            value={local.override}
                            onChange={e => setSwapOverrides(prev => ({ ...prev, [r.id]: { ...prev[r.id], override: e.target.value } }))}
                            onBlur={() => {
                              const val = local.override === "" ? null : Number(local.override)
                              patchSwap(r.id, { valuation_eur_override: val, override_note: local.note || null })
                            }}
                            style={{ ...inputStyle, width: 100, textAlign: "right", padding: "3px 6px" }}
                          />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="text" placeholder="—"
                            value={local.note}
                            onChange={e => setSwapOverrides(prev => ({ ...prev, [r.id]: { ...prev[r.id], note: e.target.value } }))}
                            onBlur={() => {
                              const val = local.override === "" ? null : Number(local.override)
                              patchSwap(r.id, { valuation_eur_override: val, override_note: local.note || null })
                            }}
                            style={{ ...inputStyle, width: 120, padding: "3px 6px" }}
                          />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          {r.needs_review && <span style={{ color: "var(--at-neg)", fontSize: 14 }} title="Valorisation manquante — override requis">⚠</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--ink)" }}>
                    <td colSpan={5} style={{ padding: "8px 8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, fontSize: 10 }}>Total</td>
                    <td colSpan={4} style={{ padding: "8px 8px", fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, textAlign: "right" }}>{fmtEur(swapsData.total_eur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── INVOICE MODAL ─────────────────────────────────────── */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,24,20,0.5)" }} onClick={() => setModalOpen(false)}>
          <div style={{ background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 6, width: 600, maxHeight: "90vh", overflowY: "auto", padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "2px solid var(--ink)", paddingBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink2)" }}>
                  {editingId ? "Modifier facture" : "Nouvelle facture"}
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", padding: 4 }}><X size={16} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Fournisseur</label>
                  <input value={modalData.party_name || ""} onChange={e => updateModalField("party_name", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>N° facture</label>
                  <input value={modalData.invoice_number || ""} onChange={e => updateModalField("invoice_number", e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Date facture</label>
                  <input type="date" value={modalData.invoice_date || ""} onChange={e => updateModalField("invoice_date", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Date paiement</label>
                  <input type="date" value={modalData.payment_date || ""} onChange={e => updateModalField("payment_date", e.target.value)} style={inputStyle} />
                </div>
              </div>

              {modalData._fxInfo && (
                <div style={{ padding: 8, borderRadius: 4, background: "color-mix(in srgb, var(--at-accent) 8%, transparent)", border: "1px solid var(--rule)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--at-accent)" }}>
                  Taux BCE du {fmtDate(modalData._fxInfo.fx_date)} : 1 {modalData._fxInfo.original_currency} = {modalData._fxInfo.fx_rate.toFixed(4)} EUR
                  <span style={{ color: "var(--ink3)", marginLeft: 8 }}>(original : {modalData._fxInfo.original_ht.toFixed(2)} {modalData._fxInfo.original_currency} HT)</span>
                </div>
              )}

              {IS_NON_CHARGE(modalData.category) ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Montant (EUR)</label>
                    <input type="number" step="0.01" value={modalData.amount_ht || 0} onChange={e => updateModalField("amount_ht", parseFloat(e.target.value) || 0)} style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)" }}>Pas de TVA ({CAT_LABEL[modalData.category] || "hors exploitation"})</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Montant HT (EUR)</label>
                    <input type="number" step="0.01" value={modalData.amount_ht || 0} onChange={e => updateModalField("amount_ht", parseFloat(e.target.value) || 0)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Taux TVA</label>
                    <select value={modalData.vat_rate} onChange={e => updateModalField("vat_rate", parseFloat(e.target.value))} style={inputStyle}>
                      {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Montant TTC</label>
                    <input type="number" step="0.01" value={modalData.amount_ttc || 0} onChange={e => updateModalField("amount_ttc", parseFloat(e.target.value) || 0)} style={inputStyle} />
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Direction</label>
                  {IS_NON_CHARGE(modalData.category) ? (
                    <div style={{ ...inputStyle, color: "var(--ink3)" }}>Hors exploitation ({CAT_LABEL[modalData.category] || modalData.category})</div>
                  ) : (
                    <select value={modalData.direction} onChange={e => updateModalField("direction", e.target.value)} style={inputStyle}>
                      <option value="expense">Charge</option>
                      <option value="revenue">Produit</option>
                    </select>
                  )}
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Catégorie PCG</label>
                  <select value={modalData.category || "471000"} onChange={e => updateModalField("category", e.target.value)} style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Pays fournisseur</label>
                  <input value={modalData.party_country || "FR"} onChange={e => updateModalField("party_country", e.target.value.toUpperCase())} style={inputStyle} maxLength={2} />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>N° TVA intracom</label>
                  <input value={modalData.party_vat_number || ""} onChange={e => updateModalField("party_vat_number", e.target.value)} style={inputStyle} />
                </div>
              </div>

              {!IS_NON_CHARGE(modalData.category) && (
                <div style={{ display: "flex", gap: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)", cursor: "pointer" }}>
                    <input type="checkbox" checked={modalData.vat_reverse_charge || false} onChange={e => updateModalField("vat_reverse_charge", e.target.checked)} style={{ accentColor: "var(--at-accent)" }} />
                    Autoliquidation
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)", cursor: "pointer" }}>
                    <input type="checkbox" checked={modalData.vat_deductible ?? true} onChange={e => updateModalField("vat_deductible", e.target.checked)} style={{ accentColor: "var(--at-accent)" }} />
                    TVA déductible
                  </label>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Description</label>
                <input value={modalData.description || ""} onChange={e => updateModalField("description", e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 }}>Notes</label>
                <textarea value={modalData.notes || ""} onChange={e => updateModalField("notes", e.target.value)} rows={2}
                  style={{ ...inputStyle, resize: "none" }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, borderTop: "1px dotted var(--rule)", paddingTop: 14 }}>
              <button onClick={() => setModalOpen(false)}
                style={{ padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", background: "var(--at-surface)", border: "1px solid var(--rule)", color: "var(--ink2)", borderRadius: 3, cursor: "pointer" }}>
                Annuler
              </button>
              <button onClick={handleSaveInvoice}
                style={{ padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", background: "var(--at-accent)", border: "1px solid var(--at-accent)", color: "var(--at-bg)", borderRadius: 3, cursor: "pointer" }}>
                {editingId ? "Enregistrer" : "Valider"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(",")[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
