import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { X } from "lucide-react"
import NotePanel from "./NotePanel"

const COMPANY_INFO: Record<string, { sector: string; description: string; metrics: string }> = {
  "RMS": {
    sector: "Luxe",
    description: "Hermès International — maison de luxe française fondée en 1837. Maroquinerie (44%), prêt-à-porter (28%), soie & textiles (6%), horlogerie (3%), parfums (3%). 294 magasins dans le monde.",
    metrics: "Cap: ~170 Md€ · Marge op: 39,8% · Div: 0,53% · PER: ~45x",
  },
  "MC": {
    sector: "Luxe",
    description: "LVMH Moët Hennessy Louis Vuitton — n°1 mondial du luxe. Louis Vuitton, Dior, Fendi, Bulgari, Tiffany, Hennessy, Dom Pérignon, Sephora. 6 283 magasins. CA ~85 Md€.",
    metrics: "Cap: ~235 Md€ · Marge EBITDA: 30% · Div: ~1,6% · PER: ~22x",
  },
  "EL": {
    sector: "Santé / Optique",
    description: "EssilorLuxottica — leader mondial de l'optique. Verres (Varilux, Transitions), montures (Ray-Ban, Oakley, Persol), retail (Sunglass Hut, LensCrafters). Lunettes connectées Ray-Ban Meta en croissance.",
    metrics: "Cap: ~83 Md€ · Marge EBITDA: 23% · Div: 2,2% · PER: ~36x",
  },
  "UBI": {
    sector: "Tech / Gaming",
    description: "Ubisoft Entertainment — éditeur français de jeux vidéo. Franchises : Assassin's Creed, Far Cry, Rainbow Six, Just Dance. En restructuration depuis 2024. Rumeurs de rachat par Tencent / consortium.",
    metrics: "Cap: ~600 M€ · Marge op: négative · Div: 0% · PER: n/a",
  },
  "ALCAP": {
    sector: "Immobilier",
    description: "Altur Investissement (ex-Altarea Capital) — foncière française. Micro-cap. Activité de capital-investissement et prise de participations.",
    metrics: "Cap: ~10 M€ · Micro-cap · Peu liquide",
  },
  "AI": {
    sector: "Tech / IA",
    description: "C3.ai — plateforme enterprise IA. Applications IA pour l'industrie, la défense, l'énergie. Fondée par Tom Siebel. Partenariat avec Microsoft Azure, AWS, Google Cloud.",
    metrics: "Cap: ~$3,2 Md · Marge brute: 60% · Cash: $730M · Non profitable",
  },
  "BKKT": {
    sector: "Crypto / Fintech",
    description: "Bakkt Holdings — plateforme crypto institutionnelle (ICE/NYSE). Custody, trading, paiements crypto. Partenariat Mastercard. Rachat par ICE acté.",
    metrics: "Cap: ~$2 Md · Early stage · Revenus faibles · Spéculatif",
  },
  "CRCL": {
    sector: "Crypto / Fintech",
    description: "Circle Internet Group — émetteur du stablecoin USDC (~$60 Md en circulation). Revenus tirés des réserves (T-bills). IPO avril 2025 sur NYSE.",
    metrics: "Cap: ~$10 Md · Revenus: ~$1,7 Md · Profitable · Marge ~25%",
  },
  "NIO": {
    sector: "Auto / EV",
    description: "NIO Inc — constructeur chinois de véhicules électriques premium. Battery-as-a-Service (swap stations). Modèles : ES8, ES6, ET7, ET5. Expansion Europe.",
    metrics: "Cap: ~$10 Md · Cash burning · Livraisons: ~160K/an · Non profitable",
  },
  "RACE": {
    sector: "Auto / Luxe",
    description: "Ferrari N.V. — constructeur automobile de luxe et sport italien. Modèles iconiques, éditions limitées. Marge opérationnelle parmi les plus élevées de l'auto. Première Ferrari électrique annoncée pour 2026.",
    metrics: "Cap: ~$60 Md · Marge op: 27% · Div: 0,7% · PER: ~45x",
  },
  "SNOW": {
    sector: "Tech / Cloud",
    description: "Snowflake Inc — plateforme cloud data (data warehousing, data lake, data sharing). Clients enterprise. Revenus produit ~$2,9 Md. Croissance ~25%/an.",
    metrics: "Cap: ~$50 Md · Marge brute: 67% · Net retention: 127% · Non profitable",
  },
  "PATH": {
    sector: "Tech / RPA",
    description: "UiPath Inc — leader mondial de l'automatisation robotique des processus (RPA). Plateforme enterprise IA + automation. ~10 600 clients.",
    metrics: "Cap: ~$6 Md · ARR: $1,6 Md · Marge brute: 85% · Breakeven",
  },
  "PUBM": {
    sector: "Tech / AdTech",
    description: "PubMatic Inc — plateforme SSP (supply-side) de publicité programmatique. Cloud infrastructure propriétaire. Revenus ~$280M. Profitable.",
    metrics: "Cap: ~$550 M · Marge EBITDA: ~30% · Profitable · PER: ~18x",
  },
  "RIVN": {
    sector: "Auto / EV",
    description: "Rivian Automotive — constructeur américain de pickups et SUV électriques (R1T, R1S). Usine Normal, Illinois. Partenariat Amazon (vans de livraison). Lancement R2 prévu 2026.",
    metrics: "Cap: ~$14 Md · Cash burn élevé · Livraisons: ~50K/an · Non profitable",
  },
  "SBET": {
    sector: "Tech / iGaming",
    description: "SharpLink Gaming — plateforme de paris sportifs et iGaming. Technologie de conversion de contenu sportif en paris. Small cap spéculative.",
    metrics: "Cap: ~$100 M · Small cap · Revenus faibles · Spéculatif",
  },
  "FLUT": {
    sector: "Paris sportifs",
    description: "Flutter Entertainment — n°1 mondial des paris en ligne. FanDuel (US), Paddy Power, Betfair, PokerStars, Sportsbet. Listage NYSE + LSE.",
    metrics: "Cap: ~$35 Md · Revenus: ~$14 Md · Leader US via FanDuel",
  },
  "P911": {
    sector: "Auto / Luxe",
    description: "Porsche AG — constructeur automobile de luxe et sport allemand. 911, Cayenne, Taycan (EV), Macan. IPO sept 2022. VW détient ~75%.",
    metrics: "Cap: ~$40 Md · Marge op: ~18% · Div: ~1,5% · PER: ~14x",
  },
  "RI": {
    sector: "Spiritueux",
    description: "Pernod Ricard — n°2 mondial des vins et spiritueux. Absolut, Jameson, Martell, Chivas, Mumm, Perrier-Jouët. 160 pays.",
    metrics: "Cap: ~$16 Md · Marge op: ~28% · Div: ~3,5% · PER: ~16x",
  },
}

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

