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
  ibkr_nlv: number
  ibkr_cash: number
  ibkr_positions_value: number
  pnl_realise_ibkr: number
  pnl_latent_ibkr: number
  nb_positions_ibkr: number
  capital_ibkr: number
  pnl_realise_kraken: number
  nb_trades_kraken: number
  capital_kraken: number
  revenus_compta: number
  revenus_detail: { party_name: string; amount_ht: number; date: string; category: string }[]
  charges_ht_ytd: number
  charges_by_category: { category: string; total_ht: number }[]
  total_produits_trading: number
  capital_total: number
  resultat_avant_is: number
  is_amount: number
  resultat_net: number
  taux_effectif_is: number
  is_tranche_reduite: number
  is_tranche_normale: number
  cca_balance: number
}

export default function Fhf() {
  const [data, setData] = useState<SimData | null>(null)
  const [loading, setLoading] = useState(true)
  const [distributionPct, setDistributionPct] = useState(100)
  const [taxMode, setTaxMode] = useState<"flat" | "bareme">("bareme")
  const [showRevenus, setShowRevenus] = useState(false)
  const [includeRevenus, setIncludeRevenus] = useState(false)

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

  const resultat_avant_is_local = data.total_produits_trading + (includeRevenus ? data.revenus_compta : 0) - data.charges_ht_ytd
  let is_local = 0
  if (resultat_avant_is_local > 0) {
    is_local = Math.min(resultat_avant_is_local, 42500) * 0.15 + Math.max(0, resultat_avant_is_local - 42500) * 0.25
  }
  const resultat_net_local = resultat_avant_is_local - is_local
  const taux_effectif_local = resultat_avant_is_local > 0 ? (is_local / resultat_avant_is_local) * 100 : 0

  const dividende_brut = resultat_net_local > 0 ? resultat_net_local * (distributionPct / 100) : 0
  const ir_flat = dividende_brut * 0.128
  const ps_flat = dividende_brut * 0.172
  const net_flat = dividende_brut - ir_flat - ps_flat
  const ir_bareme = 0
  const ps_bareme = dividende_brut * 0.172
  const net_bareme = dividende_brut - ps_bareme
  const resultat_distribue = resultat_avant_is_local * (distributionPct / 100)
  const total_taxes_flat = is_local * (distributionPct / 100) + ir_flat + ps_flat
  const taux_global_flat = resultat_distribue > 0 ? (total_taxes_flat / resultat_distribue) * 100 : 0
  const total_taxes_bareme = is_local * (distributionPct / 100) + ir_bareme + ps_bareme
  const taux_global_bareme = resultat_distribue > 0 ? (total_taxes_bareme / resultat_distribue) * 100 : 0

  const produitsData = [
    { name: "Réalisé IBKR", value: Math.abs(data.pnl_realise_ibkr) },
    { name: "Latent IBKR", value: Math.abs(data.pnl_latent_ibkr) },
    { name: "P&L Kraken", value: Math.abs(data.pnl_realise_kraken) },
  ].filter(d => d.value > 0)

  const chargesData = data.charges_by_category.map(c => ({
    name: PCG_LABELS[c.category] || c.category,
    value: c.total_ht,
  }))

  const chargesMensuelles = data.charges_ht_ytd / new Date().getMonth() || data.charges_ht_ytd
  const roi = data.capital_total > 0 ? (resultat_avant_is_local / data.capital_total) * 100 : 0

  const isBarWidth = resultat_avant_is_local > 0
    ? Math.min((resultat_avant_is_local / 85000) * 100, 100)
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
          value={EUR.format(resultat_avant_is_local)}
          color={resultat_avant_is_local >= 0 ? "text-green-400" : "text-red-400"}
          subtitle="P&L réalisé + latent − Charges HT"
        />
        <KpiCard
          label="IS estimé"
          value={`${EUR.format(is_local)} (${taux_effectif_local.toFixed(1)}%)`}
          color="text-orange-400"
        />
        <KpiCard
          label="Résultat net"
          value={EUR.format(resultat_net_local)}
          color={resultat_net_local >= 0 ? "text-green-400" : "text-red-400"}
        />
        <KpiCard
          label="Capital investi"
          value={EUR.format(data.capital_total)}
          color="text-cyan-400"
        />
      </div>
      <p className="text-[10px] text-zinc-600 -mt-4">
        P&L IBKR (réalisé + latent) + P&L Kraken − Charges{includeRevenus ? " + Revenus opéra." : ""}
      </p>

      {/* Produits + Charges */}
      <div className="grid grid-cols-2 gap-4">
        {/* Produits */}
        <div className="border border-cyan-500/20 rounded-lg p-4 bg-zinc-900/50">
          <h2 className="text-sm font-bold text-cyan-400 mb-3">P&L Trading FHF</h2>

          {/* IBKR — Investissement */}
          <div className="space-y-1.5 text-xs mb-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">IBKR — Investissement</div>
            <div className="flex justify-between text-zinc-400">
              <span>NLV IBKR</span>
              <span>{EUR.format(data.ibkr_nlv)} <span className="text-[9px] text-zinc-600">(cash {EUR.format(data.ibkr_cash)} + pos. {EUR.format(data.ibkr_positions_value)})</span></span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Capital investi</span>
              <span>{EUR.format(data.capital_ibkr)}</span>
            </div>
            <Row label="P&L réalisé" value={data.pnl_realise_ibkr} />
            <div className="group relative">
              <Row label={`P&L latent (${data.nb_positions_ibkr} pos.)`} value={data.pnl_latent_ibkr} italic note="latent — mark-to-market 31/12" />
              <div className="hidden group-hover:block absolute left-0 top-full z-10 mt-1 p-2 bg-zinc-800 border border-zinc-600 rounded text-[9px] text-zinc-400 max-w-xs">
                Plus-values latentes sur positions ouvertes — intégrées au résultat fiscal au 31/12, art. 38-6 CGI
              </div>
            </div>
          </div>

          {/* Kraken — Trading Actif */}
          <div className="space-y-1.5 text-xs mb-3 border-t border-zinc-800 pt-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Kraken — Trading Actif</div>
            <Row label={`P&L réalisé (${data.nb_trades_kraken} trades)`} value={data.pnl_realise_kraken} />
            <div className="flex justify-between text-zinc-400">
              <span>Capital investi</span>
              <span>{EUR.format(data.capital_kraken)}</span>
            </div>
            <p className="text-[9px] text-zinc-600">P&L Kraken = trades saisis manuellement dans Trading Actif</p>
          </div>

          {/* Sous-total */}
          <div className="border-t border-cyan-500/10 pt-2 text-xs font-bold text-cyan-300">
            Sous-total P&L Trading : {EUR.format(data.total_produits_trading)}
          </div>

          {/* FTMO & autres revenus */}
          <div className="mt-4 border-t border-zinc-800 pt-3">
            <button onClick={() => setShowRevenus(!showRevenus)} className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors">
              FTMO & autres revenus → {EUR.format(data.revenus_compta)} {showRevenus ? "▾" : "▸"}
            </button>
            {showRevenus && (
              <div className="mt-2 space-y-2">
                {data.revenus_detail.length > 0 && (
                  <div className="pl-2 space-y-0.5 text-[10px] text-zinc-500">
                    {data.revenus_detail.map((r, i) => (
                      <div key={i}>{r.party_name} — {EUR.format(r.amount_ht)} ({r.date})</div>
                    ))}
                  </div>
                )}
                <div className="flex items-start gap-2 p-2 rounded bg-amber-500/5 border border-amber-500/20">
                  <span className="text-amber-400 text-[10px] leading-tight">⚠️ Attention doublon : si ces revenus sont déjà dans le journal de trades (P&L réalisé ci-dessus), ne les comptez pas deux fois.</span>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeRevenus}
                    onChange={e => setIncludeRevenus(e.target.checked)}
                    className="accent-cyan-500"
                  />
                  Inclure dans le résultat
                </label>
              </div>
            )}
          </div>

          {/* Formule */}
          <div className="mt-3 text-[9px] text-zinc-600 border-t border-zinc-800 pt-2">
            P&L Trading = réalisé IBKR + latent IBKR + réalisé Kraken{includeRevenus ? " + Revenus opéra." : ""}
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
        {resultat_avant_is_local > 0 ? (
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
              <div>{EUR.format(Math.min(resultat_avant_is_local, 42500))} × 15% = {EUR.format(Math.min(resultat_avant_is_local, 42500) * 0.15)}</div>
              {resultat_avant_is_local > 42500 && (
                <div>{EUR.format(resultat_avant_is_local - 42500)} × 25% = {EUR.format((resultat_avant_is_local - 42500) * 0.25)}</div>
              )}
              <div className="font-bold text-zinc-200">Total IS = {EUR.format(is_local)}</div>
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
            disabled={resultat_net_local <= 0}
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
        {resultat_net_local > 0 ? (
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
      <div className="grid grid-cols-5 gap-4">
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">NLV IBKR</div>
          <div className="text-lg font-bold text-cyan-400">{EUR.format(data.ibkr_nlv)}</div>
          <div className="text-[10px] text-zinc-600 mt-1">Valeur totale compte</div>
        </div>
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">ROI IBKR</div>
          <div className={`text-lg font-bold ${data.capital_ibkr > 0 && (data.ibkr_nlv - data.capital_ibkr) >= 0 ? "text-green-400" : "text-red-400"}`}>
            {data.capital_ibkr > 0 ? ((data.ibkr_nlv - data.capital_ibkr) / data.capital_ibkr * 100).toFixed(1) : "0.0"}%
          </div>
          <div className="text-[10px] text-zinc-600 mt-1">(NLV − capital) / capital</div>
        </div>
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
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Break-even</div>
          <div className="text-lg font-bold text-cyan-400">{EUR.format(chargesMensuelles)}<span className="text-xs text-zinc-500">/m</span></div>
          <div className="text-[10px] text-zinc-600 mt-1">P&L min. mensuel</div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, subtitle }: { label: string; value: string; color: string; subtitle?: string }) {
  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900/50">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-[9px] text-zinc-600 mt-1">{subtitle}</div>}
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
