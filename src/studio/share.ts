import { copyText } from '../lib/dom'
import { presetsStore } from './presets'
import { applySettings, sanitize, settingsStore, type Settings } from './settings'
import { studio } from './controller'

export interface SharePayload {
  vizId: string
  settings: Settings
}

function toUrlSafe(b64: string) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromUrlSafe(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return b64 + pad
}

export function encodeShare(): string {
  const payload = { v: studio.store.get().vizId, s: settingsStore.get() }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return toUrlSafe(btoa(bin))
}

export function decodeShare(encoded: string): SharePayload | null {
  try {
    const bin = atob(fromUrlSafe(encoded))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { v?: unknown; s?: unknown }
    const settings = sanitize(data.s)
    if (!settings || typeof data.v !== 'string') return null
    return { vizId: data.v, settings }
  } catch {
    return null
  }
}

/**
 * Link that reproduces the current look: a short `?p=` link while a preset is
 * active and untouched, otherwise a full payload that also carries edits.
 */
export function shareUrl(): string {
  const base = location.origin + location.pathname
  const { activeId, dirty } = presetsStore.get()
  if (activeId && !dirty) return `${base}?p=${activeId}`
  return `${base}#s=${encodeShare()}`
}

export async function copyShareLink(): Promise<boolean> {
  return copyText(shareUrl())
}

export function applyShare(payload: SharePayload) {
  applySettings(structuredClone(payload.settings))
  studio.setViz(payload.vizId)
}
