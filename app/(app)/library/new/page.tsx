// =============================================================================
// library/new/page.tsx — add a book or piece of equipment
// =============================================================================
import type { Metadata } from 'next'
import { requireTeacher } from '@/lib/db'
import { distinctValues } from '@/lib/queries'
import { PageHeader } from '@/components/ui'
import { ItemForm } from '../item-form'
import { createItem } from '../actions'
import { currencySymbol } from '../helpers'

export const metadata: Metadata = { title: 'Add item' }

export default async function NewItemPage() {
  const teacher = await requireTeacher()
  const [kinds, conditions] = await Promise.all([
    distinctValues(teacher.id, 'library_items', 'kind'),
    distinctValues(teacher.id, 'library_items', 'condition'),
  ])
  return (
    <>
      <PageHeader title="Add an item" subtitle="A book, instrument or anything else you lend out." back={{ href: '/library', label: 'Library & loans' }} />
      <ItemForm action={createItem} kinds={kinds} conditions={conditions} currencySymbol={currencySymbol(teacher.currency)} cancelHref="/library" />
    </>
  )
}
