// =============================================================================
// files/[id]/download/route.ts — the teacher downloads one of their files
// (redirects to a 60-second signed link from the private bucket)
// =============================================================================
import { db, requireTeacher } from '@/lib/db'
import { signedDownload } from '@/lib/shared-files'

export async function GET(_req: Request, ctx: RouteContext<'/files/[id]/download'>) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })
  const teacher = await requireTeacher()
  const { data: f } = await db().from('shared_files').select('path, file_name').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  const url = f && (await signedDownload(f.path, f.file_name))
  return url ? Response.redirect(url, 302) : new Response('Not found', { status: 404 })
}
