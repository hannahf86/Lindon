// =============================================================================
// lib/locations.ts — the teacher's saved lesson locations (teachers.locations)
//
// Picked from the Location dropdown (components/location-select.tsx) and
// edited in Settings → Locations. A new location typed into the dropdown's
// "add a new location" box is remembered here when the form saves.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import type { Teacher } from './database.types'

/** Add a location to the teacher's list if it isn't there yet (case-insensitive). */
export async function rememberLocation(teacher: Teacher, location: string): Promise<void> {
  const loc = location.trim()
  if (!loc || loc === '__new__') return
  const saved = teacher.locations ?? []
  if (saved.some((l) => l.toLowerCase() === loc.toLowerCase())) return
  const locations = [...saved, loc]
  must(await db().from('teachers').update({ locations }).eq('id', teacher.id).select('id').single())
  teacher.locations = locations
}
