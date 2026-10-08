import { useState } from 'react'
import { goPreset, goViz } from '../router'
import { copyShareLink } from '../studio/share'
import { studio } from '../studio/controller'
import {
  allPresets,
  BUILTIN_PRESETS,
  deletePreset,
  duplicatePreset,
  exportPreset,
  importPreset,
  presetsStore,
  renamePreset,
  resetActivePreset,
  restorePreset,
  restoreState,
  saveAsPreset,
  snapshotState,
  updatePreset,
} from '../studio/presets'
import { settingsStore } from '../studio/settings'
import { useStore } from '../studio/store'
import { downloadBlob } from '../export/exporter'
import { useMediaQuery } from '../lib/media'
import type { PushToast } from '../lib/toast'
import { VIZ_ENGINES } from '../viz/registry'
import { activeColors } from '../viz/palette'

export function LeftSidebar({
  onToast,
  open,
  onCloseDrawer,
}: {
  onToast: PushToast
  open: boolean
  onCloseDrawer: () => void
}) {
  const { vizId } = useStore(studio.store)
  const { list, activeId, dirty } = useStore(presetsStore)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const hidden = !isDesktop && !open

  const confirmSave = () => {
    const n = name.trim()
    if (!n) return
    saveAsPreset(n)
    setSaving(false)
    setName('')
    onToast(`Saved preset “${n}”`)
  }

  const confirmRename = (id: string) => {
    const n = renameValue.trim()
    if (n) renamePreset(id, n)
    setRenaming(null)
  }

  const doExport = (id: string) => {
    try {
      const json = exportPreset(id)
      const preset = allPresets().find((p) => p.id === id)
      const safe = (preset?.name ?? 'preset').replace(/[^\w-]+/g, '_').toLowerCase()
      downloadBlob(new Blob([json], { type: 'application/json' }), `pulse_${safe}.json`)
      onToast('Preset exported as JSON')
    } catch (e) {
      onToast(String(e), true)
    }
  }

  const doImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const preset = importPreset(await f.text())
        onToast(`Imported “${preset.name}”`)
      } catch {
        onToast('Invalid preset file', true)
      }
    }
    input.click()
  }

  const deleteActive = () => {
    const target = list.find((p) => p.id === activeId)
    if (!target || target.builtin) return
    const snap = snapshotState()
    const index = deletePreset(target.id)
    if (index === null) return
    onToast('Preset deleted', false, {
      label: 'Undo',
      onClick: () => {
        restorePreset(target, index)
        restoreState(snap)
        onToast(`Restored “${target.name}”`)
      },
    })
  }

  const resetSettings = () => {
    const snap = snapshotState()
    resetActivePreset()
    onToast('Settings reset', false, {
      label: 'Undo',
      onClick: () => {
        restoreState(snap)
        onToast('Settings restored')
      },
    })
  }

  const share = () => {
    void copyShareLink().then((ok) =>
      ok ? onToast('Share link copied to clipboard') : onToast('Could not copy the link', true),
    )
  }

  return (
    <aside
      className={'sidebar' + (open ? ' open' : '')}
      id="sidebar-left"
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      {!isDesktop && (
        <div className="drawer-head">
          <b>Modes &amp; presets</b>
          <button className="btn icon" aria-label="Close panel" onClick={onCloseDrawer} type="button">
            ✕
          </button>
        </div>
      )}
      <div className="sidebar-scroll">
        <h2 className="section-title">Visualizations</h2>
        <div className="viz-list" role="group" aria-label="Visualization modes">
          {VIZ_ENGINES.map((v) => (
            <button
              key={v.id}
              className={'viz-card' + (v.id === vizId ? ' active' : '')}
              aria-pressed={v.id === vizId}
              onClick={() => {
                goViz(v.id)
                onCloseDrawer()
              }}
              type="button"
            >
              <b>{v.name}</b>
              <span>{v.description}</span>
            </button>
          ))}
        </div>

        <h2 className="section-title">
          Presets{' '}
          {dirty && activeId && <span className="preset-dirty">· edited</span>}
        </h2>

        <div className="viz-list" style={{ gap: 3 }} role="group" aria-label="Presets">
          {list.map((p) => (
            <div key={p.id}>
              {renaming === p.id ? (
                <div className="preset-row active">
                  <input
                    className="text-input"
                    autoFocus
                    aria-label="Preset name"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename(p.id)
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => confirmRename(p.id)}
                  />
                </div>
              ) : (
                <div
                  className={'preset-row' + (activeId === p.id ? ' active' : '')}
                  onClick={() => {
                    goPreset(p.id)
                    onCloseDrawer()
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={activeId === p.id}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      goPreset(p.id)
                      onCloseDrawer()
                    }
                  }}
                  title={p.builtin ? 'Built-in preset' : p.name}
                >
                  <span className={'preset-dot' + (p.builtin ? '' : ' user')} />
                  <span className="preset-name">{p.name}</span>
                  {!p.builtin && (
                    <span style={{ display: 'flex', gap: 2 }}>
                      <button
                        className="btn ghost icon small"
                        title="Update with current settings"
                        aria-label={`Update preset ${p.name} with current settings`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToast(updatePreset(p.id) ? `Updated “${p.name}”` : 'Nothing to update')
                        }}
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="btn ghost icon small"
                        title="Rename"
                        aria-label={`Rename preset ${p.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenaming(p.id)
                          setRenameValue(p.name)
                        }}
                        type="button"
                      >
                        ✎
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {saving ? (
          <div className="preset-actions">
            <input
              className="text-input"
              autoFocus
              placeholder="Preset name…"
              aria-label="New preset name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmSave()
                if (e.key === 'Escape') setSaving(false)
              }}
            />
            <button className="btn primary small" onClick={confirmSave} type="button">
              Save
            </button>
            <button className="btn small" onClick={() => setSaving(false)} type="button">
              Cancel
            </button>
          </div>
        ) : (
          <div className="preset-actions">
            <button className="btn small" onClick={() => setSaving(true)} type="button">
              + Save as
            </button>
            <button
              className="btn small"
              onClick={() => {
                if (!activeId) return onToast('Select a preset first', true)
                const copy = duplicatePreset(activeId)
                if (copy) onToast(`Duplicated “${copy.name}”`)
              }}
              type="button"
              disabled={!activeId}
            >
              Duplicate
            </button>
            <button
              className="btn small danger"
              onClick={deleteActive}
              type="button"
              disabled={!activeId || list.find((p) => p.id === activeId)?.builtin}
            >
              Delete
            </button>
            <button
              className="btn small"
              onClick={() => doExport(activeId ?? list[0].id)}
              type="button"
              disabled={!list.length}
            >
              Export
            </button>
            <button className="btn small" onClick={doImport} type="button">
              Import
            </button>
            <button className="btn small" onClick={share} type="button">
              Share
            </button>
            <button className="btn small" onClick={resetSettings} type="button">
              Reset
            </button>
          </div>
        )}

        <h2 className="section-title">Palette</h2>
        <PaletteGrid />
        <p className="hint">
          Built-in presets: {BUILTIN_PRESETS.length}. Presets are plain JSON —
          export and share them freely.
        </p>
      </div>
    </aside>
  )
}

function PaletteGrid() {
  const { global } = useStore(settingsStore)
  const colors = activeColors(global.paletteId, global.customColors)
  return (
    <div
      className="gradient-preview"
      aria-hidden="true"
      style={{
        background: `linear-gradient(${global.gradientAngle}deg, ${colors.join(', ')})`,
      }}
    />
  )
}
