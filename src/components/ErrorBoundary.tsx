import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defense: a render crash swaps in a recovery screen instead of
 * a white page. Class component required by the React error-boundary API.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[pulse] UI crashed', error, info)
  }

  render() {
    const err = this.state.error
    if (!err) return this.props.children
    return (
      <div className="app">
        <div className="notfound">
          <div>
            <p className="nf-code">:(</p>
            <h1>The studio hit an unexpected error</h1>
            <p className="hint">
              Pulse couldn't recover from this state. Your presets and settings
              are stored locally and are untouched.
            </p>
            <div className="nf-actions">
              <button className="btn primary" onClick={() => this.setState({ error: null })} type="button">
                Try again
              </button>
              <button className="btn" onClick={() => window.location.reload()} type="button">
                Reload studio
              </button>
            </div>
            <details className="nf-details">
              <summary>Technical details</summary>
              <pre>{err.stack ?? String(err)}</pre>
            </details>
          </div>
        </div>
      </div>
    )
  }
}
