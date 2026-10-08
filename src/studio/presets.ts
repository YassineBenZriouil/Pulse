import { paramDefaults } from '../viz/types'
import { vizParams } from '../viz/registry'
import {
  applySettings,
  defaultAudio,
  defaultGlobal,
  defaultSettings,
  settingsStore,
  type Settings,
} from './settings'
import { createStore, type Store } from './store'
import { studio } from './controller'

export interface Preset {
  id: string
  name: string
  builtin: boolean
  vizId: string
  settings: Settings
}

function makePreset(
  id: string,
  name: string,
  vizId: string,
  opts: {
    global?: Partial<Settings['global']>
    background?: Partial<Settings['global']['background']>
    audio?: Partial<Settings['audio']>
    viz?: Record<string, number | string | boolean>
  } = {},
): Preset {
  const settings: Settings = {
    global: { ...structuredClone(defaultGlobal), ...opts.global },
    audio: { ...defaultAudio, ...opts.audio },
    viz: {
      [vizId]: { ...paramDefaults(vizParams(vizId)), ...opts.viz },
    },
  }
  settings.global.background = {
    ...defaultGlobal.background,
    ...opts.background,
  }
  return { id, name, builtin: true, vizId, settings }
}

/**
 * Factory presets — full serializable snapshots. Tuned so each one shows off
 * a different engine.
 */
export const BUILTIN_PRESETS: Preset[] = [
  makePreset('neon-halo', 'Neon Halo', 'ncs-circle', {
    global: { paletteId: 'neon', glow: 0.65, bloom: 0.4, trails: 0.15 },
    background: { color1: '#050509', color2: '#0b0b1e' },
    viz: { barCount: 160, radius: 0.5, thickness: 5, rotation: 0.08, pulse: 0.6 },
  }),
  makePreset('ember-ring', 'Ember Ring', 'ncs-circle', {
    global: { paletteId: 'ember', glow: 0.7, bloom: 0.45, trails: 0.25 },
    background: { color1: '#0a0503', color2: '#170a05' },
    audio: { bassResponse: 1.25 },
    viz: { barCount: 120, rotation: -0.05, mirror: true, peaks: false, pulse: 0.75 },
  }),
  makePreset('chrome-bars', 'Chrome Spectrum', 'spectrum-bars', {
    global: { paletteId: 'ocean', glow: 0.5, bloom: 0.3, trails: 0.05 },
    background: { color1: '#04070d', color2: '#081522' },
    viz: { barCount: 84, style: 'rounded', align: 'bottom', gap: 5, barWidth: 14 },
  }),
  makePreset('laser-mirrored', 'Laser Mirrored', 'spectrum-bars', {
    global: { paletteId: 'vapor', glow: 0.8, bloom: 0.5, trails: 0.3 },
    background: { color1: '#06030f', color2: '#12082a' },
    viz: { barCount: 64, style: 'neon', align: 'center', gap: 7, amplitude: 1.5 },
  }),
  makePreset('silk-wave', 'Silk Wave', 'waveform', {
    global: { paletteId: 'aurora', glow: 0.55, bloom: 0.35, trails: 0.2 },
    background: { color1: '#04060f', color2: '#0a0f26' },
    viz: { style: 'ribbon', thickness: 6, points: 512, freqResponse: 0.4 },
  }),
  makePreset('paper-fold', 'Paper Fold', 'waveform', {
    global: { paletteId: 'mono', glow: 0.2, bloom: 0.15, trails: 0.08 },
    background: { color1: '#0b0b0d', color2: '#131317' },
    viz: { style: 'filled', thickness: 3, symmetry: 1, amplitude: 1.15 },
  }),
  makePreset('liquid-dream', 'Liquid Dream', 'liquid', {
    global: { paletteId: 'vapor', glow: 0.3, bloom: 0.5, trails: 0 },
    background: { mode: 'gradient', color1: '#05050c', color2: '#0d0a1c' },
    audio: { smoothing: 0.6 },
    viz: { flowSpeed: 0.5, warp: 1.2, detail: 1.1, contrast: 1.1 },
  }),
  makePreset('deep-ocean-flow', 'Deep Ocean Flow', 'liquid', {
    global: { paletteId: 'ocean', glow: 0.25, bloom: 0.4, trails: 0 },
    viz: { flowSpeed: 0.3, warp: 0.9, bassScale: 1.4, scale: 1.6, rotation: -0.15 },
  }),
  makePreset('starfield', 'Starfield', 'particles', {
    global: { paletteId: 'candy', glow: 0.6, bloom: 0.4, trails: 0.1 },
    background: { color1: '#05050a', color2: '#0a0a16' },
    viz: { count: 1400, size: 1.6, trails: 0.7, attraction: 0.35, swirl: 0.9 },
  }),
  makePreset('supernova', 'Supernova', 'particles', {
    global: { paletteId: 'ember', glow: 0.75, bloom: 0.5, trails: 0.35 },
    background: { color1: '#070303', color2: '#140708' },
    audio: { beatResponse: 1.4 },
    viz: { count: 2200, size: 2, bassKick: 1.6, attraction: -0.2, swirl: 0.4, trails: 0.6 },
  }),
  makePreset('radial-liquid', 'Radial Liquid', 'radial-wave', {
    global: { paletteId: 'neon', glow: 0.6, bloom: 0.4, trails: 0.18 },
    background: { color1: '#04040a', color2: '#0a0a1c' },
    viz: { style: 'liquid', displacement: 0.55, thickness: 6, fill: true },
  }),
  makePreset('geo-pulse', 'Geo Pulse', 'radial-wave', {
    global: { paletteId: 'gold', glow: 0.5, bloom: 0.35, trails: 0.1 },
    viz: { style: 'geometric', rotation: -0.1, beatKick: 0.85, points: 240 },
  }),
  makePreset('horizon-grid', 'Horizon Grid', 'grid', {
    global: { paletteId: 'sunset', glow: 0.55, bloom: 0.4, trails: 0.15 },
    background: { color1: '#06030c', color2: '#100824' },
    viz: { cols: 64, rows: 36, cameraTilt: 30, amplitude: 1.4, yaw: 0.08 },
  }),
]

