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
