import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { studio } from '../studio/controller'
import {
  resetEverything,
  resetViz,
  setAudio,
  setBackground,
  setGlobal,
  setVizParam,
  settingsStore,
} from '../studio/settings'
import { restoreState, snapshotState } from '../studio/presets'
import { useStore } from '../studio/store'
import { useMediaQuery } from '../lib/media'
import type { PushToast } from '../lib/toast'
import { activeColors, PALETTES } from '../viz/palette'
import { vizParams } from '../viz/registry'
import type { ParamDef } from '../viz/types'
import { ParamControl, Seg, Slider } from './controls'
import { ExportPanel } from './ExportPanel'

type Tab = 'appearance' | 'viz' | 'audio' | 'bg' | 'fx' | 'export'

const TABS: { id: Tab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'viz', label: 'Visualization' },
  { id: 'audio', label: 'Audio' },
  { id: 'bg', label: 'Background' },
  { id: 'fx', label: 'Effects' },
  { id: 'export', label: 'Export' },
]

export function RightSidebar({
  onToast,
  open,
  onCloseDrawer,
}: {
  onToast: PushToast
  open: boolean
  onCloseDrawer: () => void
}) {
  const [tab, setTab] = useState<Tab>('appearance')
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const hidden = !isDesktop && !open

  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    if (next < 0) return
    e.preventDefault()
    const t = TABS[next]
    setTab(t.id)
    tabRefs.current[t.id]?.focus()
  }

  return (
    <aside
      className={'sidebar right' + (open ? ' open' : '')}
      id="sidebar-right"
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      {!isDesktop && (
        <div className="drawer-head">
          <b>Settings</b>
          <button className="btn icon" aria-label="Close panel" onClick={onCloseDrawer} type="button">
            ✕
          </button>
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="settings-panel"
            className={'tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        className="panel"
        role="tabpanel"
        id="settings-panel"
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'appearance' && <AppearancePanel />}
        {tab === 'viz' && <VizParamsPanel onToast={onToast} />}
        {tab === 'audio' && <AudioPanel />}
        {tab === 'bg' && <BackgroundPanel />}
        {tab === 'fx' && <EffectsPanel onToast={onToast} />}
        {tab === 'export' && <ExportPanel onToast={onToast} />}
      </div>
    </aside>
  )
}

function AppearancePanel() {
  const { global } = useStore(settingsStore)
  const colors = activeColors(global.paletteId, global.customColors)

  return (
    <>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Palette
      </h2>
      <div className="swatch-grid">
        <button
          className={'swatch' + (global.paletteId === 'custom' ? ' active' : '')}
          onClick={() => setGlobal({ paletteId: 'custom' })}
          type="button"
          title="Custom"
          aria-label="Custom palette"
          aria-pressed={global.paletteId === 'custom'}
          style={{
            background: `linear-gradient(135deg, ${global.customColors.join(', ')})`,
          }}
        />
        {PALETTES.map((p) => (
          <button
            key={p.id}
            className={'swatch' + (global.paletteId === p.id ? ' active' : '')}
            onClick={() => setGlobal({ paletteId: p.id })}
            type="button"
            title={p.name}
            aria-label={`${p.name} palette`}
            aria-pressed={global.paletteId === p.id}
            style={{ background: `linear-gradient(135deg, ${p.colors.join(', ')})` }}
          />
        ))}
      </div>

      <h2 className="section-title">Custom stops</h2>
      <div className="color-row">
        <span className="field-label" id="stop-low">
          Low
        </span>
        <input
          type="color"
          aria-labelledby="stop-low"
          value={global.customColors[0] ?? '#00f5d4'}
          onChange={(e) => {
            const next = [...global.customColors]
            next[0] = e.target.value
            setGlobal({ customColors: next, paletteId: 'custom' })
          }}
        />
        <span className="field-label" id="stop-mid">
          Mid
        </span>
        <input
          type="color"
          aria-labelledby="stop-mid"
          value={global.customColors[1] ?? '#9b5de5'}
          onChange={(e) => {
            const next = [...global.customColors]
            next[1] = e.target.value
            setGlobal({ customColors: next, paletteId: 'custom' })
          }}
        />
        <span className="field-label" id="stop-high">
          High
        </span>
        <input
          type="color"
          aria-labelledby="stop-high"
          value={global.customColors[2] ?? '#f15bb5'}
          onChange={(e) => {
            const next = [...global.customColors]
            next[2] = e.target.value
            setGlobal({ customColors: next, paletteId: 'custom' })
          }}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <Slider
          label="Gradient angle"
          value={global.gradientAngle}
          min={0}
          max={360}
          step={1}
          unit="°"
          onChange={(v) => setGlobal({ gradientAngle: v })}
        />
      </div>

      <div
        className="gradient-preview"
        aria-hidden="true"
        style={{ background: `linear-gradient(${global.gradientAngle}deg, ${colors.join(', ')})` }}
      />

      <Slider
        label="Master opacity"
        value={global.opacity}
        min={0.1}
        max={1}
        step={0.01}
        onChange={(v) => setGlobal({ opacity: v })}
      />
    </>
  )
}

function VizParamsPanel({ onToast }: { onToast: PushToast }) {
  const { vizId } = useStore(studio.store)
  const settings = useStore(settingsStore)
  const defs = useMemo(() => vizParams(vizId), [vizId])

  const groups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, ParamDef[]>()
    for (const d of defs) {
      if (!map.has(d.group)) {
        map.set(d.group, [])
        order.push(d.group)
      }
      map.get(d.group)!.push(d)
    }
    return order.map((g) => ({ group: g, defs: map.get(g)! }))
  }, [defs])

  const values = settings.viz[vizId] ?? {}

  return (
    <>
      <button
        className="btn small"
        type="button"
        style={{ marginBottom: 6 }}
        onClick={() => {
          const snap = snapshotState()
          resetViz(vizId, defs)
          onToast('Visualization reset', false, {
            label: 'Undo',
            onClick: () => restoreState(snap),
          })
        }}
      >
        Reset this visualization
      </button>
      {groups.map(({ group, defs: gd }) => (
        <div key={group}>
          <h3 className="section-title">{group}</h3>
          {gd.map((d) => (
            <ParamControl
              key={d.key}
              def={d}
              value={values[d.key] ?? d.default}
              onChange={(v) => setVizParam(vizId, d.key, v)}
            />
          ))}
        </div>
      ))}
    </>
  )
}

