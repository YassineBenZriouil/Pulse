# Pulse

A high-end audio visualization studio in the browser: upload audio (or paste a YouTube URL for metadata-first preview), analyze it with real-time FFT, pick from seven swappable visualization engines, tweak every parameter, save presets, and export deterministic MP4/WebM/PNG-sequences.

**Stack:** Vite + React 19 + TypeScript 6 · oxlint · npm

## Commands

```sh
npm install
npm run dev        # → http://localhost:5174
npm run build      # tsc -b && vite build
npm run typecheck  # tsc -b (no emit)
npm run lint       # oxlint
npm run preview    # serve the production build
```

## Highlights

- **Real analysis, no fake loops** — band energies (bass → treble, amplitude, beat, BPM) come from smoothed FFT data and drive every engine.
- **Seven engines** — NCS Circle, Spectrum Bars, Waveform, Radial Wave, Particles, Liquid, Grid — one module each, swappable without touching the core (`src/viz/registry.ts`).
- **Deterministic export** — re-renders the visualization at fixed timesteps per output frame (WebCodecs), with progress UI; falls back gracefully per browser.
- **Presets** — plain serializable JSON; save / duplicate / rename / delete / import / export / reset, with Undo on destructive actions.
- **Share links** — `?p=<preset>` for clean presets, `#s=<base64url>` for unsaved settings.
- **Routing** — history-based (`?v=`, `?p=`, `#s=`), 404 view, no react-router.
- **Studio UI** — dark glass aesthetic, responsive sidebars (drawers under 1024px), keyboard shortcuts (`?` for help), onboarding, error boundary.

See `AGENTS.md` for architecture decisions, hard invariants, and verification steps.

## Deploying

Static site. `public/_headers` and `public/_redirects` target Netlify-style hosts; any static host works (SPA fallback to `index.html`). Replace the canonical/OG URL in `index.html` before shipping.
