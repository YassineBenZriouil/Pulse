import { Analyzer, normalizeDb } from '../audio/analysis'
import type { AudioFrame } from '../audio/types'
import type { Settings } from '../studio/settings'

const FFT_SIZE = 2048

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let j = 0; j < half; j++) {
        const ar = re[i + j]
        const ai = im[i + j]
        const br = re[i + j + half] * cr - im[i + j + half] * ci
        const bi = re[i + j + half] * ci + im[i + j + half] * cr
        re[i + j] = ar + br
        im[i + j] = ai + bi
        re[i + j + half] = ar - br
        im[i + j + half] = ai - bi
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

const WINDOW = new Float32Array(FFT_SIZE)
for (let i = 0; i < FFT_SIZE; i++) {
  const x = (2 * Math.PI * i) / (FFT_SIZE - 1)
  WINDOW[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x)
}
// Mean window value — compensates coherent gain so levels match AnalyserNode.
let windowMean = 0
for (let i = 0; i < FFT_SIZE; i++) windowMean += WINDOW[i]
windowMean /= FFT_SIZE

/**
 * Deterministic frame-by-frame analysis of a decoded AudioBuffer, running the
 * exact same Analyzer used in the preview so exported visualizations follow
 * the same smoothing/beat pipeline.
 */
export class OfflineAnalysis {
  private readonly mono: Float32Array
  private readonly analyzer: Analyzer
  private readonly re = new Float32Array(FFT_SIZE)
  private readonly im = new Float32Array(FFT_SIZE)
  private readonly freq = new Float32Array(FFT_SIZE / 2)
  private readonly wave = new Float32Array(FFT_SIZE)
  readonly sampleRate: number
  readonly duration: number
  private readonly settings: Settings

  constructor(pcm: AudioBuffer, settings: Settings) {
    this.settings = settings
    this.sampleRate = pcm.sampleRate
    this.duration = pcm.duration
    const n = pcm.length
    this.mono = new Float32Array(n)
    const channels = Math.min(2, pcm.numberOfChannels)
    for (let c = 0; c < channels; c++) {
      const data = pcm.getChannelData(c)
      for (let i = 0; i < n; i++) this.mono[i] += data[i] / channels
    }
    this.analyzer = new Analyzer(FFT_SIZE / 2)
  }

  /** Analysis frame for output frame `index` at `fps`. */
  frameAt(index: number, fps: number): AudioFrame {
    const t = index / fps
    const sr = this.sampleRate
    const end = Math.min(this.mono.length, Math.round(t * sr) + 1)
    const start = end - FFT_SIZE

    const re = this.re
    const im = this.im
    const wave = this.wave
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = start + i
      const s = idx >= 0 && idx < this.mono.length ? this.mono[idx] : 0
      wave[i] = s
      re[i] = s * WINDOW[i]
      im[i] = 0
    }
    fft(re, im)

    const freq = this.freq
    const gain = 2 / (FFT_SIZE * windowMean)
    for (let k = 0; k < freq.length; k++) {
      const mag = Math.hypot(re[k], im[k]) * gain
      freq[k] = normalizeDb(20 * Math.log10(Math.max(mag, 1e-9)))
    }

    return this.analyzer.update(freq, wave, t, 1 / fps, this.settings.audio, sr)
  }
}

/** Linear-resample a planar channel to a target rate (Opus needs 48 kHz). */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const outLen = Math.round((input.length * toRate) / fromRate)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const frac = pos - i0
    const a = input[Math.min(input.length - 1, i0)]
    const b = input[Math.min(input.length - 1, i0 + 1)]
    out[i] = a + (b - a) * frac
  }
  return out
}
