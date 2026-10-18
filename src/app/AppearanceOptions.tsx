import { resolveAppearanceVariables, type AppearanceMode } from './appearance'
import { DEFAULT_PREFERENCES, type Preferences } from './workspace'
import {
  boundedAutoHideDelay,
  boundedChromeSize,
  boundedPanelWidth,
  CHROME_LIMITS,
  DEFAULT_LAYOUT,
  PANEL_LIMITS,
  type WorkspaceLayout,
} from './layout'

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
  layout?: WorkspaceLayout
  onLayoutChange?: (layout: WorkspaceLayout) => void
}

export default function AppearanceOptions({
  preferences,
  onChange,
  mode = preferences.mode === 'dark' ? 'dark' : 'light',
  layout,
  onLayoutChange,
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
          <label className="toggle-control option-inline-toggle">
            <input
              type="checkbox"
              checked={preferences.railButtonBackground}
              onChange={(event) =>
                update('railButtonBackground', event.target.checked)
              }
            />
            <span>Separate rail buttons</span>
          </label>
        </fieldset>

        <fieldset className="option-card">
          <legend className="option-title">Canvas text</legend>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={preferences.autoGrowShapes}
              onChange={(event) =>
                update('autoGrowShapes', event.target.checked)
              }
            />
            <span>Grow shapes with text</span>
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={preferences.fitTextToShape}
              onChange={(event) =>
                update('fitTextToShape', event.target.checked)
              }
            />
            <span>Fit text when shapes shrink</span>
          </label>
          <div className="range-control">
            <label htmlFor="minimum-text-size">Minimum text size</label>
            <output htmlFor="minimum-text-size">
              {preferences.minTextSize} px
            </output>
            <input
              id="minimum-text-size"
              type="range"
              min="8"
              max="32"
              step="1"
              value={preferences.minTextSize}
              disabled={!preferences.fitTextToShape}
              onChange={(event) =>
                update('minTextSize', Number(event.target.value))
              }
            />
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
            <span>Speed preset</span>
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
          <div className="range-control">
            <label htmlFor="motion-scale">Animation speed</label>
            <output htmlFor="motion-scale">{preferences.motionScale}%</output>
            <input
              id="motion-scale"
              type="range"
              min="25"
              max="200"
              step="5"
              value={preferences.motionScale}
              disabled={preferences.reduceMotion}
              onChange={(event) =>
                update('motionScale', Number(event.target.value))
              }
            />
            <span>Slower</span>
            <span>Faster</span>
          </div>
          <label className="select-control" htmlFor="motion-effect">
            <span>Animation type</span>
            <select
              id="motion-effect"
              value={preferences.motionEffect}
              disabled={preferences.reduceMotion}
              onChange={(event) =>
                update(
                  'motionEffect',
                  event.target.value as Preferences['motionEffect'],
                )
              }
            >
              <option value="flow">Flow</option>
              <option value="fade">Fade</option>
              <option value="pop">Pop</option>
            </select>
          </label>
          <label className="select-control" htmlFor="motion-easing">
            <span>Animation easing</span>
            <select
              id="motion-easing"
              value={preferences.motionEasing}
              disabled={preferences.reduceMotion}
              onChange={(event) =>
                update(
                  'motionEasing',
                  event.target.value as Preferences['motionEasing'],
                )
              }
            >
              <option value="standard">Standard</option>
              <option value="linear">Linear</option>
              <option value="ease-in">Ease in</option>
              <option value="ease-out">Ease out</option>
              <option value="ease-in-out">Ease in and out</option>
            </select>
          </label>
          <button
            className="button secondary motion-preview"
            type="button"
            title="Hover to preview your animation"
            disabled={preferences.reduceMotion}
          >
            Preview
          </button>
          <p className="option-description">
            Your device’s reduced motion setting is always respected.
          </p>
        </fieldset>

        {layout && onLayoutChange && (
          <fieldset className="option-card">
            <legend className="option-title">Panels</legend>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={layout.autoHidePanels}
                onChange={(event) =>
                  onLayoutChange({
                    ...layout,
                    autoHidePanels: event.target.checked,
                  })
                }
              />
              <span>Auto-hide panels</span>
            </label>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={layout.autoHideTabs}
                onChange={(event) =>
                  onLayoutChange({
                    ...layout,
                    autoHideTabs: event.target.checked,
                  })
                }
              />
              <span>Auto-hide tab bar</span>
            </label>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={layout.autoHideStatus}
                onChange={(event) =>
                  onLayoutChange({
                    ...layout,
                    autoHideStatus: event.target.checked,
                  })
                }
              />
              <span>Auto-hide status bar</span>
            </label>
            <div className="range-control">
              <label htmlFor="panel-hide-delay">Panel hide delay</label>
              <output htmlFor="panel-hide-delay">
                {layout.autoHideDelay} ms
              </output>
              <input
                id="panel-hide-delay"
                type="range"
                min="0"
                max="2000"
                step="20"
                value={layout.autoHideDelay}
                disabled={!layout.autoHidePanels}
                onChange={(event) =>
                  onLayoutChange({
                    ...layout,
                    autoHideDelay: boundedAutoHideDelay(
                      Number(event.target.value),
                    ),
                  })
                }
              />
            </div>
            <button
              className="button secondary"
              type="button"
              aria-pressed={layout.panelsSwapped}
              title={
                layout.panelsSwapped
                  ? 'Files right, canvas panels left'
                  : 'Files left, canvas panels right'
              }
              onClick={() =>
                onLayoutChange({
                  ...layout,
                  panelsSwapped: !layout.panelsSwapped,
                })
              }
            >
              Swap panel sides
            </button>
          </fieldset>
        )}

        {layout && onLayoutChange && (
          <fieldset className="option-card">
            <legend className="option-title">Interface dimensions</legend>
            {(
              [
                [
                  'filesWidth',
                  'Files and projects width',
                  PANEL_LIMITS.files,
                  'files',
                ],
                [
                  'rightWidth',
                  'Tools and AI width',
                  PANEL_LIMITS.right,
                  'right',
                ],
              ] as const
            ).map(([key, label, limits, panel]) => (
              <div className="range-control" key={key}>
                <label htmlFor={`layout-${key}`}>{label}</label>
                <output htmlFor={`layout-${key}`}>{layout[key]} px</output>
                <input
                  id={`layout-${key}`}
                  type="range"
                  min={limits.min}
                  max={limits.max}
                  step="1"
                  value={layout[key]}
                  onChange={(event) =>
                    onLayoutChange({
                      ...layout,
                      [key]: boundedPanelWidth(
                        Number(event.target.value),
                        panel,
                      ),
                    })
                  }
                />
              </div>
            ))}
            {(
              [
                ['ribbonWidth', 'Workspace rail width'],
                ['controlsWidth', 'Canvas controls width'],
                ['tabBarHeight', 'Tab bar height'],
                ['statusBarHeight', 'Status bar height'],
              ] as const
            ).map(([key, label]) => (
              <div className="range-control" key={key}>
                <label htmlFor={`layout-${key}`}>{label}</label>
                <output htmlFor={`layout-${key}`}>{layout[key]} px</output>
                <input
                  id={`layout-${key}`}
                  type="range"
                  min={CHROME_LIMITS[key].min}
                  max={CHROME_LIMITS[key].max}
                  step="1"
                  value={layout[key]}
                  onChange={(event) =>
                    onLayoutChange({
                      ...layout,
                      [key]: boundedChromeSize(Number(event.target.value), key),
                    })
                  }
                />
              </div>
            ))}
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                onLayoutChange({
                  ...layout,
                  sidebarWidth: DEFAULT_LAYOUT.sidebarWidth,
                  filesWidth: DEFAULT_LAYOUT.filesWidth,
                  rightWidth: DEFAULT_LAYOUT.rightWidth,
                  ribbonWidth: DEFAULT_LAYOUT.ribbonWidth,
                  controlsWidth: DEFAULT_LAYOUT.controlsWidth,
                  tabBarHeight: DEFAULT_LAYOUT.tabBarHeight,
                  statusBarHeight: DEFAULT_LAYOUT.statusBarHeight,
                })
              }
            >
              Reset interface dimensions
            </button>
          </fieldset>
        )}

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
