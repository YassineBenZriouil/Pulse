import { logSample } from '../audio/analysis'
import { activeColors, colorAt, rgbaAt } from './palette'
import type { Frame, ParamDef, VisualizationEngine } from './types'
import { applyGlow, clamp, follow, strokeSmoothPath } from './util'

const STYLES = [
  { value: 'liquid', label: 'Liquid ring' },
  { value: 'pulse', label: 'Pulse ring' },
  { value: 'geometric', label: 'Geometric' },
]

const PARAMS: ParamDef[] = [
  { key: 'style', label: 'Style', type: 'select', options: STYLES, default: 'liquid', group: 'Style' },
  { key: 'radius', label: 'Radius', type: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.42, group: 'Geometry' },
  { key: 'points', label: 'Resolution', type: 'number', min: 48, max: 720, step: 16, default: 320, group: 'Geometry' },
  { key: 'displacement', label: 'Displacement', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Geometry' },
  { key: 'thickness', label: 'Thickness', type: 'number', min: 1, max: 24, step: 0.5, default: 5, unit: 'px', group: 'Geometry' },
  { key: 'fill', label: 'Inner fill', type: 'boolean', default: false, group: 'Geometry' },
  { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0.2, max: 3, step: 0.05, default: 1.2, group: 'Response' },
  { key: 'smoothing', label: 'Smoothing', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.5, group: 'Response' },
  { key: 'rotation', label: 'Rotation', type: 'number', min: -1, max: 1, step: 0.01, default: 0.04, unit: 'rot/s', group: 'Motion' },
  { key: 'beatKick', label: 'Beat kick', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6, group: 'Motion' },
]

export class RadialWaveEngine implements VisualizationEngine {
  readonly id = 'radial-wave'
  readonly name = 'Radial Wave'
  readonly description: string = 'Waveform wrapped into a ring — liquid or geometric.'
  readonly params = PARAMS

  private ctx!: CanvasRenderingContext2D
  private offsets = new Float32Array(0)
  private phase = 0
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

  render(frame: Frame) {
    const { ctx, width, height } = this
    const p = frame.params
    const g = frame.global
    const a = frame.analysis
    const colors = activeColors(g.paletteId, g.customColors)
    const dt = frame.dt

    const n = Math.round(p.points as number)
    if (this.offsets.length !== n) this.offsets = new Float32Array(n)

    const style = p.style as string
    const minDim = Math.min(width, height)
    const kick = a.beat * (p.beatKick as number)
    const R =
      (p.radius as number) * minDim * 0.5 * (1 + kick * 0.07)
    const disp = (p.displacement as number) * minDim * 0.16 * (p.amplitude as number)
    const wave = a.wave
    const cy = height / 2
    const cx = width / 2
    this.phase += (p.rotation as number) * Math.PI * 2 * dt

    const pts: Array<{ x: number; y: number }> = new Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / n
      let raw: number
      if (style === 'geometric') {
        raw = logSample(a.freq, frame.sampleRate, i, n) * 2 - 0.15
      } else if (style === 'pulse') {
        const spec = logSample(a.freq, frame.sampleRate, i, n)
        const idx = Math.floor(t * (wave.length - 1))
        raw = wave[idx] * 0.35 + spec * 1.1 + a.amplitude * 0.3
      } else {
        const idx = Math.floor(t * (wave.length - 1))
        const spec = logSample(a.freq, frame.sampleRate, i, n)
        raw = wave[idx] * 0.85 + spec * 0.35 * (0.4 + a.bands.treble)
      }
      const target = clamp(raw, -1.4, 1.6)
      const s = follow(this.offsets[i], target, p.smoothing as number, dt)
      this.offsets[i] = s

      const angle = this.phase - Math.PI / 2 + t * Math.PI * 2
      const r = R + s * disp
      pts[i] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
    }

    const thickness = p.thickness as number
    const closed = style !== 'geometric'

    if (p.fill) {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (const pt of pts) ctx.lineTo(pt.x, pt.y)
      ctx.closePath()
      const grad = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R + disp)
      grad.addColorStop(0, rgbaAt(colors, 0.9, 0.08 + a.amplitude * 0.2))
      grad.addColorStop(1, rgbaAt(colors, 0.5, 0.3 + a.beat * 0.25))
      ctx.fillStyle = grad
      ctx.fill()
    }

    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
    for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, colorAt(colors, i / 8))
    ctx.strokeStyle = grad
    ctx.lineWidth = thickness
    applyGlow(ctx, g.glow, 22)
    if (style === 'geometric') {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const pt = pts[i]
        if (i === 0) ctx.moveTo(pt.x, pt.y)
        else ctx.lineTo(pt.x, pt.y)
      }
      ctx.stroke()
    } else {
      strokeSmoothPath(ctx, pts, closed)
      ctx.stroke()
    }
    ctx.shadowBlur = 0

    // Secondary echo ring, slightly offset — adds depth without extra cost.
    ctx.strokeStyle = rgbaAt(colors, 0.2, 0.4)
    ctx.lineWidth = Math.max(1, thickness * 0.4)
    const inward = R * 0.9
    const echo = pts.map((pt) => ({
      x: cx + ((pt.x - cx) * inward) / Math.max(1, R),
      y: cy + ((pt.y - cy) * inward) / Math.max(1, R),
    }))
    strokeSmoothPath(ctx, echo, closed)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  unmount() {
    this.offsets = new Float32Array(0)
  }
}
