import { useState } from 'react'
import { goViz } from '../router'
import { studio } from '../studio/controller'
import { useStore } from '../studio/store'
import { VIZ_ENGINES } from '../viz/registry'

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function Timeline() {
  const { status, playing, vizId, volume } = useStore(studio.store)
  const time = useStore(studio.timeStore)
  const [scrub, setScrub] = useState<number | null>(null)

  const info =
    status.state === 'ready' || status.state === 'unavailable'
      ? status.info
      : null
  const duration = info?.kind === 'file' ? info.duration : 0
  const ready = status.state === 'ready'
  const position = scrub ?? time

  const commit = () => {
    if (scrub !== null) {
      studio.seek(scrub)
      setScrub(null)
    }
  }

  const cycleViz = (dir: 1 | -1) => {
    const idx = VIZ_ENGINES.findIndex((v) => v.id === vizId)
    const next = (idx + dir + VIZ_ENGINES.length) % VIZ_ENGINES.length
    goViz(VIZ_ENGINES[next].id)
  }

  return (
    <footer className="timeline">
      <div className="transport" role="group" aria-label="Transport controls">
        <button
          className="btn icon cycle-btn"
          title="Previous visualization ([)"
          aria-label="Previous visualization"
          onClick={() => cycleViz(-1)}
          type="button"
        >
          ◀◀
        </button>
        <button
          className="play-btn"
          disabled={!ready}
          onClick={() => void studio.togglePlay()}
          type="button"
          title="Space"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          className="btn icon cycle-btn"
          title="Next visualization (])"
          aria-label="Next visualization"
          onClick={() => cycleViz(1)}
          type="button"
        >
          ▶▶
        </button>
      </div>

      <div className="seek-wrap">
        <div className="seek-meta" aria-hidden="true">
          <span>{formatTime(position)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input
          className="seek-bar"
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={0.05}
          value={Math.min(position, duration || position)}
          disabled={!ready}
          aria-label="Seek position"
          aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
      </div>

      <div className="timeline-info">
        <div className="volume" role="group" aria-label="Volume">
          <button
            className="btn icon"
            title={volume === 0 ? 'Unmute (M)' : 'Mute (M)'}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            aria-pressed={volume === 0}
            onClick={() => studio.setVolume(volume === 0 ? 1 : 0)}
            type="button"
          >
            {volume === 0 ? '🔇' : '🔊'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume level"
            onChange={(e) => studio.setVolume(Number(e.target.value))}
          />
        </div>
      </div>
    </footer>
  )
}
