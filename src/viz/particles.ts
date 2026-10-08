import { activeColors, colorAt } from './palette'
import type { Frame, ParamDef, VisualizationEngine } from './types'
import { seededRandom } from './compositor'
import { clamp, follow } from './util'

const PARAMS: ParamDef[] = [
  { key: 'count', label: 'Particle count', type: 'number', min: 50, max: 5000, step: 50, default: 900, group: 'Particles' },
  { key: 'size', label: 'Size', type: 'number', min: 0.5, max: 8, step: 0.5, default: 1.8, unit: 'px', group: 'Particles' },
  { key: 'speed', label: 'Speed', type: 'number', min: 0.1, max: 3, step: 0.05, default: 1, group: 'Motion' },
  { key: 'attraction', label: 'Attraction', type: 'number', min: -1, max: 1, step: 0.05, default: 0.3, group: 'Motion' },
  { key: 'swirl', label: 'Swirl', type: 'number', min: -2, max: 2, step: 0.05, default: 0.7, group: 'Motion' },
  { key: 'gravity', label: 'Gravity', type: 'number', min: -1, max: 1, step: 0.05, default: 0, group: 'Motion' },
  { key: 'bassKick', label: 'Bass push', type: 'number', min: 0, max: 2, step: 0.05, default: 1, group: 'Audio' },
  { key: 'trebleScatter', label: 'Treble scatter', type: 'number', min: 0, max: 2, step: 0.05, default: 1, group: 'Audio' },
  { key: 'energy', label: 'Energy scale', type: 'number', min: 0.2, max: 3, step: 0.05, default: 1.2, group: 'Audio' },
  { key: 'trails', label: 'Trails', type: 'number', min: 0, max: 1, step: 0.01, default: 0.55, group: 'Rendering' },
  { key: 'colorBy', label: 'Color by', type: 'select', options: [
    { value: 'index', label: 'Index' },
    { value: 'speed', label: 'Speed' },
    { value: 'radius', label: 'Radius' },
  ], default: 'index', group: 'Rendering' },
]

const BUCKETS = 24

export class ParticlesEngine implements VisualizationEngine {
  readonly id = 'particles'
  readonly name = 'Particles'
  readonly description = 'A reactive swarm — bass pushes, treble scatters.'
  readonly params = PARAMS

  private ctx!: CanvasRenderingContext2D
  private count = 0
  private px = new Float32Array(0)
  private py = new Float32Array(0)
  private vx = new Float32Array(0)
  private vy = new Float32Array(0)
  private ct = new Float32Array(0)
  private width = 1
  private height = 1
  private amp = 0

