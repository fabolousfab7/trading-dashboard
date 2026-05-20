import type { SupabaseClient } from "@supabase/supabase-js"
import { KRAKEN_TO_COINGECKO, normalizeKrakenTicker } from "./kraken-api.js"
import { fetchCoinGeckoHistory } from "./coingecko.js"

const priceCache: Record<string, number | null> = {}

async function getEurPriceAtDate(ticker: string, dateISO: string): Promise<number | null> {
  const cgId = KRAKEN_TO_COINGECKO[ticker] || KRAKEN_TO_COINGECKO[ticker.toUpperCase()]
  if (!cgId) return null
  const day = dateISO.slice(0, 10)
  const cacheKey = `${cgId}|${day}`
  if (cacheKey in priceCache) return priceCache[cacheKey]
  try {
    const history = await fetchCoinGeckoHistory(cgId, 400)
    const hit = history.find(h => h.date === day)
      ?? history.find(h => h.date <= day)
    const price = hit?.price ?? null
    priceCache[cacheKey] = price
    return price
  } catch {
    priceCache[cacheKey] = null
    return null
  }
}

export async function upsertCryptoCryptoSwap(
  userClient: SupabaseClient,
  accountId: string,
  tradeId: string,
  parsed: { ticker: string; quote: string },
  raw: any,
): Promise<{ inserted: boolean; updated: boolean; needs_review: boolean }> {
  const tickerBase = normalizeKrakenTicker(parsed.ticker)
  const tickerQuote = normalizeKrakenTicker(parsed.quote)
  const side = (raw.type || "").toLowerCase() === "sell" ? "SELL" : "BUY"
  const quantity = Number(raw.vol) || 0
  const priceQuote = Number(raw.price) || 0
  const costQuote = Number(raw.cost) || 0
  const feeQuote = Number(raw.fee) || 0
  const tradeDate = new Date(Number(raw.time) * 1000).toISOString()

  const [basePriceEur, quotePriceEur] = await Promise.all([
    getEurPriceAtDate(tickerBase, tradeDate),
    getEurPriceAtDate(tickerQuote, tradeDate),
  ])

  let valuationEur: number | null = null
  let source = "coingecko_quote"
  if (quotePriceEur != null) {
    valuationEur = costQuote * quotePriceEur
  } else if (basePriceEur != null) {
    valuationEur = quantity * basePriceEur
    source = "coingecko_base_fallback"
  } else {
    source = "unavailable"
  }
  const needsReview = valuationEur == null

  const { data: existing } = await userClient
    .from("kraken_crypto_crypto_swaps")
    .select("id, valuation_eur_override")
    .eq("account_id", accountId)
    .eq("kraken_trade_id", tradeId)
    .maybeSingle()

  const snapshotFields = {
    trade_date: tradeDate,
    pair: raw.pair,
    ticker_base: tickerBase,
    ticker_quote: tickerQuote,
    side,
    quantity,
    price_quote: priceQuote,
    cost_quote: costQuote,
    fee_quote: feeQuote,
    fee_currency: tickerQuote,
    ticker_eur_price_snapshot: basePriceEur,
    quote_eur_price_snapshot: quotePriceEur,
    valuation_eur_snapshot: valuationEur,
    valuation_source: source,
    valuation_snapshot_at: new Date().toISOString(),
    needs_review: needsReview,
    raw_data: raw,
  }

  if (existing) {
    await userClient
      .from("kraken_crypto_crypto_swaps")
      .update(snapshotFields)
      .eq("id", existing.id)
    return { inserted: false, updated: true, needs_review: needsReview }
  } else {
    await userClient
      .from("kraken_crypto_crypto_swaps")
      .insert({ account_id: accountId, kraken_trade_id: tradeId, ...snapshotFields })
    return { inserted: true, updated: false, needs_review: needsReview }
  }
}
