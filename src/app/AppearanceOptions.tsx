import { DEFAULT_PREFERENCES, type Preferences } from './workspace'

const accents = [
  { name: 'Forest', color: '#297A5A' },
  { name: 'Ocean', color: '#4467D9' },
  { name: 'Violet', color: '#8156C8' },
  { name: 'Amber', color: '#B56A16' },
  { name: 'Rose', color: '#C35070' },
]

type AppearanceOptionsProps = {
  preferences: Preferences
  onChange: (preferences: Preferences) => void
}

export default function AppearanceOptions({
  preferences,
  onChange,
}: AppearanceOptionsProps) {
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    onChange({ ...preferences, [key]: value })
  }

  return (
    <section className="options-view" aria-labelledby="options-title">
      <div className="page-heading">
        <p className="eyebrow">Options</p>
        <h1 id="options-title">Make it feel like you.</h1>
        <p className="description">
          A few thoughtful adjustments for your space. Changes apply immediately
          and stay in this browser.
        </p>
      </div>

      <div className="options-grid">
        <fieldset className="option-card">
          <legend className="option-title">Appearance</legend>
          <p className="option-description">
            Follow your device or choose a look of your own.
          </p>
          <div className="radio-options">
            {(['system', 'light', 'dark'] as const).map((mode) => (
              <label className="radio-option" key={mode}>
                <input
                  type="radio"
                  name="appearance"
                  value={mode}
                  checked={preferences.mode === mode}
                  onChange={() => update('mode', mode)}
                />
                <span>
                  {mode === 'system'
                    ? 'Follow system'
                    : mode === 'light'
                      ? 'Light'
                      : 'Dark'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="option-card">
          <legend className="option-title">Accent color</legend>
          <p className="option-description">
            Add your color to buttons and selected items.
          </p>
          <div className="accent-swatches">
            {accents.map(({ name, color }) => (
              <button
                className="accent-swatch"
                type="button"
                key={name}
                aria-label={`${name} accent`}
                aria-pressed={
                  preferences.accent.toLowerCase() === color.toLowerCase()
                }
                onClick={() => update('accent', color)}
              >
                <span
                  className="swatch-dot"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="swatch-label">{name}</span>
              </button>
            ))}
          </div>
          <label className="custom-color-control" htmlFor="custom-accent">
            <span>Custom accent color</span>
            <input
              id="custom-accent"
              type="color"
              value={preferences.accent}
              onChange={(event) => update('accent', event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="option-card">
          <legend className="option-title">Workspace spacing</legend>
          <p className="option-description">
            Choose more breathing room or a closer arrangement.
          </p>
          <div className="radio-options">
            {(['comfortable', 'compact'] as const).map((density) => (
              <label className="radio-option" key={density}>
                <input
                  type="radio"
                  name="spacing"
                  value={density}
                  checked={preferences.density === density}
                  onChange={() => update('density', density)}
                />
                <span>
                  {density === 'comfortable' ? 'Comfortable' : 'Compact'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="option-card">
          <legend className="option-title">Canvas background</legend>
          <p className="option-description">
            Choose the backdrop for your canvas preview.
          </p>
          <div className="radio-options">
            {(['dots', 'lines', 'none'] as const).map((grid) => (
              <label className="radio-option" key={grid}>
                <input
                  type="radio"
                  name="canvas-background"
                  value={grid}
                  checked={preferences.grid === grid}
                  onChange={() => update('grid', grid)}
                />
                <span>
                  {grid === 'dots'
                    ? 'Dots'
                    : grid === 'lines'
                      ? 'Lines'
                      : 'Plain'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="option-card">
          <legend className="option-title">Motion</legend>
          <p className="option-description">
            Keep interface transitions gentle.
          </p>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={preferences.reduceMotion}
              onChange={(event) => update('reduceMotion', event.target.checked)}
            />
            <span>Reduce motion</span>
          </label>
          <p className="option-description">
            Your device’s reduced motion setting is also respected.
          </p>
        </fieldset>

        <div className="option-card reset-card">
          <h2 className="option-title">A fresh look</h2>
          <p className="option-description">
            Restore the default appearance. Your project names stay as they are.
          </p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => onChange({ ...DEFAULT_PREFERENCES })}
          >
            Reset appearance
          </button>
        </div>
      </div>
    </section>
  )
}
