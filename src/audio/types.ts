export type SourceKind = 'file' | 'youtube'

export interface SourceInfo {
  kind: SourceKind
  title: string
  artist?: string
  /** Seconds. 0 when unknown (e.g. YouTube stub without backend). */
  duration: number
  artworkUrl?: string
  /** True when this source can actually produce audio in the browser. */
  playable: boolean
}

export type SourceStatus =
  | { state: 'empty' }
  | { state: 'loading'; label: string }
  | { state: 'ready'; info: SourceInfo }
  | { state: 'error'; message: string }
  | { state: 'unavailable'; info: SourceInfo; message: string }

export const BAND_NAMES = [
  'bass',
  'lowMid',
  'mid',
  'midHigh',
  'treble',
] as const

export type BandName = (typeof BAND_NAMES)[number]

export type Bands = Record<BandName, number>

export interface AudioFrame {
  /** Audio timeline position in seconds. */
  time: number
  /** Normalized spectrum, 0..1, linear bin order (analyser bins, low → high). */
  freq: Float32Array
  /** Time-domain samples, -1..1, fixed window. */
  wave: Float32Array
  /** Smoothed + response-scaled band energies, 0..1. */
  bands: Bands
  /** Per-band raw (pre-smoothing) energies, 0..1 — used by beat detection. */
  rawBands: Bands
  /** Overall loudness, 0..1. */
  amplitude: number
  /** Decaying beat impulse, 0..1. Visuals key off this, not the raw boolean. */
  beat: number
  /** True only on the frame a transient onset was detected. */
  onset: boolean
  /** Estimated tempo, or null until enough onsets are collected. */
  bpm: number | null
}

/**
 * Common configuration shared by every visualization engine. Values live in
 * plain objects (serializable presets) and are read by the rAF loop through
 * refs — never through React state per frame.
 */
export interface AudioResponseSettings {
  /** Gain applied to raw band values, 0..3. */
  sensitivity: number
  /** Attack coefficient, 0..1 — higher follows transients faster. */
  smoothing: number
  /** Release coefficient, 0..1 — higher falls slower. */
  decay: number
  bassResponse: number
  midResponse: number
  trebleResponse: number
  beatResponse: number
  /** 0..1 mix between adjacent bands (softens spectrum edges). */
  spectrumBlend: number
}
