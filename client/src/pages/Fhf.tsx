import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const PCG_LABELS: Record<string, string> = {
  "618100": "Logiciels & data",
  "617000": "FTMO",
  "626100": "Télécom",
  "627000": "Frais bancaires",
  "627100": "Frais d'actes",
  "606300": "Fournitures",
  "625100": "Déplacements",
  "625600": "Missions",
  "681000": "Amortissements",
  "708000": "Produits divers",
  "471000": "Compte d'attente",
}

const PRODUITS_COLORS = ["#06b6d4", "#a78bfa", "#e879f9", "#facc15", "#34d399"]
const CHARGES_COLORS = ["#ef4444", "#f97316", "#eab308", "#ec4899", "#8b5cf6", "#06b6d4"]

const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })

async function authFetch(url: string) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

interface SimData {
  year: string
  revenus_compta: number
  revenus_detail: { party_name: string; amount_ht: number; date: string; category: string }[]
  pnl_realise_ibkr: number
  pnl_realise_kraken: number
  pnl_realise_ftmo: number
  pnl_realise_total: number
  pnl_latent_ibkr: number
  total_produits: number
  charges_ht_ytd: number
  charges_by_category: { category: string; total_ht: number }[]
  resultat_avant_is: number
  is_amount: number
  resultat_net: number
  taux_effectif_is: number
  capital_ibkr: number
  capital_kraken: number
  capital_total: number
  cca_balance: number
  nb_trades_ibkr: number
  nb_trades_kraken: number
  nb_positions_ibkr: number
  is_tranche_reduite: number
  is_tranche_normale: number
}

