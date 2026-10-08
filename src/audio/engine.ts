import { normalizeDb } from './analysis'
import type { AudioSource } from './sources'

const FFT_SIZE = 2048

/**
 * Owns the Web Audio graph and playback transport.
 *
 *   MediaElement → MediaElementSource → AnalyserNode → Destination
 *
 * React never touches any of this directly; the studio controller drives it
 * through refs. Context creation/resume happens on the first user gesture.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private node: MediaElementAudioSourceNode | null = null
  private gain: GainNode | null = null
  private element: HTMLMediaElement | null = null
  private source: AudioSource | null = null

  readonly spectrum = new Float32Array(FFT_SIZE / 2)
  readonly wave = new Float32Array(FFT_SIZE)

  get sampleRate() {
    return this.ctx?.sampleRate ?? 44100
  }

  get spectrumSize() {
    return FFT_SIZE / 2
  }

  get context() {
    return this.ctx
  }

  get currentTime() {
    return this.element?.currentTime ?? 0
  }

  get duration() {
    const d = this.element?.duration
    return d && Number.isFinite(d) ? d : 0
  }

  get paused() {
    return !this.element || this.element.paused
  }

  get volume() {
    return this.gain?.gain.value ?? 1
  }

  setVolume(v: number) {
    if (this.gain) this.gain.gain.value = v
  }

  /** Must be called from a user gesture at least once. */
  async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = FFT_SIZE
      this.analyser.smoothingTimeConstant = 0
      this.analyser.minDecibels = -78
      this.analyser.maxDecibels = -8
      this.gain = this.ctx.createGain()
      this.analyser.connect(this.gain)
      this.gain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    return this.ctx
  }

  /** Attach a new source; detaches and cleans up the previous one. */
  async attach(source: AudioSource): Promise<void> {
    await this.ensureContext()
    this.detachElement()
    this.source = source
    const el = source.getMediaElement()
    if (!el || !this.ctx) return
    this.element = el
    // A media element can only ever feed one MediaElementSourceNode, so the
    // node is bound to the element for its lifetime.
    this.node = this.ctx.createMediaElementSource(el)
    this.node.connect(this.analyser!)
  }

  private detachElement() {
    if (this.node) {
      try {
        this.node.disconnect()
      } catch {
        /* already disconnected */
      }
      this.node = null
    }
    this.element = null
  }

  async play() {
    await this.ensureContext()
    await this.element?.play()
  }

  pause() {
    this.element?.pause()
  }

  toggle() {
    if (this.paused) void this.play()
    else this.pause()
  }

  seek(seconds: number) {
    if (this.element && Number.isFinite(seconds)) {
      this.element.currentTime = Math.max(0, seconds)
    }
  }

  /** Fills the reusable spectrum/wave buffers. Returns false if no analyser. */
  readFrame(): boolean {
    if (!this.analyser || !this.ctx) return false
    this.analyser.getFloatFrequencyData(this.spectrum)
    for (let i = 0; i < this.spectrum.length; i++) {
      this.spectrum[i] = normalizeDb(this.spectrum[i])
    }
    this.analyser.getFloatTimeDomainData(this.wave)
    return true
  }

  dispose() {
    this.detachElement()
    this.source?.dispose()
    this.source = null
    if (this.gain) {
      try {
        this.gain.disconnect()
      } catch {
        /* noop */
      }
    }
    this.gain = null
    this.analyser = null
    void this.ctx?.close()
    this.ctx = null
  }
}