const USER_KEY = 'pulse.presets.v1'

function loadUserPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPreset)
  } catch {
    return []
  }
}

function isPreset(v: unknown): v is Preset {
  if (!v || typeof v !== 'object') return false
  const p = v as Preset
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.vizId === 'string' &&
    !!p.settings &&
    typeof p.settings === 'object' &&
    !!p.settings.global &&
    !!p.settings.audio
  )
}

function persist(list: Preset[]) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(list.filter((p) => !p.builtin)))
  } catch {
    /* storage unavailable */
  }
}

export interface PresetsState {
  list: Preset[]
  activeId: string | null
  dirty: boolean
}

export const presetsStore: Store<PresetsState> = createStore<PresetsState>({
  list: [...BUILTIN_PRESETS, ...loadUserPresets()],
  activeId: null,
  dirty: false,
})

function update(fn: (s: PresetsState) => PresetsState) {
  presetsStore.set(fn)
  const s = presetsStore.get()
  persist(s.list)
}

export function allPresets() {
  return presetsStore.get().list
}

export function getActivePreset(): Preset | null {
  const { list, activeId } = presetsStore.get()
  return list.find((p) => p.id === activeId) ?? null
}

export function applyPreset(id: string) {
  const preset = presetsStore.get().list.find((p) => p.id === id)
  if (!preset) return
  applying = true
  try {
    applySettings(structuredClone(preset.settings))
    studio.setViz(preset.vizId)
  } finally {
    applying = false
  }
  update((s) => ({ ...s, activeId: id, dirty: false }))
}

let applying = false

/** Any settings edit marks the active preset dirty (unless we applied one). */
settingsStore.subscribe(() => {
  const s = presetsStore.get()
  if (applying || s.dirty || !s.activeId) return
  presetsStore.set({ ...s, dirty: true })
})

