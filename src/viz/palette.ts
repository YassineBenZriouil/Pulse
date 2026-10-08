export interface Palette {
  id: string
  name: string
  /** Gradient stops, low frequency → high frequency. */
  colors: string[]
}

export const PALETTES: Palette[] = [
  {
    id: 'neon',
    name: 'Neon Rush',
    colors: ['#00f5d4', '#00bbf9', '#9b5de5', '#f15bb5', '#fee440'],
  },
  {
    id: 'ember',
    name: 'Ember',
    colors: ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    colors: ['#0b1354', '#1c255c', '#3a0ca3', '#4361ee', '#4cc9f0', '#80ffdb'],
  },
  {
    id: 'candy',
    name: 'Candy Pop',
    colors: ['#ff99c8', '#fcf6bd', '#d0f4de', '#a9def9', '#e4c1f9'],
  },
  {
    id: 'mono',
    name: 'Monochrome',
    colors: ['#f8f9fa', '#ced4da', '#6c757d', '#343a40'],
  },
  {
    id: 'gold',
    name: 'Liquid Gold',
    colors: ['#fff3b0', '#ffd166', '#f4a259', '#bc6c25', '#6f1d1b'],
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    colors: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'],
  },
  {
    id: 'vapor',
    name: 'Vaporwave',
    colors: ['#2b1055', '#7597de', '#ff77ff', '#ff99cc', '#7df9ff'],
  },
  {
    id: 'toxic',
    name: 'Toxic',
    colors: ['#003b00', '#0a5c0a', '#39ff14', '#ccff00', '#f7ff00'],
  },
  {
    id: 'sunset',
    name: 'Sunset Drive',
    colors: ['#2d1b69', '#b5179e', '#f72585', '#ff8800', '#ffd60a'],
  },
]

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
      : h.padEnd(6, '0').slice(0, 6)
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const rgbCache = new Map<string, RGB>()
function toRgb(hex: string): RGB {
  let v = rgbCache.get(hex)
  if (!v) {
    v = hexToRgb(hex)
    rgbCache.set(hex, v)
  }
  return v
}

/** Resolve the active gradient stops from settings. */
export function activeColors(
  paletteId: string,
  customColors: string[],
): string[] {
  if (paletteId === 'custom' && customColors.length >= 2) return customColors
  return getPalette(paletteId).colors
}

const cssCache = new Map<string, string>()

/**
 * Color at t ∈ [0,1] across the stops, cached per 1/256 bucket so engines can
 * ask for a color per bar/point every frame without allocating.
 */
export function colorAt(colors: string[], t: number): string {
  const bucket = Math.max(0, Math.min(255, Math.round(t * 255)))
  const key = colors.join(',') + '|' + bucket
  const hit = cssCache.get(key)
  if (hit) return hit
  const u = bucket / 255
  const pos = u * (colors.length - 1)
  const i = Math.min(colors.length - 2, Math.floor(pos))
  const f = pos - i
  const a = toRgb(colors[i])
  const b = toRgb(colors[i + 1])
  const r = Math.round(a[0] + (b[0] - a[0]) * f)
  const g = Math.round(a[1] + (b[1] - a[1]) * f)
  const bl = Math.round(a[2] + (b[2] - a[2]) * f)
  const css = `rgb(${r},${g},${bl})`
  if (cssCache.size > 4096) cssCache.clear()
  cssCache.set(key, css)
  return css
}

export function rgbaAt(colors: string[], t: number, alpha: number): string {
  const bucket = Math.max(0, Math.min(255, Math.round(t * 255)))
  const key = 'a' + alpha.toFixed(2) + colors.join(',') + '|' + bucket
  const hit = cssCache.get(key)
  if (hit) return hit
  const u = bucket / 255
  const pos = u * (colors.length - 1)
  const i = Math.min(colors.length - 2, Math.floor(pos))
  const f = pos - i
  const a = toRgb(colors[i])
  const b = toRgb(colors[i + 1])
  const r = Math.round(a[0] + (b[0] - a[0]) * f)
  const g = Math.round(a[1] + (b[1] - a[1]) * f)
  const bl = Math.round(a[2] + (b[2] - a[2]) * f)
  const css = `rgba(${r},${g},${bl},${alpha.toFixed(3)})`
  if (cssCache.size > 4096) cssCache.clear()
  cssCache.set(key, css)
  return css
}

/** CSS linear-gradient string at `angle` degrees. */
export function gradientCss(colors: string[], angleDeg: number): string {
  return `linear-gradient(${angleDeg}deg, ${colors.join(', ')})`
}