interface PositionNoteModalProps {
  isOpen: boolean
  onClose: () => void
  ticker: string
  accountId: string
  positionId?: string
}

interface NoteData {
  id: string
  thesis: string | null
  images: string[]
  image_url: string | null
  updated_at: string
  created_at: string
}

export default function PositionNoteModal({ isOpen, onClose, ticker, accountId, positionId }: PositionNoteModalProps) {
  const [note, setNote] = useState<NoteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialText, setInitialText] = useState("")
  const [initialImages, setInitialImages] = useState<string[]>([])

  const info = COMPANY_INFO[ticker]

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    authFetch(`/api/position-notes?account_id=${accountId}&ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : { notes: [] })
      .then(({ notes }) => {
        const active = (notes as NoteData[])?.[0] || null
        setNote(active)
        setInitialText(active?.thesis || "")
        const imgs: string[] = active?.images || []
        if (imgs.length === 0 && active?.image_url) {
          imgs.push(active.image_url)
        }
        setInitialImages(imgs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen, accountId, ticker])

  const handleSave = useCallback(async (text: string, images: string[]) => {
    const body = { thesis: text || null, images }
    if (note?.id) {
      const r = await authFetch(`/api/position-notes/${note.id}`, { method: "PUT", body: JSON.stringify(body) })
      if (r.ok) {
        const { note: updated } = await r.json()
        setNote(updated)
      }
    } else {
      const r = await authFetch("/api/position-notes", {
        method: "POST",
        body: JSON.stringify({ account_id: accountId, ticker, position_id: positionId || null, ...body }),
      })
      if (r.ok) {
        const { note: created } = await r.json()
        setNote(created)
      }
    }
  }, [note, accountId, ticker, positionId])

  const header = (
    <div style={{ padding: "20px 24px 16px", borderBottom: "2px solid var(--ink)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.5 }}>
            {ticker}
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontStyle: "italic", color: "var(--ink2)", marginTop: 2 }}>
            {info?.description?.split("—")[0]?.trim() || ticker}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", padding: 4 }}>
          <X size={18} />
        </button>
      </div>
      {info && !loading && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink2)", marginBottom: 8 }}>
            {info.sector}
          </div>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.55, color: "var(--ink)", margin: 0 }}>
            {info.description}
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)", marginTop: 8, marginBottom: 0 }}>
            {info.metrics}
          </p>
        </div>
      )}
    </div>
  )

  return (
    <NotePanel
      isOpen={isOpen}
      onClose={onClose}
      mode="modal"
      header={header}
      loading={loading}
      initialText={initialText}
      initialImages={initialImages}
      textPlaceholder="Ta thèse : setup technique, catalyseur fondamental, conviction…"
      textSectionTitle="Thèse"
      onSave={handleSave}
      updatedAt={note?.updated_at || note?.created_at || null}
    />
  )
}
