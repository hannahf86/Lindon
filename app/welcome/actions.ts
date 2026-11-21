'use server'
// =============================================================================
// welcome/actions.ts — save onboarding and mark it done
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { handle, required, str, FormError, type ActionState } from '@/lib/forms'
import { readFeatureFields } from '@/lib/feature-form'

export async function completeOnboarding(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const email = str(fd, 'email')
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new FormError(`"${email}" doesn't look like an email address.`)
    must(
      await db()
        .from('teachers')
        .update({
          display_name: required(fd, 'display_name', 'Your name'),
          business_name: str(fd, 'business_name'),
          email,
          phone: str(fd, 'phone'),
          ...readFeatureFields(fd),
          onboarded_at: new Date().toISOString(),
        })
        .eq('id', teacher.id)
        .select('id')
        .single(),
    )
  })
  if (result?.error) return result
  revalidatePath('/', 'layout')
  redirect('/')
}
