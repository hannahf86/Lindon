// =============================================================================
// lib/database.types.ts — TypeScript shape of the Supabase `public` schema
//
// Hand-written to mirror supabase/migrations/ (0001_init, 0002_products,
// 0003_family_access, 0004_slot_bookings, 0005_attendance_credits). If you change the
// schema, change this file too (or regenerate with `supabase gen types`).
//
// Gotcha: these MUST be `type` aliases, not `interface`s. An interface isn't
// assignable to Record<string, unknown>, which silently turns every typed
// Supabase query into `never`.
// =============================================================================

type Timestamps = { created_at: string; updated_at: string }

/** Builds the Row / Insert / Update trio for a table. */
type Table<Row, Required extends keyof Row, Rels extends Relationship[] = []> = {
  Row: Row
  Insert: Partial<Row> & Pick<Row, Required>
  Update: Partial<Row>
  Relationships: Rels
}

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

/** Composite (x_id, teacher_id) → table(id, teacher_id) foreign key. */
type Fk<Name extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Name
  columns: [Col, 'teacher_id']
  isOneToOne: false
  referencedRelation: Ref
  referencedColumns: ['id', 'teacher_id']
}

// ---- Row types -------------------------------------------------------------

export type StudentStatus = 'active' | 'paused' | 'left'
/** Attendance. notice_given / teacher_cancelled earn a make-up credit. */
export type LessonStatus = 'scheduled' | 'present' | 'absent' | 'notice_given' | 'teacher_cancelled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'
export type InvoiceItemKind = 'lesson' | 'equipment' | 'other' | 'credit'
export type ExamStatus = 'planned' | 'entered' | 'taken' | 'withdrawn'
export type EmailKind = 'reminder' | 'broadcast' | 'individual' | 'invoice' | 'lesson_notes' | 'family_invite' | 'message_notice' | 'credit_notice'

export type Teacher = Timestamps & {
  id: string
  display_name: string
  business_name: string
  email: string
  phone: string
  address: string
  currency: string
  timezone: string
  invoice_prefix: string
  next_invoice_number: number
  invoice_terms_days: number
  payment_details: string
  invoice_footer: string
  reminders_enabled: boolean
  reminder_hours_before: number
  reminder_message: string
}

export type Guardian = Timestamps & {
  id: string
  teacher_id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address: string
  notes: string
}

export type Student = Timestamps & {
  id: string
  teacher_id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  is_minor: boolean
  email: string
  phone: string
  address: string
  instruments: string[]
  level: string
  status: StudentStatus
  start_date: string | null
  reminders_enabled: boolean
  notes: string
}

export type StudentGuardian = {
  teacher_id: string
  student_id: string
  guardian_id: string
  relationship: string
  is_primary: boolean
  receives_emails: boolean
  created_at: string
}

export type TimeSlot = Timestamps & {
  id: string
  teacher_id: string
  day_of_week: number // ISO 1 = Monday … 7 = Sunday
  start_time: string // "HH:MM:SS"
  duration_minutes: number
  price: number
  label: string
  instrument: string
  location: string
  student_id: string | null
  active: boolean
  notes: string
  /** Booking: first lesson date (YYYY-MM-DD) */
  starts_on: string | null
  /** Booking: last lesson date — the booking does NOT repeat forever */
  ends_on: string | null
  /** 1 = every week, 2 = fortnightly … */
  repeat_weeks: number
  /** Dates inside the booking with no lesson (half term etc.) */
  skip_dates: string[]
}

export type Lesson = Timestamps & {
  id: string
  teacher_id: string
  student_id: string
  time_slot_id: string | null
  starts_at: string
  duration_minutes: number
  price: number
  instrument: string
  location: string
  status: LessonStatus
  chargeable: boolean
  notes: string
  homework: string
  notes_emailed_at: string | null
  reminder_sent_at: string | null
}

export type Invoice = Timestamps & {
  id: string
  teacher_id: string
  student_id: string | null
  number: string
  bill_to_name: string
  bill_to_email: string
  bill_to_address: string
  issue_date: string
  due_date: string | null
  status: InvoiceStatus
  sent_at: string | null
  paid_on: string | null
  payment_method: string
  notes: string
  total: number
}

export type InvoiceItem = {
  id: string
  teacher_id: string
  invoice_id: string
  kind: InvoiceItemKind
  description: string
  quantity: number
  unit_price: number
  amount: number // generated column — never write it
  lesson_id: string | null
  product_id: string | null
  /** For kind 'credit': the make-up credit this minus line uses */
  credit_id: string | null
  position: number
  created_at: string
}

export type Product = Timestamps & {
  id: string
  teacher_id: string
  name: string
  category: string
  sku: string
  price: number
  cost: number | null
  track_stock: boolean
  stock: number
  low_stock_at: number | null
  notes: string
  active: boolean
}

export type LibraryItem = Timestamps & {
  id: string
  teacher_id: string
  title: string
  kind: string
  identifier: string
  condition: string
  value: number | null
  notes: string
  archived: boolean
}

export type Loan = Timestamps & {
  id: string
  teacher_id: string
  item_id: string
  student_id: string
  lent_on: string
  due_on: string | null
  returned_on: string | null
  notes: string
}

export type Exam = Timestamps & {
  id: string
  teacher_id: string
  student_id: string
  instrument: string
  board: string
  grade: string
  exam_date: string | null
  exam_time: string | null
  venue: string
  entry_deadline: string | null
  fee: number | null
  status: ExamStatus
  result: string
  notes: string
}

