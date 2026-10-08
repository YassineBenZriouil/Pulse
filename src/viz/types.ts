import type { AudioFrame } from '../audio/types'
import type { GlobalSettings } from '../studio/settings'

export type ParamValue = number | string | boolean
export type ParamValues = Record<string, ParamValue>

export type ParamDef = {
  key: string
  label: string
  group: string
  hint?: string
} & (
  | {
      type: 'number'
      min: number
      max: number
      step: number
      default: number
      unit?: string
    }
  | { type: 'select'; options: { value: string; label: string }[]; default: string }
  | { type: 'color'; default: string }
  | { type: 'boolean'; default: boolean }
)

export function paramDefaults(defs: ParamDef[]): ParamValues {
  const out: ParamValues = {}
  for (const d of defs) out[d.key] = d.default
  return out
}

/**
 * Everything an engine receives for one frame. `time` is the engine clock in
 * seconds (always advances while previewing, fixed-step while exporting) and
 * `frameIndex` seeds any randomness so exports are deterministic.
 *
 * Engines render with the canvas transform already set to CSS pixels and must
 * not clear the canvas or touch `globalAlpha` — the compositor owns the
 * background fill, trail persistence, opacity and post effects.
 */
export interface Frame {
  analysis: AudioFrame
  params: ParamValues
  global: GlobalSettings
  time: number
  dt: number
  frameIndex: number
  width: number
  height: number
  /** Album artwork for the current source, when available. */
  artwork: HTMLImageElement | null
  /** Sample rate of the analysis input (affects log bin mapping). */
  sampleRate: number
}

export interface VisualizationEngine {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly params: ParamDef[]
  mount(canvas: HTMLCanvasElement): void
  resize(width: number, height: number, dpr: number): void
  render(frame: Frame): void
  unmount(): void
}

export type EngineFactory = () => VisualizationEngine
