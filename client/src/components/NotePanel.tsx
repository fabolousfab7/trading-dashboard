import { useState, useCallback, useRef, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

const MAX_IMAGES = 6

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

interface NotePanelProps {
  isOpen: boolean
  onClose: () => void
  mode: "modal" | "drawer"
  header: React.ReactNode
  loading?: boolean
  initialText: string
  initialImages: string[]
  textPlaceholder?: string
  textSectionTitle?: string
  onSave: (text: string, images: string[]) => Promise<void>
  updatedAt?: string | null
}

export default function NotePanel({
  isOpen, onClose, mode, header, loading = false,
  initialText, initialImages,
  textPlaceholder = "Ta note…",
  textSectionTitle = "Notes",
  onSave, updatedAt,
}: NotePanelProps) {
  const [text, setText] = useState(initialText)
  const [images, setImages] = useState<string[]>(initialImages)
  const [cleanText, setCleanText] = useState(initialText)
  const [cleanImages, setCleanImages] = useState<string[]>(initialImages)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setText(initialText)
    setImages(initialImages)
    setCleanText(initialText)
    setCleanImages(initialImages)
  }, [initialText, JSON.stringify(initialImages)])

  const dirty = text !== cleanText || JSON.stringify(images) !== JSON.stringify(cleanImages)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const addImageFiles = useCallback(async (files: File[]) => {
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) { showToast("Maximum 6 graphes"); return }
    const toProcess = files.slice(0, remaining)
    if (files.length > remaining) showToast(`${files.length - remaining} image(s) ignorée(s) — max 6`)
    for (const file of toProcess) {
      const url = await uploadImage(file)
      if (url) {
        setImages(prev => [...prev, url])
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
  }

  function handleTextChange(val: string) {
    setText(val)
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
  }, [text, loading])

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(text, images)
      setCleanText(text)
      setCleanImages([...images])
      showToast("Sauvegardé")
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

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

  useEffect(() => {
    if (!isOpen || lightboxIdx !== null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, lightboxIdx, onClose])

  if (!isOpen) return null

  const isDrawer = mode === "drawer"

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 50,
    display: "flex",
    justifyContent: isDrawer ? "flex-end" : "center",
    alignItems: isDrawer ? "stretch" : "center",
    background: "rgba(26,24,20,0.5)",
  }

  const panelStyle: React.CSSProperties = isDrawer ? {
    background: "var(--at-bg)", borderLeft: "1px solid var(--rule)",
    width: 480, maxWidth: "100vw", height: "100%", overflowY: "auto",
  } : {
    background: "var(--at-bg)", border: "1px solid var(--rule)", borderRadius: 6,
    width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto", margin: 16,
  }

  return (
    <>
      <div style={overlayStyle} onClick={onClose}>
        <div style={panelStyle}
          onClick={e => e.stopPropagation()}
          onPaste={handlePaste}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}>

          {header}

          {loading && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Chargement…
            </div>
          )}

          {!loading && (
            <div style={{ padding: "20px 24px" }}>

              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px" }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>
                  {textSectionTitle}
                </span>
                <span style={{ flex: 1, borderBottom: "1px dotted var(--rule)" }} />
              </div>

              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => handleTextChange(e.target.value)}
                placeholder={textPlaceholder}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "var(--at-surface)", border: "1px dotted var(--rule)", borderRadius: 4,
                  padding: 12, fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.55,
                  color: "var(--ink)", resize: "none", outline: "none", minHeight: 80, overflow: "hidden",
                }}
              />

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
                      className="np-img-del">
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
                      Ctrl+V &middot; Drop &middot; Clic
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

              <div style={{ borderTop: "1px dotted var(--rule)", marginTop: 20, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", color: "var(--ink3)" }}>
                  {updatedAt
                    ? `Mis à jour : ${new Date(updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    : "Nouvelle note"
                  }
                </span>
                {dirty && (
                  <button onClick={handleSave} disabled={saving}
                    style={{
                      padding: "8px 20px", fontFamily: "'Inter', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                      background: "var(--at-accent)", color: "var(--at-bg)", border: "none", borderRadius: 3,
                      cursor: saving ? "wait" : "pointer", opacity: saving ? 0.5 : 1, transition: "opacity .15s",
                    }}>
                    {saving ? "…" : "Sauvegarder"}
                  </button>
                )}
              </div>

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

      <style>{`div:hover > .np-img-del { opacity: 1 !important; }`}</style>
    </>
  )
}
