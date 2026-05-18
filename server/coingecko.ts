export async function fetchCoinGeckoHistory(
  coingeckoId: string,
  days: number = 30
): Promise<{ date: string; price: number }[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=eur&days=${days}&interval=daily`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`)
  const data = await response.json()
  const prices: number[][] = data?.prices || []
  return prices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().slice(0, 10),
    price,
  }))
}

export async function fetchCoinGeckoPrices(
  coingeckoIds: string[],
  currencies: string[] = ["eur", "usd"]
): Promise<Record<string, Record<string, number>>> {
  if (coingeckoIds.length === 0) return {}
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds.map(encodeURIComponent).join(",")}&vs_currencies=${currencies.join(",")}`
  try {
    const response = await fetch(url)
    if (!response.ok) return {}
    const data = await response.json()
    const result: Record<string, Record<string, number>> = {}
    for (const id of coingeckoIds) {
      if (data[id]) result[id] = data[id]
    }
    return result
  } catch {
    return {}
  }
}
