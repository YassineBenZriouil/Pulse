import { activeColors } from './palette'
import type { Frame, ParamDef, VisualizationEngine } from './types'

const PARAMS: ParamDef[] = [
  { key: 'scale', label: 'Scale', type: 'number', min: 0.3, max: 3, step: 0.05, default: 1.2, group: 'Fluid' },
  { key: 'flowSpeed', label: 'Flow speed', type: 'number', min: 0, max: 2, step: 0.05, default: 0.6, group: 'Fluid' },
  { key: 'warp', label: 'Domain warp', type: 'number', min: 0, max: 2, step: 0.05, default: 1, group: 'Fluid' },
  { key: 'detail', label: 'Treble detail', type: 'number', min: 0, max: 2, step: 0.05, default: 1, group: 'Fluid' },
  { key: 'contrast', label: 'Contrast', type: 'number', min: 0, max: 2, step: 0.05, default: 1, group: 'Fluid' },
  { key: 'bassScale', label: 'Bass warp', type: 'number', min: 0, max: 2, step: 0.05, default: 1, group: 'Audio' },
  { key: 'beatFlash', label: 'Beat flash', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Audio' },
  { key: 'rotation', label: 'Rotation', type: 'number', min: -1, max: 1, step: 0.05, default: 0.1, group: 'Motion' },
]

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_bass;
uniform float u_treble;
uniform float u_beat;
uniform float u_scale;
uniform float u_flow;
uniform float u_warp;
uniform float u_detail;
uniform float u_contrast;
uniform float u_bassScale;
uniform float u_flash;
uniform float u_rot;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_c4;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                   + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * snoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float cr = cos(u_rot * u_time * 0.12);
  float sr = sin(u_rot * u_time * 0.12);
  uv = mat2(cr, -sr, sr, cr) * uv;

  float t = u_time * (0.06 + u_flow * 0.22);
  float bass = u_bass * u_bassScale;
  float detail = 1.0 + u_treble * u_detail * 2.5;

  vec2 q = vec2(
    fbm(uv * u_scale + vec2(0.0, t)),
    fbm(uv * u_scale + vec2(5.2, 1.3) - t * 0.7)
  );
  vec2 warpIn = uv * u_scale * (1.0 + bass * 0.5) + q * (0.7 + u_warp * 1.3);
  vec2 r = vec2(
    fbm(warpIn + vec2(1.7, 9.2) + t * 1.3),
    fbm(warpIn + vec2(8.3, 2.8) - t * 1.1)
  );
  float n = fbm(uv * u_scale * detail + r * (1.2 + u_warp * 1.8) + u_beat * 0.3);
  float v = clamp(n * 0.5 + 0.5, 0.0, 1.0);
  float gamma = clamp(2.0 - u_contrast, 0.25, 2.5);
  v = pow(v, gamma);

  vec3 col = u_c0;
  col = mix(col, u_c1, smoothstep(0.0, 0.3, v));
  col = mix(col, u_c2, smoothstep(0.25, 0.55, v));
  col = mix(col, u_c3, smoothstep(0.5, 0.78, v));
  col = mix(col, u_c4, smoothstep(0.72, 1.0, v));

  float lum = 0.2 + 0.95 * v + u_bass * 0.3 + u_beat * u_flash * 0.45;
  float sparkle = u_treble * u_detail * 0.4 * smoothstep(0.65, 1.0, abs(n));
  gl_FragColor = vec4(col * lum + vec3(sparkle), 1.0);
}
`

function hexToVec3(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full =
    h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h.padEnd(6, '0').slice(0, 6)
  const n = parseInt(full, 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

export class LiquidEngine implements VisualizationEngine {
  readonly id = 'liquid'
  readonly name = 'Liquid'
  readonly description = 'GPU fluid field — bass warps, treble adds detail.'
  readonly params = PARAMS

  private canvas: HTMLCanvasElement | null = null
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private locs: Record<string, WebGLUniformLocation | null> = {}

  mount(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error('WebGL unavailable')
    this.canvas = canvas
    this.gl = gl

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)
      if (!sh) throw new Error('Shader allocation failed')
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh)
        gl.deleteShader(sh)
        throw new Error('Shader compile failed: ' + log)
      }
      return sh
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!prog) throw new Error('Program allocation failed')
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog))
    }
    this.program = prog
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )
    const pos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

    for (const name of [
      'u_res', 'u_time', 'u_bass', 'u_treble', 'u_beat', 'u_scale', 'u_flow',
      'u_warp', 'u_detail', 'u_contrast', 'u_bassScale', 'u_flash', 'u_rot',
      'u_c0', 'u_c1', 'u_c2', 'u_c3', 'u_c4',
    ]) {
      this.locs[name] = gl.getUniformLocation(prog, name)
    }
  }

  resize(width: number, height: number, dpr: number) {
    const canvas = this.canvas
    const gl = this.gl
    if (!canvas || !gl) return
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  render(frame: Frame) {
    const gl = this.gl
    if (!gl || !this.program) return
    const p = frame.params
    const a = frame.analysis
    const colors = activeColors(frame.global.paletteId, frame.global.customColors)

    gl.useProgram(this.program)
    gl.uniform2f(this.locs.u_res, this.canvas!.width, this.canvas!.height)
    gl.uniform1f(this.locs.u_time, frame.time)
    gl.uniform1f(this.locs.u_bass, a.bands.bass)
    gl.uniform1f(this.locs.u_treble, a.bands.treble)
    gl.uniform1f(this.locs.u_beat, a.beat)
    gl.uniform1f(this.locs.u_scale, p.scale as number)
    gl.uniform1f(this.locs.u_flow, p.flowSpeed as number)
    gl.uniform1f(this.locs.u_warp, p.warp as number)
    gl.uniform1f(this.locs.u_detail, p.detail as number)
    gl.uniform1f(this.locs.u_contrast, p.contrast as number)
    gl.uniform1f(this.locs.u_bassScale, p.bassScale as number)
    gl.uniform1f(this.locs.u_flash, p.beatFlash as number)
    gl.uniform1f(this.locs.u_rot, p.rotation as number)

    for (let i = 0; i < 5; i++) {
      const hex = colors[Math.min(colors.length - 1, Math.floor((i / 4) * (colors.length - 1)))]
      const [r, g, b] = hexToVec3(hex)
      gl.uniform3f(this.locs['u_c' + i]!, r, g, b)
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  unmount() {
    const gl = this.gl
    if (gl && this.program) {
      gl.deleteProgram(this.program)
    }
    this.program = null
    this.gl = null
    this.canvas = null
    this.locs = {}
  }
}
