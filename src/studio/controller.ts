import { Analyzer } from '../audio/analysis'
import { AudioEngine } from '../audio/engine'
import { FileSource, YouTubeSource, type AudioSource } from '../audio/sources'
import type { SourceStatus } from '../audio/types'
import { Compositor } from '../viz/compositor'
import { getViz } from '../viz/registry'
import type { Frame, ParamValues, VisualizationEngine } from '../viz/types'
import { fillVizParams, settingsStore } from './settings'
import { createStore, type Store } from './store'

export interface StudioState {
  status: SourceStatus
  playing: boolean
  vizId: string
  volume: number
}

/**
 * Non-React orchestrator: owns the audio graph, the rAF loop, the active
 * engine and the compositor. React components subscribe to stores and call
 * methods here — no per-frame React state exists anywhere.
 */
export class Studio {
  readonly audio = new AudioEngine()
  readonly analyzer: Analyzer

  private source: AudioSource | null = null
  private canvas: HTMLCanvasElement | null = null
  private compositor: Compositor | null = null
  private engine: VisualizationEngine | null = null
  private artwork: HTMLImageElement | null = null
  private resizeObserver: ResizeObserver | null = null

  private raf = 0
  private lastTs = 0
  private time = 0
  private frameIndex = 0
  private width = 1
  private height = 1
  private dpr = 1
  /** Consecutive engine render crashes (see handleRenderError). */
  private renderCrashes = 0

  /** UI hook for engine failures — App wires this to a toast. */
  onError: ((message: string) => void) | null = null

  private paramsBuf: ParamValues = {}
  private frame: Frame = {
    analysis: null as never,
    params: {},
    global: null as never,
    time: 0,
    dt: 0,
    frameIndex: 0,
    width: 1,
    height: 1,
    artwork: null,
    sampleRate: 44100,
  }

  constructor() {
    this.analyzer = new Analyzer(this.audio.spectrumSize)
  }

  /** Latest estimated tempo (read by UI on a 1 Hz poll — never per frame). */
  get currentBpm(): number | null {
    return this.frame.analysis?.bpm ?? null
  }

  /* ------------------------------------------------ ---------- state stores */

  readonly store: Store<StudioState> = createStore<StudioState>({
    status: { state: 'empty' },
    playing: false,
    vizId: 'ncs-circle',
    volume: 1,
  })

  /** Display clock (seconds), pushed at 20 Hz — only Timeline subscribes. */
  readonly timeStore: Store<number> = createStore(0)

  private setState(patch: Partial<StudioState>) {
    this.store.set((s) => ({ ...s, ...patch }))
  }

  /* ------------------------------------------------------------ sources */

  async loadFile(file: File) {
    this.setState({ status: { state: 'loading', label: `Loading ${file.name}…` } })
    this.teardownSource()
    const src = new FileSource(file)
    const status = await src.load()
    if (status.state !== 'ready') {
      src.dispose()
      this.setState({ status })
      return
    }
    this.source = src
    await this.audio.attach(src)
    this.bindTransport(src)
    this.setArtwork(null)
    this.analyzer.reset()
    this.setState({ status })
    try {
      await this.audio.play()
    } catch {
      /* autoplay may be blocked until a second gesture */
    }
  }

  private boundEl: HTMLMediaElement | null = null

  private bindTransport(src: AudioSource) {
    const el = src.getMediaElement()
    if (this.boundEl) {
      this.boundEl.removeEventListener('play', this.onPlay)
      this.boundEl.removeEventListener('pause', this.onPause)
      this.boundEl.removeEventListener('ended', this.onPause)
      this.boundEl = null
    }
    if (!el) return
    this.boundEl = el
    el.addEventListener('play', this.onPlay)
    el.addEventListener('pause', this.onPause)
    el.addEventListener('ended', this.onPause)
  }

  private onPlay = () => this.setState({ playing: true })
  private onPause = () => this.setState({ playing: false })

  async loadYouTube(url: string) {
    const parsed = YouTubeSource.fromUrl(url)
    if (!parsed) {
      this.setState({
        status: { state: 'error', message: 'That does not look like a YouTube URL.' },
      })
      return
    }
    this.setState({ status: { state: 'loading', label: 'Fetching YouTube metadata…' } })
    this.teardownSource()
    const status = await parsed.load()
    if (status.state === 'unavailable') {
      this.source = parsed
      this.setArtwork(status.info.artworkUrl ?? null)
    }
    this.setState({ status })
  }

  clearSource() {
    this.teardownSource()
    this.setState({ status: { state: 'empty' }, playing: false })
    this.timeStore.set(0)
  }

  private teardownSource() {
    this.audio.pause()
    if (this.boundEl) {
      this.boundEl.removeEventListener('play', this.onPlay)
      this.boundEl.removeEventListener('pause', this.onPause)
      this.boundEl.removeEventListener('ended', this.onPause)
      this.boundEl = null
    }
    this.source?.dispose()
    this.source = null
    this.setArtwork(null)
    this.analyzer.reset()
  }

