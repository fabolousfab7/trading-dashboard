export interface MarketEvent {
  title: string
  country: string
  date: string
  impact: string
  forecast: string
  previous: string
  actual: string
}

let cache: { events: MarketEvent[]; ts: number } | null = null
const CACHE_TTL = 30 * 60 * 1000

export async function fetchHighImpactEvents(): Promise<MarketEvent[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.events

  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json")
    if (!res.ok) return cache?.events || []
    const data: any[] = await res.json()

    const todayStr = new Date().toISOString().slice(0, 10)

    const events = data
      .filter((e: any) => e.impact === "High")
      .filter((e: any) => e.date && e.date.slice(0, 10) === todayStr)
      .map((e: any) => ({
        title: e.title || "",
        country: e.country || "",
        date: e.date || "",
        impact: e.impact || "",
        forecast: e.forecast || "",
        previous: e.previous || "",
        actual: e.actual || "",
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    cache = { events, ts: Date.now() }
    return events
  } catch (e) {
    console.error("[forex-factory] fetch error:", e)
    return cache?.events || []
  }
}
