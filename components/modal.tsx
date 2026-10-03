'use client'
// =============================================================================
// components/modal.tsx — a button that opens its content in a pop-up (modal)
//
// Uses the native <dialog> element: focus is trapped, Esc closes it, and the
// page behind is inert. Clicking the dimmed backdrop also closes it.
// The content can be server-rendered (forms with server actions work as-is).
// =============================================================================
import { useRef, type ReactNode } from 'react'

export function ModalButton(props: { label: ReactNode; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button type="button" className={props.className ?? 'btn'} onClick={() => ref.current?.showModal()}>
        {props.label}
      </button>
      <dialog
        ref={ref}
        className="modal"
        aria-label={props.title}
        // A click whose target is the <dialog> itself landed on the backdrop
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      >
        <div className="modal-body">
          {/* ---- Header ---- */}
          <div className="modal-head">
            <h2>{props.title}</h2>
            <button type="button" className="modal-close" aria-label="Close" onClick={() => ref.current?.close()}>
              ×
            </button>
          </div>
          {/* ---- Content ---- */}
          {props.children}
        </div>
      </dialog>
    </>
  )
}
