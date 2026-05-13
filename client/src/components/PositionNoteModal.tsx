import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

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

const MAX_IMAGES = 6

async function authFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
}

async function uploadImage(file: File): Promise<string | null> {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user?.id
  const ext = file.name?.split(".").pop() || "png"
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from("position-charts")
    .upload(fileName, file, { contentType: file.type })
  if (error) return null
  const { data: urlData } = supabase.storage.from("position-charts").getPublicUrl(fileName)
  return urlData.publicUrl
}

interface PositionNoteModalProps {
  isOpen: boolean
  onClose: () => void
  ticker: string
  accountId: string
  positionId?: string
  currency?: string
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
  const [saving, setSaving] = useState(false)

  const [thesis, setThesis] = useState("")
  const [images, setImages] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const info = COMPANY_INFO[ticker]

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setDirty(false)
    authFetch(`/api/position-notes?account_id=${accountId}&ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : { notes: [] })
      .then(({ notes }) => {
        const active = (notes as NoteData[])?.[0] || null
        setNote(active)
        setThesis(active?.thesis || "")
        const imgs: string[] = active?.images || []
        if (imgs.length === 0 && active?.image_url) {
          imgs.push(active.image_url)
        }
        setImages(imgs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen, accountId, ticker])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const addImageFiles = useCallback(async (files: File[]) => {
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) { showToast("Maximum 6 graphes par thèse"); return }
    const toProcess = files.slice(0, remaining)
    if (files.length > remaining) showToast(`${files.length - remaining} image(s) ignorée(s) — max 6`)
    for (const file of toProcess) {
      const url = await uploadImage(file)
      if (url) {
        setImages(prev => [...prev, url])
        setDirty(true)
        showToast("Graphe ajouté")
      }
    }
  }, [images.length])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) addImageFiles(imageFiles)
  }, [addImageFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files: File[] = []
    for (const f of e.dataTransfer.files) {
      if (f.type.startsWith("image/")) files.push(f)
    }
    if (files.length > 0) addImageFiles(files)
  }, [addImageFiles])

  function removeImage(idx: number) {
    setImages(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  function handleThesisChange(val: string) {
    setThesis(val)
    setDirty(true)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
    }
  }, [thesis, loading])

  async function save() {
    setSaving(true)
    try {
      const body = { thesis: thesis || null, images }
      if (note?.id) {
        const r = await authFetch(`/api/position-notes/${note.id}`, { method: "PUT", body: JSON.stringify(body) })
        if (r.ok) {
          const { note: updated } = await r.json()
          setNote(updated)
          setDirty(false)
          showToast("Sauvegardé")
        }
      } else {
        const r = await authFetch("/api/position-notes", {
          method: "POST",
          body: JSON.stringify({ account_id: accountId, ticker, position_id: positionId || null, ...body }),
        })
        if (r.ok) {
          const { note: created } = await r.json()
          setNote(created)
          setDirty(false)
          showToast("Sauvegardé")
        }
      }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIdx === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIdx(null)
      if (e.key === "ArrowRight") setLightboxIdx(i => i !== null ? Math.min(i + 1, images.length - 1) : null)
      if (e.key === "ArrowLeft") setLightboxIdx(i => i !== null ? Math.max(i - 1, 0) : null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxIdx, images.length])

  // Escape to close panel (when lightbox not open)
  useEffect(() => {
    if (!isOpen || lightboxIdx !== null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, lightboxIdx, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* ── PANEL OVERLAY ──────────────────────────────────────── */}
      <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(26,24,20,0.5)" }}
        onClick={onClose}>
        <div style={{
          background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 6,
          width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto", margin: 16,
        }}
          onClick={e => e.stopPropagation()}
          onPaste={handlePaste}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}>

          {/* ── HEADER ───────────────────────────────────────── */}
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
          </div>

          {loading && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Chargement…
            </div>
          )}

          {!loading && (
            <div style={{ padding: "20px 24px" }}>

              {/* ── SECTOR ─────────────────────────────────── */}
              {info && (
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink2)", marginBottom: 12 }}>
                  {info.sector}
                </div>
              )}

              {/* ── DESCRIPTION ────────────────────────────── */}
              {info && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>
                    {info.description}
                  </p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink2)", marginTop: 8 }}>
                    {info.metrics}
                  </p>
                </div>
              )}

              {/* ── SECTION: THÈSE ─────────────────────────── */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 12px" }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>
                  Thèse
                </span>
                <span style={{ flex: 1, borderBottom: "1px dotted var(--rule)" }} />
              </div>

              <textarea
                ref={textareaRef}
                value={thesis}
                onChange={e => handleThesisChange(e.target.value)}
                placeholder="Ta thèse : setup technique, catalyseur fondamental, conviction…"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "var(--at-surface)", border: "1px dotted var(--rule)", borderRadius: 4,
                  padding: 12, fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.55,
                  color: "var(--ink)", resize: "none", outline: "none", minHeight: 80, overflow: "hidden",
                }}
              />

              {/* ── SECTION: GRAPHES ───────────────────────── */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 12px" }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>
                  Graphes
                </span>
                <span style={{ flex: 1, borderBottom: "1px dotted var(--rule)" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {images.map((url, i) => (
                  <div key={i} style={{ position: "relative", aspectRatio: "16/10", borderRadius: 4, overflow: "hidden", border: "1px solid var(--rule)", cursor: "pointer", transition: "transform .15s" }}
                    onClick={() => setLightboxIdx(i)}
                    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.02)" }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)" }}>
                    <img src={url} alt={`graphe ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      onClick={e => { e.stopPropagation(); removeImage(i) }}
                      style={{
                        position: "absolute", top: 4, right: 4, width: 20, height: 20,
                        background: "rgba(26,24,20,0.7)", borderRadius: "50%", border: "none",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: 0, transition: "opacity .15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = "1" }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = "0" }}
                      className="img-delete-btn">
                      <X size={12} color="var(--at-bg)" />
                    </button>
                  </div>
                ))}

