import { Modal } from './Modal'

const SHORTCUTS: [keys: string, desc: string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Seek 5 seconds'],
  ['1 – 7', 'Jump straight to a visualization'],
  ['[ / ]', 'Previous / next visualization'],
  ['F', 'Toggle fullscreen'],
  ['M', 'Mute / unmute'],
  ['?', 'Open keyboard shortcuts'],
  ['Esc', 'Close dialogs and drawers'],
]

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <p className="modal-lead">
        Pulse turns audio into motion: real FFT analysis drives seven swappable
        engines, and exports render frame-by-frame — never a screen recording.
      </p>
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, desc]) => (
          <div className="shortcut-row" key={keys}>
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{desc}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        Drag &amp; drop an audio file anywhere on the canvas. Every parameter
        lives in the right sidebar, and presets capture the whole look as JSON.
      </p>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose} type="button">
          Got it
        </button>
      </div>
    </Modal>
  )
}

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Welcome to Pulse" onClose={onClose}>
      <p className="modal-lead">
        Your audio visualization studio: load a track, watch live FFT analysis
        drive the visuals, then export deterministic video — right in the
        browser.
      </p>
      <ol className="steps">
        <li>
          <b>Load audio</b>
          <span>
            Drop a file on the canvas, hit “Audio file”, or paste a YouTube URL
            for artwork &amp; metadata.
          </span>
        </li>
        <li>
          <b>Pick a look</b>
          <span>
            Switch engines and presets on the left; tune palette, params, audio
            response and effects on the right.
          </span>
        </li>
        <li>
          <b>Export it</b>
          <span>
            MP4, WebM or a transparent PNG sequence — rendered at fixed
            timesteps so every frame matches the preview.
          </span>
        </li>
      </ol>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose} type="button">
          Start visualizing
        </button>
        <span className="hint">Press ? anytime for keyboard shortcuts.</span>
      </div>
    </Modal>
  )
}
