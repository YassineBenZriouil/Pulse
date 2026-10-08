import { logSample } from '../audio/analysis'
import { activeColors, colorAt, rgbaAt } from './palette'
import type { Frame, ParamDef, VisualizationEngine } from './types'
import { applyGlow, clamp, follow } from './util'

const STYLES = [
  { value: 'wire', label: 'Wireframe' },
  { value: 'rows', label: 'Row lines' },
  { value: 'points', label: 'Points' },
]

const PARAMS: ParamDef[] = [
  { key: 'cols', label: 'Columns', type: 'number', min: 8, max: 96, step: 1, default: 56, group: 'Grid' },
  { key: 'rows', label: 'Depth rows', type: 'number', min: 6, max: 64, step: 1, default: 32, group: 'Grid' },
  { key: 'style', label: 'Style', type: 'select', options: STYLES, default: 'wire', group: 'Grid' },
  { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0.1, max: 3, step: 0.05, default: 1.3, group: 'Response' },
  { key: 'smoothing', label: 'Smoothing', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.5, group: 'Response' },
  { key: 'decay', label: 'Decay', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.2, group: 'Response' },
  { key: 'cameraHeight', label: 'Camera height', type: 'number', min: 0.2, max: 3, step: 0.05, default: 1.1, group: 'Camera' },
  { key: 'cameraTilt', label: 'Camera tilt', type: 'number', min: 5, max: 80, step: 1, default: 32, unit: '°', group: 'Camera' },
  { key: 'depth', label: 'Depth', type: 'number', min: 0.2, max: 2, step: 0.05, default: 1, group: 'Camera' },
  { key: 'yaw', label: 'Yaw speed', type: 'number', min: -1, max: 1, step: 0.02, default: 0.06, unit: 'rot/s', group: 'Camera' },
  { key: 'fov', label: 'Field of view', type: 'number', min: 0.3, max: 2, step: 0.05, default: 0.9, group: 'Camera' },
  { key: 'beatBob', label: 'Beat bob', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4, group: 'Camera' },
]

export class GridEngine implements VisualizationEngine {
  readonly id = 'grid'
  readonly name = 'Visualizer Grid'
  readonly description = 'A perspective spectrum field scrolling into depth.'
  readonly params = PARAMS

  private ctx!: CanvasRenderingContext2D
  private history: Float32Array[] = []
  private cols = 0
  private rows = 0
  private values: Float32Array[] = []
  private yaw = 0
  private width = 1
  private height = 1
  private lastPush = 0

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

  private ensure(cols: number, rows: number) {
    if (this.cols === cols && this.rows === rows) return
    this.cols = cols
    this.rows = rows
    this.history = []
    this.values = []
    for (let r = 0; r < rows; r++) {
      this.history.push(new Float32Array(cols))
      this.values.push(new Float32Array(cols))
    }
  }

