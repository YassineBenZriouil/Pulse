import { logSample } from '../audio/analysis'
import { activeColors, colorAt, rgbaAt } from './palette'
import type { Frame, ParamDef, VisualizationEngine } from './types'
import { applyGlow, clamp, follow, roundRectPath } from './util'

const STYLES = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'mirrored', label: 'Mirrored' },
  { value: 'segmented', label: 'Segmented' },
  { value: 'thin', label: 'Thin line' },
  { value: 'neon', label: 'Neon glow' },
]

const ALIGNMENTS = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'center', label: 'Center' },
  { value: 'top', label: 'Top' },
]

const PARAMS: ParamDef[] = [
  { key: 'barCount', label: 'Bar count', type: 'number', min: 8, max: 320, step: 1, default: 96, group: 'Geometry' },
  { key: 'barWidth', label: 'Max width', type: 'number', min: 2, max: 80, step: 1, default: 16, unit: 'px', group: 'Geometry' },
  { key: 'gap', label: 'Gap', type: 'number', min: 0, max: 24, step: 0.5, default: 4, unit: 'px', group: 'Geometry' },
  { key: 'height', label: 'Height', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.8, group: 'Geometry' },
  { key: 'align', label: 'Alignment', type: 'select', options: ALIGNMENTS, default: 'bottom', group: 'Geometry' },
  { key: 'style', label: 'Style', type: 'select', options: STYLES, default: 'rounded', group: 'Style' },
  { key: 'segments', label: 'Segments', type: 'number', min: 4, max: 40, step: 1, default: 14, group: 'Style' },
  { key: 'symmetry', label: 'Symmetry', type: 'number', min: 0, max: 1, step: 0.01, default: 0, group: 'Style' },
  { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0.2, max: 3, step: 0.05, default: 1.2, group: 'Response' },
  { key: 'smoothing', label: 'Smoothing', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.45, group: 'Response' },
  { key: 'decay', label: 'Decay', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.15, group: 'Response' },
  { key: 'peaks', label: 'Peak caps', type: 'boolean', default: true, group: 'Motion' },
  { key: 'peakFall', label: 'Peak fall speed', type: 'number', min: 0.05, max: 2, step: 0.05, default: 0.5, group: 'Motion' },
]

export class SpectrumBarsEngine implements VisualizationEngine {
  readonly id = 'spectrum-bars'
  readonly name = 'Spectrum Bars'
  readonly description = 'Classic frequency bars with six distinct styles.'
  readonly params = PARAMS

  private ctx!: CanvasRenderingContext2D
  private values = new Float32Array(0)
  private peaks = new Float32Array(0)
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

    const count = Math.round(p.barCount as number)
    if (this.values.length !== count) {
      this.values = new Float32Array(count)
      this.peaks = new Float32Array(count)
    }

    const slot = width / count
    const barW = Math.max(1, Math.min(p.barWidth as number, slot - (p.gap as number)))
    const maxH = height * (p.height as number)
    const amplitude = p.amplitude as number
    const align = p.align as string
    const style = p.style as string
    const baseY = align === 'top' ? 0 : align === 'center' ? height / 2 : height
    const dir = align === 'top' ? 1 : -1

    for (let i = 0; i < count; i++) {
      const raw = logSample(a.freq, frame.sampleRate, i, count) * amplitude
      const target = clamp(raw, 0, 1.5)
      const v = follow(this.values[i], target, p.smoothing as number, dt)
      this.values[i] = v
      const peak = this.peaks[i]
      this.peaks[i] =
        v >= peak ? v : Math.max(v, peak - (p.peakFall as number) * dt * (0.6 + peak))
    }

    ctx.lineCap = 'round'
    const sym = p.symmetry as number
    const segments = Math.round(p.segments as number)
    const segGap = 3

    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1)
      const v = this.values[i]
      const x = i * slot + (slot - barW) / 2
      const color = colorAt(colors, t)
      const h = v * maxH
      if (h < 0.5) continue

      ctx.fillStyle = color
      ctx.strokeStyle = color
      ctx.shadowColor = color

      if (style === 'segmented') {
        const segH = Math.max(2, (maxH - segGap * (segments - 1)) / segments)
        const lit = Math.max(1, Math.round((h / maxH) * segments))
        for (let s = 0; s < lit; s++) {
          const offset = s * (segH + segGap)
          const y = align === 'center' ? baseY - offset - segH : align === 'top' ? offset : baseY - offset - segH
          ctx.globalAlpha = 0.4 + 0.6 * (s / segments)
          ctx.fillRect(x, y, barW, segH)
        }
        ctx.globalAlpha = 1
      } else if (style === 'thin') {
        ctx.lineWidth = Math.max(1, barW * 0.35)
        applyGlow(ctx, g.glow, 14)
        ctx.beginPath()
        if (align === 'center') {
          ctx.moveTo(x + barW / 2, baseY - h / 2)
          ctx.lineTo(x + barW / 2, baseY + h / 2)
        } else {
          ctx.moveTo(x + barW / 2, baseY)
          ctx.lineTo(x + barW / 2, baseY + dir * h)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      } else {
        const radius = style === 'sharp' ? 0 : Math.min(barW / 2, 8)
        if (align === 'center') {
          const bh = Math.max(barW * 0.5, h)
          roundRectPath(ctx, x, baseY - bh / 2, barW, bh, radius)
          ctx.fill()
          if (sym > 0.01) {
            ctx.globalAlpha = sym
            roundRectPath(ctx, x, baseY - bh / 2 - bh * sym - 6, barW, bh * sym, radius)
            ctx.fill()
            ctx.globalAlpha = 1
          }
        } else {
          const y = dir < 0 ? baseY - h : baseY
          roundRectPath(ctx, x, y, barW, Math.max(barW * 0.4, h), radius)
          ctx.fill()
          if (sym > 0.01) {
            ctx.globalAlpha = sym
            const ry = dir < 0 ? baseY : baseY - h * sym
            roundRectPath(ctx, x, ry, barW, Math.max(2, h * sym), radius)
            ctx.fill()
            ctx.globalAlpha = 1
          }
        }
        if (style === 'neon') {
          applyGlow(ctx, Math.max(g.glow, 0.7), 26)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }

      if (p.peaks) {
        const py = this.peaks[i] * maxH
        ctx.fillStyle = rgbaAt(colors, t, 0.95)
        ctx.shadowColor = ctx.fillStyle
        applyGlow(ctx, g.glow, 10)
        if (align === 'center') {
          roundRectPath(ctx, x, baseY - py / 2 - 2, barW, 4, 2)
          ctx.fill()
          if (sym > 0.01) {
            ctx.globalAlpha = sym
            roundRectPath(ctx, x, baseY + py / 2 - 2, barW, 4, 2)
            ctx.fill()
            ctx.globalAlpha = 1
          }
        } else {
          const y = dir < 0 ? baseY - py - 3 : baseY + py
          roundRectPath(ctx, x, y, barW, 4, 2)
          ctx.fill()
        }
        ctx.shadowBlur = 0
      }
    }
  }

  unmount() {
    this.values = new Float32Array(0)
    this.peaks = new Float32Array(0)
  }
}
