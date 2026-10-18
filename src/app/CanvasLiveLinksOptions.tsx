import { type LinkOptions } from './liveViewLinks'
import './live-links-options.css'

export default function CanvasLiveLinksOptions({
  value,
  onChange,
  localStorageAvailable = true,
}: {
  value: LinkOptions
  onChange: (next: LinkOptions) => void
  localStorageAvailable?: boolean
}) {
  function toggle(key: keyof LinkOptions, checked: boolean) {
    onChange({ ...value, [key]: checked })
  }
  return (
    <section
      className="canvas-live-links-options"
      aria-labelledby="canvas-live-links-title"
    >
      <h2 id="canvas-live-links-title">Canvas Live Links</h2>
      <fieldset className="option-card">
        <legend className="option-title">Link behavior</legend>
        <p className="option-description">
          Keep a copied view or reopen the latest view. Canvas files stay live
          in your local library.
        </p>
        <label>
          <input
            type="checkbox"
            checked={value.exactEnabled}
            onChange={(event) => toggle('exactEnabled', event.target.checked)}
          />
          <span>Copy exact view links</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.latestEnabled}
            onChange={(event) => toggle('latestEnabled', event.target.checked)}
          />
          <span>Copy latest view links</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.resumeLatest}
            onChange={(event) => toggle('resumeLatest', event.target.checked)}
          />
          <span>Resume latest workspace on startup</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.rememberCamera}
            onChange={(event) => toggle('rememberCamera', event.target.checked)}
          />
          <span>Remember camera positions</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.rememberPanels}
            onChange={(event) => toggle('rememberPanels', event.target.checked)}
          />
          <span>Remember panel layout</span>
        </label>
        {!localStorageAvailable && (
          <p className="live-links-storage-note" role="status">
            These options apply to this session. Browser settings could not be
            saved.
          </p>
        )}
      </fieldset>
    </section>
  )
}
