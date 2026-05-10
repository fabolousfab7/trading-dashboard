import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Coins, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Link } from "wouter"
import InfoTip from "@/components/InfoTip"
import { useToast } from "@/hooks/use-toast"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55", "#9a988f", "#4a4540", "#d4a057", "#6b8f71", "#8b6b4a"]
const CASH_COLORS = ["#7d2b1d", "#cfb88f"]
const STABLECOINS = ["USDT", "USDC", "DAI", "BUSD", "TUSD", "UST"]

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n)
}

export default function Kraken() {
  const { toast } = useToast()
  const [portfolio, setPortfolio] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comptaCapital, setComptaCapital] = useState<number>(0)
  const [showConfig, setShowConfig] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [savingConfig, setSavingConfig] = useState(false)

  async function fetchPortfolio() {
    setLoading(true); setError(null)
    try {
      const [r, capR] = await Promise.all([
        authFetch("/api/kraken/portfolio"),
        authFetch("/api/compta/capital-invested?category=512200"),
      ])
      const data = await r.json()
      setPortfolio(data)
      if (!data.hasCredentials) setShowConfig(true)
      try {
        const capData = await capR.json()
        if (capData.capital_invested > 0) setComptaCapital(capData.capital_invested)
      } catch {}
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setLoading(false) }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const r = await authFetch("/api/kraken/sync", { method: "POST" })
      if (!r.ok) {
        const err = await r.json()
        toast({ title: "Erreur sync", description: err.error })
      } else {
        const data = await r.json()
        toast({ title: "Sync OK", description: data.message })
        fetchPortfolio()
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message })
    } finally { setSyncing(false) }
  }

  async function saveConfig() {
    if (!portfolio?.account) return
    setSavingConfig(true)
    try {
      const r = await authFetch("/api/kraken/config", {
        method: "PUT",
        body: JSON.stringify({ accountId: portfolio.account.id, apiKey, apiSecret }),
      })
      if (!r.ok) {
        const err = await r.json()
        toast({ title: "Erreur", description: err.error })
      } else {
        toast({ title: "Config sauvegardée", description: "Credentials API Kraken enregistrées" })
        setShowConfig(false)
        fetchPortfolio()
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message })
    } finally { setSavingConfig(false) }
  }

  useEffect(() => { fetchPortfolio() }, [])

  if (loading) return <div className="p-8 text-[--ink2] font-mono text-sm">Chargement...</div>
  if (error) return <div className="p-8 text-[--at-neg] font-mono text-sm">Erreur : {error}</div>
  if (!portfolio?.account) {
    return (
      <div className="p-8">
        <div className="border border-[--rule] bg-[--at-surface] rounded p-6 text-center max-w-md mx-auto mt-12">
          <Coins size={32} className="mx-auto text-[--at-accent] mb-3" />
          <h2 className="text-sm font-serif font-bold text-[--ink] mb-2">Aucun compte Kraken</h2>
          <p className="text-xs text-[--ink3] font-mono">
            Créez un compte avec le broker "Kraken" dans les paramètres pour activer cette page.
          </p>
        </div>
      </div>
    )
  }

  const positions = portfolio.positions || []
  const cashBalances = portfolio.cashBalances || []

  const positionsValue = positions.reduce((s: number, p: any) => {
    const fx = Number(p.fx_rate_to_base) || 1
    return s + Number(p.quantity) * Number(p.market_price) * fx
  }, 0)
  const cashValue = cashBalances.reduce((s: number, c: any) => {
    const fx = Number(c.fx_rate_to_base) || 1
    return s + Number(c.amount) * fx
  }, 0)
  const nlv = positionsValue + cashValue
  const capital = comptaCapital || 0
  const pnl = capital > 0 ? nlv - capital : 0
  const perf = capital > 0 ? (pnl / capital) * 100 : 0

  const tooltipStyle = { background: "#fbf8f1", border: "1px solid #d9d3c4", borderRadius: 8, fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "#1a1814" }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[--rule] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[--at-accent] text-xs font-mono uppercase tracking-widest">
            <Coins size={14} /> Kraken Business
          </div>
          <h1 className="text-3xl font-mono font-bold tracking-wider mt-1">
            <span className="text-[--at-accent]">Crypto </span>
            <span className="text-[--at-accent]">FHF</span>
          </h1>
          <p className="text-[10px] text-[--ink3] font-mono uppercase tracking-wider mt-1">
            Compte 512200 · Spot
            {portfolio.lastSyncedAt && <> · Sync {new Date(portfolio.lastSyncedAt).toLocaleString("fr-FR")}</>}
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing || !portfolio.hasCredentials}
          className="px-4 py-2 bg-[--at-accent]/10 border border-[--rule] text-[--at-accent] hover:bg-[--at-accent]/20 transition rounded font-mono text-xs uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Sync..." : "Sync Kraken"}
        </button>
      </div>

      {/* Config Panel */}
      <div className="border border-[--rule] bg-[--at-surface] rounded">
        <button onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center justify-between p-3 text-xs font-mono uppercase tracking-wider text-[--ink2] hover:text-[--at-accent] transition">
          <span>Configuration API</span>
          {showConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showConfig && (
          <div className="px-4 pb-4 space-y-3 border-t border-[--rule]">
            <p className="text-[10px] text-[--ink3] font-mono mt-3">
              Créez une API key read-only sur kraken.com/u/security/api. Permissions requises : Query Funds.
            </p>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-[--ink3] mb-1 block">API Key</label>
              <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
                className="w-full bg-[--at-bg] border border-[--rule] rounded px-3 py-2 text-xs font-mono text-[--ink] focus:outline-none focus:border-[--at-accent]"
                placeholder="Votre API key Kraken" />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-[--ink3] mb-1 block">API Secret</label>
              <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                className="w-full bg-[--at-bg] border border-[--rule] rounded px-3 py-2 text-xs font-mono text-[--ink] focus:outline-none focus:border-[--at-accent]"
                placeholder="Votre API secret (base64)" />
            </div>
            <button onClick={saveConfig} disabled={savingConfig || !apiKey || !apiSecret}
              className="px-4 py-2 bg-[--at-accent] text-white rounded font-mono text-xs uppercase tracking-wider hover:bg-[--at-accent]/90 disabled:opacity-50">
              {savingConfig ? "..." : "Sauvegarder"}
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border border-[--rule] bg-[--at-surface] rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2 flex items-center">
            NLV KRAKEN<InfoTip text="Net Liquidation Value = Cash fiat + Valeur marchande des crypto en EUR." />
          </div>
          <div className="text-2xl font-mono font-bold text-[--at-accent]">{fmtEur(nlv)}</div>
          <div className="text-xs font-mono mt-1">
            <span className="text-[--at-accent]">Crypto {fmtEur(positionsValue)}</span>
            <span className="text-[--ink3] mx-1">·</span>
            <span className="text-[--at-accent]">Fiat {fmtEur(cashValue)}</span>
          </div>
        </div>
        <div className="border border-[--rule] bg-[--at-surface] rounded p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2 flex items-center">
            CAPITAL INVESTI<InfoTip text="Montant total viré vers Kraken (compte comptable 512200)." />
          </div>
          <div className="text-2xl font-mono font-bold text-[--at-accent]">{fmtEur(capital)}</div>
        </div>
        <div className={`border ${pnl >= 0 ? "border-[--at-pos]/30" : "border-[--at-neg]/30"} bg-[--at-surface] rounded p-4`}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2 flex items-center">
            P&L TOTAL<InfoTip text="NLV actuelle − Capital investi. Inclut gains réalisés + latents." />
          </div>
          <div className={`text-2xl font-mono font-bold ${pnl >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
            {pnl >= 0 ? "+" : ""}{fmtEur(pnl)}
          </div>
        </div>
        <div className={`border ${perf >= 0 ? "border-[--at-pos]/30" : "border-[--at-neg]/30"} bg-[--at-surface] rounded p-4`}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[--ink3] mb-2">PERF TOTALE</div>
          <div className={`text-2xl font-mono font-bold ${perf >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
            {perf >= 0 ? "+" : ""}{perf.toFixed(2)}%
          </div>
          <div className="text-[10px] font-mono text-[--ink3] mt-1">
            P&L / Capital investi
          </div>
        </div>
      </div>

      {/* Charts + Positions */}
      {positions.length > 0 && (() => {
        const allocationData = positions
          .map((p: any) => {
            const fx = Number(p.fx_rate_to_base) || 1
            return { name: p.ticker, value: Number(p.quantity) * Number(p.market_price) * fx }
          })
          .filter((d: any) => d.value > 0)
          .sort((a: any, b: any) => b.value - a.value)

        const allocTotal = allocationData.reduce((s: number, d: any) => s + d.value, 0)
        const threshold = allocTotal * 0.02
        const mainSlices = allocationData.filter((d: any) => d.value >= threshold)
        const othersValue = allocationData.filter((d: any) => d.value < threshold).reduce((s: number, d: any) => s + d.value, 0)
        if (othersValue > 0) mainSlices.push({ name: "Autres", value: othersValue })

        const stableValue = positions.reduce((s: number, p: any) => {
          if (STABLECOINS.includes(p.ticker)) {
            const fx = Number(p.fx_rate_to_base) || 1
            return s + Number(p.quantity) * Number(p.market_price) * fx
          }
          return s
        }, 0)
        const nonStableValue = positionsValue - stableValue
        const stableData = [
          { name: "Non-stable", value: nonStableValue },
          { name: "Stablecoins", value: stableValue },
        ].filter(d => d.value > 0)

        const cryptoVsFiat = [
          { name: "Crypto", value: positionsValue },
          { name: "Fiat", value: cashValue },
        ].filter(d => d.value > 0)

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-2">Allocation</h2>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={mainSlices} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#fbf8f1">
                    {mainSlices.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#1a1814" }} labelStyle={{ color: "#4a4540" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {mainSlices.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[--ink2]">{d.name}</span>
                    <span className="text-[--ink] ml-auto">{((d.value / allocTotal) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-2">Stables vs Crypto</h2>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={stableData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#fbf8f1">
                    {stableData.map((_: any, i: number) => <Cell key={i} fill={CASH_COLORS[i % CASH_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#1a1814" }} labelStyle={{ color: "#4a4540" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {stableData.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CASH_COLORS[i % CASH_COLORS.length] }} />
                    <span className="text-[--ink2]">{d.name}</span>
                    <span className="text-[--ink] ml-auto">{fmtEur(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-2">Fiat vs Crypto</h2>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={cryptoVsFiat} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={65} innerRadius={28} strokeWidth={1} stroke="#fbf8f1">
                    {cryptoVsFiat.map((_: any, i: number) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#1a1814" }} labelStyle={{ color: "#4a4540" }} formatter={(value: number, name: string) => [fmtEur(value), name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {cryptoVsFiat.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[(i + 2) % COLORS.length] }} />
                    <span className="text-[--ink2]">{d.name}</span>
                    <span className="text-[--ink] ml-auto">{fmtEur(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Positions Table */}
      <div className="border border-[--rule] rounded bg-[--at-surface]">
        <div className="border-b border-[--rule] p-3">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent]">
            Positions · {positions.length}
          </h2>
        </div>
        {positions.length === 0 ? (
          <div className="p-6 text-center text-[--ink3] text-xs font-mono">
            {portfolio.hasCredentials ? "Aucune position · Lancez un sync" : "Configurez vos API keys puis lancez un sync"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-[--at-surface] text-[--ink3] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left p-3">Ticker</th>
                  <th className="text-left p-3">Nom</th>
                  <th className="text-right p-3">Quantité</th>
                  <th className="text-right p-3">Prix (USD)</th>
                  <th className="text-right p-3">Valeur (EUR)</th>
                  <th className="text-right p-3">P&L (EUR)</th>
                  <th className="text-right p-3">% alloc</th>
                </tr>
              </thead>
              <tbody>
                {[...positions].sort((a: any, b: any) => {
                  const fxA = Number(a.fx_rate_to_base) || 1, fxB = Number(b.fx_rate_to_base) || 1
                  return (Number(b.quantity) * Number(b.market_price) * fxB) - (Number(a.quantity) * Number(a.market_price) * fxA)
                }).map((p: any) => {
                  const qty = Number(p.quantity)
                  const price = Number(p.market_price)
                  const fx = Number(p.fx_rate_to_base) || 1
                  const valueEur = qty * price * fx
                  const pru = Number(p.avg_cost)
                  const pnlEur = (price - pru) * qty * fx
                  const allocPct = positionsValue > 0 ? (valueEur / (positionsValue + cashValue)) * 100 : 0
                  return (
                    <tr key={p.id} className="border-t border-[--rule] hover:bg-[--at-accent]/5 transition">
                      <td className="p-3 text-[--at-accent] font-bold">{p.ticker}</td>
                      <td className="p-3 text-[--ink2] truncate max-w-[180px]">{p.name}</td>
                      <td className="p-3 text-right text-[--ink]">{qty < 1 ? qty.toFixed(6) : qty < 100 ? qty.toFixed(4) : qty.toFixed(2)}</td>
                      <td className="p-3 text-right text-[--at-accent]">{fmtUsd(price)}</td>
                      <td className="p-3 text-right text-[--ink]">{fmtEur(valueEur)}</td>
                      <td className={`p-3 text-right ${pnlEur >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
                        {pnlEur >= 0 ? "+" : ""}{fmtEur(pnlEur)}
                      </td>
                      <td className="p-3 text-right text-[--ink3]">{allocPct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cash Balances */}
      {cashBalances.length > 0 && (
        <div className="border border-[--rule] rounded bg-[--at-surface]">
          <div className="border-b border-[--rule] p-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent]">
              Cash · {cashBalances.length} devises
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-[--at-surface] text-[--ink3] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left p-3">Devise</th>
                  <th className="text-right p-3">Montant</th>
                  <th className="text-right p-3">Équivalent EUR</th>
                </tr>
              </thead>
              <tbody>
                {cashBalances.map((c: any) => {
                  const fx = Number(c.fx_rate_to_base) || 1
                  const eurValue = Number(c.amount) * fx
                  return (
                    <tr key={c.id || c.currency} className="border-t border-[--rule]">
                      <td className="p-3 text-[--at-accent] font-bold">{c.currency}</td>
                      <td className="p-3 text-right text-[--ink]">{Number(c.amount).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-[--ink]">{fmtEur(eurValue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trading Actif link */}
      <div className="border border-[--rule] rounded bg-[--at-surface] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-[--at-accent] mb-1">Trading Actif</h2>
            <p className="text-[10px] text-[--ink3] font-mono">
              Les trades court terme Kraken sont suivis dans la page Trading Actif.
            </p>
          </div>
          <Link href="/analytics" className="flex items-center gap-1 text-xs font-mono text-[--at-accent] hover:underline">
            Voir <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </div>
  )
}
