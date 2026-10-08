import { PALETTES } from '../viz/palette'
import { paramDefaults, type ParamDef, type ParamValues } from '../viz/types'
import { createStore, type Store } from './store'

export interface BackgroundSettings {
  mode: 'solid' | 'gradient' | 'transparent'
  color1: string
  color2: string
  angle: number
}

export interface GlobalSettings {
  paletteId: string
  customColors: string[]
  gradientAngle: number
  /** Master opacity of the visualization layer. */
  opacity: number
  glow: number
  bloom: number
  /** Afterimage persistence, 0..1 — compositor keeps a fraction of the frame. */
  trails: number
  vignette: number
  grain: number
  background: BackgroundSettings
}

export interface AudioDefaults {
  sensitivity: number
  smoothing: number
  decay: number
  bassResponse: number
  midResponse: number
  trebleResponse: number
  beatResponse: number
  spectrumBlend: number
}

export interface Settings {
  global: GlobalSettings
  audio: AudioDefaults
  /** Per-viz param values keyed by engine id. */
  viz: Record<string, ParamValues>
}

export const defaultGlobal: GlobalSettings = {
  paletteId: 'neon',
  customColors: ['#00f5d4', '#9b5de5', '#f15bb5'],
  gradientAngle: 135,
  opacity: 1,
  glow: 0.5,
  bloom: 0.35,
  trails: 0.12,
  vignette: 0.35,
  grain: 0.05,
  background: {
    mode: 'gradient',
    color1: '#06060c',
    color2: '#0e0e22',
    angle: 180,
  },
}

export const defaultAudio: Settings['audio'] = {
  sensitivity: 1,
  smoothing: 0.5,
  decay: 0.12,
  bassResponse: 1,
  midResponse: 1,
  trebleResponse: 1,
  beatResponse: 1,
  spectrumBlend: 0.35,
}

export const defaultSettings: Settings = {
  global: structuredClone(defaultGlobal),
  audio: { ...defaultAudio },
  viz: {},
}

const SETTINGS_KEY = 'pulse.settings.v1'

function persist(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* storage may be unavailable */
  }
}

/** Clamp/merge arbitrary JSON into a valid Settings object (share links, storage). */
export function sanitize(raw: unknown): Settings | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<Settings>
  if (!r.global || typeof r.global !== 'object') return null
  return {
    global: {
      ...structuredClone(defaultGlobal),
      ...(r.global as GlobalSettings),
      background: {
        ...defaultGlobal.background,
        ...((r.global as GlobalSettings).background ?? {}),
      },
    },
    audio: { ...defaultAudio, ...(r.audio ?? {}) },
    viz: r.viz && typeof r.viz === 'object' ? (r.viz as Settings['viz']) : {},
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return sanitize(JSON.parse(raw)) ?? structuredClone(defaultSettings)
  } catch {
    /* corrupted storage */
  }
  return structuredClone(defaultSettings)
}

export const settingsStore: Store<Settings> = createStore(load())

settingsStore.subscribe(() => persist(settingsStore.get()))

export function setGlobal(patch: Partial<GlobalSettings>) {
  settingsStore.set((s) => ({
    ...s,
    global: { ...s.global, ...patch },
  }))
}

export function setBackground(patch: Partial<BackgroundSettings>) {
  settingsStore.set((s) => ({
    ...s,
    global: { ...s.global, background: { ...s.global.background, ...patch } },
  }))
}

export function setAudio(patch: Partial<Settings['audio']>) {
  settingsStore.set((s) => ({ ...s, audio: { ...s.audio, ...patch } }))
}

export function setVizParam(vizId: string, key: string, value: number | string | boolean) {
  settingsStore.set((s) => ({
    ...s,
    viz: {
      ...s.viz,
      [vizId]: { ...(s.viz[vizId] ?? {}), [key]: value },
    },
  }))
}

export function resetVizParam(vizId: string, key: string, def: ParamDef) {
  settingsStore.set((s) => {
    const viz = { ...(s.viz[vizId] ?? {}) }
    viz[key] = def.default
    return { ...s, viz: { ...s.viz, [vizId]: viz } }
  })
}

export function resetViz(vizId: string, defs: ParamDef[]) {
  settingsStore.set((s) => ({
    ...s,
    viz: { ...s.viz, [vizId]: paramDefaults(defs) },
  }))
}

export function resetEverything() {
  settingsStore.set(() => structuredClone(defaultSettings))
}

export function applySettings(next: Settings) {
  settingsStore.set(() => next)
}

/**
 * Fill `out` with the working params for a viz (stored values overridden by
 * schema defaults for anything missing). In-place so the rAF loop and export
 * path can reuse one object without allocating per frame.
 */
export function fillVizParams(
  out: ParamValues,
  settings: Settings,
  vizId: string,
  defs: ParamDef[],
): ParamValues {
  const stored = settings.viz[vizId]
  for (const key of Object.keys(out)) delete out[key]
  for (const d of defs) {
    const v = stored ? stored[d.key] : undefined
    out[d.key] = v === undefined ? d.default : v
  }
  return out
}

export function paletteIds() {
  return ['custom', ...PALETTES.map((p) => p.id)]
}
