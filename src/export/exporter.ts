import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer'
import { Compositor } from '../viz/compositor'
import { getViz } from '../viz/registry'
import type { Frame, ParamValues } from '../viz/types'
import { fillVizParams, type Settings } from '../studio/settings'
import { createStore, type Store } from '../studio/store'
import { OfflineAnalysis } from './offline'
import { createZip } from './zip'

export type ExportFormat = 'mp4' | 'webm' | 'png-sequence' | 'png'

export interface ExportOptions {
  format: ExportFormat
  width: number
  height: number
  fps: number
  /** Bits per second for video tracks. */
  bitrate: number
  videoCodec: 'h264' | 'vp9' | 'vp8'
  includeAudio: boolean
  /** PNG sequence on a transparent background. */
  transparent: boolean
  /** Timestamp (s) for single PNG capture. */
  time: number
}

export interface ExportProgress {
  phase: 'rendering' | 'finalizing' | 'done' | 'error' | 'cancelled'
  frame: number
  total: number
  message?: string
  blob?: Blob
  filename?: string
}

export const exportStore: Store<ExportProgress | null> =
  createStore<ExportProgress | null>(null)

let cancelRequested = false
export function cancelExport() {
  cancelRequested = true
}

export interface Capabilities {
  webCodecs: boolean
  mp4: boolean
  webm: boolean
  audioMp4: boolean
  audioWebm: boolean
}

let capsCache: Capabilities | null = null

export async function probeCapabilities(): Promise<Capabilities> {
  if (capsCache) return capsCache
  const none: Capabilities = {
    webCodecs: false,
    mp4: false,
    webm: false,
    audioMp4: false,
    audioWebm: false,
  }
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    capsCache = none
    return none
  }
  const caps: Capabilities = { ...none, webCodecs: true }
  caps.mp4 = await probeVideo(availableAvcCodecs(1920, 1080), 1920, 1080, 8_000_000)
  caps.webm = await probeVideo(['vp09.00.50.08', 'vp09.00.41.08', 'vp8'], 1920, 1080, 8_000_000)
  caps.audioMp4 = await probeAudio({ codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 192000 })
  caps.audioWebm = await probeAudio({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 })
  capsCache = caps
  return caps
}

async function probeVideo(
  codecs: string[],
  width: number,
  height: number,
  bitrate: number,
): Promise<boolean> {
  for (const codec of codecs) {
    try {
      const s = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: 60,
      })
      if (s.supported) return true
    } catch {
      /* try next */
    }
  }
  return false
}

async function probeAudio(config: AudioEncoderConfig): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false
  try {
    const s = await AudioEncoder.isConfigSupported(config)
    return s.supported === true
  } catch {
    return false
  }
}

function availableAvcCodecs(width: number, height: number): string[] {
  const mp = (width * height) / (1280 * 720)
  if (mp > 16) return ['avc1.640034', 'avc1.640033', 'avc1.640032']
  if (mp > 4) return ['avc1.640032', 'avc1.64002a', 'avc1.640028']
  return ['avc1.640028', 'avc1.4d0028', 'avc1.42001f']
}

async function pickVideoConfig(opts: ExportOptions): Promise<VideoEncoderConfig> {
  const base = {
    width: opts.width,
    height: opts.height,
    bitrate: opts.bitrate,
    framerate: opts.fps,
  }
  const candidates =
    opts.videoCodec === 'h264'
      ? availableAvcCodecs(opts.width, opts.height)
      : opts.videoCodec === 'vp9'
        ? ['vp09.00.50.08', 'vp09.00.41.08', 'vp09.00.31.08']
        : ['vp8']
  for (const codec of candidates) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, ...base })
      if (s.supported) return s.config ?? { codec, ...base }
    } catch {
      /* next */
    }
  }
  throw new Error(
    `No supported ${opts.videoCodec.toUpperCase()} encoder at ${opts.width}×${opts.height}. Try another codec or resolution.`,
  )
}

const nextTick = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function report(
  frame: number,
  total: number,
  phase: ExportProgress['phase'],
  message?: string,
) {
  exportStore.set({ phase, frame, total, message })
}

/**
 * Deterministic export: steps the engine at a fixed timestep over decoded
 * audio, rendering every frame from a fresh engine instance at output
 * resolution — never a screen capture.
 */
