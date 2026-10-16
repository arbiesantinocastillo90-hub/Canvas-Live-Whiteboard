import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  CONNECTION_SIDES,
  type CanvasDocument,
  type CanvasElement,
  type CanvasLayer,
  type ConnectionSide,
} from './lcanvas'
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
  onDraftFlusherChange?: (flush: (() => boolean) | null) => void
}

function objectName(element: CanvasElement): string {
  if (element.type === 'area') return element.name
  if ('text' in element && element.text.trim()) {
    return element.text.trim().split('\n')[0].slice(0, 50)
  }
  return `${element.type[0].toUpperCase()}${element.type.slice(1)}`
}

type Commit = (operation: () => CanvasDocument) => boolean

function propertyDraft(element: CanvasElement) {
  return {
    x: 'x' in element ? String(element.x) : '',
    y: 'y' in element ? String(element.y) : '',
    width: 'width' in element ? String(element.width) : '',
    height: 'height' in element ? String(element.height) : '',
    x2: element.type === 'line' ? String(element.x2) : '',
    y2: element.type === 'line' ? String(element.y2) : '',
    text: 'text' in element ? element.text : '',
    fontSize: 'fontSize' in element ? String(element.fontSize) : '',
    name: element.type === 'area' ? element.name : '',
    color: element.color,
    fill: 'fill' in element ? (element.fill ?? '#ffffff') : '#ffffff',
    transparent: 'fill' in element ? element.fill === null : true,
    layerId: element.layerId,
    areaId: element.areaId ?? '',
    style:
      element.type === 'connection'
        ? element.style
        : ('straight' as 'straight' | 'elbow'),
    fromSide:
      element.type === 'connection'
        ? (element.fromSide ?? 'auto')
        : ('auto' as ConnectionSide),
    toSide:
      element.type === 'connection'
        ? (element.toSide ?? 'auto')
        : ('auto' as ConnectionSide),
    arrows:
      element.type === 'connection'
        ? element.startArrow
          ? element.endArrow
            ? 'both'
            : 'start'
          : element.endArrow
            ? 'end'
            : 'none'
        : 'none',
  }
}

function LayerIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

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
          title={`${layer.visible ? 'Hide' : 'Show'} layer ${layer.name}`}
          aria-pressed={layer.visible}
          onClick={() =>
            commit(() =>
              updateLayer(document, layer.id, { visible: !layer.visible }),
            )
          }
        >
          <LayerIcon>
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {!layer.visible && <path d="m3 3 18 18" />}
          </LayerIcon>
        </button>
        <button
          type="button"
          aria-label={`${layer.locked ? 'Unlock' : 'Lock'} layer ${layer.name}`}
          title={`${layer.locked ? 'Unlock' : 'Lock'} layer ${layer.name}`}
          aria-pressed={layer.locked}
          onClick={() =>
            commit(() =>
              updateLayer(document, layer.id, { locked: !layer.locked }),
            )
          }
        >
          <LayerIcon>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path
              d={
                layer.locked
                  ? 'M8 11V7a4 4 0 0 1 8 0v4'
                  : 'M8 11V7a4 4 0 0 1 8 0'
              }
            />
            <path d="M12 15v2" />
          </LayerIcon>
        </button>
        <button
          type="button"
          aria-label={`Move layer ${layer.name} forward`}
          title={`Move layer ${layer.name} forward`}
          disabled={index === document.layers.length - 1}
          onClick={() =>
            commit(() => reorderLayer(document, layer.id, index + 1))
          }
        >
          <LayerIcon>
            <path d="M12 19V5m-6 6 6-6 6 6" />
          </LayerIcon>
        </button>
        <button
          type="button"
          aria-label={`Move layer ${layer.name} backward`}
          title={`Move layer ${layer.name} backward`}
          disabled={index === 0}
          onClick={() =>
            commit(() => reorderLayer(document, layer.id, index - 1))
          }
        >
          <LayerIcon>
            <path d="M12 5v14m-6-6 6 6 6-6" />
          </LayerIcon>
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

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: number
}) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      <input
        type="number"
        step="any"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function ElementProperties({
  element,
  document,
  commit,
  onSelect,
  onDraftFlusherChange,
}: {
  element: CanvasElement
  document: CanvasDocument
  commit: Commit
  onSelect: (id: string | null) => void
  onDraftFlusherChange: (flush: (() => boolean) | null) => void
}) {
  const prefix = useId()
  const [draft, setDraft] = useState(() => propertyDraft(element))
  const draftRef = useRef(draft)
  const dirty = useRef(false)
  const {
    x,
    y,
    width,
    height,
    x2,
    y2,
    text,
    fontSize,
    name,
    color,
    fill,
    transparent,
    layerId,
    areaId,
    style,
    arrows,
    fromSide,
    toSide,
  } = draft
  function change<K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) {
    draftRef.current = { ...draftRef.current, [key]: value }
    dirty.current = true
    setDraft(draftRef.current)
  }
  const setX = (value: string) => change('x', value)
  const setY = (value: string) => change('y', value)
  const setWidth = (value: string) => change('width', value)
  const setHeight = (value: string) => change('height', value)
  const setX2 = (value: string) => change('x2', value)
  const setY2 = (value: string) => change('y2', value)
  const setText = (value: string) => change('text', value)
  const setFontSize = (value: string) => change('fontSize', value)
  const setName = (value: string) => change('name', value)
  const setColor = (value: string) => change('color', value)
  const setFill = (value: string) => change('fill', value)
  const setTransparent = (value: boolean) => change('transparent', value)
  const setLayerId = (value: string) => change('layerId', value)
  const setAreaId = (value: string) => change('areaId', value)
  const setStyle = (value: 'straight' | 'elbow') => change('style', value)
  const setArrows = (value: string) => change('arrows', value)
  const editable = isElementEditable(document, element.id)
  const layer = document.layers.find((item) => item.id === element.layerId)
  const area = document.elements.find(
    (item) => item.id === element.areaId && item.type === 'area',
  )
  const areas = document.elements.filter((item) => item.type === 'area')
  const memberCount = document.elements.filter(
    (item) => item.areaId === element.id,
  ).length

  const fingerprint = JSON.stringify(element)
  useLayoutEffect(() => {
    // Undo, AI updates and locking replace pending fields with the latest valid object.
    // Use object content so a camera-only document replacement retains its draft.
    draftRef.current = propertyDraft(JSON.parse(fingerprint) as CanvasElement)
    dirty.current = false
    setDraft(draftRef.current)
  }, [fingerprint, editable])

  function nextDocument() {
    const {
      x,
      y,
      width,
      height,
      x2,
      y2,
      text,
      fontSize,
      name,
      color,
      fill,
      transparent,
      layerId,
      areaId,
      style,
      arrows,
      fromSide,
      toSide,
    } = draftRef.current
    const base = { color, layerId, areaId: areaId || null }
    if (element.type === 'connection') {
      return updateElement(document, element.id, {
        ...base,
        style,
        startArrow: arrows === 'start' || arrows === 'both',
        endArrow: arrows === 'end' || arrows === 'both',
        fromSide,
        toSide,
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
  }

  function applyDraft(report = true): boolean {
    if (!dirty.current) return true
    if (!editable) return false
    let next: CanvasDocument
    try {
      next = nextDocument()
    } catch (cause) {
      if (report)
        commit(() => {
          throw cause
        })
      return false
    }
    if (JSON.stringify(next.elements) === JSON.stringify(document.elements)) {
      dirty.current = false
      return true
    }
    const applied = commit(() => next)
    if (applied) dirty.current = false
    return applied
  }

  useLayoutEffect(() => {
    onDraftFlusherChange(() => applyDraft())
    return () => onDraftFlusherChange(null)
  })
  const autoApply = useRef(applyDraft)
  useLayoutEffect(() => {
    autoApply.current = applyDraft
  })
  useEffect(() => {
    if (!dirty.current) return
    const timer = setTimeout(() => autoApply.current(false), 300)
    return () => clearTimeout(timer)
  }, [draft])

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applyDraft()
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
      {!editable && <p className="inspector-notice">Layer hidden or locked.</p>}
      <form onSubmit={apply} onBlur={() => applyDraft()}>
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
              <NumberField label="X" value={x} onChange={setX} />
              <NumberField label="Y" value={y} onChange={setY} />
            </div>
          )}
          {'width' in element && (
            <div className="inspector-field-pair">
              <NumberField
                label="Width"
                value={width}
                onChange={setWidth}
                min={0}
              />
              <NumberField
                label="Height"
                value={height}
                onChange={setHeight}
                min={0}
              />
            </div>
          )}
          {element.type === 'line' && (
            <div className="inspector-field-pair">
              <NumberField label="End X" value={x2} onChange={setX2} />
              <NumberField label="End Y" value={y2} onChange={setY2} />
            </div>
          )}
          {'fontSize' in element && (
            <NumberField
              label="Font size"
              value={fontSize}
              onChange={setFontSize}
              min={8}
            />
          )}
          {element.type === 'connection' && (
            <>
              <div className="inspector-field-pair">
                {(['fromSide', 'toSide'] as const).map((key) => (
                  <label className="inspector-field" key={key}>
                    <span>
                      {key === 'fromSide' ? 'Source side' : 'Target side'}
                    </span>
                    <select
                      value={key === 'fromSide' ? fromSide : toSide}
                      onChange={(event) =>
                        change(key, event.target.value as ConnectionSide)
                      }
                    >
                      {CONNECTION_SIDES.map((side) => (
                        <option key={side} value={side}>
                          {side[0].toUpperCase() + side.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
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
  onDraftFlusherChange,
}: CanvasInspectorProps) {
  const prefix = useId()
  const [error, setError] = useState('')
  const [layerName, setLayerName] = useState('')
  const draftFlusher = useRef<(() => boolean) | null>(null)
  function registerDraftFlusher(flush: (() => boolean) | null) {
    draftFlusher.current = flush
    onDraftFlusherChange?.(flush)
  }
  function select(id: string | null) {
    draftFlusher.current?.()
    onSelect(id)
  }
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
      </header>
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
      {selected ? (
        <ElementProperties
          key={selected.id}
          element={selected}
          document={document}
          commit={commit}
          onSelect={select}
          onDraftFlusherChange={registerDraftFlusher}
        />
      ) : (
        <p className="inspector-empty">No selection</p>
      )}
      <section
        className="inspector-section"
        aria-labelledby={`${prefix}-layers`}
      >
        <div className="inspector-section-heading">
          <h3 id={`${prefix}-layers`} title="Front to back">
            Layers
          </h3>
        </div>
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
        {document.elements.length > 0 && (
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
                      onClick={() => select(element.id)}
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
