// =============================================================================
// app/(app)/layout.tsx — signed-in app shell: sidebar + main content
// Every page under (app) requires a teacher; requireTeacher() redirects to
// /login otherwise and creates the studio profile on first sign-in.
// Also counts unread family messages for the sidebar badge.
// =============================================================================
import { requireTeacher } from '@/lib/db'
import { signOut } from '@/auth'
import { teacherUnreadCount } from '@/lib/messages'
import { Sidebar } from '@/components/sidebar'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const teacher = await requireTeacher()
  const unread = await teacherUnreadCount(teacher.id)

  async function doSignOut() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <div className="shell">
      <Sidebar studio={teacher.business_name || 'Studio'} who={teacher.display_name || teacher.email} unread={unread} signOut={doSignOut} />
      <main className="main">
        <div className="content">{children}</div>
      </main>
    </div>
  )
}
