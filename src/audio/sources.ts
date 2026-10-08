import type { SourceInfo, SourceKind, SourceStatus } from './types'

export interface AudioSource {
  readonly kind: SourceKind
  /** Resolves to a ready/unavailable/error status once metadata is known. */
  load(): Promise<SourceStatus>
  /** Playable media element, or null when the source cannot produce audio. */
  getMediaElement(): HTMLMediaElement | null
  /** Decoded PCM for deterministic offline analysis (export). */
  getPcm(ctx: AudioContext): Promise<AudioBuffer | null>
  dispose(): void
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '') || name
}

export class FileSource implements AudioSource {
  readonly kind = 'file' as const
  private readonly file: File
  private readonly url: string
  private readonly el: HTMLAudioElement
  private pcm: AudioBuffer | null = null
  private loaded = false

  constructor(file: File) {
    this.file = file
    this.url = URL.createObjectURL(file)
    this.el = new Audio()
    this.el.preload = 'auto'
    this.el.src = this.url
    this.el.crossOrigin = 'anonymous'
  }

  info(): SourceInfo {
    return {
      kind: 'file',
      title: baseName(this.file.name),
      duration: Number.isFinite(this.el.duration) ? this.el.duration : 0,
      playable: true,
    }
  }

  load(): Promise<SourceStatus> {
    if (this.loaded) return Promise.resolve({ state: 'ready', info: this.info() })
    return new Promise((resolve) => {
      const fail = () =>
        resolve({
          state: 'error',
          message: `Could not decode "${this.file.name}" — the format may not be supported by this browser.`,
        })
      this.el.addEventListener(
        'loadedmetadata',
        () => {
          this.loaded = true
          resolve({ state: 'ready', info: this.info() })
        },
        { once: true },
      )
      this.el.addEventListener('error', fail, { once: true })
      this.el.load()
    })
  }

  getMediaElement() {
    return this.el
  }

  async getPcm(ctx: AudioContext): Promise<AudioBuffer | null> {
    if (this.pcm) return this.pcm
    try {
      const bytes = await this.file.arrayBuffer()
      this.pcm = await ctx.decodeAudioData(bytes)
      return this.pcm
    } catch {
      return null
    }
  }

  dispose() {
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    URL.revokeObjectURL(this.url)
    this.pcm = null
  }
}

export interface YouTubeMeta {
  id: string
  title: string
  author?: string
  thumbnailUrl: string
}

export function parseYouTubeId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /^([\w-]{11})$/,
  ]
  for (const re of patterns) {
    const m = input.trim().match(re)
    if (m) return m[1]
  }
  return null
}

/**
 * YouTube abstraction stub. Provides metadata/thumbnail/loading UI, but never
 * attempts to extract audio in the browser — that requires a backend
 * AudioSource implementing this same interface.
 */
export class YouTubeSource implements AudioSource {
  readonly kind = 'youtube' as const
  private status: SourceStatus = { state: 'empty' }
  private readonly url: string
  private readonly meta: YouTubeMeta

  constructor(url: string, meta: YouTubeMeta) {
    this.url = url
    this.meta = meta
  }

  static fromUrl(url: string): YouTubeSource | null {
    const id = parseYouTubeId(url)
    if (!id) return null
    return new YouTubeSource(url, {
      id,
      title: 'YouTube video',
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    })
  }

  async load(): Promise<SourceStatus> {
    if (this.status.state !== 'empty') return this.status
    this.status = { state: 'loading', label: 'Fetching YouTube metadata…' }
    try {
      const endpoint =
        'https://www.youtube.com/oembed?url=' +
        encodeURIComponent(this.url) +
        '&format=json'
      const res = await fetch(endpoint)
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string
          author_name?: string
          thumbnail_url?: string
        }
        if (data.title) this.meta.title = data.title
        if (data.author_name) this.meta.author = data.author_name
        if (data.thumbnail_url) this.meta.thumbnailUrl = data.thumbnail_url
      }
    } catch {
      // Metadata is best-effort; thumbnail URL still works without it.
    }
    const info: SourceInfo = {
      kind: 'youtube',
      title: this.meta.title,
      artist: this.meta.author,
      duration: 0,
      artworkUrl: this.meta.thumbnailUrl,
      playable: false,
    }
    this.status = {
      state: 'unavailable',
      info,
      message:
        'YouTube audio extraction requires a backend audio source. Playback is disabled until one is connected.',
    }
    return this.status
  }

  getMediaElement() {
    return null
  }

  getPcm(): Promise<AudioBuffer | null> {
    return Promise.resolve(null)
  }

  dispose() {}
}
