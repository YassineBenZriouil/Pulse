import { logSample } from '../audio/analysis'
import { activeColors, colorAt, rgbaAt } from './palette'
import type { Frame, ParamDef, VisualizationEngine } from './types'
import { applyGlow, clamp, follow } from './util'

const PARAMS: ParamDef[] = [
  { key: 'radius', label: 'Radius', type: 'number', min: 0.15, max: 0.9, step: 0.01, default: 0.5, group: 'Geometry' },
  { key: 'barCount', label: 'Bar count', type: 'number', min: 24, max: 360, step: 4, default: 144, group: 'Geometry' },
  { key: 'thickness', label: 'Thickness', type: 'number', min: 1, max: 24, step: 1, default: 5, unit: 'px', group: 'Geometry' },
  { key: 'spacing', label: 'Spacing', type: 'number', min: 0, max: 10, step: 0.5, default: 2, unit: 'px', group: 'Geometry' },
  { key: 'maxLength', label: 'Max bar length', type: 'number', min: 0.05, max: 0.5, step: 0.01, default: 0.3, group: 'Geometry' },
  { key: 'mirror', label: 'Mirror inward', type: 'boolean', default: false, group: 'Geometry' },
  { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0.2, max: 3, step: 0.05, default: 1.15, group: 'Response' },
  { key: 'smoothing', label: 'Smoothing', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.45, group: 'Response' },
  { key: 'decay', label: 'Decay', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.14, group: 'Response' },
  { key: 'rotation', label: 'Rotation', type: 'number', min: -1, max: 1, step: 0.01, default: 0.06, unit: 'rot/s', group: 'Motion' },
  { key: 'pulse', label: 'Beat pulse', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Motion' },
  { key: 'peaks', label: 'Peak dots', type: 'boolean', default: true, group: 'Motion' },
  { key: 'peakFall', label: 'Peak fall speed', type: 'number', min: 0.05, max: 2, step: 0.05, default: 0.5, group: 'Motion' },
  { key: 'showArt', label: 'Show artwork', type: 'boolean', default: true, group: 'Center' },
  { key: 'artScale', label: 'Artwork size', type: 'number', min: 0.4, max: 0.95, step: 0.01, default: 0.8, group: 'Center' },
  { key: 'rings', label: 'Beat rings', type: 'boolean', default: true, group: 'Center' },
]

interface Ring {
  r: number
  life: number
}

export class NcsCircleEngine implements VisualizationEngine {
  readonly id = 'ncs-circle'
  readonly name = 'NCS Circle'
  readonly description = 'Radial spectrum around artwork — the flagship look.'
  readonly params = PARAMS

  private ctx!: CanvasRenderingContext2D
  private values = new Float32Array(0)
  private peaks = new Float32Array(0)
  private phase = 0
  private rings: Ring[] = []
  private width = 1
  private height = 1

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

  private ensure(count: number) {
    if (this.values.length !== count) {
      this.values = new Float32Array(count)
      this.peaks = new Float32Array(count)
    }
  }

  render(frame: Frame) {
    const { ctx, width, height } = this
    const p = frame.params
    const g = frame.global
    const a = frame.analysis
    const colors = activeColors(g.paletteId, g.customColors)

    const count = Math.round(p.barCount as number)
    this.ensure(count)

    const cx = width / 2
    const cy = height / 2
    const minDim = Math.min(width, height)
    const pulse = 1 + a.beat * (p.pulse as number) * 0.05
    const R = (p.radius as number) * minDim * 0.5 * pulse
    const maxLength = (p.maxLength as number) * minDim
    const thickness = p.thickness as number
    const spacing = p.spacing as number
    const amplitude = p.amplitude as number
    const dt = frame.dt

    this.phase += (p.rotation as number) * Math.PI * 2 * dt

    const sampleRate = frame.sampleRate
    for (let i = 0; i < count; i++) {
      const raw = logSample(a.freq, sampleRate, i, count) * amplitude
      const target = clamp(raw, 0, 1.4)
      const v = follow(this.values[i], target, p.smoothing as number, dt)
      this.values[i] = v

      const peak = this.peaks[i]
      this.peaks[i] =
        v >= peak
          ? v
          : Math.max(v, peak - (p.peakFall as number) * dt * (0.6 + peak))
    }

    ctx.lineCap = 'round'
    const glow = g.glow
    const slot = (Math.PI * 2 * R) / count
    const barW = Math.max(1, Math.min(thickness, slot - spacing))

    for (let i = 0; i < count; i++) {
      const t = i / count
      const angle = this.phase - Math.PI / 2 + t * Math.PI * 2
      const len = this.values[i] * maxLength
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      const inner = R + spacing
      const outer = inner + len
      ctx.strokeStyle = colorAt(colors, t)
      ctx.lineWidth = barW
      ctx.shadowColor = ctx.strokeStyle
      applyGlow(ctx, glow, 18)
      ctx.beginPath()
      ctx.moveTo(cx + cos * inner, cy + sin * inner)
      ctx.lineTo(cx + cos * outer, cy + sin * outer)
      ctx.stroke()

      if (p.mirror) {
        const mOuter = R - spacing
        const mInner = mOuter - len * 0.6
        ctx.beginPath()
        ctx.moveTo(cx + cos * mOuter, cy + sin * mOuter)
        ctx.lineTo(cx + cos * mInner, cy + sin * mInner)
        ctx.stroke()
      }

      if (p.peaks && len > 1) {
        const pr = barW * 0.75
        const py = this.peaks[i] * maxLength
        ctx.fillStyle = rgbaAt(colors, t, 0.9)
        ctx.shadowColor = ctx.fillStyle
        applyGlow(ctx, glow, 12)
        ctx.beginPath()
        ctx.arc(cx + cos * (inner + py), cy + sin * (inner + py), pr, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.shadowBlur = 0

    if (a.onset && p.rings) {
      this.rings.push({ r: R, life: 1 })
      if (this.rings.length > 6) this.rings.shift()
    }
    for (const ring of this.rings) {
      ring.r += (minDim * 0.28 + ring.life * minDim * 0.1) * dt * 2.2
      ring.life -= dt * 1.1
    }
    this.rings = this.rings.filter((r) => r.life > 0)
    for (const ring of this.rings) {
      ctx.strokeStyle = rgbaAt(colors, 0.6, ring.life * 0.5)
      ctx.lineWidth = 1.5 + ring.life * 2.5
      ctx.shadowColor = ctx.strokeStyle
      applyGlow(ctx, glow, 14)
      ctx.beginPath()
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.shadowBlur = 0

    if (p.showArt) this.drawCenter(frame, R, cx, cy, colors)
  }

  private drawCenter(
    frame: Frame,
    R: number,
    cx: number,
    cy: number,
    colors: string[],
  ) {
    const { ctx } = this
    const p = frame.params
    const artR = R * (p.artScale as number)
    const a = frame.analysis

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, artR, 0, Math.PI * 2)
    ctx.clip()

    const img = frame.artwork
    if (img && img.complete && img.naturalWidth > 0) {
      const s = Math.max((artR * 2) / img.naturalWidth, (artR * 2) / img.naturalHeight)
      const w = img.naturalWidth * s
      const h = img.naturalHeight * s
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(cx - artR, cy - artR, artR * 2, artR * 2)
    } else {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, artR)
      grad.addColorStop(0, colorAt(colors, 0.15 + a.bands.bass * 0.3))
      grad.addColorStop(1, colorAt(colors, 0.85))
      ctx.fillStyle = grad
      ctx.fillRect(cx - artR, cy - artR, artR * 2, artR * 2)
      // Breathing core driven by amplitude.
      const core = artR * (0.35 + a.amplitude * 0.35)
      ctx.fillStyle = rgbaAt(colors, 0.9, 0.35 + a.beat * 0.4)
      ctx.beginPath()
      ctx.arc(cx, cy, core, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // Rim
    ctx.strokeStyle = rgbaAt(colors, 0.7, 0.9)
    ctx.lineWidth = 2
    ctx.shadowColor = ctx.strokeStyle
    applyGlow(ctx, frame.global.glow, 20)
    ctx.beginPath()
    ctx.arc(cx, cy, artR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Inner accent ring, subtle scale on beat
    const innerR = artR * (0.82 - a.beat * 0.04)
    ctx.strokeStyle = rgbaAt(colors, 0.4, 0.35 + a.beat * 0.3)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
    ctx.stroke()
  }

  unmount() {
    this.rings = []
    this.values = new Float32Array(0)
    this.peaks = new Float32Array(0)
  }
}