  private setArtwork(url: string | null) {
    this.artwork = null
    if (!url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    this.artwork = img
  }

  /* -------------------------------------------------------------- transport */

  async togglePlay() {
    if (!this.source) return
    if (this.audio.paused) {
      try {
        await this.audio.play()
      } catch {
        /* blocked */
      }
    } else {
      this.audio.pause()
    }
  }

  seek(seconds: number) {
    this.audio.seek(seconds)
    this.timeStore.set(seconds)
  }

  setVolume(v: number) {
    this.audio.setVolume(v)
    this.setState({ volume: v })
  }

  /* ------------------------------------------------------------- canvas */

  attachCanvas(canvas: HTMLCanvasElement) {
    this.detachCanvas()
    this.canvas = canvas
    try {
      this.compositor = new Compositor(canvas)
      this.engine = getViz(this.store.get().vizId).create()
      this.engine.mount(canvas)
      this.renderCrashes = 0
    } catch (err) {
      console.error('[pulse] failed to mount visualization', err)
      this.compositor = null
      this.engine = null
      return
    }

    this.resizeObserver = new ResizeObserver(() => this.applySize())
    if (canvas.parentElement) this.resizeObserver.observe(canvas.parentElement)
    this.applySize()

    if (!this.raf) {
      this.lastTs = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  detachCanvas() {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.engine?.unmount()
    this.compositor?.dispose()
    this.engine = null
    this.compositor = null
    this.canvas = null
    // Force a full resize on the next attach.
    this.width = 0
    this.height = 0
    this.dpr = 0
  }

  private applySize() {
    const canvas = this.canvas
    if (!canvas || !canvas.parentElement) return
    const rect = canvas.parentElement.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (w === this.width && h === this.height && dpr === this.dpr) return
    this.width = w
    this.height = h
    this.dpr = dpr
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    this.compositor?.resize(w, h, dpr)
    this.engine?.resize(w, h, dpr)
  }

  setViz(vizId: string) {
    if (this.store.get().vizId === vizId) return
    this.setState({ vizId })
    // React swaps the canvas element (key={vizId}); the ref effect re-attaches.
  }

  /* ------------------------------------------------------------ hot loop */

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTs) / 1000))
    this.lastTs = now
    this.time += dt
    this.frameIndex++

    const engine = this.engine
    const compositor = this.compositor
    if (!engine || !compositor) return

    const settings = settingsStore.get()
    const hasAudio = this.audio.readFrame()
    const analysis = hasAudio
      ? this.analyzer.update(
          this.audio.spectrum,
          this.audio.wave,
          this.time,
          dt,
          settings.audio,
          this.audio.sampleRate,
        )
      : this.idleFrame(dt, settings)

    fillVizParams(this.paramsBuf, settings, engine.id, engine.params)

    const f = this.frame
    f.analysis = analysis
    f.params = this.paramsBuf
    f.global = settings.global
    f.time = this.time
    f.dt = dt
    f.frameIndex = this.frameIndex
    f.width = this.width
    f.height = this.height
    f.artwork = this.artwork
    f.sampleRate = this.audio.sampleRate

    try {
      compositor.begin(settings.global)
      const ctx = compositor.ctx
      ctx.globalAlpha = settings.global.opacity
      engine.render(f)
      ctx.globalAlpha = 1
      compositor.end(settings.global, this.frameIndex)
      this.renderCrashes = 0
    } catch (err) {
      this.handleRenderError(err, engine.id)
      return
    }

    const display = this.audio.duration > 0 ? this.audio.currentTime : 0
    const rounded = Math.round(display * 20) / 20
    if (rounded !== this.timeStore.get()) this.timeStore.set(rounded)
  }

  /**
   * A throwing engine must never kill the rAF loop or blank the app: fall
   * back to the flagship engine, and pause only if that one crashes too.
   */
  private handleRenderError(err: unknown, vizId: string) {
    this.renderCrashes++
    console.error(`[pulse] visualization "${vizId}" crashed`, err)
    try {
      const ctx = this.compositor?.ctx
      if (ctx) ctx.globalAlpha = 1
    } catch {
      /* context may be lost */
    }
    if (vizId !== 'ncs-circle') {
      this.renderCrashes = 0
      this.onError?.(`“${getViz(vizId).name}” crashed — falling back to NCS Circle`)
      this.setState({ vizId: 'ncs-circle' })
      return
    }
    if (this.renderCrashes > 1) {
      this.renderCrashes = 0
      this.detachCanvas()
      this.onError?.('Rendering paused after repeated crashes — reload to retry')
    }
  }

  /** Silent analysis frame for the empty state (subtle idle motion). */
  private idleFrame(dt: number, settings: ReturnType<typeof settingsStore.get>) {
    return this.analyzer.update(
      IDLE_FREQ,
      IDLE_WAVE,
      this.time,
      dt,
      settings.audio,
      this.audio.sampleRate,
    )
  }

  /* ------------------------------------------------------------- lifecycle */

  /** Decoded PCM for deterministic export, or null when unavailable. */
  async getExportAudio(): Promise<AudioBuffer | null> {
    if (!this.source) return null
    try {
      const ctx = await this.audio.ensureContext()
      return await this.source.getPcm(ctx)
    } catch {
      return null
    }
  }

  /** Exposed for the export panel (artwork mirrors the live preview). */
  get currentArtwork() {
    return this.artwork
  }

  dispose() {
    this.detachCanvas()
    this.teardownSource()
    this.audio.dispose()
  }
}

const IDLE_FREQ = new Float32Array(1024)
const IDLE_WAVE = new Float32Array(2048)

export const studio = new Studio()
