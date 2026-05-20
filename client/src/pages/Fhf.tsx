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
  "627200": "Frais courtage Kraken",
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

const tooltipStyle = {
  background: "var(--at-surface)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--ink)",
}

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
  nb_trades_kraken_clos: number
  nb_trades_kraken_total: number
  capital_kraken: number
  revenus_compta: number
  revenus_detail: { party_name: string; amount_ht: number; date: string; category: string }[]
  charges_brutes: number
  charges_ht_ytd: number
  frais_courtage_kraken: number
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
  const [cronTriggering, setCronTriggering] = useState(false)
  const [cronResult, setCronResult] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function triggerCron() {
    setCronTriggering(true)
    setCronResult(null)
    try {
      const res = await fetch("/api/admin/trigger-cron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      })
      const data = await res.json()
      setCronResult({ status: res.status, ...data })
    } catch (e: any) {
      setCronResult({ status: 0, error: e.message })
    } finally {
      setCronTriggering(false)
    }
  }

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
    return <div style={{ padding: "28px 32px", color: "var(--ink2)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Chargement simulation FHF…</div>
  }

  if (!data) {
    return <div style={{ padding: "28px 32px", color: "var(--at-neg)", fontFamily: "var(--font-mono)", fontSize: 13 }}>Erreur de chargement des données FHF.</div>
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
    <div style={{ padding: "28px 32px" }}>

      {/* ── MASTHEAD ──────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            Société FHF &middot; Pilotage fiscal
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Le résultat, jusqu'à l'IS.
          </h1>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", border: "1px solid var(--rule)", padding: "4px 10px", borderRadius: 3 }}>
          {data.year}
        </span>
      </div>

      {/* ── KPI ROW ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Résultat avant IS
            <InfoTip text="Résultat = P&L réalisé IBKR (cash − capital investi) + P&L latent IBKR (positions ouvertes) + P&L Kraken (FIFO Spot + Futures) − Charges HT nettes (après avoirs). C'est le bénéfice (ou déficit) fiscal de FHF pour l'année." wide />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: resultat_avant_is_local >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {EUR.format(resultat_avant_is_local)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            P&L réalisé + latent − Charges nettes{includeRevenus ? " + Revenus opéra." : ""}
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            IS estimé
            <InfoTip text="Impôt sur les Sociétés. Taux réduit PME : 15% sur les premiers 42 500€ de bénéfice, 25% au-delà. FHF qualifie (CA < 10M€, capital détenu 100% par personne physique). Si déficit : IS = 0€, le déficit est reportable sans limite." wide />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {EUR.format(is_local)}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            Taux effectif {taux_effectif_local.toFixed(1)} %
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Résultat net
            <InfoTip text="Résultat après IS = Résultat avant IS − IS. C'est le montant maximum distribuable en dividendes (ou le déficit restant)." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: resultat_net_local >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {EUR.format(resultat_net_local)}
          </div>
        </div>
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Capital investi
            <InfoTip text={`Total des virements vers les brokers : IBKR (512100) = ${EUR.format(data.capital_ibkr)} + Kraken (512200) = ${EUR.format(data.capital_kraken)}. Source : factures compta validées.`} />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {EUR.format(data.capital_total)}
          </div>
        </div>
      </div>

      {/* ── PRODUITS + CHARGES ─────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 28 }}>

        {/* Produits */}
        <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>P&L Trading FHF</span>
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>Produits</span>
          </div>

          {/* IBKR — Investissement */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)", marginBottom: 8 }}>IBKR — Investissement</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink2)", padding: "4px 0" }}>
              <span style={{ display: "flex", alignItems: "center", fontFamily: "var(--font-mono)" }}>NLV IBKR<InfoTip text="Net Liquidation Value = Cash disponible + Valeur marchande des positions. Source : tables cash_balances + positions (Flex Query IBKR sync quotidien 22h UTC)." /></span>
              <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                {EUR.format(data.ibkr_nlv)} <span style={{ fontSize: 9, color: "var(--ink3)" }}>(cash {EUR.format(data.ibkr_cash)} + pos. {EUR.format(data.ibkr_positions_value)})</span>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink2)", padding: "4px 0" }}>
              <span style={{ display: "flex", alignItems: "center", fontFamily: "var(--font-mono)" }}>Capital investi<InfoTip text="Somme nette des virements FHF → IBKR (catégorie 512100 dans compta). Dépôts − Retraits. Source : factures compta validées." /></span>
              <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{EUR.format(data.capital_ibkr)}</span>
            </div>
            <Row label="P&L réalisé" value={data.pnl_realise_ibkr} tooltip="Cash IBKR − Capital investi = gains réalisés sur les trades fermés (dividendes, ventes, etc.). Toutes commissions et frais inclus." />
            <Row label={`P&L latent (${data.nb_positions_ibkr} pos.)`} value={data.pnl_latent_ibkr} italic note="mark-to-market 31/12" tooltip="Somme des plus-values/moins-values latentes sur les positions ouvertes (champ unrealized_pnl). Intégrées au résultat fiscal au 31/12 pour l'IS (art. 38-6 CGI, instruments financiers). Source : positions IBKR." />
          </div>

          {/* Kraken — Trading Actif */}
          <div style={{ borderTop: "1px dotted var(--rule)", paddingTop: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)", marginBottom: 8 }}>Kraken — Trading Actif</div>
            <Row label={`P&L réalisé (${data.nb_trades_kraken_clos}/${data.nb_trades_kraken_total} trades clos)`} value={data.pnl_realise_kraken} tooltip="Somme des realized_pnl FIFO Spot (trades de clôture) + paidPnL Futures (quand dispo). Source : table kraken_trades, sync API Kraken Pro. Conversion FX appliquée par trade avant sommation." />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink2)", padding: "4px 0" }}>
              <span style={{ display: "flex", alignItems: "center", fontFamily: "var(--font-mono)" }}>Capital investi<InfoTip text="Somme nette des virements FHF → Kraken (catégorie 512200 dans compta). Source : factures compta validées." /></span>
              <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{EUR.format(data.capital_kraken)}</span>
            </div>
          </div>

          {/* Sous-total */}
          <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 10, fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
            Sous-total P&L Trading : {EUR.format(data.total_produits_trading)}
          </div>

          {/* FTMO & autres revenus */}
          <div style={{ borderTop: "1px dotted var(--rule)", marginTop: 14, paddingTop: 14 }}>
            <button onClick={() => setShowRevenus(!showRevenus)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)", padding: 0 }}>
              FTMO & autres revenus → {EUR.format(data.revenus_compta)} {showRevenus ? "▾" : "▸"}
            </button>
            {showRevenus && (
              <div style={{ marginTop: 10 }}>
                {data.revenus_detail.length > 0 && (
                  <div style={{ paddingLeft: 8, marginBottom: 8 }}>
                    {data.revenus_detail.map((r, i) => (
                      <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)", padding: "2px 0" }}>
                        {r.party_name} — {EUR.format(r.amount_ht)} ({r.date})
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ padding: 8, borderRadius: 4, background: "color-mix(in srgb, #c08a4d 5%, transparent)", border: "1px solid color-mix(in srgb, #c08a4d 20%, transparent)", fontFamily: "var(--font-mono)", fontSize: 10, color: "#c08a4d", lineHeight: 1.5 }}>
                  Attention doublon : si ces revenus sont déjà dans le journal de trades (P&L réalisé ci-dessus), ne les comptez pas deux fois.
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink2)", cursor: "pointer" }}>
                  <input type="checkbox" checked={includeRevenus} onChange={e => setIncludeRevenus(e.target.checked)} style={{ accentColor: "var(--at-accent)" }} />
                  Inclure dans le résultat
                </label>
              </div>
            )}
          </div>

          {produitsData.length > 0 && (
            <div style={{ marginTop: 16, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={produitsData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={38} strokeWidth={1.5} stroke="var(--at-bg)">
                    {produitsData.map((_, i) => <Cell key={i} fill={PRODUITS_COLORS[i % PRODUITS_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => EUR.format(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Charges */}
        <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Charges FHF</span>
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>PCG</span>
          </div>
          <div>
            {data.charges_by_category.map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink)", padding: "5px 0", borderBottom: "1px dotted var(--rule)", fontFamily: "var(--font-mono)" }}>
                <span>{PCG_LABELS[c.category] || c.category}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{EUR.format(c.total_ht)}</span>
              </div>
            ))}
            {data.avoirs_total > 0 && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)", display: "flex", alignItems: "center", marginBottom: 6 }}>
                  Avoirs & remboursements
                  <InfoTip text="Remboursements et avoirs fournisseurs (notes de crédit). Viennent en déduction des charges brutes. Source : factures direction=revenue avec catégorie ≠ 708000." />
                </div>
                {data.avoirs_detail.map((a, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--at-pos)", padding: "3px 0", fontFamily: "var(--font-mono)" }}>
                    <span>{a.party_name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>− {EUR.format(a.amount_ht)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 10, marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
              <span style={{ display: "flex", alignItems: "center" }}>
                Total charges net
                <InfoTip text={`Charges brutes ${EUR.format(data.charges_brutes)} − Avoirs ${EUR.format(data.avoirs_total)} = ${EUR.format(data.charges_ht_ytd)}. Inclut ${EUR.format(data.frais_courtage_kraken || 0)} de frais courtage Kraken (sync auto kraken_trades.fee, hors facture compta). Sources : factures fhf_invoices + kraken_trades.`} />
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{EUR.format(data.charges_ht_ytd)}</span>
            </div>
          </div>
          {chargesData.length > 0 && (
            <div style={{ marginTop: 16, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chargesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={38} strokeWidth={1.5} stroke="var(--at-bg)">
                    {chargesData.map((_, i) => <Cell key={i} fill={CHARGES_COLORS[i % CHARGES_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => EUR.format(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── SIMULATION IS ─────────────────────────────────────── */}
      <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Simulation IS</span>
          <InfoTip text="Simulation de l'Impôt sur les Sociétés pour FHF (SASU). Taux réduit PME (art. 219-I-b CGI) : 15% ≤ 42 500€, 25% au-delà. Conditions : CA HT < 10M€, capital entièrement libéré, détenu ≥ 75% par des personnes physiques." wide />
        </div>
        {resultat_avant_is_local > 0 ? (
          <>
            <div style={{ position: "relative", height: 32, borderRadius: 4, overflow: "hidden", background: "var(--at-bg)", marginBottom: 14 }}>
              <div style={{ position: "absolute", inset: "0 auto 0 0", background: "color-mix(in srgb, var(--at-pos) 15%, transparent)", borderRight: "1px solid color-mix(in srgb, var(--at-pos) 30%, transparent)", width: `${trancheReduiteWidth}%` }} />
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${trancheReduiteWidth}%`, right: 0, background: "color-mix(in srgb, #c08a4d 15%, transparent)" }} />
              <div style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: "var(--at-accent)", left: `${isBarWidth}%` }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink2)" }}>
                <span style={{ marginRight: 32 }}>15% → 42 500€</span>
                <span>25% au-delà</span>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)" }}>
              <div style={{ padding: "3px 0" }}>{EUR.format(Math.min(resultat_avant_is_local, 42500))} × 15% = {EUR.format(Math.min(resultat_avant_is_local, 42500) * 0.15)}</div>
              {resultat_avant_is_local > 42500 && (
                <div style={{ padding: "3px 0" }}>{EUR.format(resultat_avant_is_local - 42500)} × 25% = {EUR.format((resultat_avant_is_local - 42500) * 0.25)}</div>
              )}
              <div style={{ fontWeight: 700, color: "var(--ink)", paddingTop: 4 }}>Total IS = {EUR.format(is_local)}</div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ padding: "4px 10px", background: "color-mix(in srgb, var(--at-neg) 10%, transparent)", color: "var(--at-neg)", fontFamily: "var(--font-mono)", fontSize: 11, borderRadius: 3, border: "1px solid color-mix(in srgb, var(--at-neg) 30%, transparent)", textTransform: "uppercase", letterSpacing: 1 }}>
              Déficit reportable
            </span>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", display: "flex", alignItems: "center" }}>
              Reportable sur les exercices suivants, pas de limite de durée
              <InfoTip text="Le déficit fiscal est reportable en avant sans limitation de durée (art. 209-I CGI). Il viendra en déduction des bénéfices futurs, dans la limite de 1M€ + 50% du bénéfice au-delà." />
            </span>
          </div>
        )}
      </div>

      {/* ── SIMULATION DIVIDENDES ─────────────────────────────── */}
      <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20, background: "var(--at-surface)", marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Simulation Dividendes</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)" }}>Distribution :</span>
          <input type="range" min={0} max={100} step={5} value={distributionPct}
            onChange={e => setDistributionPct(Number(e.target.value))}
            disabled={resultat_net_local <= 0}
            style={{ flex: 1, accentColor: "var(--at-accent)", opacity: resultat_net_local <= 0 ? 0.3 : 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--at-accent)", width: 40, textAlign: "right" }}>{distributionPct}%</span>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <button onClick={() => setTaxMode("flat")}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 11, padding: "5px 12px", borderRadius: 3, cursor: "pointer", transition: "all .15s",
              border: taxMode === "flat" ? "1px solid var(--at-accent)" : "1px solid var(--rule)",
              color: taxMode === "flat" ? "var(--at-accent)" : "var(--ink3)",
              background: taxMode === "flat" ? "color-mix(in srgb, var(--at-accent) 8%, transparent)" : "transparent",
            }}>Flat tax 30%</button>
          {taxMode === "flat" && <InfoTip text="Prélèvement Forfaitaire Unique (PFU) : 12,8% d'IR + 17,2% de prélèvements sociaux = 30% du dividende brut. Option par défaut, pas besoin de la cocher sur la déclaration." />}
          <button onClick={() => setTaxMode("bareme")}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 11, padding: "5px 12px", borderRadius: 3, cursor: "pointer", transition: "all .15s",
              border: taxMode === "bareme" ? "1px solid var(--at-accent)" : "1px solid var(--rule)",
              color: taxMode === "bareme" ? "var(--at-accent)" : "var(--ink3)",
              background: taxMode === "bareme" ? "color-mix(in srgb, var(--at-accent) 8%, transparent)" : "transparent",
            }}>Barème TMI 0%</button>
          {taxMode === "bareme" && <InfoTip text="Option barème progressif de l'IR (case 2OP). Avec TMI 0% (marié, 2 enfants, revenus < seuil), seuls les PS 17,2% s'appliquent. Avantage : économie de 12,8% d'IR. À cocher sur la déclaration de revenus." />}
        </div>
        {resultat_net_local > 0 ? (
          <div style={{ border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--at-bg)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600, borderBottom: "1px solid var(--rule)" }}></th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600, borderBottom: "1px solid var(--rule)" }}>Flat tax 30%</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", fontWeight: 600, borderBottom: "1px solid var(--rule)" }}>Barème TMI 0%</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px dotted var(--rule)" }}>
                  <td style={{ padding: "9px 12px", color: "var(--ink)" }}>Dividende brut</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{EUR.format(dividende_brut)}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{EUR.format(dividende_brut)}</td>
                </tr>
                <tr style={{ borderBottom: "1px dotted var(--rule)" }}>
                  <td style={{ padding: "9px 12px", color: "var(--ink)" }}>IR (12,8% / 0%)</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--at-neg)" }}>{EUR.format(ir_flat)}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--at-pos)" }}>0,00 €</td>
                </tr>
                <tr style={{ borderBottom: "1px dotted var(--rule)" }}>
                  <td style={{ padding: "9px 12px", color: "var(--ink)" }}>PS (17,2%)</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--at-neg)" }}>{EUR.format(ps_flat)}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--at-neg)" }}>{EUR.format(ps_bareme)}</td>
                </tr>
                <tr style={{ borderBottom: "1px dotted var(--rule)" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "var(--ink)" }}>Net pour Fabien</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--at-pos)" }}>{EUR.format(net_flat)}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--at-pos)" }}>{EUR.format(net_bareme)}</td>
                </tr>
                <tr style={{ borderBottom: "1px dotted var(--rule)" }}>
                  <td style={{ padding: "9px 12px", color: "var(--ink)" }}>Prélèvement total (IS + div.)</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{EUR.format(total_taxes_flat)}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{EUR.format(total_taxes_bareme)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "9px 12px", color: "var(--ink)", display: "flex", alignItems: "center" }}>
                    Taux global d'imposition
                    <InfoTip text="(IS payé + IR + PS sur dividendes) / Résultat brut avant IS × 100. C'est le % total de taxes entre le bénéfice FHF et ce qui arrive dans ta poche." wide />
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{taux_global_flat.toFixed(1)}%</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{taux_global_bareme.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink3)" }}>Pas de distribution possible sur un déficit.</div>
        )}
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 10, fontStyle: "italic", color: "var(--ink3)", marginTop: 12, display: "flex", alignItems: "center" }}>
          Capitaliser = réinvestir dans FHF sans frottement fiscal supplémentaire
          <InfoTip text="Tant que l'argent reste dans FHF, seul l'IS est payé. Pas de flat tax ni PS. Tu peux réinvestir 100% du résultat net en trading ou participations. La flat tax ne s'applique qu'au moment de la distribution effective des dividendes." wide />
        </div>
      </div>

      {/* ── INDICATEURS COMPLÉMENTAIRES ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            NLV IBKR<InfoTip text="Net Liquidation Value = Cash + Positions. Synchro IBKR Flex Query quotidienne à 22h UTC. Source : cash_balances + positions." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>{EUR.format(data.ibkr_nlv)}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>Valeur totale compte</div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            ROI IBKR<InfoTip text="Return On Investment = (NLV − Capital investi) / Capital investi × 100. Inclut P&L réalisé + latent. Source : NLV IBKR / factures 512100." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: data.capital_ibkr > 0 && (data.ibkr_nlv - data.capital_ibkr) >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {data.capital_ibkr > 0 ? ((data.ibkr_nlv - data.capital_ibkr) / data.capital_ibkr * 100).toFixed(1) : "0.0"}%
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>(NLV − capital) / capital</div>
        </div>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            ROI Global<InfoTip text="Résultat avant IS / Capital total investi (IBKR + Kraken) × 100. Mesure la performance globale de FHF sur l'année." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: roi >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
            {roi.toFixed(1)}%
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>Résultat / Capital investi</div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Solde CCA<InfoTip text="Compte Courant Associé (455000). Solde des apports et remboursements entre Fabien et FHF. Positif = FHF te doit de l'argent. Source : factures catégorie 455000 dans compta." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>{EUR.format(Math.abs(data.cca_balance))}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>
            {data.cca_balance >= 0 ? "FHF doit à Fabien" : "Fabien doit à FHF"}
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Trésorerie Qonto<InfoTip text="Solde du compte bancaire FHF (Qonto). Calculé depuis les relevés CSV importés." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>{EUR.format(data.treso_qonto)}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>Solde bancaire</div>
        </div>
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
            Break-even<InfoTip text="Charges HT totales / nombre de mois écoulés = charge mensuelle moyenne. C'est le P&L trading minimum nécessaire chaque mois pour couvrir les frais et ne pas être en déficit." />
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
            {EUR.format(chargesMensuelles)}<span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink3)" }}>/m</span>
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)", marginTop: 4 }}>P&L min. mensuel</div>
        </div>
      </div>

      {/* ── MAINTENANCE ───────────────────────────────────────── */}
      <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Maintenance</span>
          <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink3)" }}>Admin</span>
        </div>
        <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: 20 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, color: "var(--ink2)", lineHeight: 1.5 }}>
            Synchronisation centralisée via <a href="/settings/connexions" style={{ color: "var(--at-accent)", textDecoration: "underline" }}>/settings/connexions</a> ou le bouton « Tout synchroniser » en page d'accueil.
            <br />Cron automatique quotidien à 22h UTC inchangé.
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, italic, note, tooltip }: { label: string; value: number; italic?: boolean; note?: string; tooltip?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink)", padding: "4px 0" }}>
      <span style={{ display: "flex", alignItems: "center", fontFamily: "var(--font-mono)" }}>
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...(italic ? { fontStyle: "italic", color: "var(--ink2)" } : {}) }}>
        {EUR.format(value)}
        {note && <span style={{ fontSize: 9, color: "var(--ink3)", marginLeft: 4 }}>({note})</span>}
      </span>
    </div>
  )
}