export async function runExport(
  opts: ExportOptions,
  pcm: AudioBuffer,
  settings: Settings,
  vizId: string,
  artwork: HTMLImageElement | null,
): Promise<void> {
  cancelRequested = false
  const total = Math.max(1, Math.ceil(pcm.duration * opts.fps))
  report(0, total, 'rendering', 'Preparing renderer…')

  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height

  const frozen: Settings = structuredClone(settings)
  if (opts.transparent) {
    frozen.global.background.mode = 'transparent'
    frozen.global.trails = 0
    frozen.global.grain = 0
    frozen.global.vignette = 0
  }

  const engine = getViz(vizId).create()
  const compositor = new Compositor(canvas)
  const paramsBuf: ParamValues = {}
  fillVizParams(paramsBuf, frozen, vizId, engine.params)

  const ctx = compositor.ctx
  compositor.resize(opts.width, opts.height, 1)
  engine.mount(canvas)
  engine.resize(opts.width, opts.height, 1)

  const offline = new OfflineAnalysis(pcm, frozen)
  const frame: Frame = {
    analysis: null as never,
    params: paramsBuf,
    global: frozen.global,
    time: 0,
    dt: 1 / opts.fps,
    frameIndex: 0,
    width: opts.width,
    height: opts.height,
    artwork,
    sampleRate: offline.sampleRate,
  }

  const drawFrame = (index: number) => {
    frame.analysis = offline.frameAt(index, opts.fps)
    frame.time = index / opts.fps
    frame.frameIndex = index
    compositor.begin(frozen.global)
    ctx.globalAlpha = frozen.global.opacity
    engine.render(frame)
    ctx.globalAlpha = 1
    compositor.end(frozen.global, index)
  }

  const cleanup = () => {
    engine.unmount()
    compositor.dispose()
  }

  try {
    if (opts.format === 'png') {
      drawFrame(Math.round(opts.time * opts.fps))
      const blob = await canvasToBlob(canvas, 'image/png')
      if (!blob) throw new Error('PNG encoding failed')
      const filename = `pulse_${vizId}_${opts.width}x${opts.height}.png`
      exportStore.set({ phase: 'done', frame: 1, total: 1, blob, filename })
      return
    }

    if (opts.format === 'png-sequence') {
      const entries: { name: string; data: Uint8Array<ArrayBuffer> }[] = []
      for (let i = 0; i < total; i++) {
        if (cancelRequested) {
          exportStore.set({ phase: 'cancelled', frame: 0, total })
          return
        }
        drawFrame(i)
        const blob = await canvasToBlob(canvas, 'image/png')
        if (!blob) throw new Error('PNG encoding failed')
        entries.push({
          name: `pulse_${String(i + 1).padStart(5, '0')}.png`,
          data: new Uint8Array(await blob.arrayBuffer()),
        })
        report(i + 1, total, 'rendering')
        if (i % 2 === 0) await nextTick()
      }
      report(total, total, 'finalizing', 'Packing ZIP…')
      await sleep(0)
      const zip = createZip(entries)
      exportStore.set({
        phase: 'done',
        frame: total,
        total,
        blob: zip,
        filename: `pulse_sequence_${opts.width}x${opts.height}.zip`,
      })
      return
    }

    await exportVideo(opts, total, drawFrame, canvas, pcm)
  } catch (err) {
    exportStore.set({
      phase: 'error',
      frame: 0,
      total,
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    cleanup()
  }
}

async function exportVideo(
  opts: ExportOptions,
  total: number,
  drawFrame: (index: number) => void,
  canvas: HTMLCanvasElement,
  pcm: AudioBuffer,
): Promise<void> {
  const caps = await probeCapabilities()
  if (opts.format === 'mp4' && !caps.mp4) {
    throw new Error('H.264 / MP4 encoding is not supported in this browser.')
  }
  if (opts.format === 'webm' && !caps.webm) {
    throw new Error('WebM encoding is not supported in this browser.')
  }

  const videoConfig = await pickVideoConfig(opts)
  const mp4 = opts.format === 'mp4'

  let audioConfig: AudioEncoderConfig | null = null
  if (opts.includeAudio) {
    const candidate: AudioEncoderConfig = mp4
      ? { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 192000 }
      : { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 }
    if (await probeAudio(candidate)) audioConfig = candidate
  }
  const useAudio = audioConfig !== null
  const noteAudio =
    opts.includeAudio && !useAudio
      ? 'Audio track unavailable with this codec — exporting video only.'
      : undefined

  let addVideo: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void
  let addAudio: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void
  let finalize: () => void
  let getBuffer: () => ArrayBuffer

  if (mp4) {
    const muxer = new Mp4Muxer({
      target: new Mp4Target(),
      video: { codec: 'avc', width: opts.width, height: opts.height },
      audio: useAudio
        ? {
            codec: 'aac',
            sampleRate: audioConfig!.sampleRate,
            numberOfChannels: audioConfig!.numberOfChannels,
          }
        : undefined,
      fastStart: 'in-memory',
    })
    addVideo = (c, m) => muxer.addVideoChunk(c, m)
    addAudio = (c, m) => muxer.addAudioChunk(c, m)
    finalize = () => muxer.finalize()
    getBuffer = () => muxer.target.buffer
  } else {
    const muxer = new WebmMuxer({
      target: new WebmTarget(),
      video: {
        codec: opts.videoCodec === 'vp8' ? 'V_VP8' : 'V_VP9',
        width: opts.width,
        height: opts.height,
        frameRate: opts.fps,
      },
      audio: useAudio
        ? {
            codec: 'A_OPUS',
            sampleRate: audioConfig!.sampleRate,
            numberOfChannels: audioConfig!.numberOfChannels,
          }
        : undefined,
    })
    addVideo = (c, m) => muxer.addVideoChunk(c, m)
    addAudio = (c, m) => muxer.addAudioChunk(c, m)
    finalize = () => muxer.finalize()
    getBuffer = () => muxer.target.buffer
  }

  let failed: Error | null = null
  const onError = (e: unknown) => {
    failed ??= e instanceof Error ? e : new Error(String(e))
  }

  const videoEncoder = new VideoEncoder({ output: addVideo, error: onError })
  videoEncoder.configure(videoConfig)

  let audioEncoder: AudioEncoder | null = null
  if (audioConfig) {
    audioEncoder = new AudioEncoder({ output: addAudio, error: onError })
    audioEncoder.configure(audioConfig)
  }

  const keyEvery = Math.max(1, Math.round(opts.fps * 2))
  report(0, total, 'rendering', noteAudio)

  for (let i = 0; i < total; i++) {
    if (cancelRequested) {
      videoEncoder.close()
      audioEncoder?.close()
      exportStore.set({ phase: 'cancelled', frame: 0, total })
      return
    }
    if (failed) throw failed

    drawFrame(i)
    const timestamp = Math.round((i * 1_000_000) / opts.fps)
    const vFrame = new VideoFrame(canvas as unknown as CanvasImageSource, {
      timestamp,
      duration: Math.round(1_000_000 / opts.fps),
    })
    videoEncoder.encode(vFrame, { keyFrame: i % keyEvery === 0 })
    vFrame.close()

    if (audioEncoder && audioConfig) {
      const seg = buildAudioSegment(
        pcm,
        audioConfig.sampleRate,
        i,
        opts.fps,
        audioConfig.numberOfChannels,
      )
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: audioConfig.sampleRate,
        numberOfFrames: seg.frames,
        numberOfChannels: audioConfig.numberOfChannels,
        timestamp,
        data: seg.data,
      })
      audioEncoder.encode(audioData)
      audioData.close()
    }

    while (
      videoEncoder.encodeQueueSize > 6 ||
      (audioEncoder && audioEncoder.encodeQueueSize > 12)
    ) {
      await sleep(4)
      if (failed) throw failed
    }
    report(i + 1, total, 'rendering', noteAudio)
    if (i % 3 === 0) await nextTick()
  }

  report(total, total, 'finalizing', 'Encoding audio…')
  await videoEncoder.flush()
  if (audioEncoder) await audioEncoder.flush()
  if (failed) throw failed
  videoEncoder.close()
  audioEncoder?.close()

  finalize()
  const blob = new Blob([getBuffer()], {
    type: mp4 ? 'video/mp4' : 'video/webm',
  })
  const filename = `pulse_${opts.width}x${opts.height}_${opts.fps}fps.${mp4 ? 'mp4' : 'webm'}`
  exportStore.set({
    phase: 'done',
    frame: total,
    total,
    blob,
    filename,
    message: noteAudio,
  })
}

