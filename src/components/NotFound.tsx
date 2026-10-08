export function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="notfound">
      <div>
        <div className="brand nf-brand">
          <span className="brand-mark" />
          Pulse
        </div>
        <p className="nf-code">404</p>
        <h1>This page fell out of the setlist</h1>
        <p className="hint">
          Nothing lives at this address — but your studio, presets and settings
          are right where you left them.
        </p>
        <div className="nf-actions">
          <button className="btn primary" onClick={onHome} type="button">
            Back to the studio
          </button>
        </div>
      </div>
    </div>
  )
}
