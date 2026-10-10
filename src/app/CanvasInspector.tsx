import { useId, useState, type FormEvent } from 'react'
import type { CanvasDocument, CanvasElement, CanvasLayer } from './lcanvas'
import {
  addLayer,
  isElementEditable,
  removeElement,
  reorderLayer,
  updateElement,
  updateLayer,
} from './canvasOperations'
import './canvas-inspector.css'

export type CanvasInspectorProps = {
  document: CanvasDocument
  selectedId: string | null
  activeLayerId: string
  onSelect: (id: string | null) => void
  onActiveLayerChange: (id: string) => void
  onDocumentChange: (document: CanvasDocument) => void
  onError?: (message: string) => void
}

function objectName(element: CanvasElement): string {
  if (element.type === 'area') return element.name
  if ('text' in element && element.text.trim()) {
    return element.text.trim().split('\n')[0].slice(0, 50)
  }
  return `${element.type[0].toUpperCase()}${element.type.slice(1)}`
}

type Commit = (operation: () => CanvasDocument) => boolean

function LayerItem({
  layer,
  document,
  active,
  commit,
  onActiveLayerChange,
}: {
  layer: CanvasLayer
  document: CanvasDocument
  active: boolean
  commit: Commit
  onActiveLayerChange: (id: string) => void
}) {
  const [name, setName] = useState(layer.name)
  const index = document.layers.findIndex((item) => item.id === layer.id)
  const count = document.elements.filter(
    (item) => item.layerId === layer.id,
  ).length

  return (
    <li className="inspector-layer" data-active={active}>
      <button
        className="inspector-layer-select"
        type="button"
        aria-label={`Use layer ${layer.name}`}
        aria-pressed={active}
        onClick={() => onActiveLayerChange(layer.id)}
      >
        <span>{layer.name}</span>
        <small>
          {count} {count === 1 ? 'object' : 'objects'}
        </small>
      </button>
      <div className="inspector-layer-actions">
        <button
          type="button"
          aria-label={`${layer.visible ? 'Hide' : 'Show'} layer ${layer.name}`}
          aria-pressed={layer.visible}
          onClick={() =>
            commit(() =>
              updateLayer(document, layer.id, { visible: !layer.visible }),
            )
          }
        >
          {layer.visible ? 'Visible' : 'Hidden'}
        </button>
        <button
          type="button"
          aria-label={`${layer.locked ? 'Unlock' : 'Lock'} layer ${layer.name}`}
          aria-pressed={layer.locked}
          onClick={() =>
            commit(() =>
              updateLayer(document, layer.id, { locked: !layer.locked }),
            )
          }
        >
          {layer.locked ? 'Locked' : 'Unlocked'}
        </button>
        <button
          type="button"
          aria-label={`Move layer ${layer.name} forward`}
          disabled={index === document.layers.length - 1}
          onClick={() =>
            commit(() => reorderLayer(document, layer.id, index + 1))
          }
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move layer ${layer.name} backward`}
          disabled={index === 0}
          onClick={() =>
            commit(() => reorderLayer(document, layer.id, index - 1))
          }
        >
          ↓
        </button>
      </div>
      <form
        className="inspector-inline-form"
        onSubmit={(event) => {
          event.preventDefault()
          commit(() => updateLayer(document, layer.id, { name }))
        }}
      >
        <input
          aria-label={`Rename layer ${layer.name}`}
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={name.trim() === layer.name}>
          Rename
        </button>
      </form>
    </li>
  )
}

function numeric(value: string, name: string): number {
  if (!value.trim()) throw new Error(`Enter a value for ${name}.`)
  const number = Number(value)
  if (!Number.isFinite(number))
    throw new Error(`${name} must be a finite number.`)
  return number
}

function ElementProperties({
  element,
  document,
  commit,
  onSelect,
}: {
  element: CanvasElement
  document: CanvasDocument
  commit: Commit
  onSelect: (id: string | null) => void
}) {
  const prefix = useId()
  const [x, setX] = useState('x' in element ? String(element.x) : '')
  const [y, setY] = useState('y' in element ? String(element.y) : '')
  const [width, setWidth] = useState(
    'width' in element ? String(element.width) : '',
  )
  const [height, setHeight] = useState(
    'height' in element ? String(element.height) : '',
  )
  const [x2, setX2] = useState(
    element.type === 'line' ? String(element.x2) : '',
  )
  const [y2, setY2] = useState(
    element.type === 'line' ? String(element.y2) : '',
  )
  const [text, setText] = useState('text' in element ? element.text : '')
  const [fontSize, setFontSize] = useState(
    'fontSize' in element ? String(element.fontSize) : '',
  )
  const [name, setName] = useState(element.type === 'area' ? element.name : '')
  const [color, setColor] = useState(element.color)
  const [fill, setFill] = useState(
    'fill' in element ? (element.fill ?? '#ffffff') : '#ffffff',
  )
  const [transparent, setTransparent] = useState(
    'fill' in element ? element.fill === null : true,
  )
  const [layerId, setLayerId] = useState(element.layerId)
  const [areaId, setAreaId] = useState(element.areaId ?? '')
  const [style, setStyle] = useState<'straight' | 'elbow'>(
    element.type === 'connection' ? element.style : 'straight',
  )
  const [arrows, setArrows] = useState(
    element.type === 'connection'
      ? element.startArrow
        ? element.endArrow
          ? 'both'
          : 'start'
        : element.endArrow
          ? 'end'
          : 'none'
      : 'none',
  )
  const editable = isElementEditable(document, element.id)
  const layer = document.layers.find((item) => item.id === element.layerId)
  const area = document.elements.find(
    (item) => item.id === element.areaId && item.type === 'area',
  )
  const areas = document.elements.filter((item) => item.type === 'area')
  const memberCount = document.elements.filter(
    (item) => item.areaId === element.id,
  ).length

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    commit(() => {
      const base = { color, layerId, areaId: areaId || null }
      if (element.type === 'connection') {
        return updateElement(document, element.id, {
          ...base,
          style,
          startArrow: arrows === 'start' || arrows === 'both',
          endArrow: arrows === 'end' || arrows === 'both',
        })
      }
      const position = { ...base, x: numeric(x, 'X'), y: numeric(y, 'Y') }
      if (element.type === 'line') {
        return updateElement(document, element.id, {
          ...position,
          x2: numeric(x2, 'End X'),
          y2: numeric(y2, 'End Y'),
        })
      }
      const dimensions = {
        ...position,
        width: numeric(width, 'Width'),
        height: numeric(height, 'Height'),
      }
      if (element.type === 'area') {
        return updateElement(document, element.id, {
          ...dimensions,
          areaId: null,
          name,
          fill: transparent ? null : fill,
        })
      }
      const typography = {
        ...dimensions,
        text,
        fontSize: numeric(fontSize, 'Font size'),
      }
      return updateElement(
        document,
        element.id,
        element.type === 'text'
          ? typography
          : { ...typography, fill: transparent ? null : fill },
      )
    })
  }

  function numberField(
    label: string,
    value: string,
    change: (value: string) => void,
    min?: number,
  ) {
    return (
      <label className="inspector-field">
        <span>{label}</span>
        <input
          type="number"
          step="any"
          min={min}
          value={value}
          onChange={(event) => change(event.target.value)}
        />
      </label>
    )
  }

  return (
    <section
      className="inspector-section"
      aria-labelledby={`${prefix}-properties`}
    >
      <div className="inspector-section-heading">
        <h3 id={`${prefix}-properties`}>Selected object</h3>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="Clear object selection"
        >
          Clear
        </button>
      </div>
      <div className="inspector-object-summary">
        <strong>{objectName(element)}</strong>
        <span>
          {element.type} · {layer?.name ?? 'Unknown layer'}
        </span>
        {area?.type === 'area' && <span>Inside {area.name}</span>}
        {element.type === 'area' && (
          <span>
            {memberCount} {memberCount === 1 ? 'member' : 'members'} · moves
            together
          </span>
        )}
      </div>
      {!editable && (
        <p className="inspector-notice">
          This object or its area is on a hidden or locked layer. Show and
          unlock its layer to edit it.
        </p>
      )}
      <form onSubmit={apply}>
        <fieldset className="inspector-property-fields" disabled={!editable}>
          <legend className="inspector-visually-hidden">
            Object properties
          </legend>
          {element.type === 'area' && (
            <label className="inspector-field">
              <span>Area name</span>
              <input
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          {'text' in element && (
            <div className="inspector-field">
              <label htmlFor={`${prefix}-object-text`}>
                {element.type === 'text' ? 'Text' : 'Text inside shape'}
              </label>
              <textarea
                id={`${prefix}-object-text`}
                rows={4}
                value={text}
                maxLength={20000}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          )}
          {element.type !== 'connection' && (
            <div className="inspector-field-pair">
              {numberField('X', x, setX)}
              {numberField('Y', y, setY)}
            </div>
          )}
          {'width' in element && (
            <div className="inspector-field-pair">
              {numberField('Width', width, setWidth, 0)}
              {numberField('Height', height, setHeight, 0)}
            </div>
          )}
          {element.type === 'line' && (
            <div className="inspector-field-pair">
              {numberField('End X', x2, setX2)}
              {numberField('End Y', y2, setY2)}
            </div>
          )}
          {'fontSize' in element &&
            numberField('Font size', fontSize, setFontSize, 8)}
          {element.type === 'connection' && (
            <>
              <div className="inspector-field">
                <label htmlFor={`${prefix}-connection-path`}>
                  Connection path
                </label>
                <select
                  id={`${prefix}-connection-path`}
                  value={style}
                  onChange={(event) =>
                    setStyle(event.target.value as 'straight' | 'elbow')
                  }
                >
                  <option value="straight">Straight</option>
                  <option value="elbow">Elbow</option>
                </select>
              </div>
              <div className="inspector-field">
                <label htmlFor={`${prefix}-arrows`}>Arrows</label>
                <select
                  id={`${prefix}-arrows`}
                  value={arrows}
                  onChange={(event) => setArrows(event.target.value)}
                >
                  <option value="none">No arrows</option>
                  <option value="end">End arrow</option>
                  <option value="start">Start arrow</option>
                  <option value="both">Both arrows</option>
                </select>
              </div>
            </>
          )}
          <div className="inspector-color-fields">
            <label className="inspector-field">
              <span>
                {element.type === 'text' ? 'Text color' : 'Stroke color'}
              </span>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
            {'fill' in element && (
              <label className="inspector-field">
                <span>Fill color</span>
                <input
                  type="color"
                  value={fill}
                  disabled={transparent}
                  onChange={(event) => setFill(event.target.value)}
                />
              </label>
            )}
          </div>
          {'fill' in element && (
            <label className="inspector-check">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(event) => setTransparent(event.target.checked)}
              />
              <span>Transparent fill</span>
            </label>
          )}
          <div className="inspector-field">
            <label htmlFor={`${prefix}-object-layer`}>Object layer</label>
            <select
              id={`${prefix}-object-layer`}
              value={layerId}
              onChange={(event) => setLayerId(event.target.value)}
            >
              {document.layers.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={
                    (item.locked || !item.visible) &&
                    item.id !== element.layerId
                  }
                >
                  {item.name}
                  {item.locked ? ' (locked)' : ''}
                  {!item.visible ? ' (hidden)' : ''}
                </option>
              ))}
            </select>
          </div>
          {element.type !== 'area' && (
            <div className="inspector-field">
              <label htmlFor={`${prefix}-containing-area`}>
                Containing area
              </label>
              <select
                id={`${prefix}-containing-area`}
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
              >
                <option value="">No area</option>
                {areas.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={
                      !isElementEditable(document, item.id) &&
                      item.id !== element.areaId
                    }
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="inspector-apply" type="submit">
            Apply properties
          </button>
          <button
            className="inspector-delete"
            type="button"
            onClick={() => {
              if (commit(() => removeElement(document, element.id)))
                onSelect(null)
            }}
          >
            Delete selected object
          </button>
        </fieldset>
      </form>
    </section>
  )
}

export function CanvasInspector({
  document,
  selectedId,
  activeLayerId,
  onSelect,
  onActiveLayerChange,
  onDocumentChange,
  onError,
}: CanvasInspectorProps) {
  const prefix = useId()
  const [error, setError] = useState('')
  const [layerName, setLayerName] = useState('')
  const selected = document.elements.find((item) => item.id === selectedId)

  function commit(operation: () => CanvasDocument): boolean {
    try {
      const next = operation()
      onDocumentChange(next)
      setError('')
      return true
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'The canvas change could not be applied.'
      setError(message)
      onError?.(message)
      return false
    }
  }

  return (
    <aside
      className="canvas-inspector"
      aria-label="Canvas properties and layers"
    >
      <header className="inspector-header">
        <h2>Properties & layers</h2>
        <p>Arrange the details of your canvas.</p>
      </header>
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
      {selected ? (
        <ElementProperties
          key={`${selected.id}:${JSON.stringify(selected)}`}
          element={selected}
          document={document}
          commit={commit}
          onSelect={onSelect}
        />
      ) : (
        <p className="inspector-empty">
          Select a shape, text, area or connection to edit its properties.
        </p>
      )}
      <section
        className="inspector-section"
        aria-labelledby={`${prefix}-layers`}
      >
        <div className="inspector-section-heading">
          <h3 id={`${prefix}-layers`}>Layers</h3>
          <span>Front to back</span>
        </div>
        <p className="inspector-help">
          New objects use the active layer. Hide or lock layers to manage your
          work.
        </p>
        <ul className="inspector-layers">
          {[...document.layers].reverse().map((layer) => (
            <LayerItem
              key={`${layer.id}:${layer.name}`}
              document={document}
              layer={layer}
              active={layer.id === activeLayerId}
              commit={commit}
              onActiveLayerChange={onActiveLayerChange}
            />
          ))}
        </ul>
        <form
          className="inspector-inline-form inspector-add-layer"
          onSubmit={(event) => {
            event.preventDefault()
            let nextLayerId = ''
            if (
              commit(() => {
                const next = addLayer(document, layerName)
                nextLayerId = next.layers[next.layers.length - 1].id
                return next
              })
            ) {
              setLayerName('')
              onActiveLayerChange(nextLayerId)
            }
          }}
        >
          <input
            aria-label="New layer name"
            placeholder="Name a new layer"
            maxLength={120}
            value={layerName}
            onChange={(event) => setLayerName(event.target.value)}
          />
          <button type="submit" disabled={!layerName.trim()}>
            Add layer
          </button>
        </form>
      </section>
      <section
        className="inspector-section"
        aria-labelledby={`${prefix}-objects`}
      >
        <div className="inspector-section-heading">
          <h3 id={`${prefix}-objects`}>Objects</h3>
          <span>{document.elements.length}</span>
        </div>
        {document.elements.length === 0 ? (
          <p className="inspector-help">
            Your canvas is ready for its first object.
          </p>
        ) : (
          <ul className="inspector-object-list">
            {[...document.layers].reverse().flatMap((layer) =>
              document.elements
                .filter((element) => element.layerId === layer.id)
                .map((element) => (
                  <li key={element.id}>
                    <button
                      type="button"
                      aria-pressed={element.id === selectedId}
                      aria-label={`Select ${objectName(element)} on ${layer.name}`}
                      onClick={() => onSelect(element.id)}
                    >
                      <span>{objectName(element)}</span>
                      <small>
                        {layer.name} · {element.type}
                        {layer.locked ? ' · locked' : ''}
                        {!layer.visible ? ' · hidden' : ''}
                      </small>
                    </button>
                  </li>
                )),
            )}
          </ul>
        )}
      </section>
    </aside>
  )
}