interface AudioSegment {
  data: Float32Array<ArrayBuffer>
  frames: number
}

/** Extract one output-frame worth of audio, resampling when required. */
function buildAudioSegment(
  pcm: AudioBuffer,
  targetRate: number,
  frameIndex: number,
  fps: number,
  channels: number,
): AudioSegment {
  const frames = Math.round(targetRate / fps)
  const startOrig = (frameIndex * pcm.sampleRate) / fps
  const out = new Float32Array(frames * channels)
  const chCount = Math.max(1, Math.min(channels, pcm.numberOfChannels))
  for (let c = 0; c < channels; c++) {
    const src = pcm.getChannelData(Math.min(c, chCount - 1))
    const offset = c * frames
    if (pcm.sampleRate === targetRate) {
      const start = Math.round(startOrig)
      for (let i = 0; i < frames; i++) {
        const idx = start + i
        out[offset + i] = idx >= 0 && idx < src.length ? src[idx] : 0
      }
    } else {
      const rate = targetRate / pcm.sampleRate
      for (let i = 0; i < frames; i++) {
        const pos = startOrig + i / rate
        const i0 = Math.floor(pos)
        const frac = pos - i0
        const a = i0 >= 0 && i0 < src.length ? src[i0] : 0
        const b = i0 + 1 < src.length ? src[i0 + 1] : 0
        out[offset + i] = a + (b - a) * frac
      }
    }
  }
  return { data: out, frames }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type))
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
