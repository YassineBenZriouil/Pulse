import { useEffect, useState } from 'react'
import {
  cancelExport,
  downloadBlob,
  exportStore,
  probeCapabilities,
  runExport,
  type Capabilities,
  type ExportFormat,
} from '../export/exporter'
import { studio } from '../studio/controller'
import { settingsStore } from '../studio/settings'
import { useStore } from '../studio/store'
import type { PushToast } from '../lib/toast'
import { Slider, Toggle, Seg } from './controls'

type Res = '720p' | '1080p' | '1440p' | '4k' | 'custom'
type FpsChoice = '30' | '60' | 'custom'

const RESOLUTIONS: Record<Res, { w: number; h: number; label: string }> = {
  '720p': { w: 1280, h: 720, label: '720p' },
  '1080p': { w: 1920, h: 1080, label: '1080p' },
  '1440p': { w: 2560, h: 1440, label: '1440p' },
  '4k': { w: 3840, h: 2160, label: '4K' },
  custom: { w: 1920, h: 1080, label: 'Custom' },
}

export function ExportPanel({ onToast }: { onToast: PushToast }) {
  const { status, vizId } = useStore(studio.store)
  const progress = useStore(exportStore)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [res, setRes] = useState<Res>('1080p')
  const [customW, setCustomW] = useState(1920)
  const [customH, setCustomH] = useState(1080)
  const [fpsChoice, setFpsChoice] = useState<FpsChoice>('60')
  const [customFps, setCustomFps] = useState(48)
  const [bitrate, setBitrate] = useState(16)
  const [codec, setCodec] = useState<'h264' | 'vp9' | 'vp8'>('h264')
  const [includeAudio, setIncludeAudio] = useState(true)
  const [transparent, setTransparent] = useState(false)

  useEffect(() => {
    void probeCapabilities().then(setCaps)
  }, [])

  const busy =
    progress?.phase === 'rendering' || progress?.phase === 'finalizing'

  const size = res === 'custom' ? { w: customW, h: customH } : RESOLUTIONS[res]
  const fps = fpsChoice === 'custom' ? Math.max(1, Math.min(240, customFps)) : Number(fpsChoice)
  const playable = status.state === 'ready'

  const start = async () => {
    const pcm = await studio.getExportAudio()
    if (!pcm) {
      onToast('No decodable audio source for export', true)
      return
    }
    const opts = {
      format,
      width: Math.round(size.w),
      height: Math.round(size.h),
      fps,
      bitrate: Math.round(bitrate * 1_000_000),
      videoCodec: format === 'webm' ? codec : 'h264',
      includeAudio: format === 'mp4' || format === 'webm' ? includeAudio : false,
      transparent: format === 'png-sequence' ? transparent : false,
      time: studio.audio.currentTime,
    } as const
    void runExport(opts, pcm, settingsStore.get(), vizId, studio.currentArtwork).then(() => {
      const p = exportStore.get()
      if (p?.phase === 'done' && p.blob && p.filename) {
        downloadBlob(p.blob, p.filename)
        onToast(`Exported ${p.filename}`)
      } else if (p?.phase === 'error') {
        onToast(p.message ?? 'Export failed', true)
      }
    })
  }

  const pct = progress && progress.total > 0 ? (progress.frame / progress.total) * 100 : 0
  const phaseLabel =
    progress?.phase === 'done'
      ? 'Complete'
      : progress?.phase === 'error'
        ? 'Failed'
        : progress?.phase === 'cancelled'
          ? 'Cancelled'
          : progress?.phase === 'finalizing'
            ? 'Finalizing…'
            : progress
              ? 'Rendering frames'
              : ''

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Format
      </h2>
      <Seg<ExportFormat>
        value={format}
        onChange={(f) => {
          setFormat(f)
          if (f === 'webm') setCodec('vp9')
          if (f === 'mp4') setCodec('h264')
        }}
        options={[
          { value: 'mp4', label: 'MP4' },
          { value: 'webm', label: 'WebM' },
          { value: 'png-sequence', label: 'PNG seq' },
          { value: 'png', label: 'PNG' },
        ]}
      />

      {caps && (format === 'mp4' || format === 'webm') && (
        <p className="hint">
          {format === 'mp4' && !caps.mp4
            ? '⚠ H.264 encoding unavailable in this browser — try WebM or a Chromium-based browser.'
            : format === 'webm' && !caps.webm
              ? '⚠ WebM encoding unavailable in this browser.'
              : 'Rendered frame-by-frame from the analysis pipeline — not a screen recording.'}
        </p>
      )}

      {format !== 'png' && (
        <>
          <h2 className="section-title">Resolution</h2>
          <Seg<Res>
            value={res}
            onChange={setRes}
            options={[
              { value: '720p', label: '720p' },
              { value: '1080p', label: '1080p' },
              { value: '1440p', label: '1440p' },
              { value: '4k', label: '4K' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {res === 'custom' && (
            <div className="field-row" style={{ marginBottom: 13 }}>
              <input
                className="text-input"
                type="number"
                aria-label="Custom width in pixels"
                value={customW}
                onChange={(e) => setCustomW(Number(e.target.value))}
              />
              <span className="field-value" aria-hidden="true">
                ×
              </span>
              <input
                className="text-input"
                type="number"
                aria-label="Custom height in pixels"
                value={customH}
                onChange={(e) => setCustomH(Number(e.target.value))}
              />
            </div>
          )}
        </>
      )}

      {(format === 'mp4' || format === 'webm') && (
        <>
          <h2 className="section-title">Frame rate</h2>
          <Seg<FpsChoice>
            value={fpsChoice}
            onChange={setFpsChoice}
            options={[
              { value: '30', label: '30 FPS' },
              { value: '60', label: '60 FPS' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {fpsChoice === 'custom' && (
            <div className="field" style={{ marginTop: 8 }}>
              <input
                className="text-input"
                type="number"
                aria-label="Custom frames per second"
                value={customFps}
                onChange={(e) => setCustomFps(Number(e.target.value))}
              />
            </div>
          )}

          <h2 className="section-title">Codec</h2>
          <Seg<'h264' | 'vp9' | 'vp8'>
            value={codec}
            onChange={setCodec}
            options={[
              { value: 'h264', label: 'H.264' },
              { value: 'vp9', label: 'VP9' },
              { value: 'vp8', label: 'VP8' },
            ]}
          />

          <div style={{ marginTop: 14 }}>
            <Slider
              label="Bitrate"
              value={bitrate}
              min={2}
              max={60}
              step={1}
              unit="Mbps"
              onChange={setBitrate}
            />
          </div>

          <Toggle
            label="Include audio track"
            value={includeAudio}
            onChange={setIncludeAudio}
          />
        </>
      )}

      {format === 'png-sequence' && (
        <Toggle
          label="Transparent background"
          value={transparent}
          onChange={setTransparent}
        />
      )}

      <button
        className="btn primary"
        style={{ width: '100%', marginTop: 6 }}
        disabled={busy || !playable}
        onClick={() => void start()}
        type="button"
      >
        {busy ? 'Exporting…' : format === 'png' ? 'Capture frame' : 'Export video'}
      </button>
      {!playable && (
        <p className="hint" style={{ marginTop: 8 }}>
          Load an audio file to enable export.
        </p>
      )}

      {progress && (
        <div
          className="progress"
          role="progressbar"
          aria-label="Export progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.phase === 'done' ? 100 : pct)}
        >
          <span className="sr-only" role="status">
            {phaseLabel}
          </span>
          <div className="progress-head" aria-hidden="true">
            <span>{phaseLabel}</span>
            <span>
              {progress.frame}/{progress.total}
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${progress.phase === 'done' ? 100 : pct}%`,
                background:
                  progress.phase === 'error'
                    ? 'var(--danger)'
                    : undefined,
              }}
            />
          </div>
          {progress.message && (
            <div className={'progress-note' + (progress.phase === 'error' ? ' err' : '')}>
              {progress.message}
            </div>
          )}
          {busy && (
            <button
              className="btn small"
              style={{ marginTop: 10, width: '100%' }}
              onClick={cancelExport}
              type="button"
            >
              Cancel
            </button>
          )}
          {progress.phase === 'done' && progress.blob && progress.filename && (
            <button
              className="btn small"
              style={{ marginTop: 10, width: '100%' }}
              onClick={() => downloadBlob(progress.blob!, progress.filename!)}
              type="button"
            >
              ↓ Download again
            </button>
          )}
        </div>
      )}
    </div>
  )
}
