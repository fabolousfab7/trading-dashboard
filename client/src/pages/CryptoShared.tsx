import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { RefreshCw } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import PositionNoteModal from "@/components/PositionNoteModal"
import AllocBar from "@/components/AllocBar"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55", "#9a988f", "#4a4540", "#d4a057", "#6b8f71", "#8b6b4a"]

const CRYPTO_CATEGORY: Record<string, string> = {
  "BTC": "Store of Value",
  "ETH": "L1 / Smart Contracts",
  "HYPE": "DeFi / DEX",
  "AAVE": "DeFi",
  "EIGEN": "DeFi / Restaking",
  "ZRO": "Infra / Bridge",
  "BP": "DEX / Infra",
  "PUMP": "DeFi / Memecoin",
  "DIME": "DEX / Perp",
  "SUPRA": "L1",
  "XPL": "L1",
  "ILV": "Gaming",
  "GUN": "Gaming",
  "TSLAX": "Tokenized / RWA",
  "WLFI": "Tokenized / RWA",
  "USDT": "Stablecoin",
  "USDC": "Stablecoin",
  "USDT0": "Stablecoin",
  "DAI": "Stablecoin",
  "USDe": "Stablecoin",
}

interface Position {
  id: string
  account_id: string
  ticker: string
  name: string
  quantity: string | number
  avg_cost: string | number
  market_price: string | number
  market_price_usd?: string | number
  ownership_pct?: string | number
  currency: string
}

interface Account {
  id: string
  label: string
  broker: string
  currency_base?: string
  capital_invested?: string | number
}

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

function fmtUsdPrice(n: number) {
  if (Math.abs(n) < 1) return `$${n.toFixed(6)}`
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n)
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
}

