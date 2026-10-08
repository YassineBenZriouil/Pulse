import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { LeftSidebar } from './components/LeftSidebar'
import { RightSidebar } from './components/RightSidebar'
import { Timeline } from './components/Timeline'
import { TopBar } from './components/TopBar'
import { VizCanvas } from './components/VizCanvas'
import { NotFound } from './components/NotFound'
import { HelpModal, OnboardingModal } from './components/HelpModal'
import { toggleFullscreen } from './lib/dom'
import { useMediaQuery } from './lib/media'
import type { PushToast, ToastItem } from './lib/toast'
import {
  goHome,
  goViz,
  onRouteChange,
  parseRoute,
  replaceRoute,
  type Route,
} from './router'
import { allPresets, applyPreset } from './studio/presets'
import { applyShare, decodeShare } from './studio/share'
import { studio } from './studio/controller'
import { VIZ_ENGINES } from './viz/registry'

const ONBOARDED_KEY = 'pulse.onboarded.v1'
const DEFAULT_TITLE = 'Pulse — Real-Time Audio Visualizer & Video Export Studio'

function readOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true
  }
}

export default function App() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [route, setRoute] = useState<Route>(() => {
    const r = parseRoute()
    // Canonicalize a bare `/` so every history entry carries explicit state.
    if (r.path === '/' && !r.preset && !r.viz && !r.share) {
      replaceRoute({ viz: studio.store.get().vizId })
      return parseRoute()
    }
    return r
  })
  const notFound = route.path !== '/'
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [onboarding, setOnboarding] = useState(
    () => window.location.pathname === '/' && !readOnboarded(),
  )
  const nextId = useRef(1)
  const modalOpenRef = useRef(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    modalOpenRef.current = helpOpen || onboarding
  }, [helpOpen, onboarding])

  const pushToast = useCallback<PushToast>((msg, err, action) => {
    const id = nextId.current++
    setToasts((t) => [...t.slice(-3), { id, msg, err, action }])
    const ttl = action ? 8000 : err ? 5000 : 3200
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, ttl)
  }, [])

  /** Route side effects: title + applying share/preset/viz from the URL. */
  useEffect(() => {
    if (route.path !== '/') {
      document.title = 'Page not found — Pulse'
      return
    }
    document.title = DEFAULT_TITLE

    if (route.share) {
      const payload = decodeShare(route.share)
      if (payload) {
        applyShare(payload)
        return
      }
      pushToast('That shared link could not be read', true)
    }
    if (route.preset) {
      if (allPresets().some((p) => p.id === route.preset)) {
        applyPreset(route.preset)
        return
      }
      pushToast(`Preset “${route.preset}” does not exist`, true)
    }
    if (route.viz) {
      if (VIZ_ENGINES.some((v) => v.id === route.viz)) studio.setViz(route.viz)
      else pushToast(`Unknown visualization “${route.viz}”`, true)
    }
  }, [route, pushToast])

  useEffect(() => onRouteChange(setRoute), [])

  useEffect(() => {
    studio.onError = (msg) => pushToast(msg, true)
    return () => {
      studio.onError = null
    }
  }, [pushToast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (typing) return
      // Dialogs own their keyboard handling (Esc etc.) while open.
      if (modalOpenRef.current) return

      if (e.key === 'Escape') {
        setDrawer(null)
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(true)
        return
      }
      if (e.code === 'Space') {
        // A focused button already activates natively on Space.
        if (target?.tagName === 'BUTTON') return
        e.preventDefault()
        void studio.togglePlay()
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        studio.seek(studio.audio.currentTime + (e.key === 'ArrowRight' ? 5 : -5))
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
        return
      }
      if (e.key === 'm' || e.key === 'M') {
        const { volume } = studio.store.get()
        studio.setVolume(volume === 0 ? 1 : 0)
        return
      }
      if (e.key === '[' || e.key === ']') {
        const { vizId } = studio.store.get()
        const idx = VIZ_ENGINES.findIndex((v) => v.id === vizId)
        const dir = e.key === ']' ? 1 : -1
        goViz(VIZ_ENGINES[(idx + dir + VIZ_ENGINES.length) % VIZ_ENGINES.length].id)
        return
      }
      if (e.key >= '1' && e.key <= '7') {
        const v = VIZ_ENGINES[Number(e.key) - 1]
        if (v) goViz(v.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closeOnboarding = () => {
    setOnboarding(false)
    try {
      localStorage.setItem(ONBOARDED_KEY, '1')
    } catch {
      /* storage may be unavailable */
    }
  }

  const skipToStage = (e: ReactMouseEvent) => {
    e.preventDefault()
    document.getElementById('viz-stage')?.focus()
  }

  const goHomeFrom404 = () => {
    goHome(studio.store.get().vizId)
    setRoute(parseRoute())
  }

  const toggleDrawer = (side: 'left' | 'right') => {
    setDrawer((d) => (d === side ? null : side))
  }

  return (
    <div className="app">
      {!notFound && (
        <>
          <a className="skip-link" href="#viz-stage" onClick={skipToStage}>
            Skip to visualization
          </a>
          <h1 className="sr-only">Pulse — real-time audio visualization studio</h1>
          <TopBar drawer={drawer} onToggleDrawer={toggleDrawer} onHelp={() => setHelpOpen(true)} />
          <div className="app-body">
            <LeftSidebar
              onToast={pushToast}
              open={drawer === 'left'}
              onCloseDrawer={() => setDrawer(null)}
            />
            <VizCanvas />
            <RightSidebar
              onToast={pushToast}
              open={drawer === 'right'}
              onCloseDrawer={() => setDrawer(null)}
            />
          </div>
          {!isDesktop && drawer !== null && (
            <div className="drawer-backdrop" onClick={() => setDrawer(null)} aria-hidden="true" />
          )}
          <Timeline />
        </>
      )}

      {notFound && <NotFound onHome={goHomeFrom404} />}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={'toast' + (t.err ? ' error' : '')} role={t.err ? 'alert' : 'status'}>
            <span>{t.msg}</span>
            {t.action && (
              <button
                className="btn small"
                type="button"
                onClick={() => {
                  t.action?.onClick()
                  setToasts((x) => x.filter((y) => y.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {!notFound && onboarding && <OnboardingModal onClose={closeOnboarding} />}
    </div>
  )
}
