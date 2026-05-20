import type { SupabaseClient } from "@supabase/supabase-js"

interface FifoLot {
  qtyRemaining: number
  price: number
  feePerUnit: number
}

export async function recalcFifoForAccount(client: SupabaseClient, accountId: string): Promise<number> {
  const { data: tickers } = await client
    .from("kraken_trades")
    .select("ticker")
    .eq("account_id", accountId)
    .eq("market_type", "spot")
  if (!tickers || tickers.length === 0) return 0

  const uniqueTickers = Array.from(new Set(tickers.map((t: any) => t.ticker)))
  let recalculated = 0

  for (const ticker of uniqueTickers) {
    const { data: trades } = await client
      .from("kraken_trades")
      .select("id, side, quantity, price, fee, quote_currency")
      .eq("account_id", accountId)
      .eq("market_type", "spot")
      .eq("ticker", ticker)
      .order("trade_date", { ascending: true })
    if (!trades || trades.length === 0) continue

    const queue: FifoLot[] = []

    for (const t of trades) {
      const qty = Number(t.quantity)
      const price = Number(t.price)
      const fee = Number(t.fee) || 0

      if (t.side === "BUY") {
        queue.push({ qtyRemaining: qty, price, feePerUnit: qty > 0 ? fee / qty : 0 })
        continue
      }

      if (t.side !== "SELL") continue

      let qtyToSell = qty
      let costBasis = 0
      let costBasisGross = 0

      while (qtyToSell > 0 && queue.length > 0) {
        const lot = queue[0]
        const consumed = Math.min(lot.qtyRemaining, qtyToSell)
        costBasis += consumed * (lot.price + lot.feePerUnit)
        costBasisGross += consumed * lot.price
        lot.qtyRemaining -= consumed
        qtyToSell -= consumed
        if (lot.qtyRemaining <= 1e-12) queue.shift()
      }

      if (qtyToSell > 1e-12) {
        console.warn(`[fifo] ${ticker}: SELL with incomplete cost basis (missing ${qtyToSell} units)`)
        await client.from("kraken_trades").update({
          realized_pnl: null,
          realized_pnl_gross: null,
          cost_basis_used: null,
        }).eq("id", t.id)
        continue
      }

      const realizedPnl = (price * qty - fee) - costBasis
      const realizedPnlGross = price * qty - costBasisGross

      await client.from("kraken_trades").update({
        realized_pnl: realizedPnl,
        realized_pnl_gross: realizedPnlGross,
        cost_basis_used: costBasis,
        realized_pnl_currency: t.quote_currency,
        realized_pnl_gross_currency: t.quote_currency,
      }).eq("id", t.id)
      recalculated++
    }
  }

  return recalculated
}
