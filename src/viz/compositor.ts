import type { GlobalSettings } from '../studio/settings'

/**
 * Post-processes every frame on the visible (or export) canvas:
 *
 *   begin → background fill / trail persistence
 *   engine.render(...)   (controller sets globalAlpha from settings)
 *   end   → bloom, vignette, grain
 *
 * Engines never clear the canvas; trail persistence is implemented here as a
 * partial background repaint, which also works on a transparent background.
 */
export class Compositor {
  readonly ctx: CanvasRenderingContext2D
  private bloomCanvas: HTMLCanvasElement
  private bloomCtx: CanvasRenderingContext2D
  private noisePattern: CanvasPattern | null = null
  private bgCache: { key: string; gradient: CanvasGradient } | null = null
  private vignetteCache: { key: string; gradient: CanvasGradient } | null = null
  private width = 0
  private height = 0
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    this.bloomCanvas = document.createElement('canvas')
    const bctx = this.bloomCanvas.getContext('2d')
    if (!bctx) throw new Error('2D canvas context unavailable')
    this.bloomCtx = bctx
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width
    this.height = height
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.bloomCanvas.width = Math.max(1, Math.ceil(width / 4))
    this.bloomCanvas.height = Math.max(1, Math.ceil(height / 4))
    this.bgCache = null
    this.vignetteCache = null
    this.noisePattern = null
  }

  private backgroundFill(global: GlobalSettings) {
    const { ctx, width, height } = this
    const bg = global.background
    const alpha = 1 - global.trails

    if (bg.mode === 'transparent') {
      // Erase proportionally so trails work without a backdrop.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      return
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = alpha
    if (bg.mode === 'solid') {
      ctx.fillStyle = bg.color1
    } else {
      const key = `${bg.color1}|${bg.color2}|${bg.angle}|${width}x${height}`
      if (!this.bgCache || this.bgCache.key !== key) {
        const rad = ((bg.angle - 90) * Math.PI) / 180
        const cx = width / 2
        const cy = height / 2
        const len = Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad))
        const g = ctx.createLinearGradient(
          cx - (Math.cos(rad) * len) / 2,
          cy - (Math.sin(rad) * len) / 2,
          cx + (Math.cos(rad) * len) / 2,
          cy + (Math.sin(rad) * len) / 2,
        )
        g.addColorStop(0, bg.color1)
        g.addColorStop(1, bg.color2)
        this.bgCache = { key, gradient: g }
      }
      ctx.fillStyle = this.bgCache.gradient
    }
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  }

  begin(global: GlobalSettings) {
    this.backgroundFill(global)
  }

  end(global: GlobalSettings, frameIndex: number) {
    const { ctx, width, height } = this

    if (global.bloom > 0.01) {
      const bw = this.bloomCanvas.width
      const bh = this.bloomCanvas.height
      this.bloomCtx.globalCompositeOperation = 'source-over'
      this.bloomCtx.clearRect(0, 0, bw, bh)
      try {
        this.bloomCtx.filter = `blur(${Math.max(1, bw / 90).toFixed(1)}px)`
      } catch {
        /* filter unsupported — plain downscale still blooms a little */
      }
      this.bloomCtx.drawImage(this.canvas, 0, 0, bw, bh)
      this.bloomCtx.filter = 'none'
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = global.bloom * 0.85
      ctx.drawImage(this.bloomCanvas, 0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }

    if (global.vignette > 0.01) {
      const key = `${width}x${height}|${global.vignette}`
      if (!this.vignetteCache || this.vignetteCache.key !== key) {
        const r = Math.hypot(width, height) / 2
        const g = ctx.createRadialGradient(
          width / 2,
          height / 2,
          r * 0.45,
          width / 2,
          height / 2,
          r,
        )
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, `rgba(0,0,0,${global.vignette.toFixed(3)})`)
        this.vignetteCache = { key, gradient: g }
      }
      ctx.fillStyle = this.vignetteCache.gradient
      ctx.fillRect(0, 0, width, height)
    }

    if (global.grain > 0.01) {
      const pattern = this.getNoisePattern()
      if (pattern) {
        try {
          const ox = ((frameIndex * 37) % 128) - 64
          const oy = ((frameIndex * 61) % 128) - 64
          pattern.setTransform(new DOMMatrix().translate(ox, oy))
        } catch {
          /* setTransform on patterns unsupported — static grain is fine */
        }
        ctx.globalCompositeOperation = 'overlay'
        ctx.globalAlpha = global.grain * 0.5
        ctx.fillStyle = pattern
        ctx.fillRect(0, 0, width, height)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }
  }

  private getNoisePattern(): CanvasPattern | null {
    if (this.noisePattern) return this.noisePattern
    const size = 128
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const nctx = c.getContext('2d')
    if (!nctx) return null
    const img = nctx.createImageData(size, size)
    let seed = 0x9e3779b9
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const v = 96 + ((seed >>> 16) & 0xff) * 0.25
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    nctx.putImageData(img, 0, 0)
    this.noisePattern = this.ctx.createPattern(c, 'repeat')
    return this.noisePattern
  }

  dispose() {
    this.noisePattern = null
    this.bgCache = null
    this.vignetteCache = null
  }
}

/** Deterministic PRNG (mulberry32) — same seed → same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
