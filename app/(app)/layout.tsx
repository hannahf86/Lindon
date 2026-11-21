// =============================================================================
// app/(app)/layout.tsx — signed-in app shell: sidebar + main content
// Every page under (app) requires a teacher; requireTeacher() redirects to
// /login otherwise and creates the studio profile on first sign-in.
// Teachers who haven't finished the welcome steps go to /welcome first.
// Also counts unread family messages for the sidebar badge (when in-app
// messages are switched on).
// =============================================================================
import { redirect } from 'next/navigation'
import { requireTeacher } from '@/lib/db'
import { signOut } from '@/auth'
import { teacherUnreadCount } from '@/lib/messages'
import { has } from '@/lib/features'
import { Sidebar } from '@/components/sidebar'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const teacher = await requireTeacher()
  if (!teacher.onboarded_at) redirect('/welcome')
  const unread = has(teacher, 'messaging') ? await teacherUnreadCount(teacher.id) : 0
  // Sidebar shows an extra only when it's really usable (e.g. messages need family logins)
  const features = teacher.features.filter((k) => has(teacher, k as Parameters<typeof has>[1]))

  async function doSignOut() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <div className="shell">
      <Sidebar
        studio={teacher.business_name || 'Studio'}
        who={teacher.display_name || teacher.email}
        unread={unread}
        features={features}
        signOut={doSignOut}
      />
      <main className="main">
        <div className="content">{children}</div>
      </main>
    </div>
  )
}