function fmtQty(n: number) {
  if (n < 1) return n.toFixed(6)
  if (n < 100) return n.toFixed(4)
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

const tooltipStyle = {
  background: "var(--at-surface)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontFamily: "'Geist Mono', monospace",
  fontSize: 12,
  color: "var(--ink)",
}

export default function CryptoShared() {
  const [account, setAccount] = useState<Account | null>(null)
  const [data, setData] = useState<{ positions: Position[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const r = await authFetch("/api/accounts")
      const { accounts } = await r.json()
      const crypto = accounts?.find((a: Account) => a.broker === "Crypto")
      if (!crypto) { setLoading(false); return }
      setAccount(crypto)
      const r2 = await authFetch(`/api/accounts/${crypto.id}/portfolio`)
      setData(await r2.json())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  async function refreshPrices() {
    if (!account) return
    setRefreshing(true); setError(null)
    try {
      const r = await authFetch(`/api/accounts/${account.id}/refresh-prices`, { method: "POST" })
      const result = await r.json()
      if (result.failed > 0 && result.failedTickers?.length) {
        setError(`Échec : ${result.failedTickers.join(", ")} — vérifie les coingecko_id`)
      }
      await loadData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally { setRefreshing(false) }
  }

  if (loading) return <div className="p-8 text-[--ink2] font-mono text-sm">Chargement...</div>

  if (!account) {
    return (
      <div style={{ padding: "28px 32px" }}>
        <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            Crypto R+F &middot; 50/50
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Le sac partagé.
          </h1>
        </div>
        <div style={{ marginTop: 28, border: "1px solid var(--rule)", background: "var(--at-surface)", borderRadius: 4, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--ink2)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Aucun compte Crypto configuré</p>
        </div>
      </div>
    )
  }

  const positions: Position[] = (data?.positions || []).filter((p) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    const own = Number(p.ownership_pct) || 100
    return qty !== 0 && price !== 0 && own < 100
  })

  const totalUsd = positions.reduce((s, p) => s + Number(p.quantity) * (Number(p.market_price_usd) || 0), 0)
  const totalEur = positions.reduce((s, p) => s + Number(p.quantity) * Number(p.market_price), 0)
  const myPartUsd = totalUsd / 2
  const myPartEur = totalEur / 2

  const capitalInvested = Number(account.capital_invested) || 0
  const impliedCapital = capitalInvested || positions.reduce((s, p) => s + Number(p.quantity) * Number(p.avg_cost), 0)

  const unrealizedPnl = positions.reduce((s, p) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price_usd) || 0
    const cost = Number(p.avg_cost)
    return s + qty * (price - cost)
  }, 0)

  const apportsCumules = impliedCapital
  const pvCumulee = totalUsd - apportsCumules
  const netLiquidation = totalUsd - Math.max(0, pvCumulee) * 0.30

  const sortedPositions = [...positions].sort((a, b) =>
    (Number(b.quantity) * (Number(b.market_price_usd) || 0)) - (Number(a.quantity) * (Number(a.market_price_usd) || 0))
  )

  const categoryMap: Record<string, number> = {}
  for (const p of positions) {
    const ticker = p.ticker.replace(/_R$/, "")
    const cat = CRYPTO_CATEGORY[ticker] || "Autres"
    const value = Number(p.quantity) * (Number(p.market_price_usd) || 0)
    categoryMap[cat] = (categoryMap[cat] || 0) + value
  }
  const categoryData = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
  const categoryTotal = categoryData.reduce((s, d) => s + d.value, 0)

  return (
    <div style={{ padding: "28px 32px" }}>

      {/* ── MASTHEAD ──────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            Crypto R+F &middot; 50/50
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Le sac partagé.
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <button onClick={refreshPrices} disabled={refreshing}
            style={{
              padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
              background: "var(--at-accent)", border: "1px solid var(--at-accent)", color: "var(--at-bg)", borderRadius: 3,
              cursor: refreshing ? "wait" : "pointer", opacity: refreshing ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 6, transition: "opacity .15s",
            }}>
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Sync prix
          </button>
        </div>
      </div>

      {/* ── ERRORS ────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: "color-mix(in srgb, var(--at-neg) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--at-neg) 30%, transparent)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--at-neg)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{error}</span>
          <button onClick={() => setError(null)} style={{ color: "var(--at-neg)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* ── KPI ROW ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        {/* Valeur totale */}
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Valeur totale
            <InfoTip text="Valeur totale du portefeuille partagé (quantités réelles × cours CoinGecko)." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtUsd(totalUsd)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            {fmtEur(totalEur)}
          </div>
        </div>

        {/* Ma part (50%) */}
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Ma part (50 %)
            <InfoTip text="Quote-part Florent = Valeur totale × 50 %." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--at-accent)", marginTop: 6, letterSpacing: -0.5 }}>
            {fmtUsd(myPartUsd)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            {fmtEur(myPartEur)}
          </div>
        </div>

        {/* P&L latent */}
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
            P&L latent
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: unrealizedPnl >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {unrealizedPnl >= 0 ? "+" : ""}{fmtUsd(unrealizedPnl)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            total portefeuille
          </div>
        </div>

        {/* Apports cumulés */}
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Apports cumulés
            <InfoTip text="Capital total investi par les deux associés. Sert de base au calcul de la PV." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {impliedCapital > 0 ? fmtUsd(apportsCumules) : "—"}
          </div>
          {impliedCapital > 0 && (
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
              {fmtUsd(apportsCumules / 2)} chacun
            </div>
          )}
        </div>
      </div>

      {/* ── GRID 2:1 — TABLE + DONUT ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "2.1fr 1fr", gap: 28, alignItems: "start" }}>

        {/* LEFT — Positions table */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>
              Positions ouvertes
            </span>
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
              {positions.length} lignes &middot; valeurs réelles (100 %)
            </span>
          </div>

          {positions.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Aucune position partagée
            </div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto", border: "1px solid var(--rule)", borderRadius: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--at-surface)", zIndex: 1 }}>
                    {["Ticker", "Nom", "Catégorie", "Poids", "Qté", "PRU", "Cours", "Valeur", "Ma part", "Var 24h", "P&L"].map((h, i) => (
                      <th key={h} style={{
                        padding: "10px 12px",
                        textAlign: i < 4 ? "left" : "right",
                        fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600,
                        borderBottom: "1px solid var(--rule)",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((p) => {
                    const qty = Number(p.quantity)
                    const priceUsd = Number(p.market_price_usd) || 0
                    const pru = Number(p.avg_cost)
                    const valueUsd = qty * priceUsd
                    const myPart = valueUsd / 2
                    const pnl = pru > 0 ? qty * (priceUsd - pru) : 0
                    const pnlPct = pru > 0 ? ((priceUsd - pru) / pru) * 100 : 0
                    const weight = totalUsd > 0 ? (valueUsd / totalUsd) * 100 : 0
                    const ticker = p.ticker.replace(/_R$/, "")
                    const cat = CRYPTO_CATEGORY[ticker] || "Autres"

                    return (
                      <tr key={p.id}
                        onClick={() => setSelectedPosition(p)}
                        style={{ borderBottom: "1px dotted var(--rule)", cursor: "pointer", transition: "background .15s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--at-accent) 5%, transparent)" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}>
                        <td style={{ padding: "9px 12px", fontFamily: "var(--font-serif)", fontWeight: 700, color: "var(--ink)" }}>
                          {ticker}
                        </td>
                        <td style={{ padding: "9px 12px", fontStyle: "italic", color: "var(--ink3)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {(p.name || "").replace(/\s*\([^)]+\)\s*/g, "").trim() || "—"}
                        </td>
                        <td style={{ padding: "9px 12px", fontSize: 10, color: "var(--ink2)" }}>
                          {cat}
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <AllocBar value={weight} />
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {fmtQty(qty)}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>
                          {pru > 0 ? fmtUsdPrice(pru) : "—"}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {fmtUsdPrice(priceUsd)}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--ink)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {fmtUsd(valueUsd)}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--at-accent)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {fmtUsd(myPart)}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink3)" }}>
                          —
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {pru > 0 ? (
                            <>
                              <span style={{ color: pnl >= 0 ? "var(--at-pos)" : "var(--at-neg)", fontWeight: 600 }}>
                                {pnl >= 0 ? "+" : ""}{fmtUsd(pnl)}
                              </span>
                              <span style={{ color: "var(--ink3)", marginLeft: 6, fontSize: 10 }}>
                                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "var(--ink3)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT — Category allocation donut */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>
              Allocation
            </span>
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>
              Par catégorie
            </span>
          </div>

          {categoryData.length > 0 && (
            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={70} innerRadius={48} strokeWidth={1.5} stroke="var(--at-bg)">
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--ink)" }} labelStyle={{ color: "var(--ink2)" }}
                    formatter={(value: number, name: string) => [fmtUsd(value), name]} />
                </PieChart>
              </ResponsiveContainer>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                {categoryData.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-serif)", color: "var(--ink2)", flex: 1 }}>{d.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                      {((d.value / categoryTotal) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── QUOTE-PART FLORENT ────────────────────────────────── */}
      {impliedCapital > 0 && (
        <div style={{
          marginTop: 28, border: "1px solid var(--rule)", background: "var(--at-surface)",
          borderRadius: 4, padding: 16,
        }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", marginBottom: 14 }}>
            Suivi de la quote-part
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", color: "var(--ink2)" }}>Apports Florent</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
                {fmtUsd(apportsCumules / 2)}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", color: "var(--ink2)" }}>Apports Romain</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
                {fmtUsd(apportsCumules / 2)}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", color: "var(--ink2)" }}>Plus-value cumulée</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: pvCumulee >= 0 ? "var(--at-pos)" : "var(--at-neg)", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
                {pvCumulee >= 0 ? "+" : ""}{fmtUsd(pvCumulee)}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", color: "var(--ink2)" }}>Net si liquidation</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
                {fmtUsd(netLiquidation)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)", marginTop: 2 }}>
                PFU 30 %
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── POSITION NOTE MODAL ───────────────────────────────── */}
      {selectedPosition && (
        <PositionNoteModal
          isOpen={!!selectedPosition}
          onClose={() => setSelectedPosition(null)}
          ticker={selectedPosition.ticker.replace(/_R$/, "")}
          accountId={selectedPosition.account_id}
          positionId={selectedPosition.id}
          currency="USD"
        />
      )}
    </div>
  )
}
