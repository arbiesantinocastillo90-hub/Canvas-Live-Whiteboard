import {
  DEFAULT_CANVAS_CONTROLS,
  normalizeCanvasControls,
  type CanvasControlSettings,
} from './canvasControls'
import './canvas-precision.css'

export default function CanvasControlOptions({
  value,
  onChange,
}: {
  value: CanvasControlSettings
  onChange: (value: CanvasControlSettings) => void
}) {
  function update(patch: Partial<CanvasControlSettings>) {
    onChange(normalizeCanvasControls({ ...value, ...patch }))
  }
  return (
    <section
      className="canvas-control-options"
      aria-labelledby="canvas-controls-options-title"
    >
      <h2 id="canvas-controls-options-title">Canvas controls</h2>
      <div className="canvas-control-option-grid">
        <fieldset className="option-card">
          <legend className="option-title">Selection</legend>
          <label>
            Selection behavior
            <select
              value={value.selectionBehavior}
              onChange={(event) =>
                update({
                  selectionBehavior: event.target
                    .value as CanvasControlSettings['selectionBehavior'],
                })
              }
            >
              <option value="contain">Fully inside the box</option>
              <option value="intersect">Touching the box</option>
            </select>
          </label>
          <label>
            Fill color
            <span className="canvas-control-color">
              <input
                aria-label="Selection fill color"
                type="color"
                value={
                  value.selectionFill === 'theme'
                    ? '#7c5cff'
                    : value.selectionFill
                }
                onChange={(event) =>
                  update({ selectionFill: event.target.value })
                }
              />
              <button
                type="button"
                onClick={() => update({ selectionFill: 'theme' })}
              >
                Use theme
              </button>
            </span>
          </label>
          <label>
            Fill opacity
            <input
              aria-label="Selection fill opacity"
              type="range"
              min="0"
              max="0.5"
              step="0.01"
              value={value.selectionOpacity}
              onChange={(event) =>
                update({ selectionOpacity: Number(event.target.value) })
              }
            />
            <output>{Math.round(value.selectionOpacity * 100)}%</output>
          </label>
          <label>
            Outline color
            <span className="canvas-control-color">
              <input
                aria-label="Selection outline color"
                type="color"
                value={
                  value.selectionStroke === 'theme'
                    ? '#7c5cff'
                    : value.selectionStroke
                }
                onChange={(event) =>
                  update({ selectionStroke: event.target.value })
                }
              />
              <button
                type="button"
                onClick={() => update({ selectionStroke: 'theme' })}
              >
                Use theme
              </button>
            </span>
          </label>
          <label>
            Outline width
            <input
              aria-label="Selection outline width"
              type="number"
              min="0.5"
              max="6"
              step="0.5"
              value={value.selectionStrokeWidth}
              onChange={(event) =>
                update({ selectionStrokeWidth: Number(event.target.value) })
              }
            />
          </label>
          <label className="canvas-control-check">
            <input
              type="checkbox"
              checked={value.selectionDashed}
              onChange={(event) =>
                update({ selectionDashed: event.target.checked })
              }
            />
            Dashed outline
          </label>
        </fieldset>
        <fieldset className="option-card">
          <legend className="option-title">Precision</legend>
          <label className="canvas-control-check">
            <input
              type="checkbox"
              checked={value.snapToGrid}
              onChange={(event) => update({ snapToGrid: event.target.checked })}
            />
            Snap to grid
          </label>
          <label>
            Grid spacing (px)
            <input
              aria-label="Grid spacing in pixels"
              type="number"
              min="2"
              max="1000"
              step="1"
              value={value.gridSpacing}
              onChange={(event) =>
                update({ gridSpacing: Number(event.target.value) })
              }
            />
          </label>
          <p className="canvas-control-note">
            Hold Alt while dragging or resizing to bypass snapping. Grid spacing
            uses canvas coordinates.
          </p>
          <label className="canvas-control-check">
            <input
              type="checkbox"
              checked={value.rulers}
              onChange={(event) => update({ rulers: event.target.checked })}
            />
            Show rulers
          </label>
          <label>
            Ruler unit
            <select
              value={value.rulerUnit}
              onChange={(event) =>
                update({
                  rulerUnit: event.target
                    .value as CanvasControlSettings['rulerUnit'],
                })
              }
            >
              <option value="px">Pixels</option>
              <option value="mm">Millimeters</option>
              <option value="cm">Centimeters</option>
              <option value="in">Inches</option>
            </select>
          </label>
          <p className="canvas-control-note">
            Measurements use 96 canvas pixels per inch, like CSS units. They do
            not measure physical screen size.
          </p>
          <label>
            Zoom display
            <select
              value={value.zoomUnit}
              onChange={(event) =>
                update({
                  zoomUnit: event.target
                    .value as CanvasControlSettings['zoomUnit'],
                })
              }
            >
              <option value="percent">Percent (100%)</option>
              <option value="multiplier">Multiplier (1×)</option>
              <option value="ratio">Ratio (1:1)</option>
            </select>
          </label>
        </fieldset>
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_CANVAS_CONTROLS })}
      >
        Reset canvas controls
      </button>
    </section>
  )
}
