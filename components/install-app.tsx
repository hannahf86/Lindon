'use client'
// =============================================================================
// components/install-app.tsx — "Add Lindon to your desktop or phone"
//
// InstallCatcher  (root layout) Chrome, Edge and Android offer to install a
//                 site with a "beforeinstallprompt" event, once, as the page
//                 loads. We keep it so the Settings button can use it later.
// InstallButton   (Settings) one click → the browser's own "Install Lindon?"
//                 box. Where browsers don't offer that (iPhone/iPad Safari,
//                 Mac Safari, Firefox) it opens short how-to steps instead.
//                 Already running as the installed app? It says so.
// =============================================================================
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

// ---- The saved install offer (shared between the two components) --------------------------
let saved: InstallEvent | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function InstallCatcher() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // we show our own button instead of the browser's mini-bar
      saved = e as InstallEvent
      changed()
    }
    const onInstalled = () => {
      saved = null
      changed()
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  return null
}

// ---- Which device/browser (for the how-to steps) -------------------------------------------
type Kind = 'installed' | 'ios' | 'mac-safari' | 'firefox' | 'android' | 'other'
function detect(): Kind {
  const ua = navigator.userAgent
  if (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone) return 'installed'
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (iOS) return 'ios'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Android/.test(ua)) return 'android'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'mac-safari'
  return 'other'
}

const STEPS: Record<Exclude<Kind, 'installed'>, { title: string; steps: string[] }> = {
  ios: {
    title: 'On iPhone or iPad',
    steps: ['Tap the Share button (the square with an arrow pointing up) at the bottom or top of Safari.', 'Scroll down and tap “Add to Home Screen”.', 'Tap “Add” — Lindon appears on your home screen.'],
  },
  'mac-safari': {
    title: 'In Safari on a Mac',
    steps: ['Click File in the menu bar at the top of the screen.', 'Choose “Add to Dock…”.', 'Click “Add” — Lindon appears in your Dock and Launchpad.'],
  },
  firefox: {
    title: 'In Firefox',
    steps: [
      'Firefox can’t add websites as apps on a computer. Open Lindon in Chrome or Edge and use this button there,',
      'or drag the padlock from the address bar onto your desktop to make a shortcut.',
      'On an Android phone in Firefox: tap ⋮ then “Add to Home screen”.',
    ],
  },
  android: {
    title: 'On Android',
    steps: ['Tap ⋮ (top right in Chrome).', 'Tap “Add to Home screen” or “Install app”.', 'Tap “Install” — Lindon appears with your other apps.'],
  },
  other: {
    title: 'In Chrome or Edge',
    steps: [
      'Look for the install icon at the right-hand end of the address bar (a screen with a down arrow), and click it.',
      'Or open the browser menu (⋮ or …) → “Cast, save and share” → “Install page as app” (Chrome), or “Apps” → “Install this site as an app” (Edge).',
      'Click “Install” — Lindon opens in its own window and appears on your desktop or Start menu.',
    ],
  },
}

export function InstallButton() {
  const offer = useSyncExternalStore(
    subscribe,
    () => saved,
    () => null,
  )
  const kind = useSyncExternalStore(
    subscribe,
    detect,
    () => 'other' as Kind,
  )
  const [msg, setMsg] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)

  if (kind === 'installed') return <span className="small muted">You’re using the Lindon app ✓</span>

  const onClick = async () => {
    if (!offer) return dialog.current?.showModal()
    await offer.prompt()
    const { outcome } = await offer.userChoice
    saved = null
    changed()
    setMsg(outcome === 'accepted' ? 'Added — look for Lindon on your desktop, Start menu or home screen.' : '')
  }

  const help = STEPS[kind]
  return (
    <>
      <span className="row" style={{ gap: 10 }}>
        {msg && <span className="small">{msg}</span>}
        <button type="button" className="btn btn-sm" onClick={onClick}>
          Add a shortcut
        </button>
      </span>

      {/* ---- How-to steps when the browser can't do it in one click ---- */}
      <dialog ref={dialog} className="modal" aria-label="Add Lindon to this device" onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
        <div className="modal-body">
          <div className="modal-head">
            <h2>Add Lindon to this device</h2>
            <button type="button" className="modal-close" aria-label="Close" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </div>
          <p style={{ marginTop: 0 }}>
            <strong>{help.title}</strong>
          </p>
          <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
            {help.steps.map((s) => (
              <li key={s} style={{ marginBottom: 8 }}>
                {s}
              </li>
            ))}
          </ol>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Lindon then opens in its own window, like an app. You stay signed in, and nothing extra is downloaded.
          </p>
        </div>
      </dialog>
    </>
  )
}
