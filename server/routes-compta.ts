import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

const fxCache: Record<string, { rate: number; ts: number }> = {}

async function fetchFxRate(from: string, to: string, date: string): Promise<number | null> {
  const cacheKey = `${from}_${to}_${date}`
  if (fxCache[cacheKey] && Date.now() - fxCache[cacheKey].ts < 86400000) {
    return fxCache[cacheKey].rate
  }
  try {
    const fromLower = from.toLowerCase()
    const toLower = to.toLowerCase()
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${fromLower}.json`)
    if (!res.ok) {
      const res2 = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${fromLower}.json`)
      if (!res2.ok) return null
      const data2 = await res2.json()
      const rate = data2[fromLower]?.[toLower]
      if (!rate) return null
      fxCache[cacheKey] = { rate, ts: Date.now() }
      return rate
    }
    const data = await res.json()
    const rate = data[fromLower]?.[toLower]
    if (!rate) return null
    fxCache[cacheKey] = { rate, ts: Date.now() }
    return rate
  } catch {
    return null
  }
}

function userScopedClient(userToken: string): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${userToken}` } } }
  )
}

async function requireAuth(supabase: SupabaseClient, req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" })
  }
  const token = authHeader.replace("Bearer ", "")
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid token" })
  }
  ;(req as any).userId = data.user.id
  ;(req as any).userToken = token
  next()
}

function parseFrenchNumber(val: string): number {
  if (!val || val.trim() === "" || val === '""') return 0
  return parseFloat(val.replace(/"/g, "").replace(",", ".").replace(/\s/g, "")) || 0
}

function parseFrenchDate(val: string): string | null {
  if (!val || val.trim() === "") return null
  const match = val.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === sep && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseQontoCsv(csvText: string): any[] {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0], ";").map(h => h.trim().replace(/^"|"$/g, ""))
  const col = (name: string) => headers.findIndex(h => h === name)

  const iStatut = col("Statut")
  const iDateValeur = col("Date de la valeur (UTC)")
  const iDateOp = col("Date de l'opération (UTC)")
  const iMontantTTC = col("Montant total (TTC)")
  const iDebit = col("Débit")
  const iCredit = col("Crédit")
  const iDevise = col("Devise")
  const iContrepartie = col("Nom de la contrepartie")
  const iMethode = col("Méthode de paiement")
  const iReference = col("Identifiant de transaction")
  const iNote = col("Note")
  const iCategorie = col("Catégorie de trésorerie")
  const iTVA = col("Montant total de la TVA")
  const iJustificatif = col("Justificatif")
  const iMontantHT = col("Montant total (HT)")

  if (iStatut === -1 || iContrepartie === -1 || iMontantTTC === -1) {
    return []
  }

  const rows: any[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const f = parseCsvLine(line, ";").map(v => v.replace(/^"|"$/g, ""))
    if (f.length < 5) continue

    const statut = f[iStatut]?.trim()
    if (statut !== "Exécuté") continue

    const creditVal = iCredit !== -1 ? f[iCredit]?.trim() : ""
    const side: "debit" | "credit" = (creditVal && creditVal !== "" && creditVal !== '""') ? "credit" : "debit"

    const amount = parseFrenchNumber(f[iMontantTTC] || "0")
    if (amount === 0) continue

    const settlementDate = parseFrenchDate(f[iDateValeur] || "")
    if (!settlementDate) continue

    const counterparty = f[iContrepartie]?.trim()
    if (!counterparty) continue

    rows.push({
      settlement_date: settlementDate,
      operation_date: iDateOp !== -1 ? parseFrenchDate(f[iDateOp] || "") : null,
      counterparty_name: counterparty,
      amount: Math.abs(amount),
      currency: iDevise !== -1 ? (f[iDevise]?.trim() || "EUR") : "EUR",
      side,
      payment_method: iMethode !== -1 ? (f[iMethode]?.trim() || null) : null,
      reference: iReference !== -1 ? (f[iReference]?.replace(/"/g, "").trim() || null) : null,
      label: iNote !== -1 ? (f[iNote]?.replace(/"/g, "").trim() || null) : null,
      category: iCategorie !== -1 ? (f[iCategorie]?.trim() || null) : null,
      vat_amount: iTVA !== -1 ? parseFrenchNumber(f[iTVA] || "0") : null,
      attachment_name: iJustificatif !== -1 ? (f[iJustificatif]?.replace(/"/g, "").trim() || null) : null,
      raw_data: {
        montant_ht: iMontantHT !== -1 ? parseFrenchNumber(f[iMontantHT] || "0") : null,
        original_amount: amount,
      },
    })
  }
  return rows
}

const invoiceSchema = z.object({
  direction: z.enum(["expense", "revenue"]),
  party_name: z.string().min(1),
  party_siret: z.string().optional().nullable(),
  party_vat_number: z.string().optional().nullable(),
  party_country: z.string().default("FR"),
  invoice_number: z.string().optional().nullable(),
  invoice_date: z.string(),
  payment_date: z.string().optional().nullable(),
  amount_ht: z.number(),
  amount_vat: z.number().default(0),
  amount_ttc: z.number(),
  vat_rate: z.number().default(20),
  vat_deductible: z.boolean().default(true),
  vat_reverse_charge: z.boolean().default(false),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  attachment_url: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().default("validated"),
})

const ocrSchema = z.object({
  image: z.string(),
  mimeType: z.string(),
})

const bankImportSchema = z.object({
  csv: z.string(),
})

const manualMatchSchema = z.object({
  invoiceId: z.string().uuid(),
  bankTransactionId: z.string().uuid(),
})

export function registerComptaRoutes(app: Express, supabase: SupabaseClient) {
  const auth = (req: Request, res: Response, next: NextFunction) => requireAuth(supabase, req, res, next)

  // FX rate (public within auth)
  app.get("/api/compta/fx-rate", auth, async (req: Request, res: Response) => {
    const { from, to, date } = req.query as Record<string, string>
    if (!from || !to || !date) return res.status(400).json({ error: "Missing from, to, or date" })
    const rate = await fetchFxRate(from, to, date)
    if (rate === null) return res.status(404).json({ error: `No rate found for ${from}→${to} on ${date}` })
    res.json({ rate, date })
  })

  // 1. List invoices
  app.get("/api/compta/invoices", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    let query = userClient.from("fhf_invoices").select("*").order("invoice_date", { ascending: false })
    const { direction, category, month, status } = req.query as Record<string, string>
    if (direction) query = query.eq("direction", direction)
    if (category) query = query.eq("category", category)
    if (status) query = query.eq("status", status)
    if (month) query = query.gte("invoice_date", `${month}-01`).lte("invoice_date", `${month}-31`)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    res.json({ invoices: data })
  })

  // 2. Create invoice
  app.post("/api/compta/invoices", auth, async (req: Request, res: Response) => {
    const parsed = invoiceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const userClient = userScopedClient((req as any).userToken)
    const body = parsed.data
    if (body.invoice_number) {
      const { data: existing } = await userClient
        .from("fhf_invoices")
        .select("id")
        .eq("invoice_number", body.invoice_number)
        .eq("party_name", body.party_name)
        .maybeSingle()
      if (existing) {
        return res.status(409).json({ error: "Facture en doublon", detail: `Une facture ${body.invoice_number} de ${body.party_name} existe déjà.` })
      }
    }
    const { data, error } = await userClient
      .from("fhf_invoices")
      .insert({ ...body, user_id: (req as any).userId })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json(data)
  })

  // 3. Update invoice
  app.put("/api/compta/invoices/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { data, error } = await userClient
      .from("fhf_invoices")
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  })

  // 4. Delete invoice (also unmatches linked bank tx)
  app.delete("/api/compta/invoices/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { data: inv } = await userClient.from("fhf_invoices").select("bank_transaction_id").eq("id", req.params.id).single()
    if (inv?.bank_transaction_id) {
      await userClient.from("fhf_bank_transactions").update({ invoice_id: null, status: "unmatched" }).eq("id", inv.bank_transaction_id)
    }
    const { error } = await userClient.from("fhf_invoices").delete().eq("id", req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    res.status(204).send()
  })

  // 5. OCR via Claude Vision
  app.post("/api/compta/invoices/ocr", auth, async (req: Request, res: Response) => {
    const parsed = ocrSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const { image, mimeType } = parsed.data
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" })

    const contentBlock = mimeType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: mimeType, data: image } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: mimeType, data: image } }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: `Analyse cette facture et extrais les informations suivantes en JSON strict (pas de markdown, pas de backticks) :\n{\n  "party_name": "nom du fournisseur",\n  "invoice_number": "numéro de facture",\n  "invoice_date": "YYYY-MM-DD",\n  "amount_ht": 0.00,\n  "amount_vat": 0.00,\n  "amount_ttc": 0.00,\n  "vat_rate": 20,\n  "currency": "devise EXACTE indiquée sur la facture. Si tu vois un symbole $ ou la mention USD, mets USD. Si tu vois € ou EUR, mets EUR. Si tu vois £ ou GBP, mets GBP. Ne mets jamais EUR par défaut si une autre devise est clairement indiquée.",\n  "party_vat_number": "numéro TVA intracommunautaire si visible",\n  "party_country": "FR",\n  "description": "description courte des prestations"\n}\nSi un champ n'est pas visible, mets null.`,
              },
            ],
          }],
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        return res.status(500).json({ error: `Anthropic API error: ${response.status}`, detail: err })
      }

      const result = await response.json()
      const rawText = (result.content || [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("")
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return res.status(400).json({ error: "Could not extract JSON from OCR response", raw: rawText })
      }
      try {
        const parsed = JSON.parse(jsonMatch[0])
        console.log("[OCR] currency detected:", parsed.currency, "| full result:", JSON.stringify(parsed))
        res.json(parsed)
      } catch {
        res.json({ raw: rawText, error: "Could not parse OCR response as JSON" })
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  })

  // 6. Import Qonto CSV
  app.post("/api/compta/bank-import", auth, async (req: Request, res: Response) => {
    const parsed = bankImportSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

    const rows = parseQontoCsv(parsed.data.csv)
    if (rows.length === 0) return res.status(400).json({ error: "Aucune ligne valide dans le CSV (vérifiez le format Qonto)" })

    const userId = (req as any).userId
    const userClient = userScopedClient((req as any).userToken)
    const importBatch = `qonto_${Date.now()}`

    // Dedup: check existing references in DB
    const refs = rows.map(r => r.reference).filter(Boolean)
    let existingRefs = new Set<string>()
    if (refs.length > 0) {
      const { data: existing } = await userClient
        .from("fhf_bank_transactions")
        .select("reference")
        .in("reference", refs)
      existingRefs = new Set((existing || []).map((r: any) => r.reference))
    }

    const records = rows
      .filter(row => !row.reference || !existingRefs.has(row.reference))
      .map(row => ({
        user_id: userId,
        ...row,
        status: "unmatched",
        import_batch: importBatch,
      }))

    if (records.length === 0) return res.json({ imported: 0, importBatch, skipped: rows.length, message: "Toutes les transactions existent déjà" })

    const { error } = await userClient.from("fhf_bank_transactions").insert(records)
    if (error) return res.status(500).json({ error: error.message })

    const dates = records.map(r => r.settlement_date).filter(Boolean).sort()
    const skipped = rows.length - records.length
    res.json({ imported: records.length, skipped, importBatch, dateRange: { from: dates[0], to: dates[dates.length - 1] } })
  })

  // 7. List bank transactions
  app.get("/api/compta/bank-transactions", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    let query = userClient.from("fhf_bank_transactions").select("*").order("settlement_date", { ascending: false })
    const { month, status, side } = req.query as Record<string, string>
    if (status) query = query.eq("status", status)
    if (side) query = query.eq("side", side)
    if (month) query = query.gte("settlement_date", `${month}-01`).lte("settlement_date", `${month}-31`)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    res.json({ transactions: data })
  })

  // 8. Delete bank import batch
  app.delete("/api/compta/bank-transactions/batch/:importBatch", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { error } = await userClient.from("fhf_bank_transactions").delete().eq("import_batch", req.params.importBatch)
    if (error) return res.status(500).json({ error: error.message })
    res.status(204).send()
  })

  // 8b. Update bank transaction status (ignore/unignore)
  app.put("/api/compta/bank-transactions/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { data, error } = await userClient
      .from("fhf_bank_transactions")
      .update({ status: req.body.status, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  })

  // 9. Auto reconcile
  app.post("/api/compta/reconcile", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)

    const { data: invoices, error: invErr } = await userClient
      .from("fhf_invoices").select("*").is("bank_transaction_id", null)
    if (invErr) return res.status(500).json({ error: invErr.message })

    const { data: txs, error: txErr } = await userClient
      .from("fhf_bank_transactions").select("*").eq("status", "unmatched")
    if (txErr) return res.status(500).json({ error: txErr.message })

    let matched = 0, ambiguous = 0, unmatched = 0
    const usedTxIds = new Set<string>()

    for (const inv of (invoices || [])) {
      const invAmount = Math.abs(Number(inv.amount_ttc))
      const invDate = new Date(inv.invoice_date)
      const payDate = inv.payment_date ? new Date(inv.payment_date) : null

      const dateMin = new Date(invDate)
      dateMin.setDate(dateMin.getDate() - 3)
      const dateMax = payDate ? new Date(payDate) : new Date(invDate)
      dateMax.setDate(dateMax.getDate() + (payDate ? 3 : 30))

      const candidates = (txs || []).filter(tx => {
        if (usedTxIds.has(tx.id)) return false
        if (Math.abs(Math.abs(Number(tx.amount)) - invAmount) > 0.01) return false
        const txDate = new Date(tx.settlement_date)
        return txDate >= dateMin && txDate <= dateMax
      })

      if (candidates.length === 1) {
        const tx = candidates[0]
        await userClient.from("fhf_invoices").update({ bank_transaction_id: tx.id, reconciled_at: new Date().toISOString() }).eq("id", inv.id)
        await userClient.from("fhf_bank_transactions").update({ invoice_id: inv.id, status: "matched" }).eq("id", tx.id)
        usedTxIds.add(tx.id)
        matched++
      } else if (candidates.length > 1) {
        ambiguous++
      } else {
        unmatched++
      }
    }

    res.json({ matched, ambiguous, unmatched })
  })

  // 10. Manual match
  app.post("/api/compta/reconcile/manual", auth, async (req: Request, res: Response) => {
    const parsed = manualMatchSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const { invoiceId, bankTransactionId } = parsed.data
    const userClient = userScopedClient((req as any).userToken)

    const { error: e1 } = await userClient
      .from("fhf_invoices")
      .update({ bank_transaction_id: bankTransactionId, reconciled_at: new Date().toISOString() })
      .eq("id", invoiceId)
    if (e1) return res.status(500).json({ error: e1.message })

    const { error: e2 } = await userClient
      .from("fhf_bank_transactions")
      .update({ invoice_id: invoiceId, status: "matched" })
      .eq("id", bankTransactionId)
    if (e2) return res.status(500).json({ error: e2.message })

    res.json({ ok: true })
  })

  // 11. Unmatch
  app.post("/api/compta/reconcile/unmatch/:invoiceId", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const { data: inv } = await userClient
      .from("fhf_invoices").select("bank_transaction_id").eq("id", req.params.invoiceId).single()
    if (inv?.bank_transaction_id) {
      await userClient.from("fhf_bank_transactions").update({ invoice_id: null, status: "unmatched" }).eq("id", inv.bank_transaction_id)
    }
    await userClient.from("fhf_invoices").update({ bank_transaction_id: null, reconciled_at: null }).eq("id", req.params.invoiceId)
    res.json({ ok: true })
  })

  // 12. Stats
  app.get("/api/compta/stats", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const year = new Date().getFullYear()

    const { data: charges, error } = await userClient
      .from("fhf_invoices").select("*").eq("direction", "expense")
      .gte("invoice_date", `${year}-01-01`).lte("invoice_date", `${year}-12-31`)
    if (error) return res.status(500).json({ error: error.message })

    const { data: allInvoices } = await userClient.from("fhf_invoices").select("id, bank_transaction_id")

    const NON_CHARGE = ["455000", "512100", "512200"]
    const items = (charges || []).filter(i => !NON_CHARGE.includes(i.category))
    const all = allInvoices || []

    const charges_ht_ytd = items.reduce((s, i) => s + Number(i.amount_ht), 0)

    const catMap: Record<string, number> = {}
    for (const i of items) { catMap[i.category || "471000"] = (catMap[i.category || "471000"] || 0) + Number(i.amount_ht) }
    const charges_by_category = Object.entries(catMap).map(([category, total_ht]) => ({ category, total_ht }))

    const monthMap: Record<string, number> = {}
    for (const i of items) { const m = i.invoice_date.slice(0, 7); monthMap[m] = (monthMap[m] || 0) + Number(i.amount_ht) }
    const charges_by_month = Object.entries(monthMap).map(([month, total_ht]) => ({ month, total_ht })).sort((a, b) => a.month.localeCompare(b.month))

    const monthCatMap: Record<string, Record<string, number>> = {}
    for (const i of items) {
      const m = i.invoice_date.slice(0, 7), cat = i.category || "471000"
      if (!monthCatMap[m]) monthCatMap[m] = {}
      monthCatMap[m][cat] = (monthCatMap[m][cat] || 0) + Number(i.amount_ht)
    }
    const monthly_by_category = Object.entries(monthCatMap).map(([month, cats]) => ({ month, ...cats })).sort((a, b) => a.month.localeCompare(b.month))

    const supplierMap: Record<string, { total_ht: number; count: number }> = {}
    for (const i of items) {
      if (!supplierMap[i.party_name]) supplierMap[i.party_name] = { total_ht: 0, count: 0 }
      supplierMap[i.party_name].total_ht += Number(i.amount_ht)
      supplierMap[i.party_name].count++
    }
    const top_suppliers = Object.entries(supplierMap).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.total_ht - a.total_ht).slice(0, 10)

    const invoices_count = all.length
    const reconciled_count = all.filter(i => i.bank_transaction_id).length
    const reconciliation_rate = invoices_count ? (reconciled_count / invoices_count) * 100 : 0

    res.json({ charges_ht_ytd, charges_by_category, charges_by_month, monthly_by_category, invoices_count, reconciled_count, reconciliation_rate, top_suppliers })
  })

  // 13. VAT summary
  app.get("/api/compta/vat-summary", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const year = (req.query.year as string) || String(new Date().getFullYear())

    const { data: invoices, error } = await userClient
      .from("fhf_invoices").select("*")
      .gte("invoice_date", `${year}-01-01`).lte("invoice_date", `${year}-12-31`)
    if (error) return res.status(500).json({ error: error.message })

    const monthMap: Record<string, { tva_deductible_fr: number; tva_autoliquidee_intracom: number; tva_collectee: number; base_ht_achats_fr: number; base_ht_achats_intracom: number }> = {}

    for (const inv of (invoices || [])) {
      if (["455000", "512100", "512200"].includes(inv.category)) continue
      const m = inv.invoice_date.slice(0, 7)
      if (!monthMap[m]) monthMap[m] = { tva_deductible_fr: 0, tva_autoliquidee_intracom: 0, tva_collectee: 0, base_ht_achats_fr: 0, base_ht_achats_intracom: 0 }
      const vat = Number(inv.amount_vat) || 0
      const ht = Number(inv.amount_ht) || 0

      if (inv.direction === "expense") {
        if (inv.vat_reverse_charge) {
          monthMap[m].tva_autoliquidee_intracom += vat
          monthMap[m].base_ht_achats_intracom += ht
        } else if (inv.vat_deductible && vat > 0) {
          monthMap[m].tva_deductible_fr += vat
          monthMap[m].base_ht_achats_fr += ht
        }
      } else if (inv.direction === "revenue") {
        monthMap[m].tva_collectee += vat
      }
    }

    const months = Object.entries(monthMap).map(([month, d]) => ({
      month,
      ...d,
      tva_nette: d.tva_collectee + d.tva_autoliquidee_intracom - d.tva_deductible_fr - d.tva_autoliquidee_intracom,
    })).sort((a, b) => a.month.localeCompare(b.month))

    res.json({ months })
  })

  // 14. Capital invested (net of deposits minus withdrawals for a given category)
  app.get("/api/compta/capital-invested", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const category = req.query.category as string
    if (!category) return res.status(400).json({ error: "Missing category" })

    const { data, error } = await userClient
      .from("fhf_invoices")
      .select("direction, amount_ttc")
      .eq("category", category)
      .eq("status", "validated")

    if (error) return res.status(500).json({ error: error.message })

    let invested = 0
    for (const row of data || []) {
      const amount = Math.abs(Number(row.amount_ttc))
      if (row.direction === "expense") invested += amount
      else invested -= amount
    }

    res.json({ category, capital_invested: invested })
  })
}
