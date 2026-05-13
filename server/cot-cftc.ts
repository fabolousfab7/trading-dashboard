import type { SupabaseClient } from "@supabase/supabase-js"

const INSTRUMENTS: { key: string; label: string; cftcCode: string; searchName: string }[] = [
  { key: "BTC", label: "BTC future", cftcCode: "133741", searchName: "BITCOIN" },
  { key: "ETH", label: "ETH future", cftcCode: "244601", searchName: "ETHER" },
  { key: "SP500", label: "S&P 500 e-mini", cftcCode: "13874A", searchName: "E-MINI S&P 500" },
  { key: "NASDAQ", label: "Nasdaq 100", cftcCode: "209742", searchName: "NASDAQ-100" },
  { key: "RUSSELL", label: "Russell 2000", cftcCode: "239742", searchName: "RUSSELL 2000" },
  { key: "DXY", label: "DXY", cftcCode: "098662", searchName: "USD INDEX" },
  { key: "GOLD", label: "Or", cftcCode: "088691", searchName: "GOLD" },
  { key: "OIL", label: "Pétrole WTI", cftcCode: "067651", searchName: "CRUDE OIL, LIGHT SWEET" },
]

export { INSTRUMENTS }

interface CftcRow {
  report_date_as_yyyy_mm_dd: string
  cftc_contract_market_code: string
  market_and_exchange_names: string
  noncomm_positions_long_all: string
  noncomm_positions_short_all: string
  [key: string]: string
}

async function fetchCftcData(cftcCode: string, limit = 60): Promise<CftcRow[]> {
  const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=cftc_contract_market_code='${cftcCode}'&$order=report_date_as_yyyy_mm_dd DESC&$limit=${limit}`
  const r = await fetch(url, { headers: { Accept: "application/json" } })
  if (!r.ok) throw new Error(`CFTC API ${r.status}: ${r.statusText}`)
  return r.json()
}

function computePercentile1Y(currentNet: number, history: number[]): number {
  const sorted = [...history].sort((a, b) => a - b)
  const below = sorted.filter(v => v <= currentNet).length
  return (below / sorted.length) * 100
}

export async function syncCotReports(client: SupabaseClient): Promise<{ fetched: number; errors: string[] }> {
  let fetched = 0
  const errors: string[] = []

  for (const inst of INSTRUMENTS) {
    try {
      const rows = await fetchCftcData(inst.cftcCode, 60)
      if (rows.length === 0) {
        errors.push(`${inst.key}: no data returned`)
        continue
      }

      const parsed = rows.map(r => ({
        date: r.report_date_as_yyyy_mm_dd,
        net: Number(r.noncomm_positions_long_all || 0) - Number(r.noncomm_positions_short_all || 0),
        raw: r,
      })).sort((a, b) => b.date.localeCompare(a.date))

      const latest = parsed[0]
      const previous = parsed[1]
      const delta7d = previous ? latest.net - previous.net : null

      const last52 = parsed.slice(0, 52).map(p => p.net)
      const percentile = last52.length >= 4 ? computePercentile1Y(latest.net, last52) : null

      const { error: upsertErr } = await client
        .from("cot_reports")
        .upsert({
          instrument: inst.key,
          report_date: latest.date,
          net_large_specs: latest.net,
          delta_7d: delta7d,
          percentile_1y: percentile !== null ? Math.round(percentile * 10) / 10 : null,
          raw_payload: latest.raw,
          updated_at: new Date().toISOString(),
        }, { onConflict: "instrument,report_date" })

      if (upsertErr) {
        errors.push(`${inst.key}: upsert failed — ${upsertErr.message}`)
      } else {
        fetched++
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[cot-cron] ${inst.key}: ${msg}`)
      errors.push(`${inst.key}: ${msg}`)
    }
  }

  return { fetched, errors }
}
