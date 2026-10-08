import { applyPreset, allPresets } from './studio/presets'
import { studio } from './studio/controller'

/**
 * URL scheme (client-side only, no history library):
 *   /?v=<vizId>       current visualization
 *   /?p=<presetId>    an applied preset
 *   #s=<base64url>    full settings share payload
 *   #preset=<id>      legacy preset link (kept for old shares)
 *   any other path    404 view
 */

export interface Route {
  path: string
  viz: string | null
  preset: string | null
  /** Raw base64url payload after `#s=`, or null. */
  share: string | null
}

export function parseRoute(loc: Location = window.location): Route {
  const params = new URLSearchParams(loc.search)
  const hash = loc.hash
  let preset = params.get('p')
  let share: string | null = null
  if (hash.startsWith('#s=')) share = hash.slice(3)
  else if (hash.startsWith('#preset=')) preset = hash.slice(8)
  return { path: loc.pathname, viz: params.get('v'), preset, share }
}

export function buildUrl(
  state: { viz?: string | null; preset?: string | null },
  path = window.location.pathname,
): string {
  const params = new URLSearchParams()
  if (state.preset) params.set('p', state.preset)
  else if (state.viz) params.set('v', state.viz)
  const qs = params.toString()
  return path + (qs ? `?${qs}` : '')
}

/**
 * Push/replace with coalescing: rapid successive changes (holding a shortcut
 * key) collapse into one history entry so Back doesn't walk every step.
 */
let lastNavAt = 0

function navigate(state: { viz?: string | null; preset?: string | null }, replace: boolean) {
  const url = buildUrl(state)
  const now = performance.now()
  if (replace || now - lastNavAt < 700) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  lastNavAt = now
}

export function pushViz(vizId: string) {
  navigate({ viz: vizId }, false)
}

export function pushPreset(presetId: string) {
  navigate({ preset: presetId }, false)
}

export function replaceRoute(state: { viz?: string | null; preset?: string | null }) {
  lastNavAt = 0
  history.replaceState(null, '', buildUrl(state))
}

export function onRouteChange(cb: (route: Route) => void): () => void {
  const handler = () => cb(parseRoute())
  window.addEventListener('popstate', handler)
  return () => window.removeEventListener('popstate', handler)
}

/** Select a visualization and record it in history. */
export function goViz(vizId: string) {
  if (studio.store.get().vizId === vizId) return
  studio.setViz(vizId)
  pushViz(vizId)
}

/** Apply a preset and record it in history. */
export function goPreset(presetId: string) {
  if (!allPresets().some((p) => p.id === presetId)) return
  applyPreset(presetId)
  pushPreset(presetId)
}

/** Return to the studio root from a 404 address without a full reload. */
export function goHome(vizId: string) {
  lastNavAt = 0
  history.replaceState(null, '', buildUrl({ viz: vizId }, '/'))
}