function AudioPanel() {
  const { audio } = useStore(settingsStore)
  return (
    <>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Analysis
      </h2>
      <Slider label="Sensitivity" value={audio.sensitivity} min={0.2} max={3} step={0.05} onChange={(v) => setAudio({ sensitivity: v })} />
      <Slider label="Smoothing" value={audio.smoothing} min={0} max={0.95} step={0.01} onChange={(v) => setAudio({ smoothing: v })} />
      <Slider label="Decay" value={audio.decay} min={0.02} max={1} step={0.01} onChange={(v) => setAudio({ decay: v })} />
      <h2 className="section-title">Band response</h2>
      <Slider label="Bass" value={audio.bassResponse} min={0} max={2} step={0.05} onChange={(v) => setAudio({ bassResponse: v })} />
      <Slider label="Mid" value={audio.midResponse} min={0} max={2} step={0.05} onChange={(v) => setAudio({ midResponse: v })} />
      <Slider label="Treble" value={audio.trebleResponse} min={0} max={2} step={0.05} onChange={(v) => setAudio({ trebleResponse: v })} />
      <Slider label="Beat" value={audio.beatResponse} min={0} max={2} step={0.05} onChange={(v) => setAudio({ beatResponse: v })} />
      <Slider
        label="Spectrum blend"
        value={audio.spectrumBlend}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => setAudio({ spectrumBlend: v })}
      />
      <p className="hint">
        Band values are smoothed with independent attack/decay so visuals read
        as motion, not raw FFT jitter.
      </p>
    </>
  )
}

function BackgroundPanel() {
  const { global } = useStore(settingsStore)
  const bg = global.background
  return (
    <>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Mode
      </h2>
      <Seg
        value={bg.mode}
        onChange={(v) => setBackground({ mode: v })}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'transparent', label: 'Transparent' },
        ]}
      />
      {bg.mode !== 'transparent' && (
        <>
          <div className="color-row" style={{ marginTop: 13 }}>
            <span className="field-label" id="bg-from">
              {bg.mode === 'gradient' ? 'From' : 'Color'}
            </span>
            <input
              type="color"
              aria-labelledby="bg-from"
              value={bg.color1}
              onChange={(e) => setBackground({ color1: e.target.value })}
            />
            {bg.mode === 'gradient' && (
              <>
                <span className="field-label" id="bg-to">
                  To
                </span>
                <input
                  type="color"
                  aria-labelledby="bg-to"
                  value={bg.color2}
                  onChange={(e) => setBackground({ color2: e.target.value })}
                />
              </>
            )}
          </div>
          {bg.mode === 'gradient' && (
            <div style={{ marginTop: 8 }}>
              <Slider label="Angle" value={bg.angle} min={0} max={360} step={1} unit="°" onChange={(v) => setBackground({ angle: v })} />
            </div>
          )}
          <div
            className="gradient-preview"
            aria-hidden="true"
            style={{
              background:
                bg.mode === 'gradient'
                  ? `linear-gradient(${bg.angle}deg, ${bg.color1}, ${bg.color2})`
                  : bg.color1,
            }}
          />
        </>
      )}
      <p className="hint">
        Transparent mode is used by the PNG-sequence export for compositing
        over other footage.
      </p>
    </>
  )
}

function EffectsPanel({ onToast }: { onToast: PushToast }) {
  const { global } = useStore(settingsStore)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const t = window.setTimeout(() => setConfirming(false), 3000)
    return () => window.clearTimeout(t)
  }, [confirming])

  const resetAll = () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    const snap = snapshotState()
    resetEverything()
    onToast('All settings reset', false, {
      label: 'Undo',
      onClick: () => {
        restoreState(snap)
        onToast('Settings restored')
      },
    })
  }

  return (
    <>
      <Slider label="Glow" value={global.glow} min={0} max={1} step={0.01} onChange={(v) => setGlobal({ glow: v })} />
      <Slider label="Bloom" value={global.bloom} min={0} max={1} step={0.01} onChange={(v) => setGlobal({ bloom: v })} />
      <Slider
        label="Trails"
        value={global.trails}
        min={0}
        max={0.95}
        step={0.01}
        onChange={(v) => setGlobal({ trails: v })}
      />
      <Slider label="Vignette" value={global.vignette} min={0} max={1} step={0.01} onChange={(v) => setGlobal({ vignette: v })} />
      <Slider label="Film grain" value={global.grain} min={0} max={0.5} step={0.01} onChange={(v) => setGlobal({ grain: v })} />
      <p className="hint">Effects are applied by the compositor after the engine draws.</p>
      <button
        className="btn small danger"
        style={{ width: '100%', marginTop: 6 }}
        type="button"
        aria-live="polite"
        onClick={resetAll}
      >
        {confirming ? 'Click again to confirm' : 'Reset all settings'}
      </button>
    </>
  )
}
