interface ForexEvent {
  title: string
  country: string
  date: string
  time: string
  impact: string
  forecast: string
  previous: string
  actual: string
}

let cachedEvents: ForexEvent[] = []
let cacheTimestamp = 0
const CACHE_TTL = 30 * 60 * 1000

export async function fetchHighImpactEvents(): Promise<ForexEvent[]> {
  if (Date.now() - cacheTimestamp < CACHE_TTL && cachedEvents.length > 0) {
    return cachedEvents
  }

  const today = new Date()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay())
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)

  const fmt = (d: Date) =>
    `${d.toLocaleString("en-US", { month: "short" })}${d.getDate()}.${d.getFullYear()}`
  const url = `https://www.forexfactory.com/calendar?week=${fmt(sunday)}`

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })
    if (!resp.ok) throw new Error(`FF ${resp.status}`)
    const html = await resp.text()

    const events: ForexEvent[] = []
    let currentDate = ""

    const rowRegex = /<tr[^>]*class="[^"]*calendar__row[^"]*"[^>]*>([\s\S]*?)<\/tr>/g
    let rowMatch
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1]

      const dateMatch = row.match(
        /<td[^>]*class="[^"]*calendar__date[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
      )
      if (dateMatch) {
        currentDate = dateMatch[1].replace(/<[^>]+>/g, "").trim()
      }

      const impactMatch = row.match(
        /<td[^>]*class="[^"]*calendar__impact[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*high[^"]*"/
      )
      if (!impactMatch) continue

      const countryMatch = row.match(
        /<td[^>]*class="[^"]*calendar__currency[^"]*"[^>]*>([\s\S]*?)<\/td>/
      )
      const timeMatch = row.match(
        /<td[^>]*class="[^"]*calendar__time[^"]*"[^>]*>([\s\S]*?)<\/td>/
      )
      const titleMatch = row.match(
        /<td[^>]*class="[^"]*calendar__event[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*calendar__event-title[^"]*"[^>]*>([\s\S]*?)<\/span>/
      )
      const forecastMatch = row.match(
        /<td[^>]*class="[^"]*calendar__forecast[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
      )
      const previousMatch = row.match(
        /<td[^>]*class="[^"]*calendar__previous[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
      )
      const actualMatch = row.match(
        /<td[^>]*class="[^"]*calendar__actual[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
      )

      const clean = (s?: string) =>
        (s || "")
          .replace(/<[^>]+>/g, "")
          .trim()

      if (titleMatch) {
        events.push({
          title: clean(titleMatch[1]),
          country: clean(countryMatch?.[1]),
          date: currentDate,
          time: clean(timeMatch?.[1]),
          impact: "High",
          forecast: clean(forecastMatch?.[1]),
          previous: clean(previousMatch?.[1]),
          actual: clean(actualMatch?.[1]),
        })
      }
    }

    cachedEvents = events
    cacheTimestamp = Date.now()
    return events
  } catch (err) {
    console.error("[forex-factory] scrape error:", err)
    return cachedEvents
  }
}