export default function Fhf() {
  const [data, setData] = useState<SimData | null>(null)
  const [loading, setLoading] = useState(true)
  const [distributionPct, setDistributionPct] = useState(100)
  const [taxMode, setTaxMode] = useState<"flat" | "bareme">("bareme")
  const [showRevenus, setShowRevenus] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await authFetch("/api/fhf/simulation")
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-cyan-400 font-mono animate-pulse">Chargement simulation FHF...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-red-400 font-mono">Erreur de chargement des données FHF.</p>
      </div>
    )
  }

  const dividende_brut = data.resultat_net > 0 ? data.resultat_net * (distributionPct / 100) : 0
  const ir_flat = dividende_brut * 0.128
  const ps_flat = dividende_brut * 0.172
  const net_flat = dividende_brut - ir_flat - ps_flat
  const ir_bareme = 0
  const ps_bareme = dividende_brut * 0.172
  const net_bareme = dividende_brut - ps_bareme
  const resultat_distribue = data.resultat_avant_is * (distributionPct / 100)
  const total_taxes_flat = data.is_amount * (distributionPct / 100) + ir_flat + ps_flat
  const taux_global_flat = resultat_distribue > 0 ? (total_taxes_flat / resultat_distribue) * 100 : 0
  const total_taxes_bareme = data.is_amount * (distributionPct / 100) + ir_bareme + ps_bareme
  const taux_global_bareme = resultat_distribue > 0 ? (total_taxes_bareme / resultat_distribue) * 100 : 0

  const produitsData = [
    { name: "P&L IBKR", value: Math.abs(data.pnl_realise_ibkr) },
    { name: "P&L Kraken", value: Math.abs(data.pnl_realise_kraken) },
    { name: "P&L FTMO", value: Math.abs(data.pnl_realise_ftmo) },
    { name: "Latent IBKR", value: Math.abs(data.pnl_latent_ibkr) },
    { name: "Revenus compta", value: Math.abs(data.revenus_compta) },
  ].filter(d => d.value > 0)

  const chargesData = data.charges_by_category.map(c => ({
    name: PCG_LABELS[c.category] || c.category,
    value: c.total_ht,
  }))

  const chargesMensuelles = data.charges_ht_ytd / new Date().getMonth() || data.charges_ht_ytd
  const roi = data.capital_total > 0 ? (data.resultat_avant_is / data.capital_total) * 100 : 0

  const isBarWidth = data.resultat_avant_is > 0
    ? Math.min((data.resultat_avant_is / 85000) * 100, 100)
    : 0
  const trancheReduiteWidth = Math.min((42500 / 85000) * 100, 50)

  return (
    <div className="p-6 space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          <span className="text-cyan-400">FHF</span>
          <span className="text-zinc-500"> — </span>
          <span className="text-zinc-300">Pilotage Fiscal</span>
        </h1>
        <span className="text-xs text-zinc-500 border border-zinc-700 px-2 py-1 rounded">{data.year}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Résultat avant IS"
          value={EUR.format(data.resultat_avant_is)}
          color={data.resultat_avant_is >= 0 ? "text-green-400" : "text-red-400"}
        />
        <KpiCard
          label="IS estimé"
          value={`${EUR.format(data.is_amount)} (${data.taux_effectif_is.toFixed(1)}%)`}
          color="text-orange-400"
        />
        <KpiCard
          label="Résultat net"
          value={EUR.format(data.resultat_net)}
          color={data.resultat_net >= 0 ? "text-green-400" : "text-red-400"}
        />
        <KpiCard
          label="Capital investi"
          value={EUR.format(data.capital_total)}
          color="text-cyan-400"
        />
      </div>

      {/* Produits + Charges */}
      <div className="grid grid-cols-2 gap-4">
        {/* Produits */}
        <div className="border border-cyan-500/20 rounded-lg p-4 bg-zinc-900/50">
          <h2 className="text-sm font-bold text-cyan-400 mb-3">Produits FHF</h2>
          <div className="space-y-2 text-xs">
            <Row label={`P&L réalisé IBKR (${data.nb_trades_ibkr} trades)`} value={data.pnl_realise_ibkr} />
            <Row label={`P&L réalisé Kraken (${data.nb_trades_kraken} trades)`} value={data.pnl_realise_kraken} />
            <Row label={`P&L latent IBKR (${data.nb_positions_ibkr} pos.)`} value={data.pnl_latent_ibkr} italic note="latent — mark-to-market" />
            <div>
              <button onClick={() => setShowRevenus(!showRevenus)} className="text-zinc-400 hover:text-cyan-400 transition-colors">
                Revenus compta → {EUR.format(data.revenus_compta)} {showRevenus ? "▾" : "▸"}
              </button>
              {showRevenus && data.revenus_detail.length > 0 && (
                <div className="pl-4 mt-1 space-y-0.5 text-[10px] text-zinc-500">
                  {data.revenus_detail.map((r, i) => (
                    <div key={i}>{r.party_name} — {EUR.format(r.amount_ht)} ({r.date})</div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-cyan-500/10 pt-2 font-bold text-cyan-300">
              Total produits : {EUR.format(data.total_produits)}
            </div>
          </div>
          {produitsData.length > 0 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={produitsData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} strokeWidth={0}>
                    {produitsData.map((_, i) => <Cell key={i} fill={PRODUITS_COLORS[i % PRODUITS_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #06b6d4", fontSize: 11, fontFamily: "monospace" }} formatter={(v: number) => EUR.format(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Charges */}
        <div className="border border-fuchsia-500/20 rounded-lg p-4 bg-zinc-900/50">
          <h2 className="text-sm font-bold text-fuchsia-400 mb-3">Charges FHF</h2>
          <div className="space-y-2 text-xs">
            {data.charges_by_category.map((c, i) => (
              <div key={i} className="flex justify-between text-zinc-300">
                <span>{PCG_LABELS[c.category] || c.category}</span>
                <span>{EUR.format(c.total_ht)}</span>
              </div>
            ))}
            <div className="border-t border-fuchsia-500/10 pt-2 font-bold text-fuchsia-300">
              Total charges : {EUR.format(data.charges_ht_ytd)}
            </div>
          </div>
          {chargesData.length > 0 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chargesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} strokeWidth={0}>
                    {chargesData.map((_, i) => <Cell key={i} fill={CHARGES_COLORS[i % CHARGES_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #e879f9", fontSize: 11, fontFamily: "monospace" }} formatter={(v: number) => EUR.format(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Simulation IS */}
      <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
        <h2 className="text-sm font-bold text-zinc-300 mb-4">Simulation IS</h2>
        {data.resultat_avant_is > 0 ? (
          <>
            <div className="relative h-8 rounded overflow-hidden bg-zinc-800 mb-3">
              <div className="absolute inset-y-0 left-0 bg-green-500/30 border-r border-green-500/50" style={{ width: `${trancheReduiteWidth}%` }} />
              <div className="absolute inset-y-0 bg-orange-500/30" style={{ left: `${trancheReduiteWidth}%`, right: 0 }} />
              <div className="absolute inset-y-0 w-0.5 bg-cyan-400 shadow-[0_0_6px_#06b6d4]" style={{ left: `${isBarWidth}%` }} />
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-400">
                <span className="mr-8">15% → 42 500€</span>
                <span>25% au-delà</span>
              </div>
            </div>
            <div className="text-xs text-zinc-400 space-y-1">
              <div>{EUR.format(Math.min(data.resultat_avant_is, 42500))} × 15% = {EUR.format(data.is_tranche_reduite)}</div>
              {data.resultat_avant_is > 42500 && (
                <div>{EUR.format(data.resultat_avant_is - 42500)} × 25% = {EUR.format(data.is_tranche_normale)}</div>
              )}
              <div className="font-bold text-zinc-200">Total IS = {EUR.format(data.is_amount)}</div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded border border-red-500/30">DÉFICIT REPORTABLE</span>
            <span className="text-[10px] text-zinc-500">Reportable sur les exercices suivants, pas de limite de durée</span>
          </div>
        )}
      </div>

      {/* Simulation Dividendes */}
      <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
        <h2 className="text-sm font-bold text-zinc-300 mb-4">Simulation Dividendes</h2>
        <div className="flex items-center gap-4 mb-4">
          <label className="text-xs text-zinc-400">Distribution :</label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={distributionPct}
            onChange={e => setDistributionPct(Number(e.target.value))}
            disabled={data.resultat_net <= 0}
            className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-700 accent-fuchsia-500 disabled:opacity-30"
          />
          <span className="text-xs text-fuchsia-400 w-10 text-right">{distributionPct}%</span>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setTaxMode("flat")}
            className={`text-xs px-3 py-1 rounded border transition-all ${taxMode === "flat" ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" : "border-zinc-700 text-zinc-500"}`}
          >Flat tax 30%</button>
          <button
            onClick={() => setTaxMode("bareme")}
            className={`text-xs px-3 py-1 rounded border transition-all ${taxMode === "bareme" ? "border-fuchsia-500 text-fuchsia-400 bg-fuchsia-500/10" : "border-zinc-700 text-zinc-500"}`}
          >Barème TMI 0%</button>
        </div>
        {data.resultat_net > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2"></th>
                  <th className="text-right py-2">Flat tax 30%</th>
                  <th className="text-right py-2">Barème TMI 0%</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                <tr className="border-b border-zinc-800/50">
                  <td className="py-1.5">Dividende brut</td>
                  <td className="text-right">{EUR.format(dividende_brut)}</td>
                  <td className="text-right">{EUR.format(dividende_brut)}</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-1.5">IR (12,8% / 0%)</td>
                  <td className="text-right text-red-400">{EUR.format(ir_flat)}</td>
                  <td className="text-right text-green-400">0,00 €</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-1.5">PS (17,2%)</td>
                  <td className="text-right text-red-400">{EUR.format(ps_flat)}</td>
                  <td className="text-right text-red-400">{EUR.format(ps_bareme)}</td>
                </tr>
                <tr className="border-b border-zinc-800/50 font-bold">
                  <td className="py-1.5">Net pour Fabien</td>
                  <td className="text-right text-green-400">{EUR.format(net_flat)}</td>
                  <td className="text-right text-green-400">{EUR.format(net_bareme)}</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-1.5">Prélèvement total (IS + div.)</td>
                  <td className="text-right">{EUR.format(total_taxes_flat)}</td>
                  <td className="text-right">{EUR.format(total_taxes_bareme)}</td>
                </tr>
                <tr>
                  <td className="py-1.5">Taux global d'imposition</td>
                  <td className="text-right">{taux_global_flat.toFixed(1)}%</td>
                  <td className="text-right">{taux_global_bareme.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Pas de distribution possible sur un déficit.</p>
        )}
        <p className="text-[10px] text-zinc-600 mt-3">Capitaliser = réinvestir dans FHF sans frottement fiscal supplémentaire</p>
      </div>

      {/* Indicateurs complémentaires */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">ROI Global</div>
          <div className={`text-lg font-bold ${roi >= 0 ? "text-green-400" : "text-red-400"}`}>
            {roi.toFixed(1)}%
          </div>
          <div className="text-[10px] text-zinc-600 mt-1">Résultat / Capital investi</div>
        </div>
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Solde CCA</div>
          <div className="text-lg font-bold text-fuchsia-400">{EUR.format(Math.abs(data.cca_balance))}</div>
          <div className="text-[10px] text-zinc-600 mt-1">
            {data.cca_balance >= 0 ? "FHF doit à Fabien" : "Fabien doit à FHF"}
          </div>
        </div>
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Break-even mensuel</div>
          <div className="text-lg font-bold text-cyan-400">{EUR.format(chargesMensuelles)}<span className="text-xs text-zinc-500">/mois</span></div>
          <div className="text-[10px] text-zinc-600 mt-1">P&L minimum pour couvrir les charges</div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900/50">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  )
}

function Row({ label, value, italic, note }: { label: string; value: number; italic?: boolean; note?: string }) {
  return (
    <div className="flex justify-between text-zinc-300">
      <span>{label}</span>
      <span className={italic ? "italic text-zinc-400" : ""}>
        {EUR.format(value)}
        {note && <span className="text-[9px] text-zinc-600 ml-1">({note})</span>}
      </span>
    </div>
  )
}