function uid() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function saveAsPreset(name: string): Preset {
  const preset: Preset = {
    id: uid(),
    name,
    builtin: false,
    vizId: studio.store.get().vizId,
    settings: structuredClone(settingsStore.get()),
  }
  update((s) => ({ ...s, list: [...s.list, preset], activeId: preset.id, dirty: false }))
  return preset
}

/** Overwrite a preset with the currently loaded settings (per-row update). */
export function updatePreset(id: string): boolean {
  const target = presetsStore.get().list.find((p) => p.id === id)
  if (!target || target.builtin) return false
  const next: Preset = {
    ...target,
    settings: structuredClone(settingsStore.get()),
    vizId: studio.store.get().vizId,
  }
  update((s) => ({
    ...s,
    list: s.list.map((p) => (p.id === id ? next : p)),
    activeId: id,
    dirty: false,
  }))
  return true
}

export function duplicatePreset(id: string): Preset | null {
  const src = presetsStore.get().list.find((p) => p.id === id)
  if (!src) return null
  const copy: Preset = {
    ...structuredClone(src),
    id: uid(),
    name: src.name + ' copy',
    builtin: false,
  }
  update((s) => ({ ...s, list: [...s.list, copy], activeId: copy.id, dirty: false }))
  return copy
}

export function renamePreset(id: string, name: string) {
  update((s) => ({
    ...s,
    list: s.list.map((p) => (p.id === id ? { ...p, name, builtin: false } : p)),
  }))
}

/** Delete a user preset; returns its list index (for undo) or null. */
export function deletePreset(id: string): number | null {
  const list = presetsStore.get().list
  const target = list.find((p) => p.id === id)
  if (!target || target.builtin) return null
  const index = list.indexOf(target)
  update((s) => ({
    ...s,
    list: s.list.filter((p) => p.id !== id),
    activeId: s.activeId === id ? null : s.activeId,
  }))
  return index
}

/** Re-insert a previously deleted preset at its original position (undo). */
export function restorePreset(preset: Preset, index: number): boolean {
  if (presetsStore.get().list.some((p) => p.id === preset.id)) return false
  update((s) => {
    const list = [...s.list]
    list.splice(Math.max(0, Math.min(index, list.length)), 0, preset)
    return { ...s, list }
  })
  return true
}

/** Everything a reset/undo needs to put back the previous working state. */
export interface StateSnapshot {
  settings: Settings
  activeId: string | null
  dirty: boolean
}

export function snapshotState(): StateSnapshot {
  const s = presetsStore.get()
  return {
    settings: structuredClone(settingsStore.get()),
    activeId: s.activeId,
    dirty: s.dirty,
  }
}

export function restoreState(snap: StateSnapshot) {
  applySettings(structuredClone(snap.settings))
  // applySettings marks the active preset dirty; put the flags back exactly.
  presetsStore.set({ ...presetsStore.get(), activeId: snap.activeId, dirty: snap.dirty })
}

export function exportPreset(id: string): string {
  const preset = presetsStore.get().list.find((p) => p.id === id)
  if (!preset) throw new Error('Preset not found')
  return JSON.stringify(
    { format: 'pulse-preset', version: 1, preset: { ...preset, builtin: false } },
    null,
    2,
  )
}

export function importPreset(json: string): Preset {
  const data = JSON.parse(json) as { preset?: unknown; name?: string }
  const candidate = (data.preset ?? data) as Preset
  if (!isPreset(candidate)) throw new Error('Not a valid Pulse preset')
  const preset: Preset = { ...candidate, id: uid(), builtin: false }
  update((s) => ({ ...s, list: [...s.list, preset] }))
  return preset
}

export function resetActivePreset() {
  const active = getActivePreset()
  if (active) {
    applyPreset(active.id)
    return
  }
  applying = true
  try {
    applySettings(structuredClone(defaultSettings))
  } finally {
    applying = false
  }
  update((s) => ({ ...s, activeId: null, dirty: false }))
}
