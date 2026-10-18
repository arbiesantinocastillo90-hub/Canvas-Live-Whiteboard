import {
  LINE_PATTERNS,
  type LinePattern,
  type CanvasDocument,
  type CanvasElement,
} from './lcanvas'
import {
  isElementEditable,
  reverseConnection,
  updateElement,
  type ElementPatch,
} from './canvasOperations'
import {
  TextFormattingFields,
  ConnectionFormattingFields,
} from './CanvasRichProperties'

export default function CanvasQuickProperties({
  document,
  ids,
  onChange,
  onError,
  onDelete,
  onDuplicate,
}: {
  document: CanvasDocument
  ids: string[]
  onChange: (document: CanvasDocument) => void
  onError: (message: string) => void
  onDelete?: () => void
  onDuplicate?: () => void
}) {
  const selected = document.elements.filter((e) => ids.includes(e.id))
  const writable = selected.filter((e) => isElementEditable(document, e.id))
  const first = selected[0]
  function patch(
    value: ElementPatch,
    predicate: (element: CanvasElement) => boolean = () => true,
  ) {
    try {
      let next = document
      for (const e of writable.filter(predicate))
        next = updateElement(next, e.id, value)
      onChange(next)
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : 'These properties could not be changed.',
      )
    }
  }
  const text = selected.find(
    (e): e is Extract<CanvasElement, { text: string }> => 'text' in e,
  )
  const connection = selected.find(
    (e): e is Extract<CanvasElement, { type: 'connection' }> =>
      e.type === 'connection',
  )
  const line = selected.find((e) => e.type === 'line')
  const fill = selected.find(
    (e): e is Extract<CanvasElement, { fill: string | null }> => 'fill' in e,
  )
  if (!first) return <p>No selection</p>
  return (
    <fieldset className="canvas-quick-fields" disabled={!writable.length}>
      <legend>
        {selected.length > 1
          ? `${selected.length} selected objects`
          : `${first.type[0].toUpperCase()}${first.type.slice(1)}`}
      </legend>
      {writable.length < selected.length && (
        <small>Locked or hidden objects keep their properties.</small>
      )}
      <div className="inspector-field-pair">
        <label className="inspector-field">
          <span>Stroke color</span>
          <input
            type="color"
            value={first.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
        {fill && (
          <label className="inspector-field">
            <span>Fill color</span>
            <input
              type="color"
              value={fill.fill ?? '#ffffff'}
              onChange={(e) =>
                patch({ fill: e.target.value }, (e) => 'fill' in e)
              }
            />
          </label>
        )}
      </div>
      {fill && (
        <label className="inspector-check">
          <input
            type="checkbox"
            checked={fill.fill === null}
            onChange={(e) =>
              patch(
                { fill: e.target.checked ? null : '#ffffff' },
                (e) => 'fill' in e,
              )
            }
          />
          <span>Transparent fill</span>
        </label>
      )}
      {text && (
        <>
          <label className="inspector-field">
            <span>Font size</span>
            <input
              type="number"
              min={8}
              max={160}
              value={text.fontSize}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 8 && v <= 160)
                  patch({ fontSize: v }, (e) => 'text' in e)
              }}
            />
          </label>
          <TextFormattingFields
            value={{
              ...text,
              textAlign:
                text.textAlign ?? (text.type === 'text' ? 'left' : 'center'),
              verticalAlign:
                text.verticalAlign ?? (text.type === 'text' ? 'top' : 'middle'),
            }}
            onChange={(value) => patch(value, (e) => 'text' in e)}
          />
        </>
      )}
      {line && !connection && (
        <label className="inspector-field">
          <span>Line type</span>
          <select
            value={line.linePattern ?? 'solid'}
            onChange={(event) =>
              patch(
                { linePattern: event.target.value as LinePattern },
                (e) => e.type === 'line',
              )
            }
          >
            {LINE_PATTERNS.map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      {connection && (
        <ConnectionFormattingFields
          value={connection}
          onChange={(value) => patch(value, (e) => e.type === 'connection')}
          onReverse={() => {
            try {
              let next = document
              for (const e of writable.filter((e) => e.type === 'connection'))
                next = reverseConnection(next, e.id)
              onChange(next)
            } catch (e) {
              onError(
                e instanceof Error
                  ? e.message
                  : 'This connection cannot be reversed.',
              )
            }
          }}
        />
      )}
      <label className="inspector-field">
        <span>Object layer</span>
        <select
          value={first.layerId}
          onChange={(e) => patch({ layerId: e.target.value })}
        >
          {document.layers.map((l) => (
            <option key={l.id} value={l.id} disabled={l.locked || !l.visible}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {(onDuplicate || onDelete) && (
        <div className="canvas-quick-actions">
          {onDuplicate && (
            <button type="button" onClick={onDuplicate}>
              Duplicate
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      )}
    </fieldset>
  )
}
