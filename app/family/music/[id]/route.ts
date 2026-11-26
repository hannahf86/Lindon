// =============================================================================
// family/music/[id]/route.ts — a family downloads a shared file
//
// Allowed only if the file is from one of their teachers (with the feature
// on) and is for everyone or for one of their own pupils. Then redirects to
// a 60-second signed link from the private bucket.
// =============================================================================
import { db } from '@/lib/db'
import { requireFamily } from '@/lib/family'
import { has } from '@/lib/features'
import { signedDownload } from '@/lib/shared-files'

export async function GET(_req: Request, ctx: RouteContext<'/family/music/[id]'>) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })
  const family = await requireFamily()
  const { data: f } = await db().from('shared_files').select('teacher_id, path, file_name, everyone, student_ids').eq('id', id).maybeSingle()
  const link = f && family.links.find((l) => l.teacher.id === f.teacher_id && has(l.teacher, 'sheets'))
  const allowed = !!f && !!link && (f.everyone ? link.studentIds.length > 0 : f.student_ids.some((s) => link.studentIds.includes(s)))
  const url = allowed ? await signedDownload(f!.path, f!.file_name) : null
  return url ? Response.redirect(url, 302) : new Response('Not found', { status: 404 })
}
