import { activeColors, colorAt, rgbaAt } from './palette'
import type { Frame, ParamDef, VisualizationEngine } from './types'
import { applyGlow, clamp, follow, lerp, strokeSmoothPath } from './util'

const STYLES = [
  { value: 'line', label: 'Smooth line' },
  { value: 'filled', label: 'Filled mirror' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'dots', label: 'Dotted chain' },
]

const PARAMS: ParamDef[] = [
  { key: 'style', label: 'Style', type: 'select', options: STYLES, default: 'filled', group: 'Style' },
  { key: 'thickness', label: 'Thickness', type: 'number', min: 1, max: 24, step: 0.5, default: 4, unit: 'px', group: 'Style' },
  { key: 'points', label: 'Resolution', type: 'number', min: 48, max: 1024, step: 16, default: 384, group: 'Style' },
  { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0.1, max: 3, step: 0.05, default: 1, group: 'Response' },
  { key: 'smoothing', label: 'Smoothing', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.5, group: 'Response' },
  { key: 'symmetry', label: 'Symmetry', type: 'number', min: 0, max: 1, step: 0.01, default: 1, group: 'Response' },
  { key: 'freqResponse', label: 'Frequency response', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Response' },
  { key: 'mirror', label: 'Mirror horizontally', type: 'boolean', default: false, group: 'Motion' },
  { key: 'travel', label: 'Scroll speed', type: 'number', min: -2, max: 2, step: 0.05, default: 0, group: 'Motion' },
]

export class WaveformEngine implements VisualizationEngine {
  readonly id = 'waveform'
  readonly name = 'Waveform'
  readonly description = 'Time-domain wave, from silky lines to filled ribbons.'
  readonly params = PARAMS

  private ctx!: CanvasRenderingContext2D
  private smoothed = new Float32Array(0)
  private width = 1
  private height = 1
  private offset = 0

  mount(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')
    this.ctx = ctx
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width
    this.height = height
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  render(frame: Frame) {
    const { ctx, width, height } = this
    const p = frame.params
    const g = frame.global
    const a = frame.analysis
    const colors = activeColors(g.paletteId, g.customColors)
    const dt = frame.dt

    const n = Math.round(p.points as number)
    if (this.smoothed.length !== n) this.smoothed = new Float32Array(n)

    this.offset += (p.travel as number) * dt

    const wave = a.wave
    const amp = (p.amplitude as number) * height * 0.42
    const sym = p.symmetry as number
    const freqResponse = p.freqResponse as number
    const mirror = p.mirror as boolean
    const cy = height / 2

    const pts: Array<{ x: number; y: number }> = new Array(n)
    const center: Array<{ x: number; y: number }> = new Array(n)
    const W = mirror ? width * 2 : width

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const srcT = mirror ? ((t + this.offset + 1) % 1) * 2 : (t + this.offset + 1) % 1
      const idx = Math.min(wave.length - 1, Math.floor(srcT * (wave.length - 1)))
      let sample = wave[idx]
      // Frequency-driven wobble: highs lift the line locally.
      if (freqResponse > 0.01) {
        const f = a.freq[Math.floor((idx / wave.length) * a.freq.length)] ?? 0
        sample += f * freqResponse * Math.sin(t * 40 + frame.time * 3) * 0.35
      }
      const target = clamp(sample * (1 + a.amplitude * 0.35), -1.6, 1.6)
      const s = follow(this.smoothed[i], target, p.smoothing as number, dt)
      this.smoothed[i] = s

      let x = t * width
      if (mirror) {
        const cycle = (t + this.offset * 0.5 + 2) % 1
        x = cycle * W
        if (x > width) x = W - x
      }
      pts[i] = { x, y: cy - s * amp }
      center[i] = { x, y: cy + s * amp * sym }
    }

    const style = p.style as string
    const thickness = p.thickness as number

    if (style === 'filled') {
      const grad = ctx.createLinearGradient(0, cy - amp, 0, cy + amp)
      grad.addColorStop(0, colorAt(colors, 0.95))
      grad.addColorStop(0.5, colorAt(colors, 0.5))
      grad.addColorStop(1, colorAt(colors, 0.05))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(pts[0].x, cy)
      for (const pt of pts) ctx.lineTo(pt.x, pt.y)
      for (let i = pts.length - 1; i >= 0; i--) {
        const pt = center[i]
        ctx.lineTo(pt.x, sym > 0.01 ? pt.y : cy)
      }
      ctx.closePath()
      ctx.globalAlpha = 0.85
      ctx.fill()
      ctx.globalAlpha = 1

      ctx.strokeStyle = colorAt(colors, 0.75)
      ctx.lineWidth = Math.max(1, thickness * 0.6)
      applyGlow(ctx, g.glow, 16)
      strokeSmoothPath(ctx, pts, false)
      ctx.stroke()
      ctx.shadowBlur = 0
      if (sym > 0.01) {
        ctx.strokeStyle = rgbaAt(colors, 0.25, 0.6 + sym * 0.4)
        strokeSmoothPath(ctx, center, false)
        ctx.stroke()
        ctx.shadowBlur = 0
      }
    } else if (style === 'ribbon') {
      const grad = ctx.createLinearGradient(0, 0, width, 0)
      for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, colorAt(colors, i / 8))
      ctx.strokeStyle = grad
      ctx.lineWidth = thickness
      ctx.lineCap = 'round'
      applyGlow(ctx, g.glow, 20)
      strokeSmoothPath(ctx, pts, false)
      ctx.stroke()
      ctx.shadowBlur = 0
      if (sym > 0.01) {
        ctx.globalAlpha = 0.55
        strokeSmoothPath(ctx, center, false)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.shadowBlur = 0
      }
      // Inner highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = Math.max(1, thickness * 0.25)
      strokeSmoothPath(ctx, pts, false)
      ctx.stroke()
      ctx.shadowBlur = 0
    } else if (style === 'dots') {
      const step = Math.max(1, Math.floor(n / 160))
      for (let i = 0; i < n; i += step) {
        const t = i / (n - 1)
        ctx.fillStyle = colorAt(colors, t)
        ctx.shadowColor = ctx.fillStyle
        applyGlow(ctx, g.glow, 12)
        ctx.beginPath()
        ctx.arc(pts[i].x, pts[i].y, thickness, 0, Math.PI * 2)
        ctx.fill()
        if (sym > 0.01) {
          ctx.globalAlpha = 0.6
          ctx.beginPath()
          ctx.arc(center[i].x, center[i].y, thickness * 0.7, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }
      ctx.shadowBlur = 0
      // Connecting hairline
      ctx.strokeStyle = rgbaAt(colors, 0.5, 0.35)
      ctx.lineWidth = 1
      strokeSmoothPath(ctx, pts, false)
      ctx.stroke()
      ctx.shadowBlur = 0
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, 0)
      for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, colorAt(colors, i / 8))
      ctx.strokeStyle = grad
      ctx.lineWidth = thickness
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      applyGlow(ctx, g.glow, 18)
      strokeSmoothPath(ctx, pts, false)
      ctx.stroke()
      ctx.shadowBlur = 0
      if (sym > 0.01) {
        ctx.globalAlpha = lerp(0.3, 1, sym)
        strokeSmoothPath(ctx, center, false)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.shadowBlur = 0
      }
    }
  }

  unmount() {
    this.smoothed = new Float32Array(0)
  }
}