                {images.length < MAX_IMAGES && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      aspectRatio: "16/10", borderRadius: 4,
                      border: dragging ? "2px solid var(--at-accent)" : "2px dashed var(--rule)",
                      background: dragging ? "color-mix(in srgb, var(--at-accent) 5%, transparent)" : "var(--at-bg)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", transition: "border .15s, background .15s", gap: 4,
                    }}>
                    <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--ink3)" }}>
                      Coller un graphe
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink3)", letterSpacing: 1, textTransform: "uppercase" }}>
                      Ctrl+V · Drop · Clic
                    </span>
                  </div>
                )}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  if (files.length > 0) addImageFiles(files)
                  e.target.value = ""
                }} />

              {/* ── FOOTER ─────────────────────────────────── */}
              <div style={{ borderTop: "1px dotted var(--rule)", marginTop: 20, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)" }}>
                  {note?.updated_at || note?.created_at
                    ? `Mis à jour : ${new Date(note.updated_at || note.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    : "Nouvelle thèse"
                  }
                </span>
                {dirty && (
                  <button onClick={save} disabled={saving}
                    style={{
                      padding: "8px 20px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                      background: "var(--at-accent)", color: "var(--at-bg)", border: "none", borderRadius: 3,
                      cursor: saving ? "wait" : "pointer", opacity: saving ? 0.5 : 1, transition: "opacity .15s",
                    }}>
                    {saving ? "…" : "Sauvegarder"}
                  </button>
                )}
              </div>

              {/* ── TOAST ──────────────────────────────────── */}
              {toast && (
                <div style={{
                  position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 100,
                  background: "var(--ink)", color: "var(--at-bg)", padding: "8px 20px", borderRadius: 4,
                  fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: 0.5,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}>
                  {toast}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── LIGHTBOX ─────────────────────────────────────────── */}
      {lightboxIdx !== null && images[lightboxIdx] && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(26,24,20,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightboxIdx(null)}>
          <button onClick={() => setLightboxIdx(null)}
            style={{ position: "absolute", top: 20, right: 20, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", zIndex: 1 }}>
            <X size={24} />
          </button>
          {lightboxIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null ? i - 1 : null) }}
              style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", zIndex: 1 }}>
              <ChevronLeft size={32} />
            </button>
          )}
          {lightboxIdx < images.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null ? i + 1 : null) }}
              style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", zIndex: 1 }}>
              <ChevronRight size={32} />
            </button>
          )}
          <img src={images[lightboxIdx]} alt="graphe" onClick={e => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 4 }} />
        </div>
      )}

      {/* ── HOVER STYLE FOR DELETE BUTTONS ────────────────────── */}
      <style>{`
        div:hover > .img-delete-btn { opacity: 1 !important; }
      `}</style>
    </>
  )
}
