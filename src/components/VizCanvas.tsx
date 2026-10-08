import { useEffect, useRef, useState } from 'react'
import { studio } from '../studio/controller'
import { useStore } from '../studio/store'
import { getViz } from '../viz/registry'

/**
 * The canvas element is keyed by viz id so switching engines swaps the
 * underlying canvas — a canvas can only ever hold one context type (2D vs
 * WebGL), so reusing it across engines is not possible.
 */
export function VizCanvas() {
  const { vizId, status } = useStore(studio.store)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) studio.attachCanvas(canvas)
    return () => studio.detachCanvas()
  }, [vizId])

  useEffect(() => {
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file && file.type.startsWith('audio/')) void studio.loadFile(file)
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragleave', onDragLeave)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragleave', onDragLeave)
    }
  }, [])

  const empty = status.state === 'empty'
  const loading = status.state === 'loading'
  const unavailable = status.state === 'unavailable'
  const error = status.state === 'error'

  return (
    <div
      className={'stage' + (dragging ? ' dragging' : '')}
      id="viz-stage"
      tabIndex={-1}
      role="region"
      aria-label="Visualization canvas"
    >
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
      <canvas
        key={vizId}
        ref={canvasRef}
        role="img"
        aria-label={`${getViz(vizId).name} — live audio-reactive visualization`}
      />
      {empty && (
        <div className="stage-overlay">
          <div className="drop-hint">
            <div className="ring" aria-hidden="true">
              ♪
            </div>
            <h2>Drop an audio file here</h2>
            <p>
              Pulse runs a live FFT analysis of your track and renders it
              through seven swappable visual engines — then exports
              frame-accurate video.
            </p>
            <div className="drop-actions">
              <button
                className="btn primary"
                onClick={() => fileRef.current?.click()}
                type="button"
              >
                Browse audio files
              </button>
              <span className="hint">
                MP3, WAV, FLAC, OGG or M4A — or paste a YouTube URL in the top bar.
              </span>
            </div>
          </div>
        </div>
      )}
      {loading && (
        <div className="stage-overlay" role="status">
          <div className="drop-hint">
            <div className="spinner" aria-hidden="true" />
            <p>{status.label}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="stage-overlay" role="alert">
          <div className="notice error">
            <b>Could not load audio</b>
            <p>{status.message}</p>
          </div>
        </div>
      )}
      {unavailable && <YouTubeNotice />}
    </div>
  )
}

function YouTubeNotice() {
  const { status } = useStore(studio.store)
  if (status.state !== 'unavailable') return null
  const info = status.info
  return (
    <div className="stage-overlay">
      <div className="youtube-card">
        {info.artworkUrl && (
          <img className="youtube-thumb" src={info.artworkUrl} alt={`${info.title} thumbnail`} />
        )}
        <div className="youtube-meta">
          <b>{info.title}</b>
          <p>{status.message}</p>
          <button
            className="btn small"
            style={{ marginTop: 10 }}
            onClick={() => studio.clearSource()}
            type="button"
          >
            Use an audio file instead
          </button>
        </div>
      </div>
    </div>
  )
}
