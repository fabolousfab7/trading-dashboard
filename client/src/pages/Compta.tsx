import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { Receipt, Upload, FileText, RefreshCw, X, Check, AlertTriangle, Eye, Pencil, Trash2, Link2Off, Ban, UserMinus, Briefcase, Bitcoin } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import InfoTip from "@/components/InfoTip"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"

const COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55", "#9a988f", "#4a4540", "#d4a057", "#6b8f71", "#8b6b4a"]

const CATEGORIES = [
  { code: "618100", label: "Logiciels & data" },
  { code: "617000", label: "FTMO" },
  { code: "626100", label: "Télécom" },
  { code: "627000", label: "Frais bancaires" },
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

  // Build reconciliation rows
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

  const tooltipStyle = { background: "#fbf8f1", border: "1px solid #d9d3c4", borderRadius: 8, fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "#1a1814" }

  // Unreconciled invoices for manual matching dropdown
  const unreconciledInvoices = invoices.filter(i => !i.bank_transaction_id)

  // VAT for selected month
  const vatMonth = selectedMonth || `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}`
  const vatData = vatSummary?.months?.find((m: any) => m.month === vatMonth)

  if (loading) return <div className="p-8 text-[--ink2] font-mono text-sm">Chargement...</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[--rule] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[--at-accent] text-xs font-mono uppercase tracking-widest">
            <Receipt size={14} /> Comptabilité
          </div>
          <h1 className="text-3xl font-mono font-bold tracking-wider mt-1">
            <span className="text-[--at-accent]">Comptabilité </span>
            <span className="text-[--at-accent]">FHF</span>
          </h1>
          <p className="text-[10px] text-[--ink3] font-mono uppercase tracking-wider mt-1">
            Rapprochement bancaire · TVA · Pilotage
          </p>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="bg-[--at-surface] border border-[--rule] text-[--ink] rounded px-3 py-1.5 font-mono text-xs"
        >
          <option value="">Tous les mois</option>
          {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {error && (
        <div className="border border-[--at-neg]/30 bg-[--at-neg]/10 text-[--at-neg] p-3 rounded font-mono text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-[--at-neg] hover:text-red-300">✕</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border border-[--rule] bg-[--at-surface] rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2 flex items-center">CHARGES HT YTD<InfoTip text="Total des factures dépenses HT de l'année en cours. Exclut les mouvements bilan (CCA 455000, IBKR 512100, Kraken 512200, Capital 101000)." /></div>
          <div className="text-2xl font-mono font-bold text-[--at-accent]">{fmtEur(stats?.charges_ht_ytd || 0)}</div>
        </div>
        <div className="border border-[--rule] bg-[--at-surface] rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2 flex items-center">TVA DÉDUCTIBLE YTD<InfoTip text="TVA payée sur les achats pro (logiciels, abonnements, matériel). Récupérable via la déclaration CA3 mensuelle. Source : factures avec vat_deductible = true." /></div>
          <div className="text-2xl font-mono font-bold text-[--at-accent]">
            {fmtEur((vatSummary?.months || []).reduce((s: number, m: any) => s + m.tva_deductible_fr + m.tva_autoliquidee_intracom, 0))}
          </div>
        </div>
        <div className="border border-[--rule] bg-[--at-surface] rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2">FACTURES</div>
          <div className="text-2xl font-mono font-bold text-[--ink]">
            {stats?.reconciled_count || 0} <span className="text-[--ink3]">/ {stats?.invoices_count || 0}</span>
          </div>
          <div className="text-[10px] font-mono text-[--ink3] mt-1">rapprochées</div>
        </div>
        <div className="border border-[--rule] bg-[--at-surface] rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2 flex items-center">COMPTE COURANT ASSOCIE<InfoTip text="Compte Courant Associé 455000. Positif = FHF doit à Fabien. Calculé depuis les factures catégorie 455000." /></div>
          <div className={`text-2xl font-mono font-bold ${(stats?.cca_balance || 0) >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
            {fmtEur(Math.abs(stats?.cca_balance || 0))}
          </div>
          <div className="text-[10px] font-mono text-[--ink3] mt-1">
            {(stats?.cca_balance || 0) >= 0 ? "FHF te doit" : "Tu dois a FHF"}
          </div>
        </div>
      </div>

      {/* Upload zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Invoice upload */}
        <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-3 flex items-center gap-2">
            <FileText size={14} /> Upload facture
          </h2>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleInvoiceDrop}
            className="border-2 border-dashed border-[--rule] rounded-lg p-8 text-center cursor-pointer hover:border-[--at-accent]/40 transition"
          >
            {ocrLoading ? (
              <div className="flex items-center justify-center gap-2 text-[--at-accent] font-mono text-sm">
                <RefreshCw size={16} className="animate-spin" /> Analyse OCR en cours...
              </div>
            ) : (
              <>
                <Upload size={24} className="mx-auto text-[--ink3] mb-2" />
                <p className="text-[--ink3] font-mono text-xs">Glissez une facture (image/PDF)</p>
                <label className="mt-3 inline-block px-4 py-1.5 bg-[--at-accent]/10 border border-[--rule] text-[--at-accent] rounded font-mono text-xs uppercase cursor-pointer hover:bg-[--at-accent]/10 transition">
                  Sélectionner un fichier
                  <input type="file" accept="image/*,application/pdf" onChange={handleInvoiceDrop} className="hidden" />
                </label>
              </>
            )}
          </div>
          <button
            onClick={() => { setEditingId(null); setModalData({ direction: "expense", party_name: "", invoice_number: "", invoice_date: new Date().toISOString().slice(0, 10), amount_ht: 0, amount_vat: 0, amount_ttc: 0, vat_rate: 20, party_vat_number: "", party_country: "FR", vat_reverse_charge: false, vat_deductible: true, category: "618100", description: "", notes: "" }); setModalOpen(true) }}
            className="mt-3 w-full px-3 py-1.5 bg-[--at-accent]/10 border border-[--rule] text-[--at-accent] rounded font-mono text-xs uppercase hover:bg-[--at-accent]/20 transition"
          >
            + Saisie manuelle
          </button>
        </div>

        {/* Right: CSV upload */}
        <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-3 flex items-center gap-2">
            <Receipt size={14} /> Import relevé Qonto
          </h2>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleCsvDrop}
            className="border-2 border-dashed border-[--rule] rounded-lg p-8 text-center cursor-pointer hover:border-[--at-accent]/40 transition"
          >
            <Upload size={24} className="mx-auto text-[--ink3] mb-2" />
            <p className="text-[--ink3] font-mono text-xs">Glissez un export CSV Qonto</p>
            <label className="mt-3 inline-block px-4 py-1.5 bg-[--at-accent]/10 border border-[--rule] text-[--at-accent] rounded font-mono text-xs uppercase cursor-pointer hover:bg-[--at-accent]/20 transition">
              Sélectionner un CSV
              <input type="file" accept=".csv" onChange={handleCsvDrop} className="hidden" />
            </label>
          </div>
          {importResult && <div className="mt-3 text-[--at-pos] font-mono text-xs">{importResult}</div>}
          <button
            onClick={handleReconcile}
            className="mt-3 w-full px-3 py-1.5 bg-[--at-accent]/10 border border-[--rule] text-[--at-accent] rounded font-mono text-xs uppercase hover:bg-[--at-accent]/10 transition flex items-center justify-center gap-2"
          >
            <RefreshCw size={12} /> Lancer le rapprochement
          </button>
          {reconcileResult && <div className="mt-2 text-[--at-accent] font-mono text-xs">{reconcileResult}</div>}
        </div>
      </div>

      {/* Match suggestions */}
      {suggestions.length > 0 && (
        <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-3">
            Suggestions de rapprochement · {suggestions.length}
          </h2>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={`${s.invoice_id}-${s.bank_tx_id}`} className="flex items-center gap-3 border border-[--rule] rounded p-2.5 hover:bg-[--at-accent]/5 transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-[--at-accent]">Facture</span>
                    <span className="text-[--ink] truncate">{s.invoice_party}</span>
                    <span className="text-[--ink3]">({fmtEur(s.invoice_amount)}, {fmtDate(s.invoice_date)})</span>
                    <span className="text-[--ink3] mx-1">↔</span>
                    <span className="text-[--at-accent]">Banque</span>
                    <span className="text-[--ink] truncate">{s.bank_counterparty}</span>
                    <span className="text-[--ink3]">({fmtEur(s.bank_amount)}, {fmtDate(s.bank_date)})</span>
                  </div>
                  {s.confidence === "approx" && (
                    <div className="text-[10px] font-mono text-amber-400 mt-0.5">
                      écart {fmtEur(s.amount_diff)} (valeur facture conservée)
                    </div>
                  )}
                  {s.confidence === "exact" && (
                    <div className="text-[10px] font-mono text-[--at-pos] mt-0.5">montant exact</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={async () => { await handleManualMatch(s.invoice_id, s.bank_tx_id); setSuggestions(prev => prev.filter(x => x.invoice_id !== s.invoice_id && x.bank_tx_id !== s.bank_tx_id)); toast({ title: "Rapproché", description: `${s.invoice_party} ↔ ${s.bank_counterparty}` }) }}
                    className="px-2.5 py-1 bg-green-500/10 border border-[--at-pos]/30 text-[--at-pos] rounded font-mono text-[10px] uppercase hover:bg-green-500/20 transition"
                  >
                    Valider
                  </button>
                  <button
                    onClick={() => setSuggestions(prev => prev.filter(x => x.invoice_id !== s.invoice_id || x.bank_tx_id !== s.bank_tx_id))}
                    className="px-2.5 py-1 border border-[--rule] text-[--ink3] rounded font-mono text-[10px] uppercase hover:bg-[--at-accent]/5 transition"
                  >
                    Ignorer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reconciliation table */}
      <div className="border border-[--rule] rounded bg-[--at-surface]">
        <div className="border-b border-[--rule] p-3 flex items-center gap-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent]">Rapprochement</h2>
          <div className="flex gap-1 ml-auto">
            {([["all", "Tout", rows.length], ["unmatched", `À traiter`, unmatchedCount], ["matched", "Rapprochés", matchedCount]] as const).map(([t, label, count]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded font-mono text-xs transition ${tab === t ? "bg-[--at-accent]/10 text-[--at-accent] border border-[--rule]" : "text-[--ink3] hover:text-[--ink]"}`}>
                {label} ({count})
              </button>
            ))}
          </div>
        </div>
        {filteredRows.length === 0 ? (
          <div className="p-6 text-center text-[--ink3] text-xs font-mono">Aucune donnée</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-[--at-surface] text-[--ink3] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Contrepartie</th>
                  <th className="text-right p-3">Montant TTC</th>
                  <th className="text-center p-3">Type</th>
                  <th className="text-center p-3">Statut</th>
                  <th className="text-left p-3">Facture liée</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id} className="border-t border-[--rule] hover:bg-[--at-accent]/5 transition">
                    <td className="p-3 text-[--ink]">{fmtDate(row.date)}</td>
                    <td className="p-3 text-[--ink] truncate max-w-[200px]">{row.counterparty}</td>
                    <td className={`p-3 text-right ${row.type === "bank" && row.original.side === "credit" ? "text-[--at-pos]" : "text-[--ink]"}`}>
                      {row.type === "bank" && row.original.side === "credit" ? "+" : "-"}{fmtEur(row.amount)}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.type === "bank" ? "bg-[--at-accent]/10 text-[--at-accent]" : "bg-[--at-accent]/20 text-[--at-accent]"}`}>
                        {row.type === "bank" ? "Banque" : "Facture"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {row.status === "matched" && row.linkedInvoice?.category === "455000" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">CCA</span>
                      )}
                      {row.status === "matched" && row.linkedInvoice?.category === "512100" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[--at-accent]/10 text-[--at-accent] border border-[--rule]">IBKR</span>
                      )}
                      {row.status === "matched" && row.linkedInvoice?.category === "512200" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">KRK</span>
                      )}
                      {row.status === "matched" && !NON_CHARGE_CATS.includes(row.linkedInvoice?.category) && <span className="text-[--at-pos]">✅</span>}
                      {row.status === "settled_cca" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">CCA</span>
                      )}
                      {row.status === "unmatched" && <span className="text-amber-400">⚠️</span>}
                      {row.status === "pending_payment" && <span className="text-[--ink2]">📄</span>}
                      {row.status === "ignored" && <span className="text-[--ink3]">🔕</span>}
                    </td>
                    <td className="p-3 text-[--ink3] text-[10px] truncate max-w-[150px]">
                      {row.linkedInvoice && <span>{row.linkedInvoice.party_name} — {row.linkedInvoice.invoice_number || "N/A"}</span>}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {/* Bank tx: unmatched → match or ignore */}
                        {row.type === "bank" && row.status === "unmatched" && (
                          <>
                            {matchingTxId === row.original.id ? (
                              <select
                                className="bg-[--at-bg] border border-[--rule] text-[--ink] rounded px-1 py-0.5 text-[10px] font-mono max-w-[120px]"
                                onChange={e => { if (e.target.value) handleManualMatch(e.target.value, row.original.id) }}
                                defaultValue=""
                              >
                                <option value="">Choisir facture...</option>
                                {unreconciledInvoices.map(inv => (
                                  <option key={inv.id} value={inv.id}>{inv.party_name} — {fmtEur(Number(inv.amount_ttc))}</option>
                                ))}
                              </select>
                            ) : (
                              <button onClick={() => setMatchingTxId(row.original.id)} className="text-[--at-accent] hover:text-[--at-accent] p-1" title="Matcher">
                                <Check size={12} />
                              </button>
                            )}
                            <button onClick={() => handleQuickCategory(row.original, "455000", "Dépense personnelle — avance CCA", "Apport personnel — CCA")} className="text-amber-500 hover:text-amber-400 p-1" title="Opération perso — compte courant associé (455000)">
                              <UserMinus size={12} />
                            </button>
                            <button onClick={() => handleQuickCategory(row.original, "512100", "Virement vers Interactive Brokers", "Rapatriement depuis Interactive Brokers")} className="text-cyan-500 hover:text-[--at-accent] p-1" title="Virement IBKR (512100)">
                              <Briefcase size={12} />
                            </button>
                            <button onClick={() => handleQuickCategory(row.original, "512200", "Virement vers Kraken Pro Futures", "Rapatriement depuis Kraken Pro Futures")} className="text-purple-500 hover:text-purple-400 p-1" title="Virement Kraken (512200)">
                              <Bitcoin size={12} />
                            </button>
                            <button onClick={() => handleIgnore(row.original.id)} className="text-[--ink3] hover:text-[--ink] p-1" title="Ignorer">
                              <Ban size={12} />
                            </button>
                          </>
                        )}
                        {/* Bank tx: matched → unmatch */}
                        {row.type === "bank" && row.status === "matched" && row.linkedInvoice && (
                          <button onClick={() => handleUnmatch(row.linkedInvoice.id)} className="text-[--ink3] hover:text-[--at-neg] p-1" title="Défaire">
                            <Link2Off size={12} />
                          </button>
                        )}
                        {/* Bank tx: ignored → unignore */}
                        {row.type === "bank" && row.status === "ignored" && (
                          <button onClick={() => handleUnignore(row.original.id)} className="text-[--ink3] hover:text-[--at-accent] p-1" title="Restaurer">
                            <RefreshCw size={12} />
                          </button>
                        )}
                        {/* Invoice actions */}
                        {row.type === "invoice" && (
                          <>
                            {row.original.attachment_url && (
                              <button onClick={() => window.open(row.original.attachment_url, "_blank")} className="text-[--ink3] hover:text-[--at-accent] p-1" title="Voir">
                                <Eye size={12} />
                              </button>
                            )}
                            <button onClick={() => openEditModal(row.original)} className="text-[--ink3] hover:text-[--at-accent] p-1" title="Modifier">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => handleDeleteInvoice(row.original.id)} className="text-[--ink3] hover:text-[--at-neg] p-1" title="Supprimer">
                              <Trash2 size={12} />
                            </button>
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

      {/* VAT block */}
      <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-3">
          TVA — {monthOptions.find(m => m.value === vatMonth)?.label || vatMonth}
        </h2>
        {vatData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] font-mono text-[--ink3] uppercase">TVA déductible (FR)</div>
              <div className="text-lg font-mono font-bold text-[--at-accent]">{fmtEur(vatData.tva_deductible_fr)}</div>
              <div className="text-[10px] font-mono text-[--ink3]">Base HT : {fmtEur(vatData.base_ht_achats_fr)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-[--ink3] uppercase">TVA autoliquidée (intracom)</div>
              <div className="text-lg font-mono font-bold text-[--at-accent]">{fmtEur(vatData.tva_autoliquidee_intracom)}</div>
              <div className="text-[10px] font-mono text-[--ink3]">Base HT : {fmtEur(vatData.base_ht_achats_intracom)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-[--ink3] uppercase">TVA collectée (ventes)</div>
              <div className="text-lg font-mono font-bold text-[--ink]">{fmtEur(vatData.tva_collectee)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-[--ink3] uppercase">TVA nette</div>
              <div className={`text-lg font-mono font-bold ${vatData.tva_nette >= 0 ? "text-[--at-neg]" : "text-[--at-pos]"}`}>
                {vatData.tva_nette >= 0 ? "" : "Crédit "}{fmtEur(Math.abs(vatData.tva_nette))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[--ink3] font-mono text-xs">Aucune donnée TVA pour ce mois</div>
        )}
        <p className="text-[10px] font-mono text-[--ink3] mt-3">Ces montants sont indicatifs. Valide avec ta CA3 sur impots.gouv.</p>
      </div>

      {/* Charts */}
      {stats && (stats.charges_by_category?.length > 0 || stats.monthly_by_category?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pie: charges by category */}
          {stats.charges_by_category?.length > 0 && (
            <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-2">Charges par catégorie (YTD)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stats.charges_by_category} dataKey="total_ht" nameKey="category" cx="50%" cy="50%"
                    outerRadius={70} innerRadius={30} strokeWidth={1} stroke="#09090b">
                    {stats.charges_by_category.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#a1a1aa" }}
                    formatter={(value: number, name: string) => [fmtEur(value), CAT_LABEL[name] || name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {stats.charges_by_category.map((d: any, i: number) => (
                  <div key={d.category} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[--ink2]">{CAT_LABEL[d.category] || d.category}</span>
                    <span className="text-[--ink] ml-auto">{fmtEur(d.total_ht)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bar: monthly charges */}
          {stats.monthly_by_category?.length > 0 && (() => {
            const usedCats: string[] = Array.from(new Set(stats.monthly_by_category.flatMap((m: any) => Object.keys(m).filter((k: string) => k !== "month"))))
            return (
              <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
                <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-2">Charges mensuelles (YTD)</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.monthly_by_category}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} axisLine={false} tickLine={false}
                      tickFormatter={(v: string) => { const [, m] = v.split("-"); return MONTH_NAMES[parseInt(m) - 1]?.slice(0, 3) || v }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} axisLine={false} tickLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#a1a1aa" }}
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

      {/* Invoice modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[--at-bg]/70" onClick={() => setModalOpen(false)}>
          <div className="bg-[--at-surface] border border-[--rule] rounded-lg w-[600px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-mono font-bold text-[--at-accent] uppercase tracking-widest">
                {editingId ? "Modifier facture" : "Nouvelle facture"}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-[--ink3] hover:text-[--ink]"><X size={16} /></button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[--ink3] uppercase">Fournisseur</label>
                  <input value={modalData.party_name || ""} onChange={e => updateModalField("party_name", e.target.value)}
                    className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[--ink3] uppercase">N° facture</label>
                  <input value={modalData.invoice_number || ""} onChange={e => updateModalField("invoice_number", e.target.value)}
                    className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[--ink3] uppercase">Date facture</label>
                  <input type="date" value={modalData.invoice_date || ""} onChange={e => updateModalField("invoice_date", e.target.value)}
                    className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[--ink3] uppercase">Date paiement</label>
                  <input type="date" value={modalData.payment_date || ""} onChange={e => updateModalField("payment_date", e.target.value)}
                    className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
                </div>
              </div>

              {modalData._fxInfo && (
                <div className="bg-[--at-accent]/10 border border-[--rule] rounded p-2 text-xs font-mono text-fuchsia-300">
                  Taux BCE du {fmtDate(modalData._fxInfo.fx_date)} : 1 {modalData._fxInfo.original_currency} = {modalData._fxInfo.fx_rate.toFixed(4)} EUR
                  <span className="text-[--ink3] ml-2">
                    (original : {modalData._fxInfo.original_ht.toFixed(2)} {modalData._fxInfo.original_currency} HT)
                  </span>
                </div>
              )}

              {IS_NON_CHARGE(modalData.category) ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-[--ink3] uppercase">Montant (EUR)</label>
                    <input type="number" step="0.01" value={modalData.amount_ht || 0} onChange={e => updateModalField("amount_ht", parseFloat(e.target.value) || 0)}
                      className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
                  </div>
                  <div className="flex items-end">
                    <div className="text-[10px] font-mono text-[--ink3] pb-2">Pas de TVA ({CAT_LABEL[modalData.category] || "hors exploitation"})</div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-[--ink3] uppercase">Montant HT (EUR)</label>
                    <input type="number" step="0.01" value={modalData.amount_ht || 0} onChange={e => updateModalField("amount_ht", parseFloat(e.target.value) || 0)}
                      className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-[--ink3] uppercase">Taux TVA</label>
                    <select value={modalData.vat_rate} onChange={e => updateModalField("vat_rate", parseFloat(e.target.value))}
                      className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs">
                      {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-[--ink3] uppercase">Montant TTC</label>
                    <input type="number" step="0.01" value={modalData.amount_ttc || 0} onChange={e => updateModalField("amount_ttc", parseFloat(e.target.value) || 0)}
                      className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[--ink3] uppercase">Direction</label>
                  {IS_NON_CHARGE(modalData.category) ? (
                    <div className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink3] font-mono text-xs">Hors exploitation ({CAT_LABEL[modalData.category] || modalData.category})</div>
                  ) : (
                    <select value={modalData.direction} onChange={e => updateModalField("direction", e.target.value)}
                      className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs">
                      <option value="expense">Charge</option>
                      <option value="revenue">Produit</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[--ink3] uppercase">Catégorie PCG</label>
                  <select value={modalData.category || "471000"} onChange={e => updateModalField("category", e.target.value)}
                    className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs">
                    {CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[--ink3] uppercase">Pays fournisseur</label>
                  <input value={modalData.party_country || "FR"} onChange={e => updateModalField("party_country", e.target.value.toUpperCase())}
                    className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" maxLength={2} />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[--ink3] uppercase">N° TVA intracom</label>
                  <input value={modalData.party_vat_number || ""} onChange={e => updateModalField("party_vat_number", e.target.value)}
                    className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
                </div>
              </div>

              {!IS_NON_CHARGE(modalData.category) && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-mono text-[--ink2] cursor-pointer">
                    <input type="checkbox" checked={modalData.vat_reverse_charge || false} onChange={e => updateModalField("vat_reverse_charge", e.target.checked)}
                      className="rounded border-[--rule]" />
                    Autoliquidation
                  </label>
                  <label className="flex items-center gap-2 text-xs font-mono text-[--ink2] cursor-pointer">
                    <input type="checkbox" checked={modalData.vat_deductible ?? true} onChange={e => updateModalField("vat_deductible", e.target.checked)}
                      className="rounded border-[--rule]" />
                    TVA déductible
                  </label>
                </div>
              )}

              <div>
                <label className="text-[10px] font-mono text-[--ink3] uppercase">Description</label>
                <input value={modalData.description || ""} onChange={e => updateModalField("description", e.target.value)}
                  className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs" />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[--ink3] uppercase">Notes</label>
                <textarea value={modalData.notes || ""} onChange={e => updateModalField("notes", e.target.value)} rows={2}
                  className="w-full bg-[--at-bg] border border-[--rule] rounded px-2 py-1.5 text-[--ink] font-mono text-xs resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-1.5 border border-[--rule] text-[--ink2] rounded font-mono text-xs hover:bg-[--at-accent]/5 transition">
                Annuler
              </button>
              <button onClick={handleSaveInvoice}
                className="px-4 py-1.5 bg-[--at-accent]/10 border border-[--rule] text-[--at-accent] rounded font-mono text-xs hover:bg-[--at-accent]/20 transition">
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
