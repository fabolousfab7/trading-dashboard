export async function fetchCoinGeckoPrices(
  coingeckoIds: string[],
  currency: string = "eur"
): Promise<Record<string, number>> {
  if (coingeckoIds.length === 0) return {}
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds.map(encodeURIComponent).join(",")}&vs_currencies=${currency}`
  try {
    const response = await fetch(url)
    if (!response.ok) return {}
    const data = await response.json()
    const result: Record<string, number> = {}
    for (const id of coingeckoIds) {
      if (data[id]?.[currency] !== undefined) result[id] = data[id][currency]
    }
    return result
  } catch {
    return {}
  }
}
