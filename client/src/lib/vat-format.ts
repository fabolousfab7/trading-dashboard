import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"

export function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n)
}

export function getMonthLabel(periodMonth: string): string {
  const normalized = periodMonth.length === 7 ? `${periodMonth}-01` : periodMonth
  const label = format(parseISO(normalized), "MMMM yyyy", { locale: fr })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function getShortMonthLabel(periodMonth: string): string {
  const normalized = periodMonth.length === 7 ? `${periodMonth}-01` : periodMonth
  const label = format(parseISO(normalized), "MMM yy", { locale: fr })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function getFilingDeadline(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, "0")}-24`
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

export function fmtDate(d: string): string {
  if (!d) return ""
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return `${py}-${String(pm).padStart(2, "0")}`
}

export function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}
