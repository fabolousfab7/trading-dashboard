import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { X, Image as ImageIcon } from "lucide-react"

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
  currency?: string
}

export default function PositionNoteModal({ isOpen, onClose, ticker, accountId, positionId, currency = "EUR" }: PositionNoteModalProps) {
  const [allNotes, setAllNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [thesis, setThesis] = useState("")
  const [targetPrice, setTargetPrice] = useState("")
  const [stopLoss, setStopLoss] = useState("")
  const [horizon, setHorizon] = useState("")
  const [status, setStatus] = useState("active")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const activeNote = allNotes[0] || null

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    authFetch(`/api/position-notes?account_id=${accountId}&ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : { notes: [] })
      .then(({ notes }) => setAllNotes(notes || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen, accountId, ticker])

  function resetForm() {
    setEditingNoteId(null)
    setThesis("")
    setTargetPrice("")
    setStopLoss("")
    setHorizon("")
    setStatus("active")
    setImageFile(null)
    setImagePreview(null)
  }

  function prefillFromNote(note: any) {
    if (!note) { resetForm(); return }
    setEditingNoteId(note.id)
    setThesis(note.thesis || "")
    setTargetPrice(note.target_price != null ? String(note.target_price) : "")
    setStopLoss(note.stop_loss != null ? String(note.stop_loss) : "")
    setHorizon(note.horizon || "")
    setStatus(note.status || "active")
    setImageFile(null)
    setImagePreview(note.image_url || null)
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
  }

  function handleImagePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          setImageFile(file)
          setImagePreview(URL.createObjectURL(file))
        }
        return
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setImageFile(f)
      setImagePreview(URL.createObjectURL(f))
    }
  }

  async function saveNote() {
    setSaving(true)
    try {
      let imageUrl = editingNoteId ? (imagePreview || null) : null
      if (imageFile) {
        const { data: session } = await supabase.auth.getSession()
        const userId = session.session?.user?.id
        const ext = imageFile.name.split(".").pop()
        const fileName = `${userId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from("position-charts")
          .upload(fileName, imageFile, { contentType: imageFile.type })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("position-charts").getPublicUrl(fileName)
          imageUrl = urlData.publicUrl
        }
      }

      const body: any = {
        thesis: thesis || null,
        image_url: imageUrl,
        target_price: targetPrice ? Number(targetPrice) : null,
        stop_loss: stopLoss ? Number(stopLoss) : null,
        horizon: horizon || null,
        status,
      }

      if (editingNoteId) {
        const r = await authFetch(`/api/position-notes/${editingNoteId}`, { method: "PUT", body: JSON.stringify(body) })
        if (r.ok) {
          const { note } = await r.json()
          setAllNotes(prev => prev.map(n => n.id === note.id ? note : n))
        }
      } else {
        body.account_id = accountId
        body.ticker = ticker
        body.position_id = positionId || null
        const r = await authFetch("/api/position-notes", { method: "POST", body: JSON.stringify(body) })
        if (r.ok) {
          const { note } = await r.json()
          setAllNotes(prev => [note, ...prev])
        }
      }
      setIsEditing(false)
      resetForm()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d0e14] border border-cyan-500/20 rounded-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto m-4"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between p-4 border-b border-cyan-500/10">
          <div className="flex items-center gap-3">
            <span className="text-fuchsia-400 font-bold font-mono text-lg">{ticker}</span>
            <span className="text-zinc-500 text-xs font-mono">Thèse & Conviction</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {loading && <div className="p-6 text-zinc-500 text-xs font-mono text-center">Chargement...</div>}

        {!loading && !isEditing && (
          <div className="p-4 space-y-4">
            {activeNote ? (
              <>
                <div className="flex items-center gap-2">
                  {activeNote.horizon && (
                    <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-[10px] font-mono text-cyan-400 uppercase">
                      {activeNote.horizon}
                    </span>
                  )}
                  {activeNote.status && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                      activeNote.status === "active" ? "bg-green-500/10 border border-green-500/20 text-green-400" :
                      activeNote.status === "closed" ? "bg-zinc-500/10 border border-zinc-500/20 text-zinc-400" :
                      "bg-red-500/10 border border-red-500/20 text-red-400"
                    }`}>
                      {activeNote.status}
                    </span>
                  )}
                </div>

                {(activeNote.target_price || activeNote.stop_loss) && (
                  <div className="flex gap-4">
                    {activeNote.target_price && (
                      <div className="text-xs font-mono">
                        <span className="text-zinc-500">Target: </span>
                        <span className="text-green-400">{activeNote.target_price} {currency}</span>
                      </div>
                    )}
                    {activeNote.stop_loss && (
                      <div className="text-xs font-mono">
                        <span className="text-zinc-500">Stop: </span>
                        <span className="text-red-400">{activeNote.stop_loss} {currency}</span>
                      </div>
                    )}
                  </div>
                )}

                {activeNote.thesis && (
                  <p className="text-sm font-mono text-zinc-300 whitespace-pre-wrap">{activeNote.thesis}</p>
                )}

                {activeNote.image_url && (
                  <img src={activeNote.image_url} alt="chart"
                    className="rounded border border-cyan-500/10 max-h-64 w-full object-contain cursor-pointer hover:border-cyan-500/30 transition"
                    onClick={() => window.open(activeNote.image_url, "_blank")} />
                )}

                <div className="text-[9px] font-mono text-zinc-600">
                  Mis à jour : {new Date(activeNote.updated_at || activeNote.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </>
            ) : (
              <p className="text-zinc-600 text-xs font-mono text-center py-4">Aucune thèse enregistrée pour {ticker}</p>
            )}
          </div>
        )}

        {!loading && isEditing && (
          <div className="p-4 border-t border-cyan-500/10 space-y-3" onPaste={handleImagePaste}>
            <textarea value={thesis} onChange={e => setThesis(e.target.value)}
              placeholder="Ta thèse : pourquoi ce trade, quel setup, quel catalyseur..."
              rows={4}
              className="w-full bg-transparent border border-cyan-500/20 rounded px-3 py-2 text-sm font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 resize-none" />

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] font-mono text-zinc-500 uppercase mb-1 block">Target</label>
                <input type="number" step="any" value={targetPrice} onChange={e => setTargetPrice(e.target.value)}
                  placeholder="0.00" className="w-full bg-transparent border border-cyan-500/20 rounded px-2 py-1.5 text-xs font-mono text-green-400 placeholder:text-zinc-700 focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div>
                <label className="text-[9px] font-mono text-zinc-500 uppercase mb-1 block">Stop Loss</label>
                <input type="number" step="any" value={stopLoss} onChange={e => setStopLoss(e.target.value)}
                  placeholder="0.00" className="w-full bg-transparent border border-cyan-500/20 rounded px-2 py-1.5 text-xs font-mono text-red-400 placeholder:text-zinc-700 focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div>
                <label className="text-[9px] font-mono text-zinc-500 uppercase mb-1 block">Horizon</label>
                <select value={horizon} onChange={e => setHorizon(e.target.value)}
                  className="w-full bg-[#0d0e14] border border-cyan-500/20 rounded px-2 py-1.5 text-xs font-mono text-cyan-400 focus:outline-none focus:border-cyan-500/50">
                  <option value="">—</option>
                  <option value="swing">Swing</option>
                  <option value="position">Position</option>
                  <option value="long-terme">Long terme</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 rounded text-zinc-400 hover:text-zinc-300 hover:border-zinc-500 transition cursor-pointer font-mono text-[10px] uppercase tracking-wider">
                <ImageIcon size={12} /> {imagePreview ? "Changer chart" : "Ajouter chart (Ctrl+V)"}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
              {imagePreview && (
                <div className="relative">
                  <img src={imagePreview} alt="preview" className="h-16 rounded border border-cyan-500/20" />
                  <button onClick={clearImage} className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full p-0.5">
                    <X size={10} className="text-white" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-zinc-500 uppercase">Statut</label>
              {(["active", "closed", "invalidated"] as const).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition ${
                    status === s
                      ? s === "active" ? "bg-green-500/20 border border-green-500/30 text-green-400"
                        : s === "closed" ? "bg-zinc-500/20 border border-zinc-500/30 text-zinc-400"
                        : "bg-red-500/20 border border-red-500/30 text-red-400"
                      : "text-zinc-600 border border-transparent hover:border-zinc-700"
                  }`}>
                  {s === "active" ? "Active" : s === "closed" ? "Clôturée" : "Invalidée"}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setIsEditing(false); resetForm() }}
                className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 font-mono text-[10px] uppercase tracking-wider transition">
                Annuler
              </button>
              <button onClick={saveNote} disabled={saving}
                className="px-4 py-1.5 bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-400 hover:bg-fuchsia-500/30 transition rounded font-mono text-[10px] uppercase tracking-wider disabled:opacity-40">
                {saving ? "..." : editingNoteId ? "Modifier" : "Sauvegarder"}
              </button>
            </div>
          </div>
        )}

        {!loading && !isEditing && (
          <div className="p-4 border-t border-cyan-500/10 flex gap-2">
            <button onClick={() => { prefillFromNote(activeNote); setIsEditing(true) }}
              className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition rounded font-mono text-[10px] uppercase tracking-wider">
              {activeNote ? "Modifier" : "Écrire ma thèse"}
            </button>
            {activeNote && (
              <button onClick={() => { resetForm(); setIsEditing(true) }}
                className="px-3 py-1.5 border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition rounded font-mono text-[10px] uppercase tracking-wider">
                Nouvelle note
              </button>
            )}
          </div>
        )}

        {allNotes.length > 1 && (
          <div className="p-4 border-t border-cyan-500/10">
            <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Historique · {allNotes.length - 1} note{allNotes.length > 2 ? "s" : ""} précédente{allNotes.length > 2 ? "s" : ""}
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {allNotes.slice(1).map((note: any) => (
                <div key={note.id} className="border border-zinc-800 rounded p-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] uppercase ${
                      note.status === "active" ? "text-green-400" : note.status === "closed" ? "text-zinc-500" : "text-red-400"
                    }`}>{note.status}</span>
                    <span className="text-zinc-600 text-[9px]">
                      {new Date(note.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                  {note.thesis && <p className="text-zinc-400 mt-1 line-clamp-2">{note.thesis}</p>}
                  {note.image_url && <img src={note.image_url} alt="chart" className="mt-1 h-20 rounded object-contain" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