  mount(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')
    this.ctx = ctx
    this.count = 0
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width
    this.height = height
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private spawn(i: number, rand: () => number) {
    const angle = rand() * Math.PI * 2
    const radius = Math.sqrt(rand()) * Math.min(this.width, this.height) * 0.48
    this.px[i] = this.width / 2 + Math.cos(angle) * radius
    this.py[i] = this.height / 2 + Math.sin(angle) * radius
    this.vx[i] = (rand() - 0.5) * 40
    this.vy[i] = (rand() - 0.5) * 40
    this.ct[i] = i / Math.max(1, this.count)
  }

  private ensure(count: number) {
    if (count === this.count) return
    const oldPx = this.px
    const oldPy = this.py
    const oldVx = this.vx
    const oldVy = this.vy
    const oldCt = this.ct
    const n = count
    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.ct = new Float32Array(n)
    const copy = Math.min(oldPx.length, n)
    this.px.set(oldPx.subarray(0, copy))
    this.py.set(oldPy.subarray(0, copy))
    this.vx.set(oldVx.subarray(0, copy))
    this.vy.set(oldVy.subarray(0, copy))
    this.ct.set(oldCt.subarray(0, copy))
    this.count = n
    const rand = seededRandom(999 + n)
    for (let i = copy; i < n; i++) this.spawn(i, rand)
  }

  render(frame: Frame) {
    const { ctx, width, height } = this
    const p = frame.params
    const g = frame.global
    const a = frame.analysis
    const colors = activeColors(g.paletteId, g.customColors)
    const dt = clamp(frame.dt, 0.001, 0.05)

    this.ensure(Math.round(p.count as number))

    const energy = follow(this.amp, a.amplitude, 0.3, dt)
    this.amp = energy
    const bass = a.bands.bass
    const treble = a.bands.treble
    const cx = width / 2
    const cy = height / 2
    const speed = p.speed as number
    const attraction = p.attraction as number
    const swirl = p.swirl as number
    const gravity = p.gravity as number
    const bassPush = (p.bassKick as number) * (bass * 0.75 + a.beat * 0.6)
    const scatter = (p.trebleScatter as number) * treble
    const maxDim = Math.max(width, height)
    const rand = seededRandom(frame.frameIndex * 2654435761)

    // Downward pull when gravity is non-zero; attraction/swirl dominate.
    const gy = gravity * 120

    for (let i = 0; i < this.count; i++) {
      let x = this.px[i]
      let y = this.py[i]
      let dx = cx - x
      let dy = cy - y
      const d = Math.max(24, Math.hypot(dx, dy))
      dx /= d
      dy /= d

      let ax = dx * attraction * (520 / d) * 60
      let ay = dy * attraction * (520 / d) * 60

      // Tangential swirl around the center.
      ax += -dy * swirl * 90
      ay += dx * swirl * 90

      // Bass blows particles outward from the center.
      const push = bassPush * (1 - Math.min(1, d / maxDim)) * 900
      ax -= dx * push
      ay -= dy * push

      ay += gy

      if (scatter > 0.01) {
        ax += (rand() - 0.5) * scatter * 2600
        ay += (rand() - 0.5) * scatter * 2600
      }

      let vx = this.vx[i] + ax * dt
      let vy = this.vy[i] + ay * dt

      // Damping keeps the swarm from exploding.
      const damp = Math.exp(-1.6 * dt)
      vx *= damp
      vy *= damp

      const vMax = 900 * speed
      const v = Math.hypot(vx, vy)
      if (v > vMax) {
        vx = (vx / v) * vMax
        vy = (vy / v) * vMax
      }

      x += vx * dt * speed
      y += vy * dt * speed

      const margin = 40
      if (x < -margin || x > width + margin || y < -margin || y > height + margin) {
        const r = seededRandom((frame.frameIndex * 40503 + i * 7919) >>> 0)
        this.spawn(i, r)
        continue
      }

      this.px[i] = x
      this.py[i] = y
      this.vx[i] = vx
      this.vy[i] = vy
    }

    const colorBy = p.colorBy as string
    const baseSize = (p.size as number) * (0.8 + energy * 0.9)
    const trailLen = (p.trails as number) * 0.12

    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'

    // Bucket particles by color so each frame needs only BUCKETS strokes.
    for (let b = 0; b < BUCKETS; b++) {
      const t = b / (BUCKETS - 1)
      const color = colorAt(colors, t)
      ctx.strokeStyle = color
      ctx.shadowColor = color
      if (g.glow > 0.02) {
        ctx.shadowBlur = g.glow * 12
      } else {
        ctx.shadowBlur = 0
      }
      ctx.lineWidth = baseSize

      ctx.beginPath()
      let any = false
      for (let i = b; i < this.count; i += BUCKETS) {
        const x = this.px[i]
        const y = this.py[i]
        if (colorBy === 'index') {
          const bucket = Math.min(BUCKETS - 1, Math.floor(this.ct[i] * BUCKETS))
          if (bucket !== b) continue
        } else if (colorBy === 'speed') {
          const s = Math.hypot(this.vx[i], this.vy[i]) / 500
          const bucket = Math.min(BUCKETS - 1, Math.floor(clamp(s, 0, 0.999) * BUCKETS))
          if (bucket !== b) continue
        } else {
          const d = Math.hypot(x - width / 2, y - height / 2) / (Math.max(width, height) * 0.5)
          const bucket = Math.min(BUCKETS - 1, Math.floor(clamp(d, 0, 0.999) * BUCKETS))
          if (bucket !== b) continue
        }
        any = true
        if (trailLen > 0.001) {
          ctx.moveTo(x, y)
          ctx.lineTo(x - this.vx[i] * trailLen, y - this.vy[i] * trailLen)
        } else {
          ctx.moveTo(x, y)
          ctx.lineTo(x + 0.1, y)
        }
      }
      if (any) ctx.stroke()
    }
    ctx.shadowBlur = 0
    ctx.globalCompositeOperation = 'source-over'
  }

  unmount() {
    this.px = new Float32Array(0)
    this.py = new Float32Array(0)
    this.vx = new Float32Array(0)
    this.vy = new Float32Array(0)
    this.ct = new Float32Array(0)
    this.count = 0
  }
}
