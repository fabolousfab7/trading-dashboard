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
