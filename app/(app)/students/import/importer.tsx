'use client'
// =============================================================================
// students/import/importer.tsx — pick a CSV, match its columns, check, import
//
// 1. Choose a file → it's read in the browser and checked on the server
// 2. Match your columns: every column in the file, a few example values, and
//    a dropdown of what Lindon will use it for (pre-filled with Lindon's
//    guess). Changing one re-checks straight away. (A dropdown here is an
//    approved exception to the no-dropdowns rule — it's a one-off setup.)
// 3. The pupils: each row ✓ will be added, "already here", or left out
// 4. "Import N pupils" adds them and goes back to the students list
// Errors show under the button.
// =============================================================================
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui'
import { checkImport, runImport, type ImportCheck } from './actions'

const MAX_BYTES = 850_000
type Checked = Extract<ImportCheck, { ok: true }>

export function StudentImporter() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [check, setCheck] = useState<Checked | null>(null)
  const [keys, setKeys] = useState<string[]>([])
  const [busy, setBusy] = useState<'' | 'checking' | 'importing'>('')
  const [error, setError] = useState('')

  // ---- 1. Choose a file ----
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
      setKeys(result.columns.map((c) => c.key))
    } catch {
      setError('The file couldn’t be read — make sure it’s a CSV file.')
    } finally {
      setBusy('')
    }
  }

  // ---- 2. Change what a column is used for → check again ----
  const onMatch = async (index: number, key: string) => {
    const next = keys.map((k, i) => (i === index ? key : k))
    setKeys(next)
    setError('')
    setBusy('checking')
    try {
      const result = await checkImport(text, next)
      if (!result.ok) return setError(result.error)
      setCheck(result)
    } finally {
      setBusy('')
    }
  }

  // ---- 4. Import ----
  const onImport = async () => {
    setBusy('importing')
    setError('')
    const result = await runImport(text, keys)
    if (!result.ok) {
      setBusy('')
      return setError(result.error)
    }
    router.push(`/students?imported=${result.added}`)
  }

  const counts = check
    ? {
        warn: check.rows.filter((r) => r.warnings.length > 0).length,
        add: check.adding,
        duplicate: check.rows.filter((r) => r.outcome === 'duplicate').length,
        problem: check.rows.filter((r) => r.outcome === 'problem').length,
      }
    : null
  // A Lindon field chosen for two columns: only the first is used
  const firstUse = new Map<string, number>()
  keys.forEach((k, i) => k !== 'keep' && k !== 'skip' && !firstUse.has(k) && firstUse.set(k, i))
  const labelOf = (key: string) => check?.targets.flatMap((g) => g.options).find((o) => o.key === key)?.label ?? key

  return (
    <Card title={check ? `Import ${fileName}` : 'Choose your file'} className={check ? 'import-wide' : ''}>
      {/* ---- File picker ---- */}
      <div className="field">
        <label className="field-label" htmlFor="csv">
          CSV file
        </label>
        <input id="csv" className="input" type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy === 'importing'} />
      </div>
      {busy === 'checking' && !check && <p className="small muted">Checking…</p>}

      {check && counts && (
        <>
          {/* ---- 2. Match your columns ---- */}
          <h3 className="import-step">1 · Match your columns</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            Lindon has guessed what each column in your file is. Change any that are wrong — the pupils below update as you go. “Keep in the pupil’s
            notes” copies it into their notes so nothing is lost.
          </p>
          <div className="table-wrap import-table import-match">
            <table className="table">
              <thead>
                <tr>
                  <th>Your column</th>
                  <th>Examples</th>
                  <th>Lindon will use it as</th>
                </tr>
              </thead>
              <tbody>
                {check.columns.map((c, i) => {
                  const key = keys[i] ?? 'keep'
                  const dupe = key !== 'keep' && key !== 'skip' && firstUse.get(key) !== i
                  return (
                    <tr key={i} className={key === 'skip' ? 'import-skip' : ''}>
                      <td>
                        <strong>{c.heading}</strong>
                      </td>
                      <td className="small muted import-samples">{c.samples.length ? c.samples.join(' · ') : 'empty'}</td>
                      <td>
                        <select className="input import-select" value={key} aria-label={`What “${c.heading}” is`} onChange={(e) => onMatch(i, e.target.value)} disabled={busy !== ''}>
                          {check.targets.map((g) => (
                            <optgroup key={g.label} label={g.label}>
                              {g.options.map((o) => (
                                <option key={o.key} value={o.key}>
                                  {o.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {dupe && <div className="import-warn">Already used for an earlier column — only the first one counts ({labelOf(key)}).</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ---- 3. The pupils ---- */}
          <h3 className="import-step">2 · Check the pupils {busy === 'checking' && <span className="small muted">(updating…)</span>}</h3>
          {check.problem ? (
            <div className="alert alert-error" role="alert">
              {check.problem}
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 8px' }}>
                <strong>
                  {counts.add} pupil{counts.add === 1 ? '' : 's'} to add
                </strong>
                {counts.duplicate > 0 && <span className="muted"> · {counts.duplicate} already on Lindon</span>}
                {counts.warn > 0 && <span className="import-warn"> · {counts.warn} with something to check afterwards</span>}
                {counts.problem > 0 && <span className="text-danger"> · {counts.problem} left out (no name)</span>}
              </p>
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
            </>
          )}

          {/* ---- 4. Import ---- */}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onImport} disabled={busy !== '' || counts.add === 0 || Boolean(check.problem)}>
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
