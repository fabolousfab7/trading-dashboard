import { XMLParser } from "fast-xml-parser"

const FLEX_BASE_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService"
const SEND_REQUEST_PATH = "SendRequest"
const GET_STATEMENT_PATH = "GetStatement"
const API_VERSION = "3"

export interface FlexOpenPosition {
  accountId: string
  symbol: string
  description?: string
  quantity: number
  markPrice: number
  positionValue: number
  openPrice: number
  costBasisPrice?: number
  currency: string
  fxRateToBase?: number
  assetCategory?: string
  fifoPnlUnrealized?: number
}

export interface FlexCashBalance {
  accountId: string
  currency: string
  endingCash: number
  endingSettledCash: number
}

export interface FlexTrade {
  accountId: string
  tradeID?: string
  symbol: string
  description?: string
  assetCategory?: string
  currency: string
  exchange?: string
  tradeDate: string
  tradeTime?: string
  settleDateTarget?: string
  buySell?: string
  quantity: number
  tradePrice: number
  proceeds?: number
  ibCommission?: number
  netCash: number
  fifoPnlRealized?: number
  fxRateToBase?: number
}

export interface FlexStmtOfFundsLine {
  accountId: string
  currency: string
  date: string
  activityCode?: string
  activityDescription?: string
  description?: string
  amount: number
}

export interface FlexStatementData {
  accountId: string
  fromDate: string
  toDate: string
  whenGenerated: string
  openPositions: FlexOpenPosition[]
  cashBalances: FlexCashBalance[]
  trades: FlexTrade[]
  stmtFunds: FlexStmtOfFundsLine[]
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  trimValues: true,
})

function num(v: unknown): number {
  if (v === undefined || v === null || v === "") return 0
  const n = parseFloat(String(v))
  return Number.isNaN(n) ? 0 : n
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fetchWithTimeout(url: string, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { method: "GET", signal: controller.signal })
    .catch((err) => {
      if (err.name === "AbortError") throw new Error("IBKR_FLEX_TIMEOUT")
      throw err
    })
    .finally(() => clearTimeout(timer))
}

async function sendRequest(token: string, queryId: string, maxAttempts = 5, delayMs = 25_000): Promise<string> {
  const url = `${FLEX_BASE_URL}.${SEND_REQUEST_PATH}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=${API_VERSION}`

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchWithTimeout(url)
    if (!response.ok) {
      throw new Error(`Flex SendRequest failed: HTTP ${response.status}`)
    }
    const xml = await response.text()
    const parsed = xmlParser.parse(xml)
    const root = parsed.FlexStatementResponse

    if (!root) {
      throw new Error("Flex SendRequest: response not in expected format")
    }

    if (root.Status === "Success") {
      const referenceCode = root.ReferenceCode
      if (!referenceCode) {
        throw new Error("Flex SendRequest: no ReferenceCode returned")
      }
      return String(referenceCode)
    }

    const errorCode = root.ErrorCode
    const errorMessage = root.ErrorMessage || "Unknown error"

    if (String(errorCode) === "1001" && attempt < maxAttempts) {
      console.log(`[ibkr-flex] SendRequest attempt ${attempt}/${maxAttempts} failed with 1001 (${errorMessage}). Retrying in ${delayMs / 1000}s...`)
      await sleep(delayMs)
      continue
    }

    if (String(errorCode) === "1001") {
      throw new Error(`IBKR_RATE_LIMIT: ${errorMessage}`)
    }
    throw new Error(`IBKR_API_ERROR_${errorCode}: ${errorMessage}`)
  }

  throw new Error("Flex SendRequest: unexpected exit from retry loop")
}

async function getStatement(
  token: string,
  referenceCode: string,
  maxAttempts = 8,
  delayMs = 10_000,
): Promise<string> {
  const url = `${FLEX_BASE_URL}.${GET_STATEMENT_PATH}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=${API_VERSION}`

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchWithTimeout(url)
    if (!response.ok) {
      throw new Error(`Flex GetStatement failed: HTTP ${response.status}`)
    }
    const xml = await response.text()

    if (xml.includes("<FlexStatementResponse")) {
      const parsed = xmlParser.parse(xml)
      const root = parsed.FlexStatementResponse
      const status = root?.Status
      const errorCode = root?.ErrorCode

      if (status === "Warn" || errorCode === 1019) {
        if (attempt < maxAttempts) {
          console.log(`[ibkr-flex] GetStatement attempt ${attempt}/${maxAttempts}: report not ready (${errorCode}). Retrying in ${delayMs / 1000}s...`)
          await sleep(delayMs)
          continue
        }
        throw new Error("Flex GetStatement: timeout, report not ready after max attempts")
      }
      if (status !== "Success") {
        const errorMessage = root?.ErrorMessage || "Unknown error"
        throw new Error(`Flex GetStatement error ${errorCode}: ${errorMessage}`)
      }
    }

    return xml
  }

  throw new Error("Flex GetStatement: unexpected exit from retry loop")
}

