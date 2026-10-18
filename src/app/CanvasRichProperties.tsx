import { useId } from 'react'
import {
  CONNECTION_STYLES,
  FONT_FAMILIES,
  LINE_PATTERNS,
  POINTER_TYPES,
  type ConnectionElement,
  type TextFormat,
} from './lcanvas'
import type { ElementPatch } from './canvasOperations'

const title = (value: string) =>
  value[0].toUpperCase() + value.slice(1).replaceAll('-', ' ')
export function TextFormattingFields({
  value,
  onChange,
}: {
  value: TextFormat & { color?: string }
  onChange: (patch: ElementPatch) => void
}) {
  const prefix = useId()
  return (
    <div className="canvas-rich-properties">
      <div className="inspector-field-pair">
        <label className="inspector-field">
          <span>Horizontal alignment</span>
          <select
            value={value.textAlign ?? 'center'}
            onChange={(e) =>
              onChange({ textAlign: e.target.value as TextFormat['textAlign'] })
            }
          >
            {['left', 'center', 'right'].map((v) => (
              <option key={v} value={v}>
                {title(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="inspector-field">
          <span>Vertical alignment</span>
          <select
            value={value.verticalAlign ?? 'middle'}
            onChange={(e) =>
              onChange({
                verticalAlign: e.target.value as TextFormat['verticalAlign'],
              })
            }
          >
            {['top', 'middle', 'bottom'].map((v) => (
              <option key={v} value={v}>
                {title(v)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="inspector-field-pair">
        <label className="inspector-field">
          <span>Font family</span>
          <select
            value={value.fontFamily ?? 'sans'}
            onChange={(e) =>
              onChange({
                fontFamily: e.target.value as TextFormat['fontFamily'],
              })
            }
          >
            {FONT_FAMILIES.map((v) => (
              <option key={v} value={v}>
                {
                  {
                    sans: 'Sans serif',
                    serif: 'Serif',
                    mono: 'Monospace',
                    cursive: 'Cursive',
                  }[v]
                }
              </option>
            ))}
          </select>
        </label>
        <label className="inspector-field">
          <span>Font color</span>
          <input
            id={`${prefix}-font-color`}
            type="color"
            value={value.textColor ?? value.color ?? '#ffffff'}
            onChange={(e) => onChange({ textColor: e.target.value })}
          />
        </label>
      </div>
      <div className="inspector-field-pair">
        <label className="inspector-check">
          <input
            type="checkbox"
            checked={value.fontWeight === 'bold'}
            onChange={(e) =>
              onChange({ fontWeight: e.target.checked ? 'bold' : 'normal' })
            }
          />
          <span>Bold</span>
        </label>
        <label className="inspector-check">
          <input
            type="checkbox"
            checked={value.fontStyle === 'italic'}
            onChange={(e) =>
              onChange({ fontStyle: e.target.checked ? 'italic' : 'normal' })
            }
          />
          <span>Italic</span>
        </label>
      </div>
    </div>
  )
}

export function ConnectionFormattingFields({
  value,
  onChange,
  onReverse,
}: {
  value: Partial<ConnectionElement>
  onChange: (patch: ElementPatch) => void
  onReverse?: () => void
}) {
  return (
    <div className="canvas-rich-properties">
      <label className="inspector-field">
        <span>Connection path</span>
        <select
          value={value.style ?? 'straight'}
          onChange={(e) =>
            onChange({ style: e.target.value as ConnectionElement['style'] })
          }
        >
          {CONNECTION_STYLES.map((v) => (
            <option key={v} value={v}>
              {title(v)}
            </option>
          ))}
        </select>
      </label>
      <label className="inspector-field">
        <span>Line type</span>
        <select
          value={value.linePattern ?? 'solid'}
          onChange={(e) =>
            onChange({
              linePattern: e.target.value as ConnectionElement['linePattern'],
            })
          }
        >
          {LINE_PATTERNS.map((v) => (
            <option key={v} value={v}>
              {title(v)}
            </option>
          ))}
        </select>
      </label>
      <div className="inspector-field-pair">
        {(['start', 'end'] as const).map((end) => (
          <label className="inspector-field" key={end}>
            <span>{title(end)} pointer</span>
            <select
              value={
                value[`${end}Pointer`] ??
                (value[`${end}Arrow`] ? 'arrow' : 'none')
              }
              onChange={(e) =>
                onChange({
                  [`${end}Pointer`]: e.target.value,
                  [`${end}Arrow`]: e.target.value !== 'none',
                })
              }
            >
              {POINTER_TYPES.map((v) => (
                <option key={v} value={v}>
                  {title(v)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {onReverse && (
        <button type="button" onClick={onReverse}>
          Reverse connection
        </button>
      )}
    </div>
  )
}
