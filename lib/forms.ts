// =============================================================================
// lib/forms.ts — tiny FormData readers for server actions
//
// Every input in the app is typed by the teacher (no dropdowns), so these
// helpers trim, coerce and validate in one place. They throw FormError with a
// friendly message; actions catch it and return { error } to the form.
// =============================================================================

export class FormError extends Error {}

/** Result shape every form action returns (used with useActionState). */
export type ActionState = { error?: string; ok?: string } | null

export function str(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export function required(fd: FormData, key: string, label: string): string {
  const v = str(fd, key)
  if (!v) throw new FormError(`${label} is required.`)
  return v
}

/** Optional date "YYYY-MM-DD" → string | null */
export function date(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  if (!v) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new FormError(`"${v}" isn't a valid date.`)
  return v
}

/** Optional "HH:MM" time → string | null. Accepts "4:30pm", "16.30", "1630". */
export function time(fd: FormData, key: string, label = 'Time'): string | null {
  const v = str(fd, key)
  if (!v) return null
  return parseTime(v, label)
}

export function parseTime(raw: string, label = 'Time'): string {
  const s = raw.toLowerCase().replace(/\s+/g, '')
  const m = s.match(/^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm)?$/)
  if (!m) throw new FormError(`${label}: "${raw}" isn't a time I recognise. Try 16:30 or 4:30pm.`)
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (m[3] === 'pm' && h < 12) h += 12
  if (m[3] === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) throw new FormError(`${label}: "${raw}" isn't a valid time.`)
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Money / decimal. Strips £, $, € and commas. */
export function num(fd: FormData, key: string, label: string, opts: { min?: number; fallback?: number } = {}): number {
  const raw = str(fd, key).replace(/[£$€,\s]/g, '')
  if (!raw) {
    if (opts.fallback !== undefined) return opts.fallback
    throw new FormError(`${label} is required.`)
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new FormError(`${label}: "${raw}" isn't a number.`)
  if (opts.min !== undefined && n < opts.min) throw new FormError(`${label} must be at least ${opts.min}.`)
  return Math.round(n * 100) / 100
}

export function optionalNum(fd: FormData, key: string, label: string): number | null {
  return str(fd, key) ? num(fd, key, label, { min: 0 }) : null
}

export function int(fd: FormData, key: string, label: string, opts: { min?: number; max?: number; fallback?: number } = {}): number {
  const raw = str(fd, key)
  if (!raw && opts.fallback !== undefined) return opts.fallback
  const n = Number(raw)
  if (!raw || !Number.isInteger(n)) throw new FormError(`${label} must be a whole number.`)
  if (opts.min !== undefined && n < opts.min) throw new FormError(`${label} must be at least ${opts.min}.`)
  if (opts.max !== undefined && n > opts.max) throw new FormError(`${label} must be ${opts.max} or less.`)
  return n
}

/** Checkbox / toggle → boolean */
export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === 'on' || v === 'true' || v === '1'
}

/** One of a fixed set (used by segmented radio buttons). */
export function oneOf<T extends string>(fd: FormData, key: string, options: readonly T[], fallback: T): T {
  const v = str(fd, key) as T
  return options.includes(v) ? v : fallback
}

/** All values for a repeated field (e.g. checkboxes with the same name). */
export function all(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())
}

/** Optional uuid reference → string | null */
export function ref(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  if (!v) return null
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new FormError('Invalid reference.')
  return v
}

/**
 * Wrap a form action body: FormErrors become { error } for the form,
 * anything else is re-thrown (Next.js redirects are thrown too, so they pass through).
 */
export async function handle(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? null
  } catch (e) {
    if (e instanceof FormError) return { error: e.message }
    const msg = (e as { message?: string })?.message ?? ''
    // Postgres unique / FK violations → friendlier wording
    if (/duplicate key/.test(msg)) return { error: 'That already exists.' }
    if (/violates foreign key/.test(msg)) return { error: 'That record no longer exists — refresh and try again.' }
    throw e
  }
}