export function parseFlexReport(xml: string): FlexStatementData {
  const parsed = xmlParser.parse(xml)
  const flexQueryResponse = parsed.FlexQueryResponse
  if (!flexQueryResponse) {
    throw new Error("Flex parse: missing FlexQueryResponse root")
  }

  const flexStatementsNode = flexQueryResponse.FlexStatements
  const statements = asArray(flexStatementsNode?.FlexStatement)
  if (statements.length === 0) {
    throw new Error("Flex parse: no FlexStatement found")
  }
  const stmt = statements[0]

  const openPositionsNode = stmt.OpenPositions
  const openPositions: FlexOpenPosition[] = asArray(openPositionsNode?.OpenPosition).map((p: any) => {
    // Flex Query uses `position` attribute, not `quantity`. Fallback for compat.
    // `positionValue` is not provided by Flex for OpenPositions — compute it.
    const quantity = num(p.position ?? p.quantity)
    const markPrice = num(p.markPrice)
    return {
      accountId: p.accountId,
      symbol: p.symbol,
      description: p.description,
      quantity,
      markPrice,
      positionValue: num(p.positionValue) || quantity * markPrice,
      openPrice: num(p.openPrice),
      costBasisPrice: p.costBasisPrice ? num(p.costBasisPrice) : undefined,
      currency: p.currency,
      fxRateToBase: p.fxRateToBase ? num(p.fxRateToBase) : undefined,
      assetCategory: p.assetCategory,
      fifoPnlUnrealized: p.fifoPnlUnrealized ? num(p.fifoPnlUnrealized) : undefined,
    }
  })

  const cashReportNode = stmt.CashReport
  const cashBalances: FlexCashBalance[] = asArray(cashReportNode?.CashReportCurrency)
    .filter((c: any) => c.currency && c.currency !== "BASE_SUMMARY")
    .map((c: any) => ({
      accountId: c.accountId,
      currency: c.currency,
      endingCash: num(c.endingCash),
      endingSettledCash: num(c.endingSettledCash),
    }))

  const tradesNode = stmt.Trades
  const trades: FlexTrade[] = asArray(tradesNode?.Trade).map((t: any) => ({
    accountId: t.accountId,
    tradeID: t.tradeID,
    symbol: t.symbol,
    description: t.description,
    assetCategory: t.assetCategory,
    currency: t.currency,
    exchange: t.exchange,
    tradeDate: t.tradeDate,
    tradeTime: t.tradeTime,
    settleDateTarget: t.settleDateTarget,
    buySell: t.buySell,
    quantity: num(t.quantity),
    tradePrice: num(t.tradePrice),
    proceeds: t.proceeds != null ? num(t.proceeds) : undefined,
    ibCommission: t.ibCommission != null ? num(t.ibCommission) : undefined,
    netCash: num(t.netCash),
    fifoPnlRealized: t.fifoPnlRealized != null ? num(t.fifoPnlRealized) : undefined,
    fxRateToBase: t.fxRateToBase ? num(t.fxRateToBase) : undefined,
  }))

  const stmtFundsNode = stmt.StmtFunds
  const stmtFunds: FlexStmtOfFundsLine[] = asArray(stmtFundsNode?.StatementOfFundsLine).map((s: any) => ({
    accountId: s.accountId,
    currency: s.currency,
    date: s.date,
    activityCode: s.activityCode,
    activityDescription: s.activityDescription,
    description: s.description,
    amount: num(s.amount),
  }))

  return {
    accountId: stmt.accountId,
    fromDate: stmt.fromDate,
    toDate: stmt.toDate,
    whenGenerated: stmt.whenGenerated,
    openPositions,
    cashBalances,
    trades,
    stmtFunds,
  }
}

export async function fetchFlexReport(token: string, queryId: string): Promise<FlexStatementData> {
  const referenceCode = await sendRequest(token, queryId)
  await sleep(3000)
  const xml = await getStatement(token, referenceCode)
  return parseFlexReport(xml)
}

export async function requestFlexReport(token: string, queryId: string): Promise<string> {
  return sendRequest(token, queryId)
}

async function getStatementOnce(token: string, referenceCode: string): Promise<{ ready: true; xml: string } | { ready: false }> {
  const url = `${FLEX_BASE_URL}.${GET_STATEMENT_PATH}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=${API_VERSION}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) {
    throw new Error(`Flex GetStatement failed: HTTP ${response.status}`)
  }
  const xml = await response.text()

  if (xml.includes("<FlexStatementResponse")) {
    const parsed = xmlParser.parse(xml)
    const root = parsed.FlexStatementResponse
    const status = root?.Status
    const errorCode = root?.ErrorCode

    if (status === "Warn" || errorCode === 1019) {
      console.log(`[ibkr-flex] getStatementOnce: report not ready (${errorCode})`)
      return { ready: false }
    }
    if (status !== "Success") {
      const errorMessage = root?.ErrorMessage || "Unknown error"
      throw new Error(`Flex GetStatement error ${errorCode}: ${errorMessage}`)
    }
  }

  return { ready: true, xml }
}

export async function retrieveFlexReport(token: string, referenceCode: string): Promise<FlexStatementData | null> {
  const result = await getStatementOnce(token, referenceCode)
  if (!result.ready) return null
  return parseFlexReport(result.xml)
}

export function calculateNlvInBase(data: FlexStatementData, baseCurrency = "EUR"): {
  nlvBase: number
  positionsValueBase: number
  cashValueBase: number
  fxEurUsd?: number
} {
  const fxByCurrency: Record<string, number> = { [baseCurrency]: 1 }
  for (const p of data.openPositions) {
    if (p.fxRateToBase && !fxByCurrency[p.currency]) {
      fxByCurrency[p.currency] = p.fxRateToBase
    }
  }

  const positionsValueBase = data.openPositions.reduce((sum, p) => {
    const fx = fxByCurrency[p.currency] || 1
    return sum + p.positionValue * fx
  }, 0)

  const cashValueBase = data.cashBalances.reduce((sum, c) => {
    const fx = fxByCurrency[c.currency] || 1
    return sum + c.endingCash * fx
  }, 0)

  const usdRate = fxByCurrency.USD
  const fxEurUsd = usdRate ? 1 / usdRate : undefined

  return {
    nlvBase: positionsValueBase + cashValueBase,
    positionsValueBase,
    cashValueBase,
    fxEurUsd,
  }
}
