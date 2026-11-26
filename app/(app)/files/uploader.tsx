'use client'
// =============================================================================
// files/uploader.tsx — "Share a file" form
//
// Pick a file (PDF / image / audio), give it a title and optional note, and
// choose Everyone or particular pupils. On "Share": ask the server for a
// one-off upload link, send the file straight to storage (with progress
// shown as "Uploading…"), then save the details. Errors show under the button.
// =============================================================================
import { useState } from 'react'
import { Picker, type PickerOption } from '@/components/pickers'
import { prepareUpload, saveFile } from './actions'

export function FileUploader({ students }: { students: PickerOption[] }) {
  const [busy, setBusy] = useState<'' | 'uploading' | 'saving'>('')
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null)
  const [everyone, setEveryone] = useState(true)
  const [round, setRound] = useState(0) // remount to clear the form after success

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const file = fd.get('file')
    if (!(file instanceof File) || file.size === 0) return setMsg({ error: 'Choose a file to share.' })
    setMsg(null)
    setBusy('uploading')
    try {
      // 1. Upload link from the server (checks type and size)
      const prep = await prepareUpload(file.name, file.type, file.size)
      if (!prep.ok) throw new Error(prep.error)
      // 2. Straight to storage
      const body = new FormData()
      body.append('cacheControl', '3600')
      body.append('', file)
      const res = await fetch(prep.signedUrl, { method: 'PUT', body, headers: { 'x-upsert': 'false' } })
      if (!res.ok) throw new Error('The upload didn’t finish — please try again.')
      // 3. Save the details
      setBusy('saving')
      const saved = await saveFile({
        path: prep.path,
        fileName: file.name,
        mime: file.type,
        size: file.size,
        title: String(fd.get('title') ?? ''),
        notes: String(fd.get('notes') ?? ''),
        everyone,
        studentIds: fd.getAll('student_ids').map(String),
      })
      if (saved?.error) throw new Error(saved.error)
      setMsg({ ok: saved?.ok ?? 'Shared.' })
      setEveryone(true)
      setRound((r) => r + 1)
    } catch (err) {
      setMsg({ error: (err as Error).message })
    } finally {
      setBusy('')
    }
  }

  return (
    <form key={round} className="form" onSubmit={onSubmit}>
      <div className="field">
        <label className="field-label" htmlFor="share-file">
          File
        </label>
        <input id="share-file" name="file" type="file" className="input" accept="application/pdf,image/png,image/jpeg,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" required />
        <span className="field-hint">PDF sheet music, a photo or scan, or an audio backing track — up to 25 MB.</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="share-title">
          Title
        </label>
        <input id="share-title" name="title" className="input" placeholder="e.g. Grade 3 scales, Minuet in G" autoComplete="off" />
        <span className="field-hint">Leave empty to use the file name.</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="share-notes">
          Note for families (optional)
        </label>
        <textarea id="share-notes" name="notes" className="textarea" rows={2} placeholder="e.g. Practise bars 1–16 slowly this week" maxLength={1000} />
      </div>

      {/* ---- Who can see it ---- */}
      <fieldset className="field">
        <legend className="field-label">Who’s it for?</legend>
        <div className="segmented" role="radiogroup">
          <label>
            <input type="radio" name="who" checked={everyone} onChange={() => setEveryone(true)} />
            <span>Everyone</span>
          </label>
          <label>
            <input type="radio" name="who" checked={!everyone} onChange={() => setEveryone(false)} />
            <span>Choose pupils</span>
          </label>
        </div>
      </fieldset>
      {!everyone && <Picker name="student_ids" label="Pupils" options={students} multiple placeholder="Type a name…" />}

      <div className="form-actions">
        <button type="submit" className="btn" disabled={!!busy}>
          {busy === 'uploading' ? 'Uploading…' : busy === 'saving' ? 'Saving…' : 'Share file'}
        </button>
      </div>
      {msg?.error && (
        <div className="alert alert-error" role="alert">
          {msg.error}
        </div>
      )}
      {msg?.ok && (
        <div className="alert alert-ok" role="status">
          {msg.ok}
        </div>
      )}
    </form>
  )
}
