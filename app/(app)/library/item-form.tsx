// =============================================================================
// library/item-form.tsx — the add / edit library item form
// Kind and condition are typed; past values are offered as one-tap chips.
// =============================================================================
import Link from 'next/link'
import type { LibraryItem } from '@/lib/database.types'
import type { ActionState } from '@/lib/forms'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Card, MoneyField, TextArea, TextField, Toggle } from '@/components/ui'
import { SuggestField } from '@/components/pickers'

export function ItemForm(props: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>
  item?: LibraryItem
  kinds: string[]
  conditions: string[]
  currencySymbol: string
  cancelHref: string
}) {
  const it = props.item
  return (
    <ActionForm action={props.action}>
      <Card title={it ? 'Item details' : undefined}>
        <div className="form-grid">
          <TextField
            label="Name"
            name="title"
            defaultValue={it?.title}
            required
            autoFocus={!it}
            placeholder="e.g. Abracadabra Violin Book 1, Violin 1/2 size"
            wrapClass="full"
          />
          <SuggestField label="Kind" name="kind" defaultValue={it?.kind} suggestions={props.kinds} placeholder="e.g. Book, Violin 1/2 size, Music stand" />
          <TextField label="Serial number / label" name="identifier" defaultValue={it?.identifier} placeholder="e.g. ISBN, serial no., “Case 3”" />
          <SuggestField label="Condition" name="condition" defaultValue={it?.condition} suggestions={props.conditions} placeholder="e.g. Good, New strings, Scuffed case" />
          <MoneyField label="Value" name="value" symbol={props.currencySymbol} defaultValue={it?.value ?? ''} hint="Optional — useful if something goes missing." />
          <TextArea label="Notes" name="notes" defaultValue={it?.notes} wrapClass="full" rows={3} style={{ minHeight: 80 }} />
          {it && (
            <div className="full">
              <Toggle name="archived" label="Archived" defaultChecked={it.archived} hint="Archive items you no longer lend (sold, lost, worn out). Their loan history is kept." />
            </div>
          )}
        </div>
      </Card>

      <div className="form-actions">
        <SubmitButton>{it ? 'Save changes' : 'Add item'}</SubmitButton>
        <Link href={props.cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </ActionForm>
  )
}
