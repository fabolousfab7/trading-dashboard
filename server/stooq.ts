export async function fetchStooqPrice(stooqSymbol: string): Promise<number | null> {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const csv = await response.text()
    const lines = csv.trim().split("\n")
    if (lines.length < 2) return null
    const values = lines[1].split(",")
    if (values.length < 7) return null
    const close = parseFloat(values[6])
    if (Number.isNaN(close) || close === 0) return null
    return close
  } catch {
    return null
  }
}

export function defaultStooqSymbol(ticker: string, currency: string): string {
  const t = ticker.toLowerCase()
  if (currency === "USD") return `${t}.us`
  return `${t}.fr`
}
