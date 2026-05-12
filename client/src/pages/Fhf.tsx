import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import InfoTip from "@/components/InfoTip"

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

const PRODUITS_COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55"]
const CHARGES_COLORS = ["#7d2b1d", "#cfb88f", "#3a6e3f", "#c08a4d", "#5b5a55", "#9a988f"]

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
  charges_brutes: number
  charges_ht_ytd: number
  avoirs_total: number
  avoirs_detail: { party_name: string; amount_ht: number; date: string; category: string }[]
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
  treso_qonto: number
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
        <div className="text-[--at-accent] font-mono animate-pulse">Chargement simulation FHF...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-[--at-neg] font-mono">Erreur de chargement des données FHF.</p>
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

  const currentMonth = new Date().getMonth() || 1
  const chargesMensuelles = data.charges_ht_ytd / currentMonth
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
          <span className="text-[--at-accent]">FHF</span>
          <span className="text-[--ink3]"> — </span>
          <span className="text-[--ink]">Pilotage Fiscal</span>
        </h1>
        <span className="text-xs text-[--ink3] border border-[--rule] px-2 py-1 rounded">{data.year}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Résultat avant IS"
          value={EUR.format(resultat_avant_is_local)}
          color={resultat_avant_is_local >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}
          subtitle="P&L réalisé + latent − Charges nettes"
          tooltip="Résultat = P&L réalisé IBKR (cash − capital investi) + P&L latent IBKR (positions ouvertes) + P&L Kraken (journal) − Charges HT nettes (après avoirs). C'est le bénéfice (ou déficit) fiscal de FHF pour l'année."
        />
        <KpiCard
          label="IS estimé"
          value={`${EUR.format(is_local)} (${taux_effectif_local.toFixed(1)}%)`}
          color="text-[#c08a4d]"
          tooltip="Impôt sur les Sociétés. Taux réduit PME : 15% sur les premiers 42 500€ de bénéfice, 25% au-delà. FHF qualifie (CA < 10M€, capital détenu 100% par personne physique). Si déficit : IS = 0€, le déficit est reportable sans limite."
        />
        <KpiCard
          label="Résultat net"
          value={EUR.format(resultat_net_local)}
          color={resultat_net_local >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}
          tooltip="Résultat après IS = Résultat avant IS − IS. C'est le montant maximum distribuable en dividendes (ou le déficit restant)."
        />
        <KpiCard
          label="Capital investi"
          value={EUR.format(data.capital_total)}
          color="text-[--at-accent]"
          tooltip={`Total des virements vers les brokers : IBKR (512100) = ${EUR.format(data.capital_ibkr)} + Kraken (512200) = ${EUR.format(data.capital_kraken)}. Source : factures compta validées.`}
        />
      </div>
      <p className="text-[10px] text-[--ink3] -mt-4">
        P&L IBKR (réalisé + latent) + P&L Kraken − Charges nettes{includeRevenus ? " + Revenus opéra." : ""}
      </p>

      {/* Produits + Charges */}
      <div className="grid grid-cols-2 gap-4">
        {/* Produits */}
        <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
          <h2 className="text-sm font-bold text-[--at-accent] mb-3">P&L Trading FHF</h2>

          {/* IBKR — Investissement */}
          <div className="space-y-1.5 text-xs mb-3">
            <div className="text-[10px] text-[--ink3] uppercase tracking-wider">IBKR — Investissement</div>
            <div className="flex justify-between text-[--ink2]">
              <span className="flex items-center">NLV IBKR<InfoTip text="Net Liquidation Value = Cash disponible + Valeur marchande des positions. Source : tables cash_balances + positions (Flex Query IBKR sync quotidien 22h UTC)." /></span>
              <span>{EUR.format(data.ibkr_nlv)} <span className="text-[9px] text-[--ink3]">(cash {EUR.format(data.ibkr_cash)} + pos. {EUR.format(data.ibkr_positions_value)})</span></span>
            </div>
            <div className="flex justify-between text-[--ink2]">
              <span className="flex items-center">Capital investi<InfoTip text="Somme nette des virements FHF → IBKR (catégorie 512100 dans compta). Dépôts − Retraits. Source : factures compta validées." /></span>
              <span>{EUR.format(data.capital_ibkr)}</span>
            </div>
            <Row label="P&L réalisé" value={data.pnl_realise_ibkr} tooltip="Cash IBKR − Capital investi = gains réalisés sur les trades fermés (dividendes, ventes, etc.). Toutes commissions et frais inclus." />
            <Row label={`P&L latent (${data.nb_positions_ibkr} pos.)`} value={data.pnl_latent_ibkr} italic note="mark-to-market 31/12" tooltip="Somme des plus-values/moins-values latentes sur les positions ouvertes (champ unrealized_pnl). Intégrées au résultat fiscal au 31/12 pour l'IS (art. 38-6 CGI, instruments financiers). Source : positions IBKR." />
          </div>

          {/* Kraken — Trading Actif */}
          <div className="space-y-1.5 text-xs mb-3 border-t border-[--rule] pt-3">
            <div className="text-[10px] text-[--ink3] uppercase tracking-wider">Kraken — Trading Actif</div>
            <Row label={`P&L réalisé (${data.nb_trades_kraken} trades)`} value={data.pnl_realise_kraken} tooltip="Somme des profits des trades Kraken saisis manuellement dans la page Trading Actif. Source : table trades, filtre compte = Kraken." />
            <div className="flex justify-between text-[--ink2]">
              <span className="flex items-center">Capital investi<InfoTip text="Somme nette des virements FHF → Kraken (catégorie 512200 dans compta). Source : factures compta validées." /></span>
              <span>{EUR.format(data.capital_kraken)}</span>
            </div>
            <p className="text-[9px] text-[--ink3]">P&L Kraken = trades saisis manuellement dans Trading Actif</p>
          </div>

          {/* Sous-total */}
          <div className="border-t border-[--rule] pt-2 text-xs font-bold text-[--at-accent]">
            Sous-total P&L Trading : {EUR.format(data.total_produits_trading)}
          </div>

          {/* FTMO & autres revenus */}
          <div className="mt-4 border-t border-[--rule] pt-3">
            <button onClick={() => setShowRevenus(!showRevenus)} className="text-xs text-[--ink2] hover:text-[--at-accent] transition-colors">
              FTMO & autres revenus → {EUR.format(data.revenus_compta)} {showRevenus ? "▾" : "▸"}
            </button>
            {showRevenus && (
              <div className="mt-2 space-y-2">
                {data.revenus_detail.length > 0 && (
                  <div className="pl-2 space-y-0.5 text-[10px] text-[--ink3]">
                    {data.revenus_detail.map((r, i) => (
                      <div key={i}>{r.party_name} — {EUR.format(r.amount_ht)} ({r.date})</div>
                    ))}
                  </div>
                )}
                <div className="flex items-start gap-2 p-2 rounded bg-[#c08a4d]/5 border border-[#c08a4d]/20">
                  <span className="text-[#c08a4d] text-[10px] leading-tight">⚠️ Attention doublon : si ces revenus sont déjà dans le journal de trades (P&L réalisé ci-dessus), ne les comptez pas deux fois.</span>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-[--ink2] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeRevenus}
                    onChange={e => setIncludeRevenus(e.target.checked)}
                    className="accent-[--at-accent]"
                  />
                  Inclure dans le résultat
                </label>
              </div>
            )}
          </div>

          {produitsData.length > 0 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={produitsData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} strokeWidth={0}>
                    {produitsData.map((_, i) => <Cell key={i} fill={PRODUITS_COLORS[i % PRODUITS_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#fbf8f1", border: "1px solid #d9d3c4", fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "#1a1814" }} formatter={(v: number) => EUR.format(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Charges */}
        <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
          <h2 className="text-sm font-bold text-[--at-accent] mb-3">Charges FHF</h2>
          <div className="space-y-2 text-xs">
            {data.charges_by_category.map((c, i) => (
              <div key={i} className="flex justify-between text-[--ink]">
                <span>{PCG_LABELS[c.category] || c.category}</span>
                <span>{EUR.format(c.total_ht)}</span>
              </div>
            ))}
            {data.avoirs_total > 0 && (
              <div className="space-y-1 mt-2 border-t border-[--rule] pt-2">
                <div className="text-[10px] text-[--ink3] uppercase tracking-wider flex items-center">
                  Avoirs & remboursements
                  <InfoTip text="Remboursements et avoirs fournisseurs (notes de crédit). Viennent en déduction des charges brutes. Source : factures direction=revenue avec catégorie ≠ 708000." />
                </div>
                {data.avoirs_detail.map((a, i) => (
                  <div key={i} className="flex justify-between text-[--at-pos]">
                    <span>{a.party_name}</span>
                    <span>− {EUR.format(a.amount_ht)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-[--rule] pt-2 font-bold text-[--at-accent] flex items-center justify-between">
              <span className="flex items-center">
                Total charges net
                <InfoTip text={`Charges brutes ${EUR.format(data.charges_brutes)} − Avoirs ${EUR.format(data.avoirs_total)} = ${EUR.format(data.charges_ht_ytd)}. Source : factures compta (hors 455000/512100/512200/101000).`} />
              </span>
              <span>{EUR.format(data.charges_ht_ytd)}</span>
            </div>
          </div>
          {chargesData.length > 0 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chargesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} strokeWidth={0}>
                    {chargesData.map((_, i) => <Cell key={i} fill={CHARGES_COLORS[i % CHARGES_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#fbf8f1", border: "1px solid #d9d3c4", fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "#1a1814" }} formatter={(v: number) => EUR.format(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Simulation IS */}
      <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
        <h2 className="text-sm font-bold text-[--ink] mb-4 flex items-center">
          Simulation IS
          <InfoTip text="Simulation de l'Impôt sur les Sociétés pour FHF (SASU). Taux réduit PME (art. 219-I-b CGI) : 15% ≤ 42 500€, 25% au-delà. Conditions : CA HT < 10M€, capital entièrement libéré, détenu ≥ 75% par des personnes physiques." wide />
        </h2>
        {resultat_avant_is_local > 0 ? (
          <>
            <div className="relative h-8 rounded overflow-hidden bg-[--at-surface] mb-3">
              <div className="absolute inset-y-0 left-0 bg-[--at-pos]/20 border-r border-[--at-pos]/30" style={{ width: `${trancheReduiteWidth}%` }} />
              <div className="absolute inset-y-0 bg-[#c08a4d]/20" style={{ left: `${trancheReduiteWidth}%`, right: 0 }} />
              <div className="absolute inset-y-0 w-0.5 bg-[--at-accent]" style={{ left: `${isBarWidth}%` }} />
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[--ink2]">
                <span className="mr-8">15% → 42 500€</span>
                <span>25% au-delà</span>
              </div>
            </div>
            <div className="text-xs text-[--ink2] space-y-1">
              <div>{EUR.format(Math.min(resultat_avant_is_local, 42500))} × 15% = {EUR.format(Math.min(resultat_avant_is_local, 42500) * 0.15)}</div>
              {resultat_avant_is_local > 42500 && (
                <div>{EUR.format(resultat_avant_is_local - 42500)} × 25% = {EUR.format((resultat_avant_is_local - 42500) * 0.25)}</div>
              )}
              <div className="font-bold text-[--ink]">Total IS = {EUR.format(is_local)}</div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-[--at-neg]/10 text-[--at-neg] text-xs rounded border border-[--at-neg]/30">DÉFICIT REPORTABLE</span>
            <span className="text-[10px] text-[--ink3] flex items-center">
              Reportable sur les exercices suivants, pas de limite de durée
              <InfoTip text="Le déficit fiscal est reportable en avant sans limitation de durée (art. 209-I CGI). Il viendra en déduction des bénéfices futurs, dans la limite de 1M€ + 50% du bénéfice au-delà." />
            </span>
          </div>
        )}
      </div>

      {/* Simulation Dividendes */}
      <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
        <h2 className="text-sm font-bold text-[--ink] mb-4">Simulation Dividendes</h2>
        <div className="flex items-center gap-4 mb-4">
          <label className="text-xs text-[--ink2]">Distribution :</label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={distributionPct}
            onChange={e => setDistributionPct(Number(e.target.value))}
            disabled={resultat_net_local <= 0}
            className="flex-1 h-1.5 rounded-full appearance-none bg-[--at-surface] accent-[--at-accent] disabled:opacity-30"
          />
          <span className="text-xs text-[--at-accent] w-10 text-right">{distributionPct}%</span>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setTaxMode("flat")}
            className={`text-xs px-3 py-1 rounded border transition-all ${taxMode === "flat" ? "border-[--at-accent] text-[--at-accent] bg-[--at-accent]/10" : "border-[--rule] text-[--ink3]"}`}
          >Flat tax 30%</button>
          {taxMode === "flat" && <InfoTip text="Prélèvement Forfaitaire Unique (PFU) : 12,8% d'IR + 17,2% de prélèvements sociaux = 30% du dividende brut. Option par défaut, pas besoin de la cocher sur la déclaration." />}
          <button
            onClick={() => setTaxMode("bareme")}
            className={`text-xs px-3 py-1 rounded border transition-all ${taxMode === "bareme" ? "border-[--at-accent] text-[--at-accent] bg-[--at-accent]/10" : "border-[--rule] text-[--ink3]"}`}
          >Barème TMI 0%</button>
          {taxMode === "bareme" && <InfoTip text="Option barème progressif de l'IR (case 2OP). Avec TMI 0% (marié, 2 enfants, revenus < seuil), seuls les PS 17,2% s'appliquent. Avantage : économie de 12,8% d'IR. À cocher sur la déclaration de revenus." />}
        </div>
        {resultat_net_local > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[--ink3] border-b border-[--rule]">
                  <th className="text-left py-2"></th>
                  <th className="text-right py-2">Flat tax 30%</th>
                  <th className="text-right py-2">Barème TMI 0%</th>
                </tr>
              </thead>
              <tbody className="text-[--ink]">
                <tr className="border-b border-[--rule]">
                  <td className="py-1.5">Dividende brut</td>
                  <td className="text-right">{EUR.format(dividende_brut)}</td>
                  <td className="text-right">{EUR.format(dividende_brut)}</td>
                </tr>
                <tr className="border-b border-[--rule]">
                  <td className="py-1.5">IR (12,8% / 0%)</td>
                  <td className="text-right text-[--at-neg]">{EUR.format(ir_flat)}</td>
                  <td className="text-right text-[--at-pos]">0,00 €</td>
                </tr>
                <tr className="border-b border-[--rule]">
                  <td className="py-1.5">PS (17,2%)</td>
                  <td className="text-right text-[--at-neg]">{EUR.format(ps_flat)}</td>
                  <td className="text-right text-[--at-neg]">{EUR.format(ps_bareme)}</td>
                </tr>
                <tr className="border-b border-[--rule] font-bold">
                  <td className="py-1.5">Net pour Fabien</td>
                  <td className="text-right text-[--at-pos]">{EUR.format(net_flat)}</td>
                  <td className="text-right text-[--at-pos]">{EUR.format(net_bareme)}</td>
                </tr>
                <tr className="border-b border-[--rule]">
                  <td className="py-1.5">Prélèvement total (IS + div.)</td>
                  <td className="text-right">{EUR.format(total_taxes_flat)}</td>
                  <td className="text-right">{EUR.format(total_taxes_bareme)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 flex items-center">
                    Taux global d'imposition
                    <InfoTip text="(IS payé + IR + PS sur dividendes) / Résultat brut avant IS × 100. C'est le % total de taxes entre le bénéfice FHF et ce qui arrive dans ta poche." wide />
                  </td>
                  <td className="text-right">{taux_global_flat.toFixed(1)}%</td>
                  <td className="text-right">{taux_global_bareme.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-[--ink3]">Pas de distribution possible sur un déficit.</p>
        )}
        <p className="text-[10px] text-[--ink3] mt-3 flex items-center">
          Capitaliser = réinvestir dans FHF sans frottement fiscal supplémentaire
          <InfoTip text="Tant que l'argent reste dans FHF, seul l'IS est payé. Pas de flat tax ni PS. Tu peux réinvestir 100% du résultat net en trading ou participations. La flat tax ne s'applique qu'au moment de la distribution effective des dividendes." wide />
        </p>
      </div>

      {/* Indicateurs complémentaires */}
      <div className="grid grid-cols-5 gap-4">
        <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
          <div className="text-[10px] text-[--ink3] uppercase tracking-wider mb-1 flex items-center">
            NLV IBKR<InfoTip text="Net Liquidation Value = Cash + Positions. Synchro IBKR Flex Query quotidienne à 22h UTC. Source : cash_balances + positions." />
          </div>
          <div className="text-lg font-bold text-[--at-accent]">{EUR.format(data.ibkr_nlv)}</div>
          <div className="text-[10px] text-[--ink3] mt-1">Valeur totale compte</div>
        </div>
        <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
          <div className="text-[10px] text-[--ink3] uppercase tracking-wider mb-1 flex items-center">
            ROI IBKR<InfoTip text="Return On Investment = (NLV − Capital investi) / Capital investi × 100. Inclut P&L réalisé + latent. Source : NLV IBKR / factures 512100." />
          </div>
          <div className={`text-lg font-bold ${data.capital_ibkr > 0 && (data.ibkr_nlv - data.capital_ibkr) >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
            {data.capital_ibkr > 0 ? ((data.ibkr_nlv - data.capital_ibkr) / data.capital_ibkr * 100).toFixed(1) : "0.0"}%
          </div>
          <div className="text-[10px] text-[--ink3] mt-1">(NLV − capital) / capital</div>
        </div>
        <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
          <div className="text-[10px] text-[--ink3] uppercase tracking-wider mb-1 flex items-center">
            ROI Global<InfoTip text="Résultat avant IS / Capital total investi (IBKR + Kraken) × 100. Mesure la performance globale de FHF sur l'année." />
          </div>
          <div className={`text-lg font-bold ${roi >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
            {roi.toFixed(1)}%
          </div>
          <div className="text-[10px] text-[--ink3] mt-1">Résultat / Capital investi</div>
        </div>
        <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
          <div className="text-[10px] text-[--ink3] uppercase tracking-wider mb-1 flex items-center">
            Solde CCA<InfoTip text="Compte Courant Associé (455000). Solde des apports et remboursements entre Fabien et FHF. Positif = FHF te doit de l'argent. Source : factures catégorie 455000 dans compta." />
          </div>
          <div className="text-lg font-bold text-[--at-accent]">{EUR.format(Math.abs(data.cca_balance))}</div>
          <div className="text-[10px] text-[--ink3] mt-1">
            {data.cca_balance >= 0 ? "FHF doit à Fabien" : "Fabien doit à FHF"}
          </div>
        </div>
        <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
          <div className="text-[10px] text-[--ink3] uppercase tracking-wider mb-1 flex items-center">
            Trésorerie Qonto<InfoTip text="Solde du compte bancaire FHF (Qonto). Calculé depuis les relevés CSV importés." />
          </div>
          <div className="text-lg font-bold text-[--at-accent]">{EUR.format(data.treso_qonto)}</div>
          <div className="text-[10px] text-[--ink3] mt-1">Solde bancaire</div>
        </div>
        <div className="border border-[--rule] rounded-lg p-4 bg-[--at-surface]">
          <div className="text-[10px] text-[--ink3] uppercase tracking-wider mb-1 flex items-center">
            Break-even<InfoTip text="Charges HT totales / nombre de mois écoulés = charge mensuelle moyenne. C'est le P&L trading minimum nécessaire chaque mois pour couvrir les frais et ne pas être en déficit." />
          </div>
          <div className="text-lg font-bold text-[--at-accent]">{EUR.format(chargesMensuelles)}<span className="text-xs text-[--ink3]">/m</span></div>
          <div className="text-[10px] text-[--ink3] mt-1">P&L min. mensuel</div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, subtitle, tooltip }: { label: string; value: string; color: string; subtitle?: string; tooltip?: string }) {
  return (
    <div className="border border-[--rule] rounded-lg p-3 bg-[--at-surface]">
      <div className="text-[10px] text-[--ink3] uppercase tracking-wider mb-1 flex items-center">
        {label}
        {tooltip && <InfoTip text={tooltip} wide />}
      </div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-[9px] text-[--ink3] mt-1">{subtitle}</div>}
    </div>
  )
}

function Row({ label, value, italic, note, tooltip }: { label: string; value: number; italic?: boolean; note?: string; tooltip?: string }) {
  return (
    <div className="flex justify-between text-[--ink]">
      <span className="flex items-center">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </span>
      <span className={italic ? "italic text-[--ink2]" : ""}>
        {EUR.format(value)}
        {note && <span className="text-[9px] text-[--ink3] ml-1">({note})</span>}
      </span>
    </div>
  )
}
