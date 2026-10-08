import type {
  AudioFrame,
  AudioResponseSettings,
  BandName,
  Bands,
} from './types'

const BAND_RANGES_HZ: Record<BandName, [number, number]> = {
  bass: [20, 150],
  lowMid: [150, 600],
  mid: [600, 2000],
  midHigh: [2000, 6000],
  treble: [6000, 16000],
}

const MIN_DB = -78
const MAX_DB = -8
const BEAT_DECAY_PER_SEC = 4.5
const ONSET_REFRACTORY = 0.11
const FLUX_HISTORY_SEC = 1.2

export function emptyBands(): Bands {
  return { bass: 0, lowMid: 0, mid: 0, midHigh: 0, treble: 0 }
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** dB (from AnalyserNode) → 0..1 linear-ish amplitude. */
export function normalizeDb(db: number) {
  if (db <= MIN_DB) return 0
  if (db >= MAX_DB) return 1
  return (db - MIN_DB) / (MAX_DB - MIN_DB)
}

/**
 * Log-spaced slice of the spectrum for a frequency range.
 * `freq` holds one normalized value per analyser bin (linear Hz spacing).
 */
export function spectrumRange(
  freq: Float32Array,
  sampleRate: number,
  f0: number,
  f1: number,
): number {
  const nyquist = sampleRate / 2
  const bins = freq.length
  let start = Math.floor((f0 / nyquist) * bins)
  let end = Math.ceil((f1 / nyquist) * bins)
  start = Math.max(0, Math.min(bins - 1, start))
  end = Math.max(start + 1, Math.min(bins, end))
  let sum = 0
  let weight = 0
  for (let i = start; i < end; i++) {
    const v = freq[i]
    // Power weighting so loud partials dominate the band reading.
    sum += v * v
    weight++
  }
  return weight ? Math.sqrt(sum / weight) : 0
}

/**
 * One log-spaced spectrum sample covering bins for visual index `index` of
 * `count`, across [minHz, maxHz]. Guarantees at least one bin per index.
 */
export function logSample(
  freq: Float32Array,
  sampleRate: number,
  index: number,
  count: number,
  minHz = 30,
  maxHz = 16000,
): number {
  const nyquist = sampleRate / 2
  const bins = freq.length
  const t0 = index / count
  const t1 = (index + 1) / count
  const f0 = minHz * Math.pow(maxHz / minHz, t0)
  const f1 = minHz * Math.pow(maxHz / minHz, t1)
  let s = Math.floor((f0 / nyquist) * bins)
  let e = Math.ceil((f1 / nyquist) * bins)
  s = Math.max(0, Math.min(bins - 1, s))
  e = Math.max(s + 1, Math.min(bins, e))
  let peak = 0
  for (let i = s; i < e; i++) if (freq[i] > peak) peak = freq[i]
  return peak
}

/** Neighbour-mixing so adjacent bars/points don't jitter independently. */
function blendSpectrum(freq: Float32Array, out: Float32Array, mix: number) {
  const n = freq.length
  if (mix <= 0) {
    out.set(freq)
    return
  }
  const side = mix / 2
  const center = 1 - mix
  for (let i = 0; i < n; i++) {
    const left = i > 0 ? freq[i - 1] : freq[i]
    const right = i < n - 1 ? freq[i + 1] : freq[i]
    out[i] = freq[i] * center + left * side + right * side
  }
}

interface FluxSample {
  t: number
  flux: number
}

/**
 * Turns raw AnalyserNode output into the smoothed AudioFrame that every
 * visualization consumes. One instance per playback session (stateful: peak
 * hold, attack/decay smoothing, onset history). Also reused frame-by-frame by
 * the offline exporter so exported analysis matches the preview pipeline.
 */
export class Analyzer {
  readonly spectrumSize: number
  private blended: Float32Array
  private smoothed = emptyBands()
  private rawScaled = emptyBands()
  private prevFluxSpectrum: Float32Array | null = null
  private fluxHistory: FluxSample[] = []
  private onsetTimes: number[] = []
  private lastOnset = -1
  private beatEnv = 0
  private amplitude = 0
  private bpmValue: number | null = null
  private first = true

  constructor(spectrumSize: number) {
    this.spectrumSize = spectrumSize
    this.blended = new Float32Array(spectrumSize)
  }

  /**
   * @param freq  normalized spectrum (0..1), length === spectrumSize
   * @param wave  time-domain samples, -1..1
   * @param time  monotonic seconds used for onset/BPM history
   * @param dt    seconds since last update
   */
  update(
    freq: Float32Array,
    wave: Float32Array,
    time: number,
    dt: number,
    settings: AudioResponseSettings,
    sampleRate: number,
  ): AudioFrame {
    blendSpectrum(freq, this.blended, settings.spectrumBlend)
    const f = this.blended

    const raw = this.rawScaled
    const sens = settings.sensitivity
    raw.bass =
      spectrumRange(f, sampleRate, ...BAND_RANGES_HZ.bass) *
      sens *
      settings.bassResponse
    raw.lowMid = spectrumRange(f, sampleRate, ...BAND_RANGES_HZ.lowMid) * sens
    raw.mid =
      spectrumRange(f, sampleRate, ...BAND_RANGES_HZ.mid) * sens * settings.midResponse
    raw.midHigh = spectrumRange(f, sampleRate, ...BAND_RANGES_HZ.midHigh) * sens
    raw.treble =
      spectrumRange(f, sampleRate, ...BAND_RANGES_HZ.treble) *
      sens *
      settings.trebleResponse
    for (const k of Object.keys(raw) as BandName[]) raw[k] = clamp01(raw[k])

    const attack = 1 - Math.pow(1 - settings.smoothing, dt * 60)
    const release = 1 - Math.pow(1 - settings.decay, dt * 60)
    const sm = this.smoothed
    for (const k of Object.keys(raw) as BandName[]) {
      const target = raw[k]
      const coef = target > sm[k] ? attack : release
      sm[k] += (target - sm[k]) * coef
      sm[k] = clamp01(sm[k])
    }

    let sumSq = 0
    for (let i = 0; i < wave.length; i++) sumSq += wave[i] * wave[i]
    const rms = Math.sqrt(sumSq / wave.length)
    const ampTarget = clamp01(rms * 2.4)
    const ampCoef = ampTarget > this.amplitude ? attack : release
    this.amplitude += (ampTarget - this.amplitude) * ampCoef

    const { onset, fluxNorm } = this.detectOnset(f, time, sampleRate)
    this.beatEnv *= Math.exp(-BEAT_DECAY_PER_SEC * dt)
    if (onset) this.beatEnv = Math.max(this.beatEnv, 0.55 + 0.45 * fluxNorm)
    const beat = clamp01(this.beatEnv * settings.beatResponse)

    if (this.first) {
      this.first = false
      this.prevFluxSpectrum = Float32Array.from(f)
    } else if (this.prevFluxSpectrum) {
      this.prevFluxSpectrum.set(f)
    }

    return {
      time,
      freq: f,
      wave,
      bands: { ...sm },
      rawBands: { ...raw },
      amplitude: clamp01(this.amplitude),
      beat,
      onset,
      bpm: this.bpmValue,
    }
  }

  private detectOnset(f: Float32Array, time: number, sampleRate: number) {
    const prev = this.prevFluxSpectrum
    if (!prev) return { onset: false, fluxNorm: 0 }

    const cutoff = Math.max(
      4,
      Math.min(f.length, Math.floor((5000 / (sampleRate / 2)) * f.length)),
    )
    let flux = 0
    for (let i = 0; i < cutoff; i++) {
      const d = f[i] - prev[i]
      if (d > 0) flux += d
    }
    const fluxNorm = clamp01(flux / 6)

    this.fluxHistory.push({ t: time, flux })
    const horizon = time - FLUX_HISTORY_SEC
    while (this.fluxHistory.length && this.fluxHistory[0].t < horizon) {
      this.fluxHistory.shift()
    }

    let mean = 0
    for (const s of this.fluxHistory) mean += s.flux
    mean /= this.fluxHistory.length || 1
    let variance = 0
    for (const s of this.fluxHistory) variance += (s.flux - mean) ** 2
    variance /= this.fluxHistory.length || 1
    const std = Math.sqrt(variance)

    const threshold = Math.max(mean + 1.35 * std, 0.06)
    const canFire =
      this.fluxHistory.length >= 6 &&
      time - this.lastOnset > ONSET_REFRACTORY &&
      flux > threshold

    if (canFire) {
      this.lastOnset = time
      this.onsetTimes.push(time)
      if (this.onsetTimes.length > 64) this.onsetTimes.shift()
      this.estimateBpm()
      return { onset: true, fluxNorm }
    }
    return { onset: false, fluxNorm }
  }

  private estimateBpm() {
    const times = this.onsetTimes
    if (times.length < 4) return
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      const d = times[i] - times[i - 1]
      if (d >= 0.25 && d <= 2) intervals.push(d)
    }
    if (intervals.length < 3) return

    // Fold intervals into a musically plausible 60–180 BPM window.
    const folded = intervals.map((d) => {
      let bpm = 60 / d
      while (bpm < 60) bpm *= 2
      while (bpm > 180) bpm /= 2
      return bpm
    })
    folded.sort((a, b) => a - b)
    const median = folded[Math.floor(folded.length / 2)]
    let sum = 0
    let weight = 0
    for (const bpm of folded) {
      const w = Math.exp(-((bpm - median) ** 2) / (2 * 8 * 8))
      sum += bpm * w
      weight += w
    }
    const candidate = sum / weight
    this.bpmValue =
      this.bpmValue === null
        ? candidate
        : this.bpmValue + (candidate - this.bpmValue) * 0.35
  }

  reset() {
    this.smoothed = emptyBands()
    this.rawScaled = emptyBands()
    this.prevFluxSpectrum = null
    this.fluxHistory = []
    this.onsetTimes = []
    this.lastOnset = -1
    this.beatEnv = 0
    this.amplitude = 0
    this.bpmValue = null
    this.first = true
  }
}
