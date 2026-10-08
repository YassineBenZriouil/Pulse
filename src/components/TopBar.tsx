import { useEffect, useRef, useState } from 'react'
import { goViz } from '../router'
import { studio } from '../studio/controller'
import { useStore } from '../studio/store'
import { toggleFullscreen } from '../lib/dom'
import { VIZ_ENGINES } from '../viz/registry'

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function TopBar({
  drawer,
  onToggleDrawer,
  onHelp,
}: {
  drawer: 'left' | 'right' | null
  onToggleDrawer: (side: 'left' | 'right') => void
  onHelp: () => void
}) {
  const { status, vizId, playing } = useStore(studio.store)
  const time = useStore(studio.timeStore)
  const [ytUrl, setYtUrl] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [bpm, setBpm] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const info = status.state === 'ready' ? status.info : status.state === 'unavailable' ? status.info : null
  const duration = info?.kind === 'file' ? info.duration : 0

  useEffect(() => {
    const id = window.setInterval(() => setBpm(studio.currentBpm), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const hasSource = status.state === 'ready' || status.state === 'unavailable'

  return (
    <header className="topbar">
      <button
        className="btn icon drawer-toggle"
        aria-label="Open modes and presets"
        aria-expanded={drawer === 'left'}
        aria-controls="sidebar-left"
        onClick={() => onToggleDrawer('left')}
        type="button"
      >
        ☰
      </button>

      <div className="brand">
        <span className="brand-mark" />
        Pulse
      </div>

      <div className="topbar-group source-controls">
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void studio.loadFile(f)
            e.target.value = ''
          }}
        />
        <button className="btn primary" onClick={() => fileRef.current?.click()} type="button">
          ↥ Audio file
        </button>
        <form
          className="yt-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (ytUrl.trim()) void studio.loadYouTube(ytUrl.trim())
          }}
        >
          <input
            className="text-input yt-input"
            placeholder="YouTube URL…"
            aria-label="YouTube URL"
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
          />
          <button className="btn" type="submit" disabled={!ytUrl.trim()} aria-label="Load YouTube URL">
            Go
          </button>
        </form>
        {hasSource && (
          <button
            className="btn ghost"
            onClick={() => studio.clearSource()}
            type="button"
            title="Remove current source"
            aria-label="Remove current audio source"
          >
            ✕
          </button>
        )}
      </div>

      {info && (
        <div className="source-title">
          <b>{info.title}</b>
          <span>
            {info.artist ? info.artist + ' · ' : ''}
            {info.kind === 'file' ? formatTime(duration) : 'YouTube'}
          </span>
        </div>
      )}

      <div className="topbar-spacer" />

      <div className="topbar-group">
        <button
          className="play-btn"
          disabled={!hasSource}
          onClick={() => void studio.togglePlay()}
          type="button"
          title="Space"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="timecode">
          <b>{formatTime(time)}</b> / {formatTime(duration)}
        </span>
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-group">
        {bpm && bpm > 0 && <span className="badge">{Math.round(bpm)} BPM</span>}
        <select
          className="viz-select"
          value={vizId}
          onChange={(e) => goViz(e.target.value)}
          title="Visualization mode"
          aria-label="Visualization mode"
        >
          {VIZ_ENGINES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          className="btn icon"
          onClick={toggleFullscreen}
          type="button"
          title="Fullscreen (F)"
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-pressed={fullscreen}
        >
          {fullscreen ? '⤡' : '⤢'}
        </button>
        <button
          className="btn icon"
          onClick={onHelp}
          type="button"
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts and help"
        >
          ?
        </button>
        <button
          className="btn icon drawer-toggle"
          aria-label="Open settings"
          aria-expanded={drawer === 'right'}
          aria-controls="sidebar-right"
          onClick={() => onToggleDrawer('right')}
          type="button"
        >
          ⚙
        </button>
      </div>
    </header>
  )
}
