// =============================================================================
// lib/require-feature.ts — page and action guard for optional features
//
// requireFeature('exams') returns the signed-in teacher, or shows a 404 when
// that teacher has the feature switched off (lib/features.ts). Used by the
// layout of each optional section and by its server actions.
// =============================================================================
import 'server-only'
import { notFound } from 'next/navigation'
import { requireTeacher } from './db'
import { has, type FeatureKey } from './features'
import type { Teacher } from './database.types'

export async function requireFeature(key: FeatureKey): Promise<Teacher> {
  const teacher = await requireTeacher()
  if (!has(teacher, key)) notFound()
  return teacher
}
