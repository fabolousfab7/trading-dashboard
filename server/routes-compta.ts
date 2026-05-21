import type { Express, Request, Response, NextFunction } from "express"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import { aggregateRoundTrips } from "./routes-kraken-trades.js"

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

async function snapshotQontoBalance(client: any, userId: string) {
  const { data: transactions } = await client
    .from("fhf_bank_transactions")
    .select("amount, side")

  const balance = (transactions || []).reduce((s: number, t: any) => {
    const amt = Math.abs(Number(t.amount))
    return s + (t.side === "credit" ? amt : -amt)
  }, 0)

  let { data: qontoAccount } = await client
    .from("accounts")
    .select("id")
    .eq("broker", "Qonto")
    .maybeSingle()

  if (!qontoAccount) {
    const { data: newAcc } = await client
      .from("accounts")
      .insert({
        user_id: userId, label: "Qonto FHF", broker: "Qonto",
        account_type: "business", currency_base: "EUR",
        is_active: true, display_order: 5,
      })
      .select()
      .single()
    qontoAccount = newAcc
  }

  if (!qontoAccount) return

  const today = new Date().toISOString().slice(0, 10)

  await client.from("portfolio_snapshots").upsert({
    account_id: qontoAccount.id,
    snapshot_date: today,
    nlv_base: balance,
    capital_invested: null,
    cash_total: balance,
  }, { onConflict: "account_id,snapshot_date" })
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

const EU_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
])

const NON_CHARGE_ACCOUNTS = ["101000", "455000", "512100", "512200"]

