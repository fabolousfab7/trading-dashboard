export async function fetchYahooHistory(
  ticker: string,
  suffix: string = "PA",
  days: number = 30
): Promise<{ date: string; price: number }[]> {
  const symbol = suffix ? `${ticker}.${suffix}` : ticker
  const range = days <= 7 ? "5d" : days <= 30 ? "1mo" : days <= 90 ? "3mo" : "6mo"
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`)
  const data = await response.json()
  const result = data?.chart?.result?.[0]
  const timestamps: number[] = result?.timestamp || []
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || []
  const points: { date: string; price: number }[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const price = closes[i]
    if (typeof price === "number" && price > 0) {
      points.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), price })
    }
  }
  return points
}

export async function fetchYahooPrice(ticker: string, suffix: string = "PA"): Promise<number | null> {
  const symbol = suffix ? `${ticker}.${suffix}` : ticker
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    if (!response.ok) return null
    const data = await response.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    if (typeof price === "number" && price > 0) return price
    return null
  } catch {
    return null
  }
}
