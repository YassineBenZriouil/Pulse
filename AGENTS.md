# AGENTS.md — Pulse

Pulse is a high-end audio visualization studio (upload audio or paste a YouTube URL → real-time FFT analysis → multiple swappable visualization engines → live preview + deterministic export).

The repo started empty; this file encodes decisions and constraints that are not recoverable from code.

## Stack (pinned)

- **Vite + React + TypeScript** SPA. No SSR/Next.js.
- Package manager: whatever lockfile exists at the time (`package-lock.json` → npm, `pnpm-lock.yaml` → pnpm). Never guess; check the repo first.
- After scaffolding, real commands live in `package.json` scripts (`dev`, `build`, `typecheck`, `lint`). Verify there before running anything.

## Architecture (non-negotiable pipeline)

```
AudioSource → AudioEngine → FFT/AudioAnalysis → VisualizationEngine → Renderer → Preview | Export
```

- **AudioSource is an interface.** Uploaded files implement it now. YouTube is *abstraction only* — define the interface + a stub that surfaces loading/thumbnail/metadata UI, and never scrape or hack around browser CORS/security to extract YouTube audio. A backend extractor may implement the same interface later; do not build that backend now.
- All sources must feed **one** analysis pipeline. Visualization engines must be source-agnostic — never branch on "is this YouTube or a file" inside a viz module.
- **One module per visualization**, all implementing the same analysis-input interface. Adding mode #8 must not require touching the core. Build order: foundation → **NCS Circle first** (flagship) → Spectrum Bars → Waveform → Radial Wave → Particles → Liquid → Grid → (open slot for custom/experimental).
- Do not build this as one giant component; the renderer, analysis, presets, and export are separate concerns.

## Hard invariants

- **Visualizations must be genuinely audio-driven.** No fake/looped/static animations standing in for analysis. Band energies (bass / low-mid / mid / mid-high / treble / amplitude / beat / BPM) come from real FFT data, smoothed with interpolation/decay — not raw jittering bins.
- **Export must be deterministic re-rendering**, not `captureStream()` screen recording: step the visualization through fixed timesteps per output frame at target resolution/FPS so exported frames match what the engine produces. Show progress; support MP4/WebM/PNG/sequence where codecs allow (WebCodecs API; fall back gracefully per browser).
- **React must not own the hot loop.** FFT results, band values, and frame state flow through refs/rAF — never React state per frame. React re-renders only for UI-level changes (selected mode, param edits, playback status).
- **Cleanup is mandatory**: `AudioContext.close()`, cancel animation loops, and dispose GPU/texture resources on unmount and on visualization/source switches. Long (hour-long) audio must not leak or degrade FPS.
- Canvas must handle high-DPI and responsive resize; target 60 FPS in preview.

## Presets

- Presets are **plain serializable JSON** (no functions, class instances, refs, or circular data) so export/import is a straight `JSON.stringify`. Include several polished defaults out of the box.
- Support save / duplicate / rename / delete / import / export / reset-one / reset-all. Param changes go through one settings store so reset and preset-swap are cheap.

## UI expectations

Dark creative-studio aesthetic (glass/translucent panels, subtle borders, micro-interactions) — not a generic dashboard. Layout: dominant central canvas, top bar (transport + timeline + viz selector + fullscreen), left sidebar (modes + presets), right sidebar (appearance / viz params / audio response / background / effects / export), bottom timeline. Every visual parameter in the spec (radius, bar count, smoothing, decay, sensitivity, band responses, glow/bloom, particles, camera, etc.) should be user-tunable and live in the preset schema.

## Routing (history-based, no react-router)

Implemented in `src/router.ts`. Scheme: `/?v=<vizId>` (viz), `/?p=<presetId>` (preset), `#s=<base64url settings>` (shared settings payload), legacy `#preset=<id>`; any other path renders the `NotFound` view (no full-page reload). Decisions:

- On load, a bare `/` is canonicalized via `replaceState` to `?v=<current>` so every history entry carries explicit state.
- `navigate()` coalesces pushes within 700ms (`lastNavAt`) so slider drags / viz flips don't spam history. `pushViz`/`pushPreset` go through it; `replaceRoute` never coalesces.
- Popstate → `onRouteChange` → `setRoute` in App; route side effects (title, apply share/preset/viz) run in an effect keyed on `route` — never call setState directly in that effect (oxlint `set-state-in-effect`).
- App derives `notFound = route.path !== '/'` — no separate state flag.
- Sharing (`src/studio/share.ts`): clean presets export as short `?p=<id>` links; dirty/unsaved settings export as `#s=<base64url>`. `copyShareLink` uses `navigator.clipboard` with `document.execCommand` fallback (`src/lib/dom.ts`).