function vatFilingDeadline(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, "0")}-24`
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return `${py}-${String(pm).padStart(2, "0")}`
}

function normalizePeriodMonth(val: string): string {
  if (/^\d{4}-\d{2}$/.test(val)) return `${val}-01`
  return val
}

async function computeVatMonth(client: SupabaseClient, month: string) {
  const { data: invoices } = await client
    .from("fhf_invoices")
    .select("direction, party_country, vat_reverse_charge, vat_deductible, amount_ht, amount_vat, category")
    .eq("status", "validated")
    .gte("invoice_date", `${month}-01`)
    .lte("invoice_date", `${month}-31`)

  const items = (invoices || []).filter(i => !NON_CHARGE_ACCOUNTS.includes(i.category))
  const revenues = items.filter(i => i.direction === "revenue")
  const expenses = items.filter(i => i.direction === "expense")

  const base_ventes_fr = revenues.reduce((s: number, i) => s + Number(i.amount_ht || 0), 0)

  const intracom = expenses.filter(i =>
    i.vat_reverse_charge && EU_COUNTRIES.has(i.party_country) && i.party_country !== "FR"
  )
  const base_acquisitions_intracom = intracom.reduce((s: number, i) => s + Number(i.amount_ht || 0), 0)

  const horsUe = expenses.filter(i =>
    i.vat_reverse_charge && !EU_COUNTRIES.has(i.party_country)
  )
  const base_achats_hors_ue = horsUe.reduce((s: number, i) => s + Number(i.amount_ht || 0), 0)

  const vat_collectee_fr = revenues.reduce((s: number, i) => s + Number(i.amount_vat || 0), 0)
  const vat_brute_due = Math.round((vat_collectee_fr + (base_acquisitions_intracom + base_achats_hors_ue) * 0.20) * 100) / 100
  const vat_intracom = Math.round(base_acquisitions_intracom * 0.20 * 100) / 100

  const deductibleFr = expenses.filter(i => i.vat_deductible && !i.vat_reverse_charge)
  const vat_deductible_fr = deductibleFr.reduce((s: number, i) => s + Number(i.amount_vat || 0), 0)

  const vat_deductible_autoliq = Math.round((base_acquisitions_intracom + base_achats_hors_ue) * 0.20 * 100) / 100
  const vat_deductible_total = Math.round((vat_deductible_fr + vat_deductible_autoliq) * 100) / 100
  const vat_credit_or_to_pay = Math.round((vat_deductible_total - vat_brute_due) * 100) / 100

  return {
    base_ventes_fr,
    base_acquisitions_intracom,
    base_achats_hors_ue,
    vat_collectee_fr,
    vat_brute_due,
    vat_intracom,
    vat_deductible_fr,
    vat_deductible_autoliq,
    vat_deductible_total,
    vat_credit_or_to_pay,
  }
}

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
    try { await snapshotQontoBalance(userClient, (req as any).userId) } catch {}
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
    try { await snapshotQontoBalance(userClient, (req as any).userId) } catch {}
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
    try { await snapshotQontoBalance(userClient, (req as any).userId) } catch {}
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

    try { await snapshotQontoBalance(userClient, (req as any).userId) } catch {}

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
        if (Math.abs(Math.abs(Number(tx.amount)) - invAmount) > 0.10) return false
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

    try { await snapshotQontoBalance(userClient, (req as any).userId) } catch {}
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

    try { await snapshotQontoBalance(userClient, (req as any).userId) } catch {}
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
    try { await snapshotQontoBalance(userClient, (req as any).userId) } catch {}
    res.json({ ok: true })
  })

  // 11b. Match suggestions (±0.50€, ±30 days, no name filter)
  app.get("/api/compta/reconcile/suggestions", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)

    const { data: invoices, error: invErr } = await userClient
      .from("fhf_invoices").select("*").is("bank_transaction_id", null)
    if (invErr) return res.status(500).json({ error: invErr.message })

    const { data: txs, error: txErr } = await userClient
      .from("fhf_bank_transactions").select("*").eq("status", "unmatched")
    if (txErr) return res.status(500).json({ error: txErr.message })

    const suggestions: any[] = []

    for (const inv of (invoices || [])) {
      const invAmount = Math.abs(Number(inv.amount_ttc))
      const invDate = new Date(inv.invoice_date)
      const dateMin = new Date(invDate); dateMin.setDate(dateMin.getDate() - 30)
      const dateMax = new Date(invDate); dateMax.setDate(dateMax.getDate() + 30)

      for (const tx of (txs || [])) {
        const diff = Math.abs(Math.abs(Number(tx.amount)) - invAmount)
        const tolerance = Math.max(0.50, invAmount * 0.05)
        if (diff > tolerance) continue
        const txDate = new Date(tx.settlement_date)
        if (txDate < dateMin || txDate > dateMax) continue
        suggestions.push({
          invoice_id: inv.id,
          invoice_party: inv.party_name,
          invoice_amount: invAmount,
          invoice_date: inv.invoice_date,
          bank_tx_id: tx.id,
          bank_counterparty: tx.counterparty_name,
          bank_amount: Math.abs(Number(tx.amount)),
          bank_date: tx.settlement_date,
          amount_diff: Math.round(diff * 100) / 100,
          confidence: diff <= 0.01 ? "exact" : "approx",
        })
      }
    }

    res.json({ suggestions })
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

    const NON_CHARGE = ["101000", "455000", "512100", "512200"]
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

    const { data: ccaInvoices } = await userClient
      .from("fhf_invoices")
      .select("direction, amount_ttc, category, notes")
      .or("category.eq.455000,notes.ilike.%455000%")
    let cca_balance = 0
    for (const inv of (ccaInvoices || [])) {
      const amount = Math.abs(Number(inv.amount_ttc))
      if (inv.category === "455000") {
        cca_balance += inv.direction === "revenue" ? amount : -amount
      } else {
        cca_balance += amount
      }
    }

    res.json({ charges_ht_ytd, charges_by_category, charges_by_month, monthly_by_category, invoices_count, reconciled_count, reconciliation_rate, top_suppliers, cca_balance })
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
      if (["101000", "455000", "512100", "512200"].includes(inv.category)) continue
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

  app.get("/api/compta/bank-balance", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    try {
      const { data: transactions } = await userClient
        .from("fhf_bank_transactions")
        .select("amount, side, settlement_date")
        .order("settlement_date", { ascending: false })

      if (!transactions || transactions.length === 0) {
        return res.json({ balance: 0, lastDate: null, nbTransactions: 0 })
      }

      const balance = transactions.reduce((s: number, t: any) => {
        const amt = Math.abs(Number(t.amount))
        return s + (t.side === "credit" ? amt : -amt)
      }, 0)

      res.json({
        balance,
        lastDate: transactions[0].settlement_date,
        nbTransactions: transactions.length,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Crypto-crypto swaps — liste filtrée YTD
  app.get("/api/compta/crypto-swaps", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const from = (req.query.from as string) || `${new Date().getFullYear()}-01-01`
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10)
    const { data, error } = await userClient
      .from("kraken_crypto_crypto_swaps")
      .select("*")
      .gte("trade_date", `${from}T00:00:00Z`)
      .lte("trade_date", `${to}T23:59:59Z`)
      .order("trade_date", { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    const total_eur = (data || []).reduce(
      (s: number, r: any) => s + Number(r.valuation_eur_override ?? r.valuation_eur_snapshot ?? 0), 0
    )
    const needs_review_count = (data || []).filter((r: any) => r.needs_review).length
    res.json({ rows: data || [], total_eur, needs_review_count })
  })

  // Crypto-crypto swaps — override manuel
  app.patch("/api/compta/crypto-swaps/:id", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const id = req.params.id
    const { valuation_eur_override, override_note } = req.body || {}
    const update: any = {
      valuation_eur_override: valuation_eur_override === null ? null : Number(valuation_eur_override),
      override_note: override_note ?? null,
      override_set_at: valuation_eur_override == null ? null : new Date().toISOString(),
      needs_review: false,
    }
    const { data, error } = await userClient
      .from("kraken_crypto_crypto_swaps")
      .update(update)
      .eq("id", id)
      .select()
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  })

  // Crypto-crypto swaps — export CSV
  app.get("/api/compta/crypto-swaps/export.csv", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const from = (req.query.from as string) || `${new Date().getFullYear()}-01-01`
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10)
    const { data, error } = await userClient
      .from("kraken_crypto_crypto_swaps")
      .select("*")
      .gte("trade_date", `${from}T00:00:00Z`)
      .lte("trade_date", `${to}T23:59:59Z`)
      .order("trade_date", { ascending: true })
    if (error) return res.status(500).send(error.message)
    const headers = [
      "date","pair","side","quantity","ticker_base","ticker_quote",
      "price_quote","cost_quote","valuation_eur_snapshot","valuation_eur_override",
      "valuation_eur_effective","valuation_source","needs_review","override_note","kraken_trade_id"
    ]
    const lines = [headers.join(",")]
    for (const r of data || []) {
      const eff = r.valuation_eur_override ?? r.valuation_eur_snapshot ?? ""
      const row = [
        r.trade_date.slice(0, 10), r.pair, r.side, r.quantity,
        r.ticker_base, r.ticker_quote, r.price_quote, r.cost_quote,
        r.valuation_eur_snapshot ?? "", r.valuation_eur_override ?? "",
        eff, r.valuation_source ?? "", r.needs_review,
        (r.override_note ?? "").replace(/[",\n]/g, " "), r.kraken_trade_id
      ]
      lines.push(row.join(","))
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="evenements_imposables_fhf_${from}_${to}.csv"`)
    res.send(lines.join("\n"))
  })

  // FHF Simulation fiscale
  app.get("/api/fhf/simulation", auth, async (req: Request, res: Response) => {
    const userClient = userScopedClient((req as any).userToken)
    const year = (req.query.year as string) || String(new Date().getFullYear())
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    try {
      const NON_CHARGE = ["101000", "455000", "512100", "512200"]
      const { data: expenseInvoices } = await userClient
        .from("fhf_invoices").select("*")
        .eq("direction", "expense")
        .gte("invoice_date", startDate).lte("invoice_date", endDate)

      const chargeItems = (expenseInvoices || []).filter(i => !NON_CHARGE.includes(i.category))
      let charges_brutes = chargeItems.reduce((s, i) => s + Number(i.amount_ht), 0)

      const catMap: Record<string, number> = {}
      for (const i of chargeItems) {
        const cat = i.category || "471000"
        catMap[cat] = (catMap[cat] || 0) + Number(i.amount_ht)
      }
      const charges_by_category = Object.entries(catMap)
        .map(([category, total_ht]) => ({ category, total_ht }))
        .sort((a, b) => b.total_ht - a.total_ht)

      const { data: revenueInvoices } = await userClient
        .from("fhf_invoices").select("*")
        .eq("direction", "revenue")
        .gte("invoice_date", startDate).lte("invoice_date", endDate)

      const revenueItems = (revenueInvoices || []).filter(i => !NON_CHARGE.includes(i.category))
      const vraisRevenus = revenueItems.filter(i => i.category === "708000")
      const avoirs = revenueItems.filter(i => i.category !== "708000")

      const revenus_compta = vraisRevenus.reduce((s, i) => s + Number(i.amount_ht), 0)
      const avoirs_total = avoirs.reduce((s, i) => s + Number(i.amount_ht), 0)
      let charges_ht_ytd = charges_brutes - avoirs_total

      const revenus_detail = vraisRevenus.map(i => ({
        party_name: i.party_name,
        amount_ht: Number(i.amount_ht),
        date: i.invoice_date,
        category: i.category
      }))

      // Capital investi (needed before IBKR P&L calc)
      const { data: capitalIbkr } = await userClient
        .from("fhf_invoices").select("direction, amount_ttc")
        .eq("category", "512100").eq("status", "validated")
      const { data: capitalKraken } = await userClient
        .from("fhf_invoices").select("direction, amount_ttc")
        .eq("category", "512200").eq("status", "validated")

      const calcCapital = (rows: any[]) => (rows || []).reduce((s, r) => {
        const amt = Math.abs(Number(r.amount_ttc))
        return s + (r.direction === "expense" ? amt : -amt)
      }, 0)

      const capital_ibkr = calcCapital(capitalIbkr || [])
      const capital_kraken = calcCapital(capitalKraken || [])
      const capital_total = capital_ibkr + capital_kraken

      // IBKR — investissement, P&L basé sur le compte
      const { data: accounts } = await userClient
        .from("accounts").select("id, broker, currency_base")
      const ibkrAccount = (accounts || []).find(a => a.broker === "IBKR")

      let pnl_latent_ibkr = 0
      let pnl_realise_ibkr = 0
      let ibkr_nlv = 0
      let ibkr_positions_value = 0
      let ibkr_cash = 0
      let ibkr_positions: any[] = []

      if (ibkrAccount) {
        const { data: positions } = await userClient
          .from("positions").select("*").eq("account_id", ibkrAccount.id)
        ibkr_positions = (positions || []).filter(p => Number(p.quantity) !== 0)

        pnl_latent_ibkr = ibkr_positions.reduce((s, p) => s + Number(p.unrealized_pnl || 0), 0)

        ibkr_positions_value = ibkr_positions.reduce((s, p) => {
          const qty = Number(p.quantity)
          const price = Number(p.market_price)
          const fx = Number(p.fx_rate_to_base || 1)
          return s + (qty * price * fx)
        }, 0)

        const { data: cashBalances } = await userClient
          .from("cash_balances").select("amount, fx_rate_to_base").eq("account_id", ibkrAccount.id)
        ibkr_cash = (cashBalances || []).reduce((s, c) => {
          return s + Number(c.amount) * Number(c.fx_rate_to_base || 1)
        }, 0)

        ibkr_nlv = ibkr_cash + ibkr_positions_value
        pnl_realise_ibkr = ibkr_nlv - capital_ibkr - pnl_latent_ibkr
      }

      // Kraken — P&L réalisé YTD depuis kraken_trades (Spot FIFO + Futures paidPnL si dispo)
      const yearStart = `${year}-01-01T00:00:00Z`
      const yearEnd = `${year}-12-31T23:59:59Z`

      const { data: krakenAccounts } = await userClient
        .from("accounts").select("id").eq("broker", "Kraken").eq("is_active", true)
      const krakenAccountIds = (krakenAccounts || []).map((a: any) => a.id)

      let pnl_realise_kraken_spot = 0
      let pnl_realise_kraken_futures = 0
      let nb_trades_kraken_clos = 0
      let nb_trades_kraken_total = 0
      let frais_courtage_kraken = 0

      if (krakenAccountIds.length > 0) {
        const { data: ktrades } = await userClient
          .from("kraken_trades")
          .select("id, market_type, realized_pnl_gross, realized_pnl, fee, fx_rate_to_eur, " +
                  "ticker, quote_currency, pair, side, quantity, price, trade_date, kraken_trade_id")
          .in("account_id", krakenAccountIds)
          .gte("trade_date", yearStart)
          .lte("trade_date", yearEnd)

        const futuresFills: any[] = []
        for (const t of (ktrades || [])) {
          const fx = Number(t.fx_rate_to_eur ?? 1)
          nb_trades_kraken_total++
          frais_courtage_kraken += Number(t.fee ?? 0) * fx
          if (t.market_type === "spot") {
            if (t.realized_pnl_gross !== null && t.realized_pnl_gross !== undefined) {
              pnl_realise_kraken_spot += Number(t.realized_pnl_gross) * fx
              nb_trades_kraken_clos++
            }
          } else if (t.market_type === "futures") {
            futuresFills.push(t)
          }
        }

        if (futuresFills.length > 0) {
          const { round_trips } = aggregateRoundTrips(futuresFills, { allowShort: true })
          for (const trip of round_trips) {
            pnl_realise_kraken_futures += Number(trip.gross_pnl_eur ?? 0)
            nb_trades_kraken_clos++
          }
        }
      }

      const pnl_realise_kraken = pnl_realise_kraken_spot + pnl_realise_kraken_futures

      if (frais_courtage_kraken > 0) {
        charges_by_category.push({ category: "627200", total_ht: frais_courtage_kraken })
        charges_brutes += frais_courtage_kraken
        charges_ht_ytd = charges_brutes - avoirs_total
      }

      // Kraken holding fees (rollover, margin, funding)
      let frais_holding_fees: Record<string, number> = {
        "661800": 0,
        "627800": 0,
        "668000": 0,
        "768000": 0,
      }
      if (krakenAccountIds.length > 0) {
        const { data: holdingFees } = await userClient
          .from("kraken_holding_fees")
          .select("pcg_code, amount_eur, amount_sign")
          .in("account_id", krakenAccountIds)
          .gte("ts", yearStart)
          .lte("ts", yearEnd)
        for (const f of (holdingFees || [])) {
          const eur = Math.abs(Number(f.amount_eur ?? 0))
          frais_holding_fees[f.pcg_code] = (frais_holding_fees[f.pcg_code] ?? 0) + eur
        }
      }

      for (const pcg of ["661800", "627800", "668000"]) {
        if (frais_holding_fees[pcg] > 0) {
          charges_by_category.push({ category: pcg, total_ht: frais_holding_fees[pcg] })
          charges_brutes += frais_holding_fees[pcg]
        }
      }
      charges_by_category.sort((a: any, b: any) => b.total_ht - a.total_ht)
      charges_ht_ytd = charges_brutes - avoirs_total

      const produits_funding_futures = frais_holding_fees["768000"]

      // Total P&L trading
      const total_produits_trading = pnl_realise_ibkr + pnl_latent_ibkr + pnl_realise_kraken + produits_funding_futures

      const { data: ccaInvoices } = await userClient
        .from("fhf_invoices").select("direction, amount_ttc, category, notes")
        .or("category.eq.455000,notes.ilike.%455000%")
      let cca_balance = 0
      for (const inv of (ccaInvoices || [])) {
        const amount = Math.abs(Number(inv.amount_ttc))
        if (inv.category === "455000") {
          cca_balance += inv.direction === "revenue" ? amount : -amount
        } else {
          cca_balance += amount
        }
      }

      const resultat_avant_is = total_produits_trading + revenus_compta - charges_ht_ytd

      let is_amount = 0
      if (resultat_avant_is > 0) {
        const tranche_reduite = Math.min(resultat_avant_is, 42500)
        const tranche_normale = Math.max(0, resultat_avant_is - 42500)
        is_amount = tranche_reduite * 0.15 + tranche_normale * 0.25
      }
      const resultat_net = resultat_avant_is - is_amount
      const taux_effectif_is = resultat_avant_is > 0 ? (is_amount / resultat_avant_is) * 100 : 0

      const { data: bankTx } = await userClient
        .from("fhf_bank_transactions")
        .select("amount, side")
      const tresoQonto = (bankTx || []).reduce((s: number, t: any) => {
        const amt = Math.abs(Number(t.amount))
        return s + (t.side === "credit" ? amt : -amt)
      }, 0)

      res.json({
        year,
        ibkr_nlv,
        ibkr_cash,
        ibkr_positions_value,
        pnl_realise_ibkr,
        pnl_latent_ibkr,
        nb_positions_ibkr: ibkr_positions.length,
        capital_ibkr,
        pnl_realise_kraken,
        pnl_realise_kraken_spot,
        pnl_realise_kraken_futures,
        nb_trades_kraken_clos,
        nb_trades_kraken_total,
        frais_courtage_kraken,
        frais_interets_margin_kraken: frais_holding_fees["661800"],
        frais_margin_kraken: frais_holding_fees["627800"],
        charges_funding_futures: frais_holding_fees["668000"],
        produits_funding_futures,
        capital_kraken,
        revenus_compta,
        revenus_detail,
        charges_brutes,
        charges_ht_ytd,
        avoirs_total,
        avoirs_detail: avoirs.map(i => ({
          party_name: i.party_name,
          amount_ht: Number(i.amount_ht),
          date: i.invoice_date,
          category: i.category
        })),
        charges_by_category,
        total_produits_trading,
        capital_total,
        resultat_avant_is,
        is_amount,
        resultat_net,
        taux_effectif_is,
        is_tranche_reduite: resultat_avant_is > 0 ? Math.min(resultat_avant_is, 42500) * 0.15 : 0,
        is_tranche_normale: resultat_avant_is > 42500 ? (resultat_avant_is - 42500) * 0.25 : 0,
        cca_balance,
        treso_qonto: tresoQonto,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── VAT Returns (CA3) ──

  app.get("/api/compta/vat-returns", auth, async (req: Request, res: Response) => {
    try {
      const userClient = userScopedClient((req as any).userToken)
      const year = (req.query.year as string) || String(new Date().getFullYear())

      const { data: returns, error } = await userClient
        .from("fhf_vat_returns")
        .select("*")
        .gte("period_month", `${year}-01-01`)
        .lte("period_month", `${year}-12-31`)
        .order("period_month", { ascending: false })

      if (error) {
        console.error("[vat-returns] list error:", error.message)
        return res.status(500).json({ error: error.message })
      }

      const enriched = []
      for (const r of (returns || [])) {
        let refund_transaction = null
        if (r.refund_bank_transaction_id) {
          const { data: tx } = await userClient
            .from("fhf_bank_transactions")
            .select("settlement_date, amount, counterparty_name")
            .eq("id", r.refund_bank_transaction_id)
            .maybeSingle()
          refund_transaction = tx || null
        }
        enriched.push({ ...r, refund_transaction })
      }

      res.json({ returns: enriched })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[vat-returns] list error:", msg)
      res.status(500).json({ error: msg })
    }
  })

  app.get("/api/compta/vat-returns/preparation", auth, async (req: Request, res: Response) => {
    try {
      const userClient = userScopedClient((req as any).userToken)
      const month = req.query.month as string
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: "Paramètre month manquant ou invalide (YYYY-MM)" })
      }

      const year = month.slice(0, 4)
      const deadline = vatFilingDeadline(month)
      const today = new Date().toISOString().slice(0, 10)
      const [dy, dm] = deadline.split("-").map(Number)
      const windowStart = `${dy}-${String(dm).padStart(2, "0")}-01`
      const filing_window_open = today >= windowStart && today <= deadline

      const computed = await computeVatMonth(userClient, month)

      const { data: yearReturns } = await userClient
        .from("fhf_vat_returns")
        .select("*")
        .gte("period_month", `${year}-01-01`)
        .lte("period_month", `${year}-12-31`)

      const returnsArr = yearReturns || []
      const existing_return = returnsArr.find(r => String(r.period_month).slice(0, 7) === month) || null

      const prevMonth = previousMonth(month)
      let prevReturn = returnsArr.find(r => String(r.period_month).slice(0, 7) === prevMonth)
      if (!prevReturn && prevMonth.slice(0, 4) !== year) {
        const { data: pr } = await userClient
          .from("fhf_vat_returns")
          .select("vat_credit, credit_action")
          .eq("period_month", `${prevMonth}-01`)
          .maybeSingle()
        prevReturn = pr || undefined
      }

      let credit_reported_from_previous = 0
      if (prevReturn && prevReturn.credit_action === "reported") {
        credit_reported_from_previous = Number(prevReturn.vat_credit || 0)
      }

      const monthNum = parseInt(month.slice(5, 7))
      const priorMonths: string[] = []
      for (let m = 1; m < monthNum; m++) {
        priorMonths.push(`${year}-${String(m).padStart(2, "0")}`)
      }

      const alreadyRetroactivelyCovered = new Set<string>()
      for (const r of returnsArr) {
        if (r.status === "draft") continue
        for (const period of (r.retroactive_periods || [])) {
          alreadyRetroactivelyCovered.add(String(period).slice(0, 7))
        }
      }

      const retroactiveCandidates = priorMonths.filter(m => {
        if (alreadyRetroactivelyCovered.has(m)) return false
        const ret = returnsArr.find(r => String(r.period_month).slice(0, 7) === m)
        return !ret || ret.status === "draft"
      })

      const retroactive_available: Array<{
        period_month: string
        vat_deductible_fr_missed: number
        base_intracom_missed: number
        base_hors_ue_missed: number
        factures_count: number
      }> = []

      if (retroactiveCandidates.length > 0) {
        const { data: yearExpenses } = await userClient
          .from("fhf_invoices")
          .select("invoice_date, party_country, vat_reverse_charge, vat_deductible, amount_ht, amount_vat, category")
          .eq("status", "validated")
          .eq("direction", "expense")
          .gte("invoice_date", `${year}-01-01`)
          .lte("invoice_date", `${year}-12-31`)

        const expensesByMonth: Record<string, typeof yearExpenses> = {}
        for (const inv of (yearExpenses || [])) {
          const m = String(inv.invoice_date).slice(0, 7)
          if (!expensesByMonth[m]) expensesByMonth[m] = []
          expensesByMonth[m]!.push(inv)
        }

        for (const m of retroactiveCandidates) {
          const items = (expensesByMonth[m] || []).filter(i => !NON_CHARGE_ACCOUNTS.includes(i.category))
          if (items.length === 0) continue

          const deductibleFr = items.filter(i => i.vat_deductible && !i.vat_reverse_charge)
          const intracom = items.filter(i => i.vat_reverse_charge && EU_COUNTRIES.has(i.party_country) && i.party_country !== "FR")
          const horsUe = items.filter(i => i.vat_reverse_charge && !EU_COUNTRIES.has(i.party_country))

          const vat_deductible_fr_missed = deductibleFr.reduce((s: number, i) => s + Number(i.amount_vat || 0), 0)
          const base_intracom_missed = intracom.reduce((s: number, i) => s + Number(i.amount_ht || 0), 0)
          const base_hors_ue_missed = horsUe.reduce((s: number, i) => s + Number(i.amount_ht || 0), 0)

          if (vat_deductible_fr_missed > 0 || base_intracom_missed > 0 || base_hors_ue_missed > 0) {
            retroactive_available.push({
              period_month: `${m}-01`,
              vat_deductible_fr_missed,
              base_intracom_missed,
              base_hors_ue_missed,
              factures_count: deductibleFr.length + intracom.length + horsUe.length,
            })
          }
        }
      }

      res.json({
        period_month: month,
        filing_deadline: deadline,
        filing_window_open,
        computed,
        retroactive_available,
        credit_reported_from_previous,
        existing_return,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[vat-returns] preparation error:", msg)
      res.status(500).json({ error: msg })
    }
  })

  app.post("/api/compta/vat-returns", auth, async (req: Request, res: Response) => {
    try {
      const userClient = userScopedClient((req as any).userToken)
      const body = req.body
      const errors: string[] = []

      const period_month = normalizePeriodMonth(body.period_month || "")
      if (!/^\d{4}-\d{2}-01$/.test(period_month)) {
        errors.push("period_month invalide (attendu: YYYY-MM ou YYYY-MM-01)")
      }

      if (body.status === "submitted") {
        if (!body.submitted_at) errors.push("submitted_at obligatoire quand status='submitted'")
        if (!body.filing_reference) errors.push("filing_reference obligatoire quand status='submitted'")
      }

      if (body.credit_action === "refund_requested") {
        if (!body.refund_requested_amount || Number(body.refund_requested_amount) <= 0) {
          errors.push("refund_requested_amount doit être > 0 quand credit_action='refund_requested'")
        }
        if (Number(body.vat_credit || 0) < 760) {
          errors.push("vat_credit doit être >= 760 € pour demander un remboursement")
        }
      }

      const expectedTotal = Number(body.vat_deductible_immo || 0)
        + Number(body.vat_deductible_other || 0)
        + Number(body.vat_other_deduction || 0)
      if (Math.abs(Number(body.vat_deductible_total || 0) - expectedTotal) > 1) {
        errors.push(`vat_deductible_total (${body.vat_deductible_total}) incohérent avec la somme des composantes (${expectedTotal.toFixed(2)})`)
      }

      const expectedCredit = Math.max(0, Number(body.vat_deductible_total || 0) - Number(body.vat_brute_due || 0))
      if (Math.abs(Number(body.vat_credit || 0) - expectedCredit) > 1) {
        errors.push(`vat_credit (${body.vat_credit}) incohérent avec max(0, deductible_total - brute_due) = ${expectedCredit.toFixed(2)}`)
      }

      if (errors.length > 0) {
        return res.status(400).json({ errors })
      }

      const month = period_month.slice(0, 7)
      const snapshot = await computeVatMonth(userClient, month)

      const record = {
        user_id: (req as any).userId,
        period_month,
        submitted_at: body.submitted_at || null,
        filing_deadline: body.filing_deadline || vatFilingDeadline(month),
        filing_reference: body.filing_reference || null,
        acknowledgment_url: body.acknowledgment_url || null,
        base_ventes_fr_taxable: body.base_ventes_fr_taxable,
        base_acquisitions_intracom: body.base_acquisitions_intracom,
        base_achats_hors_ue: body.base_achats_hors_ue,
        vat_brute_due: body.vat_brute_due,
        vat_intracom: body.vat_intracom,
        vat_deductible_immo: body.vat_deductible_immo,
        vat_deductible_other: body.vat_deductible_other,
        vat_other_deduction: body.vat_other_deduction,
        vat_deductible_total: body.vat_deductible_total,
        vat_to_pay: body.vat_to_pay,
        vat_credit: body.vat_credit,
        credit_action: body.credit_action || null,
        refund_requested_amount: body.refund_requested_amount || null,
        retroactive_periods: body.retroactive_periods || null,
        retroactive_notes: body.retroactive_notes || null,
        status: body.status || "draft",
        notes: body.notes || null,
        dashboard_snapshot: snapshot,
      }

      const { data, error } = await userClient
        .from("fhf_vat_returns")
        .insert(record)
        .select()
        .single()

      if (error) {
        console.error("[vat-returns] create error:", error.message)
        if (error.code === "23505") {
          return res.status(409).json({ error: "Une déclaration CA3 existe déjà pour ce mois" })
        }
        return res.status(500).json({ error: error.message })
      }

      res.status(201).json(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[vat-returns] create error:", msg)
      res.status(500).json({ error: msg })
    }
  })

  app.put("/api/compta/vat-returns/:id", auth, async (req: Request, res: Response) => {
    try {
      const userClient = userScopedClient((req as any).userToken)
      const id = req.params.id
      const body = { ...req.body }

      delete body.id
      delete body.user_id
      delete body.created_at

      if (body.refund_bank_transaction_id) {
        const { data: tx, error: txErr } = await userClient
          .from("fhf_bank_transactions")
          .select("id, settlement_date, amount")
          .eq("id", body.refund_bank_transaction_id)
          .maybeSingle()

        if (txErr || !tx) {
          console.error("[vat-returns] refund tx lookup:", txErr?.message || "not found")
          return res.status(400).json({ error: "Transaction bancaire introuvable ou non autorisée" })
        }

        const { data: linked } = await userClient
          .from("fhf_vat_returns")
          .select("id")
          .eq("refund_bank_transaction_id", body.refund_bank_transaction_id)
          .neq("id", id)
          .maybeSingle()

        if (linked) {
          return res.status(400).json({ error: "Cette transaction est déjà liée à une autre déclaration CA3" })
        }

        const { data: current } = await userClient
          .from("fhf_vat_returns")
          .select("refund_received_at, refund_amount_actual, status")
          .eq("id", id)
          .maybeSingle()

        if (!current) {
          return res.status(404).json({ error: "Déclaration CA3 introuvable" })
        }

        if (!body.refund_received_at && !current.refund_received_at) {
          body.refund_received_at = tx.settlement_date
        }
        if (body.refund_amount_actual == null && current.refund_amount_actual == null) {
          body.refund_amount_actual = tx.amount
        }
        if (!body.status && current.status === "refund_pending") {
          body.status = "refund_received"
        }
      }

      body.updated_at = new Date().toISOString()

      const { data, error } = await userClient
        .from("fhf_vat_returns")
        .update(body)
        .eq("id", id)
        .select()
        .single()

      if (error) {
        console.error("[vat-returns] update error:", error.message)
        if (error.code === "PGRST116") {
          return res.status(404).json({ error: "Déclaration CA3 introuvable" })
        }
        return res.status(500).json({ error: error.message })
      }

      res.json(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[vat-returns] update error:", msg)
      res.status(500).json({ error: msg })
    }
  })

  app.delete("/api/compta/vat-returns/:id", auth, async (req: Request, res: Response) => {
    try {
      const userClient = userScopedClient((req as any).userToken)
      const { error } = await userClient
        .from("fhf_vat_returns")
        .delete()
        .eq("id", req.params.id)

      if (error) {
        console.error("[vat-returns] delete error:", error.message)
        return res.status(500).json({ error: error.message })
      }

      res.status(204).send()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[vat-returns] delete error:", msg)
      res.status(500).json({ error: msg })
    }
  })
}
