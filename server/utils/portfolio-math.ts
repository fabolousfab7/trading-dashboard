export function normalizeTicker(ticker: string): string {
  return ticker.replace(/_R$/, "")
}

export const DERIVATIVE_ASSET_CLASSES = ["crypto_perp", "crypto_futures", "FUT"]

export function isDerivative(assetClass: string | null | undefined): boolean {
  if (!assetClass) return false
  return DERIVATIVE_ASSET_CLASSES.includes(assetClass)
}

export function getPositionValueEur(p: {
  asset_class?: string | null
  quantity?: string | number | null
  market_price?: string | number | null
  fx_rate_to_base?: string | number | null
  unrealized_pnl?: string | number | null
  ownership_pct?: string | number | null
}): number {
  const fx = Number(p.fx_rate_to_base) || 1

  if (isDerivative(p.asset_class)) {
    return (Number(p.unrealized_pnl) || 0) * fx
  }

  const qty = Number(p.quantity) || 0
  const price = Number(p.market_price) || 0
  const own = (Number(p.ownership_pct) || 100) / 100
  return qty * price * fx * own
}
