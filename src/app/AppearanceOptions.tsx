import { resolveAppearanceVariables, type AppearanceMode } from './appearance'
import { DEFAULT_PREFERENCES, type Preferences } from './workspace'

const accents = [
  { name: 'Forest', color: '#297A5A' },
  { name: 'Ocean', color: '#4467D9' },
  { name: 'Violet', color: '#8156C8' },
  { name: 'Amber', color: '#B56A16' },
  { name: 'Rose', color: '#C35070' },
]

const customColors = [
  { key: 'backgroundColor', label: 'Background', token: '--bg' },
  { key: 'surfaceColor', label: 'Panels', token: '--panel' },
  { key: 'textColor', label: 'Text', token: '--ink' },
  { key: 'borderColor', label: 'Borders', token: '--line' },
  { key: 'gridColor', label: 'Canvas grid', token: '--grid' },
] as const

type AppearanceOptionsProps = {
  preferences: Preferences
  onChange: (preferences: Preferences) => void
  mode?: AppearanceMode
}

export default function AppearanceOptions({
  preferences,
  onChange,
  mode = preferences.mode === 'dark' ? 'dark' : 'light',
}: AppearanceOptionsProps) {
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    onChange({ ...preferences, [key]: value })
  }

  const colors = resolveAppearanceVariables(preferences, mode)

  return (
    <section className="options-view" aria-labelledby="options-title">
      <div className="page-heading">
        <h1 id="options-title">Appearance</h1>
      </div>

      <div className="options-grid">
        <fieldset className="option-card appearance-colors-card">
          <legend className="option-title">Colors and contrast</legend>
          <p className="option-description">A quiet look, in your colors.</p>
          <div className="radio-options">
            {(['system', 'light', 'dark'] as const).map((appearance) => (
              <label className="radio-option" key={appearance}>
                <input
                  type="radio"
                  name="appearance"
                  value={appearance}
                  checked={preferences.mode === appearance}
                  onChange={() => update('mode', appearance)}
                />
                <span>
                  {appearance === 'system'
                    ? 'Follow system'
                    : appearance === 'light'
                      ? 'Light'
                      : 'Dark'}
                </span>
              </label>
            ))}
          </div>

          <h2 className="option-subtitle">Accent</h2>
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

          <div className="range-control">
            <label htmlFor="interface-contrast">Interface contrast</label>
            <output htmlFor="interface-contrast">
              {preferences.contrast}%
            </output>
            <input
              id="interface-contrast"
              type="range"
              min="0"
              max="100"
              step="1"
              value={preferences.contrast}
              onChange={(event) =>
                update('contrast', Number(event.target.value))
              }
            />
            <span>Soft</span>
            <span>Strong</span>
          </div>

          <details className="advanced-colors">
            <summary>Fine-tune colors</summary>
            <div className="custom-color-list">
              {customColors.map(({ key, label, token }) => (
                <div className="custom-color-row" key={key}>
                  <label htmlFor={`custom-${key}`}>{label}</label>
                  <input
                    id={`custom-${key}`}
                    type="color"
                    aria-label={`${label} color`}
                    value={preferences[key] ?? colors[token]}
                    onChange={(event) => update(key, event.target.value)}
                  />
                  <button
                    className="text-button"
                    type="button"
                    aria-label={`Automatic ${label.toLowerCase()} color`}
                    disabled={preferences[key] === null}
                    onClick={() => update(key, null)}
                  >
                    Automatic
                  </button>
                </div>
              ))}
            </div>
          </details>

          <div className="appearance-preview" aria-label="Appearance preview">
            <div className="appearance-preview-rail" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="appearance-preview-content">
              <span className="appearance-preview-title">Your workspace</span>
              <span className="appearance-preview-note">
                Room for your ideas
              </span>
              <span className="appearance-preview-chip">Selected</span>
            </div>
          </div>
        </fieldset>

        <fieldset className="option-card">
          <legend className="option-title">Spacing and canvas</legend>
          <p className="option-description">
            More room, or a closer arrangement.
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
          <h2 className="option-subtitle">Canvas background</h2>
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
          <p className="option-description">Choose how your interface moves.</p>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={preferences.reduceMotion}
              onChange={(event) => update('reduceMotion', event.target.checked)}
            />
            <span>Reduce motion</span>
          </label>
          <div className="radio-options">
            {(['subtle', 'smooth'] as const).map((style) => (
              <label className="radio-option" key={style}>
                <input
                  type="radio"
                  name="motion-style"
                  checked={preferences.motionStyle === style}
                  disabled={preferences.reduceMotion}
                  onChange={() => update('motionStyle', style)}
                />
                <span>{style === 'subtle' ? 'Subtle' : 'Smooth'}</span>
              </label>
            ))}
          </div>
          <label className="select-control" htmlFor="motion-speed">
            <span>Animation speed</span>
            <select
              id="motion-speed"
              value={preferences.motionSpeed}
              disabled={preferences.reduceMotion}
              onChange={(event) =>
                update(
                  'motionSpeed',
                  event.target.value as Preferences['motionSpeed'],
                )
              }
            >
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </label>
          <p className="option-description">
            Your device’s reduced motion setting is always respected.
          </p>
        </fieldset>

        <div className="option-card reset-card">
          <h2 className="option-title">A fresh look</h2>
          <p className="option-description">Restore the default appearance.</p>
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
