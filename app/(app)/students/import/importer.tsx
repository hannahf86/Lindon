'use client'
// =============================================================================
// students/import/importer.tsx — pick a CSV, check it, import it
//
// 1. Choose a file → it's read in the browser and checked on the server
// 2. A table shows each row: ✓ will be added, "already here", or what to fix
// 3. "Import N students" adds them and goes back to the students list
// Errors show under the button.
// =============================================================================
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui'
import { checkImport, runImport, type ImportCheck } from './actions'

const MAX_BYTES = 850_000

export function StudentImporter() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [check, setCheck] = useState<Extract<ImportCheck, { ok: true }> | null>(null)
  const [busy, setBusy] = useState<'' | 'checking' | 'importing'>('')
  const [error, setError] = useState('')

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setCheck(null)
    setError('')
    if (!file) return
    if (file.size > MAX_BYTES) return setError('That file is too big — split it into smaller files of a few hundred pupils.')
    if (/\.(xlsx?|numbers|ods)$/i.test(file.name)) return setError('That’s a spreadsheet file, not a CSV. In Excel or Google Sheets, use File → Save as / Download → CSV, then choose that file.')
    setBusy('checking')
    try {
      const t = await file.text()
      const result = await checkImport(t)
      if (!result.ok) return setError(result.error)
      setText(t)
      setFileName(file.name)
      setCheck(result)
    } catch {
      setError('The file couldn’t be read — make sure it’s a CSV file.')
    } finally {
      setBusy('')
    }
  }

  const onImport = async () => {
    setBusy('importing')
    setError('')
    const result = await runImport(text)
    if (!result.ok) {
      setBusy('')
      return setError(result.error)
    }
    router.push(`/students?imported=${result.added}`)
  }

  const counts = check
    ? { warn: check.rows.filter((r) => r.warnings.length > 0).length, add: check.adding, duplicate: check.rows.filter((r) => r.outcome === 'duplicate').length, problem: check.rows.filter((r) => r.outcome === 'problem').length }
    : null

  return (
    <Card title={check ? `Check ${fileName}` : 'Choose your file'}>
      {/* ---- File picker ---- */}
      <div className="field">
        <label className="field-label" htmlFor="csv">
          CSV file
        </label>
        <input id="csv" className="input" type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy !== ''} />
      </div>
      {busy === 'checking' && <p className="small muted">Checking…</p>}

      {/* ---- Row-by-row check ---- */}
      {check && counts && (
        <>
          <p style={{ margin: '16px 0 8px' }}>
            <strong>
              {counts.add} pupil{counts.add === 1 ? '' : 's'} to add
            </strong>
            {counts.duplicate > 0 && <span className="muted"> · {counts.duplicate} already on Lindon</span>}
            {counts.warn > 0 && <span className="import-warn"> · {counts.warn} with something to check afterwards</span>}
            {counts.problem > 0 && <span className="text-danger"> · {counts.problem} left out (no name)</span>}
          </p>
          {check.unknownHeadings.length > 0 && (
            <p className="small muted" style={{ marginTop: 0 }}>
              Kept in each pupil’s notes (no matching Lindon field): {check.unknownHeadings.join(', ')}
            </p>
          )}
          <div className="table-wrap import-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Pupil</th>
                  <th>Parent</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {check.rows.map((r) => (
                  <tr key={r.line} className={r.outcome === 'add' ? '' : 'import-skip'}>
                    <td className="small muted">{r.line}</td>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td className="small">{r.parent || <span className="muted">—</span>}</td>
                    <td className="small">
                      {r.outcome === 'add' ? (
                        <>
                          <span>✓ {r.note}</span>
                          {r.warnings.length > 0 && <div className="import-warn">Added, but {r.warnings.join('; ')}.</div>}
                        </>
                      ) : r.outcome === 'duplicate' ? (
                        <span className="muted">{r.note}</span>
                      ) : (
                        <span className="text-danger">{r.note}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            Anything that doesn’t fit a Lindon field — extra columns, dates or emails we couldn’t read — is kept in each pupil’s notes, so nothing
            from your file is lost.
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={onImport} disabled={busy !== '' || counts.add === 0}>
              {busy === 'importing' ? 'Importing…' : `Import ${counts.add} pupil${counts.add === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}
    </Card>
  )
}
