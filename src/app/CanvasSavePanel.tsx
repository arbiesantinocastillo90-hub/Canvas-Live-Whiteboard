import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  MAX_AUTOSAVE_INTERVAL_MS,
  MIN_AUTOSAVE_INTERVAL_MS,
} from './canvasLocalFiles'
import Icon from './Icon'
import './canvas-save-panel.css'

export type CanvasSaveSettings = { autoSave: boolean; intervalMs: number }
type Props = {
  anchor: RefObject<HTMLButtonElement | null>
  settings: CanvasSaveSettings
  destination: string
  hasCanvas: boolean
  saving: boolean
  canChooseLocation: boolean
  needsLocation: boolean
  needsPermission: boolean
  onChange: (settings: CanvasSaveSettings) => void
  onSave: () => void
  onChooseLocation: () => void
  onDownload: () => void
  onClose: () => void
}
export default function CanvasSavePanel({
  anchor,
  settings,
  destination,
  hasCanvas,
  saving,
  canChooseLocation,
  needsLocation,
  needsPermission,
  onChange,
  onSave,
  onChooseLocation,
  onDownload,
  onClose,
}: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const [intervalDraft, setIntervalDraft] = useState({
    basis: settings.intervalMs,
    text: String(settings.intervalMs / 1000),
  })
  const intervalText =
    intervalDraft.basis === settings.intervalMs
      ? intervalDraft.text
      : String(settings.intervalMs / 1000)
  useEffect(() => {
    panel.current
      ?.querySelector<HTMLButtonElement>('[aria-label="Close Save options"]')
      ?.focus()
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !anchor.current?.contains(event.target)
      )
        onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
      anchor.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape, true)
    }
  }, [anchor, onClose])
  const seconds = Number(intervalText)
  const valid =
    intervalText.trim() !== '' &&
    Number.isFinite(seconds) &&
    seconds * 1000 >= MIN_AUTOSAVE_INTERVAL_MS &&
    seconds * 1000 <= MAX_AUTOSAVE_INTERVAL_MS
  return (
    <div
      ref={panel}
      className="canvas-save-panel"
      role="dialog"
      aria-label="Save options"
    >
      <div className="canvas-save-panel-heading">
        <h2>Save options</h2>
        <button
          className="icon-button"
          aria-label="Close Save options"
          title="Close"
          onClick={() => {
            onClose()
            anchor.current?.focus()
          }}
        >
          <Icon name="close" />
        </button>
      </div>
      <p
        className="canvas-save-destination"
        aria-label="Save destination"
        title={destination}
      >
        {destination}
      </p>
      {needsLocation && (
        <p className="canvas-save-warning" role="status">
          The saved file was moved or deleted. Choose a new location; your edits
          remain open.
        </p>
      )}
      {needsPermission && !needsLocation && (
        <p className="canvas-save-warning" role="status">
          File access needs your approval. Use Save now to resume.
        </p>
      )}
      <label className="canvas-save-toggle">
        <input
          type="checkbox"
          checked={settings.autoSave}
          disabled={!hasCanvas}
          onChange={(event) =>
            onChange({ ...settings, autoSave: event.target.checked })
          }
        />
        <span>Autosave</span>
      </label>
      <label className="canvas-save-interval">
        <span>Interval (seconds)</span>
        <input
          type="number"
          inputMode="decimal"
          min={MIN_AUTOSAVE_INTERVAL_MS / 1000}
          max={MAX_AUTOSAVE_INTERVAL_MS / 1000}
          step="0.1"
          aria-label="Autosave interval in seconds"
          aria-invalid={!valid}
          disabled={!hasCanvas}
          value={intervalText}
          onChange={(event) => {
            const next = event.target.value
            setIntervalDraft({ basis: settings.intervalMs, text: next })
            const value = Number(next)
            if (
              next.trim() &&
              Number.isFinite(value) &&
              value * 1000 >= MIN_AUTOSAVE_INTERVAL_MS &&
              value * 1000 <= MAX_AUTOSAVE_INTERVAL_MS
            )
              onChange({ ...settings, intervalMs: Math.round(value * 1000) })
          }}
          onBlur={() => {
            if (!valid)
              setIntervalDraft({
                basis: settings.intervalMs,
                text: String(settings.intervalMs / 1000),
              })
          }}
        />
      </label>
      {!valid && (
        <p className="canvas-save-warning" role="alert">
          Enter an interval from 0.5 to 3600 seconds.
        </p>
      )}
      <div className="canvas-save-panel-actions">
        <button
          className="button primary"
          disabled={!hasCanvas || saving}
          onClick={onSave}
        >
          {saving ? 'Saving…' : 'Save now'}
        </button>
        <button
          className="button secondary"
          disabled={!hasCanvas || saving || !canChooseLocation}
          onClick={onChooseLocation}
        >
          Choose location
        </button>
        {!canChooseLocation && (
          <button
            className="button secondary"
            disabled={!hasCanvas}
            onClick={onDownload}
          >
            Download copy
          </button>
        )}
      </div>
    </div>
  )
}
