const fxCache: Record<string, number> = {}

const CRYPTO_CG_MAP: Record<string, string> = {
  XBT: "bitcoin", BTC: "bitcoin", XXBT: "bitcoin",
  ETH: "ethereum", XETH: "ethereum",
  XMR: "monero", XXMR: "monero",
  XRP: "ripple", XXRP: "ripple",
  LTC: "litecoin", XLTC: "litecoin",
  SOL: "solana", DOT: "polkadot",
  LINK: "chainlink", AVAX: "avalanche-2",
  ADA: "cardano", ATOM: "cosmos",
  DOGE: "dogecoin", XDOGE: "dogecoin",
  UNI: "uniswap", AAVE: "aave", MKR: "maker",
}

const FIAT_SET = new Set([
  "EUR", "USD", "GBP", "JPY", "CHF",
  "ZEUR", "ZUSD", "ZGBP", "ZJPY", "ZCHF",
  "USDT", "USDC", "DAI",
])

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function cgIdFor(currency: string): string | null {
  return CRYPTO_CG_MAP[currency] || CRYPTO_CG_MAP[currency.replace(/^X/, "")] || null
}

async function getFiatToEur(currency: string, dateISO: string): Promise<number> {
  if (currency === "EUR" || currency === "ZEUR") return 1
  const day = dateISO.slice(0, 10)
  const cur = currency.replace(/^Z/, "")
  const usdLike = ["USDT", "USDC", "DAI"].includes(cur)
  const baseCur = usdLike ? "USD" : cur
  const key = `fiat:${baseCur}:${day}`
  if (key in fxCache) return fxCache[key]
  try {
    const r = await fetch(`https://api.frankfurter.app/${day}?from=${baseCur}&to=EUR`)
    if (!r.ok) throw new Error(`Frankfurter ${r.status}`)
    const data = await r.json()
    const rate = data?.rates?.EUR
    if (!rate) throw new Error("no EUR rate")
    fxCache[key] = rate
    return rate
  } catch {
    const fallback: Record<string, number> = { USD: 0.92, GBP: 1.17, CHF: 1.05, JPY: 0.006 }
    const fb = fallback[baseCur] ?? 1
    console.warn(`[fx-historical] Frankfurter fallback for ${baseCur} ${day}: ${fb}`)
    fxCache[key] = fb
    return fb
  }
}

async function fetchCgHistoryDate(cgId: string, day: string): Promise<number | null> {
  const key = `crypto:${cgId}:${day}`
  if (key in fxCache) return fxCache[key]

  const [yyyy, mm, dd] = day.split("-")
  let lastError = ""

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * Math.pow(2, attempt - 1))
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/${cgId}/history?date=${dd}-${mm}-${yyyy}&localization=false`
      )
      if (r.status === 429) {
        lastError = "429 rate limit"
        continue
      }
      if (!r.ok) throw new Error(`CG ${r.status}`)
      const data = await r.json()
      const price = data?.market_data?.current_price?.eur
      if (!price) throw new Error("no EUR price in response")
      fxCache[key] = price
      return price
    } catch (e: any) {
      lastError = e.message
    }
  }

  console.warn(`[fx-historical] CoinGecko failed for ${cgId} ${day} after 3 attempts: ${lastError}`)
  return null
}

async function getCryptoToEur(currency: string, dateISO: string): Promise<number | null> {
  const day = dateISO.slice(0, 10)
  const cgId = cgIdFor(currency)
  if (!cgId) {
    console.warn(`[fx-historical] no cgId for crypto ${currency}`)
    return null
  }
  return fetchCgHistoryDate(cgId, day)
}

export async function getHistoricalFxToEur(
  currency: string,
  dateISO: string
): Promise<number | null> {
  if (FIAT_SET.has(currency)) {
    return getFiatToEur(currency, dateISO)
  }
  return getCryptoToEur(currency, dateISO)
}

export async function preWarmCryptoDates(
  currency: string,
  dates: string[]
): Promise<{ warmed: number; failed: string[] }> {
  const cgId = cgIdFor(currency)
  if (!cgId) return { warmed: 0, failed: dates }

  let warmed = 0
  const failed: string[] = []

  for (const day of dates) {
    const key = `crypto:${cgId}:${day}`
    if (key in fxCache) { warmed++; continue }

    const price = await fetchCgHistoryDate(cgId, day)
    if (price !== null) {
      warmed++
    } else {
      failed.push(day)
    }
    await sleep(1500)
  }

  console.log(`[fx-historical] pre-warmed ${cgId}: ${warmed} dates, ${failed.length} failed`)
  return { warmed, failed }
}