export type EmailLog = {
  id: string
  teacher_id: string
  kind: EmailKind
  subject: string
  body: string
  recipients: string[]
  status: 'sent' | 'failed'
  error: string | null
  lesson_id: string | null
  invoice_id: string | null
  created_at: string
}

export type CreditReason = 'notice_given' | 'teacher_cancelled' | 'manual'

/** A make-up credit. invoice_item_id null = still available. Never expires. */
export type LessonCredit = {
  id: string
  teacher_id: string
  student_id: string
  lesson_id: string | null
  amount: number
  reason: CreditReason
  note: string
  invoice_item_id: string | null
  created_at: string
}

export type FamilyAccess = {
  id: string
  teacher_id: string
  email: string
  guardian_id: string | null
  student_id: string | null
  invited_at: string
  last_seen_at: string | null
  revoked_at: string | null
  created_at: string
}

export type Conversation = {
  id: string
  teacher_id: string
  guardian_id: string | null
  student_id: string | null
  contact_name: string
  last_message_at: string | null
  teacher_unread: number
  family_unread: number
  created_at: string
}

export type Message = {
  id: string
  teacher_id: string
  conversation_id: string
  sender: 'teacher' | 'family'
  sender_email: string
  body: string
  read_at: string | null
  created_at: string
}

// ---- Database ----------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      teachers: Table<Teacher, 'id'>
      guardians: Table<Guardian, 'teacher_id' | 'first_name'>
      students: Table<Student, 'teacher_id' | 'first_name'>
      student_guardians: Table<
        StudentGuardian,
        'teacher_id' | 'student_id' | 'guardian_id',
        [
          Fk<'student_guardians_student_id_teacher_id_fkey', 'student_id', 'students'>,
          Fk<'student_guardians_guardian_id_teacher_id_fkey', 'guardian_id', 'guardians'>,
        ]
      >
      time_slots: Table<
        TimeSlot,
        'teacher_id' | 'day_of_week' | 'start_time' | 'duration_minutes',
        [Fk<'time_slots_student_id_teacher_id_fkey', 'student_id', 'students'>]
      >
      lessons: Table<
        Lesson,
        'teacher_id' | 'student_id' | 'starts_at' | 'duration_minutes',
        [
          Fk<'lessons_student_id_teacher_id_fkey', 'student_id', 'students'>,
          Fk<'lessons_time_slot_id_teacher_id_fkey', 'time_slot_id', 'time_slots'>,
        ]
      >
      invoices: Table<
        Invoice,
        'teacher_id' | 'number',
        [Fk<'invoices_student_id_teacher_id_fkey', 'student_id', 'students'>]
      >
      invoice_items: {
        Row: InvoiceItem
        Insert: Partial<Omit<InvoiceItem, 'amount'>> &
          Pick<InvoiceItem, 'teacher_id' | 'invoice_id' | 'description'>
        Update: Partial<Omit<InvoiceItem, 'amount'>>
        Relationships: [
          Fk<'invoice_items_invoice_id_teacher_id_fkey', 'invoice_id', 'invoices'>,
          Fk<'invoice_items_lesson_id_teacher_id_fkey', 'lesson_id', 'lessons'>,
          Fk<'invoice_items_product_id_teacher_id_fkey', 'product_id', 'products'>,
        ]
      }
      products: Table<Product, 'teacher_id' | 'name'>
      lesson_credits: Table<
        LessonCredit,
        'teacher_id' | 'student_id' | 'amount' | 'reason',
        [
          Fk<'lesson_credits_student_id_teacher_id_fkey', 'student_id', 'students'>,
          Fk<'lesson_credits_lesson_id_teacher_id_fkey', 'lesson_id', 'lessons'>,
          Fk<'lesson_credits_invoice_item_id_teacher_id_fkey', 'invoice_item_id', 'invoice_items'>,
        ]
      >
      library_items: Table<LibraryItem, 'teacher_id' | 'title'>
      loans: Table<
        Loan,
        'teacher_id' | 'item_id' | 'student_id',
        [
          Fk<'loans_item_id_teacher_id_fkey', 'item_id', 'library_items'>,
          Fk<'loans_student_id_teacher_id_fkey', 'student_id', 'students'>,
        ]
      >
      exams: Table<
        Exam,
        'teacher_id' | 'student_id',
        [Fk<'exams_student_id_teacher_id_fkey', 'student_id', 'students'>]
      >
      email_log: Table<EmailLog, 'teacher_id' | 'kind' | 'subject'>
      family_access: Table<
        FamilyAccess,
        'teacher_id' | 'email',
        [
          Fk<'family_access_guardian_id_teacher_id_fkey', 'guardian_id', 'guardians'>,
          Fk<'family_access_student_id_teacher_id_fkey', 'student_id', 'students'>,
        ]
      >
      conversations: Table<
        Conversation,
        'teacher_id',
        [
          Fk<'conversations_guardian_id_teacher_id_fkey', 'guardian_id', 'guardians'>,
          Fk<'conversations_student_id_teacher_id_fkey', 'student_id', 'students'>,
        ]
      >
      messages: Table<
        Message,
        'teacher_id' | 'conversation_id' | 'sender' | 'body',
        [Fk<'messages_conversation_id_teacher_id_fkey', 'conversation_id', 'conversations'>]
      >
    }
    Views: { [_ in never]: never }
    Functions: {
      next_invoice_number: { Args: { p_teacher: string }; Returns: string }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
