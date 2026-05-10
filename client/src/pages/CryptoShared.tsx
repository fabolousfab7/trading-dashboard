import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Bitcoin, RefreshCw } from "lucide-react"
import InfoTip from "@/components/InfoTip"
import PositionNoteModal from "@/components/PositionNoteModal"

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

function calcStatsTotal(pos: any[]) {
  const value = pos.reduce((s, p) => s + Number(p.quantity) * Number(p.market_price), 0)
  const valueUsd = pos.reduce((s, p) => s + Number(p.quantity) * (Number(p.market_price_usd) || 0), 0)
  return { value, valueUsd }
}

function calcStatsPart(pos: any[]) {
  const value = pos.reduce((s, p) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * Number(p.market_price) * own
  }, 0)
  const valueUsd = pos.reduce((s, p) => {
    const own = (Number(p.ownership_pct) || 100) / 100
    return s + Number(p.quantity) * (Number(p.market_price_usd) || 0) * own
  }, 0)
  return { value, valueUsd }
}

export default function CryptoShared() {
  const [account, setAccount] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<any>(null)

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const r = await authFetch("/api/accounts")
      const { accounts } = await r.json()
      const crypto = accounts?.find((a: any) => a.broker === "Crypto")
      if (!crypto) { setLoading(false); return }
      setAccount(crypto)
      const r2 = await authFetch(`/api/accounts/${crypto.id}/portfolio`)
      setData(await r2.json())
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setLoading(false) }
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
    } catch (e: any) { setError(String(e.message || e)) }
    finally { setRefreshing(false) }
  }

  if (loading) return <div className="p-8 text-zinc-400 font-mono text-sm">Chargement...</div>
  if (!account) return <div className="p-8 text-zinc-500 font-mono">Aucun compte Crypto</div>

  const positions = (data?.positions || []).filter((p: any) => {
    const qty = Number(p.quantity)
    const price = Number(p.market_price)
    return qty !== 0 && price !== 0
  })
  const sharedPositions = positions.filter((p: any) => (Number(p.ownership_pct) || 100) < 100)
  const totalStats = calcStatsTotal(sharedPositions)
  const partStats = calcStatsPart(sharedPositions)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-fuchsia-500/20 pb-4">
        <div>
          <div className="flex items-center gap-2 text-fuchsia-400 text-xs font-mono uppercase tracking-widest">
            <Bitcoin size={14} /> Crypto R+F
          </div>
          <h1 className="text-3xl font-mono font-bold tracking-wider mt-1">
            <span className="text-fuchsia-500">Crypto </span>
            <span className="text-cyan-400">R+F</span>
          </h1>
        </div>
        <button onClick={refreshPrices} disabled={refreshing}
          className="px-4 py-2 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/20 transition rounded font-mono text-xs uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Sync..." : "Refresh cours"}
        </button>
      </div>

      {error && <div className="border border-red-500/30 bg-red-500/10 text-red-400 p-3 rounded font-mono text-xs">{error}</div>}

      <div className="border border-fuchsia-500/30 bg-black/40 rounded p-4">
        <div className="flex gap-8">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1 flex items-center">
              Valeur totale portefeuille
              <InfoTip text="Valeur totale du portefeuille partagé Raph+Fab (quantités réelles × cours). La part Fabien (50%) est affichée en dessous." />
            </div>
            <div className="text-3xl font-mono font-bold text-white">{fmtUsd(totalStats.valueUsd)}</div>
            <div className="text-sm font-mono text-zinc-400 mt-1">Part Fabien (50%) : {fmtUsd(partStats.valueUsd)} / {fmtEur(partStats.value)}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1 flex items-center">Valeur EUR</div>
            <div className="text-3xl font-mono font-bold text-white">{fmtEur(totalStats.value)}</div>
          </div>
        </div>
      </div>

      {sharedPositions.length === 0 ? (
        <div className="text-zinc-500 font-mono text-sm text-center py-8">Aucune position partagée</div>
      ) : (
        <div className="border border-fuchsia-500/30 rounded bg-black/40">
          <div className="border-b border-fuchsia-500/30 p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-fuchsia-400 flex items-center">
                Raph + Fab
                <InfoTip text="Portefeuille partagé Raph+Fab. Valeurs réelles affichées (quantités et cours non pondérés). La part Fabien (50%) est calculée uniquement sur la page Home." />
              </h2>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Valeurs réelles du portefeuille commun</p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <div className="text-[10px] text-zinc-600 font-mono uppercase">Valeur USD</div>
                <div className="text-base font-mono font-bold text-cyan-300">{fmtUsd(totalStats.valueUsd)}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-600 font-mono uppercase">Valeur EUR</div>
                <div className="text-base font-mono font-bold text-zinc-400">{fmtEur(totalStats.value)}</div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-black/60 text-zinc-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left p-3">Coin</th>
                  <th className="text-right p-3">Qté</th>
                  <th className="text-right p-3">Cours ($)</th>
                  <th className="text-right p-3">Valeur ($)</th>
                </tr>
              </thead>
              <tbody>
                {[...sharedPositions].sort((a: any, b: any) => {
                  return (Number(b.quantity) * (Number(b.market_price_usd) || 0)) - (Number(a.quantity) * (Number(a.market_price_usd) || 0))
                }).map((p: any) => {
                  const qty = Number(p.quantity)
                  const priceUsd = Number(p.market_price_usd) || 0
                  const valueUsd = qty * priceUsd
                  return (
                    <tr key={p.id} className="border-t border-fuchsia-500/10 hover:bg-fuchsia-500/5 cursor-pointer transition"
                      onClick={() => setSelectedPosition(p)}>
                      <td className="p-3">
                        <div className="text-fuchsia-400 font-bold">{p.ticker.replace(/_R$/, "")}</div>
                        <div className="text-zinc-500 text-[10px] truncate max-w-[200px]">{(p.name || "").replace(/\s*\([^)]+\)\s*/g, "").trim()}</div>
                      </td>
                      <td className="p-3 text-right text-zinc-300">{qty.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}</td>
                      <td className="p-3 text-right text-cyan-300">{priceUsd < 1 ? `$${priceUsd.toFixed(6)}` : fmtUsd(priceUsd)}</td>
                      <td className="p-3 text-right text-zinc-300">{fmtUsd(valueUsd)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedPosition && (
        <PositionNoteModal
          isOpen={!!selectedPosition}
          onClose={() => setSelectedPosition(null)}
          ticker={selectedPosition.ticker.replace(/_R$/, "")}
          accountId={selectedPosition.account_id}
          positionId={selectedPosition.id}
          currency="EUR"
        />
      )}
    </div>
  )
}
