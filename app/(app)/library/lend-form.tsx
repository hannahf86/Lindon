// =============================================================================
// library/lend-form.tsx — "lend an item to a student" form
// Used on the library list (choose item + student) and on an item's own page
// (item fixed, choose student). Lent date defaults to today; due date optional.
// A monthly hire fee makes it paid hire; blank means a free loan. An optional
// refundable deposit can be added too.
// =============================================================================
import { ActionForm, SubmitButton } from '@/components/forms'
import { Picker, type PickerOption } from '@/components/pickers'
import { MoneyField, TextField } from '@/components/ui'
import { lendItem } from './actions'

export function LendForm(props: {
  /** Pass `itemId` to lend one specific item, or `items` to choose from */
  itemId?: string
  items?: PickerOption[]
  students: PickerOption[]
  preselectStudent?: string
  today: string
  currencySymbol: string
}) {
  return (
    <ActionForm action={lendItem} resetOnSuccess>
      {props.itemId ? (
        <input type="hidden" name="item_id" value={props.itemId} />
      ) : (
        <Picker name="item_id" label="Item" options={props.items ?? []} placeholder="Search available items…" />
      )}
      <Picker name="student_id" label="Lend to" options={props.students} defaultValue={props.preselectStudent} placeholder="Search students…" />
      <div className="form-grid">
        <TextField label="Lent on" name="lent_on" type="date" defaultValue={props.today} required />
        <TextField label="Due back" name="due_on" type="date" hint="Optional — leave empty for an open-ended loan." />
        <MoneyField
          label="Monthly hire fee"
          name="hire_fee"
          symbol={props.currencySymbol}
          placeholder="0.00"
          hint="Leave empty for a free loan. Added to their monthly invoice until it’s returned."
        />
        <MoneyField
          label="Deposit"
          name="deposit"
          symbol={props.currencySymbol}
          placeholder="0.00"
          hint="Optional and refundable. Add it to their next invoice, or mark it paid if they pay another way."
        />
        <TextField label="Notes" name="notes" placeholder="e.g. Includes bow and rosin" />
      </div>
      <div className="form-actions">
        <SubmitButton pendingText="Lending…">Lend item</SubmitButton>
      </div>
    </ActionForm>
  )
}
