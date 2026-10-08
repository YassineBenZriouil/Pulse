export function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** Frame-rate independent coefficient: `c` is the per-60fps-frame factor. */
export function follow(current: number, target: number, c: number, dt: number) {
  const k = 1 - Math.pow(1 - clamp(c, 0, 1), dt * 60)
  return current + (target - current) * k
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

/** Quadratic midpoint smoothing through points — cheap liquid curves. */
export function strokeSmoothPath(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  closed: boolean,
) {
  const n = pts.length
  if (n < 2) return
  ctx.beginPath()
  if (n === 2) {
    ctx.moveTo(pts[0].x, pts[0].y)
    ctx.lineTo(pts[1].x, pts[1].y)
    return
  }
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  const start = closed ? mid(pts[n - 1], pts[0]) : pts[0]
  ctx.moveTo(start.x, start.y)
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    const m = mid(cur, next)
    ctx.quadraticCurveTo(cur.x, cur.y, m.x, m.y)
  }
  if (closed) ctx.closePath()
  else ctx.lineTo(pts[n - 1].x, pts[n - 1].y)
}

export function applyGlow(ctx: CanvasRenderingContext2D, glow: number, blur: number) {
  if (glow > 0.02) {
    ctx.shadowBlur = glow * blur
  } else {
    ctx.shadowBlur = 0
  }
}