## Error handling & onboarding

- `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) wraps the app in `main.tsx`; recovery screen + "Try again" (remounts children).
- `studio.onError` + `renderCrashes` in `controller.ts`: a viz render exception falls back to `ncs-circle` after toast; two crashes on the flagship → `detachCanvas()` + "Rendering paused". `renderCrashes` resets on successful attach.
- `HelpModal.tsx` exports both the `?` shortcut-help modal (focus trap, Esc closes, focus restored) and `OnboardingModal` (first-run, `localStorage` key `pulse.onboarded`).

## Accessibility & responsive (component + CSS contract)

- Skip link (`.skip-link`), sr-only `h1`, `:focus-visible` outline (accent-2), `prefers-reduced-motion` kills all animation/transition.
- Controls: sliders expose `aria-label` + `aria-valuetext`; `Toggle` is `<button role="switch">` (styled by `button.toggle` reset — do NOT reintroduce a div); Seg buttons `aria-pressed`; tabs use full `tablist`/`tab`/`tabpanel` roles with ArrowLeft/Right nav; canvas `role="img"` with live aria-label; toasts `role="status"` / `role="alert"` for errors; export progress `role="progressbar"` + sr-only phase.
- Drawers: sidebars are static flex panels ≥1024px (`useMediaQuery('(min-width: 1024px)')`); below that they become fixed off-canvas drawers (`.sidebar.open`, `transform: translateX`, z-60) with a backdrop (`.drawer-backdrop`, z-55), `inert` + `aria-hidden` when closed, `aria-controls` ids `sidebar-left`/`sidebar-right`. Toggles live in TopBar (`.drawer-toggle`, only `display:inline-flex` under 1024px). Drawers cover topbar/timeline (full height) by design.
- Other breakpoints in `index.css`: ≤767px topbar wraps, YT input flexes (`.yt-input` base width comes from CSS, not inline styles), volume slider hidden ≤479px, `pointer: coarse` bumps targets to 38–44px.
- Component classNames must all exist in `index.css` — verify with the class-coverage check (see Verification).

## Product UX conventions

- Toast contract (`src/lib/toast.ts`): `PushToast = (msg, err?, action?) => void`; action toasts 8s (Undo etc.), errors 5s, plain 3.2s; stack capped at 4.
- Destructive/non-trivial actions use Undo, not just confirm: preset delete and settings reset snapshot via `snapshotState()`/`restoreState()` (`presets.ts`) and toast an Undo action; "Reset all" requires a two-step confirm button (3s timeout).
- Keyboard shortcuts (App-level, skipped while focus is in inputs/buttons): Space play/pause, ←/→ seek, `?` help, F fullscreen, M mute, `[`/`]` cycle viz, 1–7 direct viz, Esc closes modals (capture listener stops propagation; guarded by `modalOpenRef`).
- `PushToast` is passed down as `onToast` into sidebars/ExportPanel — components never call `setToasts` directly.

## SEO & security (static-host ready)

- `index.html`: title/description/canonical (`https://pulse.example.com/` placeholder — swap on deploy), OG/Twitter tags pointing at `/og.png` (1200×630, rendered from `assets/og-cover.svg`; regenerate **via headless Chrome**, `qlmanage` renders SVGs wrongly). `public/robots.txt` + `public/sitemap.xml`.
- `public/_headers` (Netlify-style: nosniff, DENY framing, Referrer-Policy, Permissions-Policy, HSTS, full CSP — keep `img-src` open for `i.ytimg.com`, `connect-src` for `www.youtube.com`, no `worker-src blob:` needed) + `public/_redirects` (`/* /index.html 200`).
- `vite.config.ts` `SECURITY_HEADERS` applies the same headers to dev/preview servers — **no CSP in dev** (breaks HMR).

## Verification

- Before declaring done: `npm run typecheck && npm run lint && npm run build` (all must be clean; oxlint warnings count as failures here).
- Class-coverage: extract every `className` literal from `src/**/*.tsx` and diff against `.class` selectors in `src/index.css` — any missing class is a bug (it renders unstyled).
- No browser automation in this environment — final QA is the user's manual pass on `http://localhost:5174/`.