  render(frame: Frame) {
    const { ctx, width, height } = this
    const p = frame.params
    const g = frame.global
    const a = frame.analysis
    const colors = activeColors(g.paletteId, g.customColors)
    const dt = frame.dt

    const cols = Math.round(p.cols as number)
    const rows = Math.round(p.rows as number)
    this.ensure(cols, rows)

    // Advance the depth history ~20 times per second for a readable scroll.
    if (frame.time - this.lastPush > 0.05 || this.lastPush === 0) {
      this.lastPush = frame.time
      const row = this.history.pop()!
      this.history.unshift(row)
      for (let c = 0; c < cols; c++) {
        row[c] = logSample(a.freq, frame.sampleRate, c, cols)
      }
    }

    const smoothing = p.smoothing as number
    const decay = p.decay as number
    const amplitude = p.amplitude as number
    const camH = (p.cameraHeight as number) * (1 + a.beat * (p.beatBob as number) * 0.12)
    const tilt = ((p.cameraTilt as number) * Math.PI) / 180
    const depth = (p.depth as number) * 4
    const fov = (p.fov as number) * Math.min(width, height) * 1.1
    this.yaw += (p.yaw as number) * Math.PI * 2 * dt

    const cosY = Math.cos(this.yaw)
    const sinY = Math.sin(this.yaw)
    const cosT = Math.cos(tilt)
    const sinT = Math.sin(tilt)

    // Smooth each cell toward its history value.
    for (let r = 0; r < rows; r++) {
      const hv = this.history[r]
      const vv = this.values[r]
      for (let c = 0; c < cols; c++) {
        const target = clamp(hv[c] * amplitude, 0, 1.4)
        vv[c] = follow(vv[c], target, target > vv[c] ? smoothing : decay, dt)
      }
    }

    const project = (x: number, y: number, z: number) => {
      // World: x across, y up, z into the screen. Camera sits at (0, camH, -1.6).
      const wx = x * cosY - z * sinY
      const wz = x * sinY + z * cosY
      const rx = wx
      const ry = y - camH
      const rz = wz + 1.6
      if (rz < 0.15) return null
      const ty = ry * cosT - rz * sinT
      const tz = ry * sinT + rz * cosT
      if (tz < 0.15) return null
      return {
        x: width / 2 + (rx * fov) / tz,
        y: height * 0.62 - (ty * fov) / tz,
        depth: tz,
      }
    }

    const style = p.style as string
    const halfW = 1.6

    ctx.lineCap = 'round'
    // Painter's algorithm: far rows first.
    for (let r = rows - 1; r >= 0; r--) {
      const z = (r / (rows - 1)) * depth
      const vv = this.values[r]
      const fade = 1 - r / rows
      const rowPts: Array<{ x: number; y: number; c: number; ok: boolean }> = []
      for (let c = 0; c < cols; c++) {
        const x = (c / (cols - 1)) * 2 * halfW - halfW
        const proj = project(x, vv[c] * 0.9, z)
        rowPts.push(
          proj
            ? { x: proj.x, y: proj.y, c, ok: proj.depth < depth + 4 }
            : { x: 0, y: 0, c, ok: false },
        )
      }

      if (style !== 'points') {
        ctx.strokeStyle = rgbaAt(colors, fade * 0.85, 0.25 + fade * 0.7)
        ctx.lineWidth = Math.max(0.6, 2.4 * fade)
        applyGlow(ctx, g.glow, 10)
        ctx.beginPath()
        let pen = false
        for (const pt of rowPts) {
          if (!pt.ok) {
            pen = false
            continue
          }
          if (!pen) {
            ctx.moveTo(pt.x, pt.y)
            pen = true
          } else ctx.lineTo(pt.x, pt.y)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      if (style === 'points') {
        for (const pt of rowPts) {
          if (!pt.ok) continue
          ctx.fillStyle = colorAt(colors, pt.c / cols)
          ctx.globalAlpha = 0.3 + fade * 0.7
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, 1 + 2.5 * vv[pt.c], 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
    }

    if (style === 'wire') {
      // Vertical threads connecting the nearest row through depth.
      const stride = Math.max(1, Math.floor(cols / 28))
      for (let c = 0; c < cols; c += stride) {
        ctx.strokeStyle = rgbaAt(colors, c / cols, 0.5)
        ctx.lineWidth = 1
        ctx.beginPath()
        let pen = false
        for (let r = 0; r < rows; r++) {
          const z = (r / (rows - 1)) * depth
          const x = (c / (cols - 1)) * 2 * halfW - halfW
          const proj = project(x, this.values[r][c] * 0.9, z)
          if (!proj) {
            pen = false
            continue
          }
          if (!pen) {
            ctx.moveTo(proj.x, proj.y)
            pen = true
          } else ctx.lineTo(proj.x, proj.y)
        }
        ctx.stroke()
      }
    }

    // Horizon glow line at the far edge of the field.
    const hy = project(0, 0, depth)
    if (hy) {
      ctx.strokeStyle = rgbaAt(colors, 0.6, 0.5)
      ctx.lineWidth = 1.5
      applyGlow(ctx, g.glow, 16)
      ctx.beginPath()
      ctx.moveTo(0, hy.y)
      ctx.lineTo(width, hy.y)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }

  unmount() {
    this.history = []
    this.values = []
    this.cols = 0
    this.rows = 0
  }
}
