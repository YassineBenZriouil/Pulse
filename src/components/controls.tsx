import type { ParamDef, ParamValue } from '../viz/types'

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const display = format ? format(value) : trimNum(value) + (unit ? ' ' + unit : '')
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">{label}</span>
        <span className="field-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function trimNum(v: number) {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">{label}</span>
      </div>
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      className={'toggle' + (value ? ' on' : '')}
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <span className="field-label">{label}</span>
      <span className="toggle-track" />
    </button>
  )
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="color-row">
      <span className="field-label">{label}</span>
      <input
        type="color"
        aria-label={label}
        value={toHex(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function toHex(color: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const [r, g, b] = color.slice(1)
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#000000'
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? 'active' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Schema-driven control: renders the right editor for a ParamDef. */
export function ParamControl({
  def,
  value,
  onChange,
}: {
  def: ParamDef
  value: ParamValue
  onChange: (v: ParamValue) => void
}) {
  if (def.type === 'number') {
    return (
      <Slider
        label={def.label}
        value={Number(value)}
        min={def.min}
        max={def.max}
        step={def.step}
        unit={def.unit}
        onChange={(v) => onChange(v)}
      />
    )
  }
  if (def.type === 'select') {
    return (
      <Select
        label={def.label}
        value={String(value)}
        options={def.options}
        onChange={(v) => onChange(v)}
      />
    )
  }
  if (def.type === 'boolean') {
    return (
      <Toggle label={def.label} value={Boolean(value)} onChange={(v) => onChange(v)} />
    )
  }
  return (
    <ColorField label={def.label} value={String(value)} onChange={(v) => onChange(v)} />
  )
}
