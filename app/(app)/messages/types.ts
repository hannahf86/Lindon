// =============================================================================
// messages/email/types.ts — the state the compose form and its server action share
// (kept apart from actions.ts because 'use server' files only export functions)
// =============================================================================

export type PreviewRecipient = { name: string; email: string; studentName: string; via: 'student' | 'guardian' }

export type ComposeState = {
  error?: string
  /** Step 1 result: who would receive the message */
  preview?: { recipients: PreviewRecipient[]; missing: string[] }
  /** Step 2 result: what happened when it was sent */
  sent?: { sent: number; failed: number; error?: string; missing: string[] }
} | null
