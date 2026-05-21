export interface VatReturn {
  id: string
  user_id: string
  period_month: string
  submitted_at: string | null
  filing_deadline: string | null
  filing_reference: string | null
  acknowledgment_url: string | null
  base_ventes_fr_taxable: number | null
  base_acquisitions_intracom: number | null
  base_achats_hors_ue: number | null
  vat_brute_due: number | null
  vat_intracom: number | null
  vat_deductible_immo: number | null
  vat_deductible_other: number | null
  vat_other_deduction: number | null
  vat_deductible_total: number | null
  vat_to_pay: number | null
  vat_credit: number | null
  credit_action: "reported" | "refund_requested" | "na" | "to_pay" | null
  refund_requested_amount: number | null
  refund_bank_transaction_id: string | null
  refund_received_at: string | null
  refund_amount_actual: number | null
  dashboard_snapshot: unknown
  retroactive_periods: string[] | null
  retroactive_notes: string | null
  status: "draft" | "submitted" | "refund_pending" | "refund_received" | "closed"
  notes: string | null
  created_at: string
  updated_at: string
  refund_transaction?: {
    settlement_date: string
    amount: number
    counterparty_name: string
  } | null
}

export interface VatComputed {
  base_ventes_fr: number
  base_acquisitions_intracom: number
  base_achats_hors_ue: number
  vat_collectee_fr: number
  vat_brute_due: number
  vat_intracom: number
  vat_deductible_fr: number
  vat_deductible_autoliq: number
  vat_deductible_total: number
  vat_credit_or_to_pay: number
}

export interface RetroactiveItem {
  period_month: string
  vat_deductible_fr_missed: number
  base_intracom_missed: number
  base_hors_ue_missed: number
  factures_count: number
}

export interface VatPreparation {
  period_month: string
  filing_deadline: string
  filing_window_open: boolean
  computed: VatComputed
  retroactive_available: RetroactiveItem[]
  credit_reported_from_previous: number
  existing_return: VatReturn | null
}
