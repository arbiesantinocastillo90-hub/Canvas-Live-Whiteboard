import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  CONNECTION_SIDES,
  TEXT_FORMAT_KEYS,
  LINE_PATTERNS,
  type LinePattern,
  type CanvasDocument,
  type CanvasElement,
  type CanvasLayer,
  type ConnectionSide,
  type ConnectionElement,
  type TextFormat,
} from './lcanvas'
import {
  addLayer,
  isElementEditable,
  removeElement,
  reorderLayer,
  reverseConnection,
  updateElement,
  updateLayer,
} from './canvasOperations'
import {
  TextFormattingFields,
  ConnectionFormattingFields,
} from './CanvasRichProperties'
import CanvasQuickProperties from './CanvasQuickProperties'
import {
  CANVAS_LAYER_DRAG_MIME,
  canDropCanvasLayerItem,
  dropCanvasLayerItem,
  inspectorLayerElements,
  readCanvasLayerDrag,
  type CanvasLayerDrag,
  type LayerDropPosition,
} from './canvasLayerDrag'
import './canvas-inspector.css'

export type CanvasInspectorProps = {
  document: CanvasDocument
  selectedId: string | null
  selectedIds?: string[]
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
    linePattern: (element.type === 'line'
      ? (element.linePattern ?? 'solid')
      : 'solid') as LinePattern,
    textFormat: ('text' in element
      ? Object.fromEntries(
          TEXT_FORMAT_KEYS.filter((key) => Object.hasOwn(element, key)).map(
            (key) => [key, Reflect.get(element, key)],
          ),
        )
      : {}) as TextFormat,
    connectionFormat: (element.type === 'connection'
      ? {
          style: element.style,
          ...(element.linePattern ? { linePattern: element.linePattern } : {}),
          ...(element.startPointer
            ? { startPointer: element.startPointer }
            : {}),
          ...(element.endPointer ? { endPointer: element.endPointer } : {}),
          startArrow: element.startArrow,
          endArrow: element.endArrow,
        }
      : {}) as Partial<ConnectionElement>,
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
  expanded,
  onExpand,
  selectedIds,
  onSelect,
  dragging,
  dropPosition,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  layer: CanvasLayer
  document: CanvasDocument
  active: boolean
  commit: Commit
  onActiveLayerChange: (id: string) => void
  expanded: boolean
  onExpand: () => void
  selectedIds: ReadonlySet<string>
  onSelect: (id: string) => void
  dragging: CanvasLayerDrag | null
  dropPosition?: LayerDropPosition
  onDragStart: (event: DragEvent, item: CanvasLayerDrag) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>, layerId: string) => void
  onDrop: (event: DragEvent<HTMLElement>, layerId: string) => void
}) {
  const [name, setName] = useState(layer.name)
  const contentId = useId()
  const index = document.layers.findIndex((item) => item.id === layer.id)
  const elements = inspectorLayerElements(document, layer.id)
  const count = elements.length

  return (
    <li
      className="inspector-layer"
      data-layer-row={layer.id}
      data-active={active}
      data-drop-position={dropPosition}
      data-dragging={dragging?.kind === 'layer' && dragging.id === layer.id}
      onDragOver={(event) => onDragOver(event, layer.id)}
      onDrop={(event) => onDrop(event, layer.id)}
    >
      <div className="inspector-layer-heading">
        <button
          type="button"
          className="inspector-layer-grip"
          aria-label={`Drag layer ${layer.name}`}
          aria-description="Drag above or below another layer. Alt+Up or Alt+Down changes its position."
          title="Drag to reorder; Alt+Up / Alt+Down"
          draggable
          onDragStart={(event) =>
            onDragStart(event, { version: 1, kind: 'layer', id: layer.id })
          }
          onDragEnd={onDragEnd}
          onKeyDown={(event) => {
            if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key))
              return
            event.preventDefault()
            const nextIndex = index + (event.key === 'ArrowUp' ? 1 : -1)
            if (nextIndex >= 0 && nextIndex < document.layers.length)
              commit(() => reorderLayer(document, layer.id, nextIndex))
          }}
        >
          <LayerIcon>
            <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
          </LayerIcon>
        </button>
        <button
          type="button"
          className="inspector-layer-toggle"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} layer ${layer.name}`}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={onExpand}
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </button>
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
      </div>
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
      </div>
      <div
        className="inspector-layer-contents"
        data-expanded={expanded}
        id={contentId}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div className="inspector-layer-contents-inner">
          {elements.length ? (
            <ul
              className="inspector-object-list"
              aria-label={`Objects in ${layer.name}`}
            >
              {elements.map((element) => (
                <li
                  key={element.id}
                  data-dragging={
                    dragging?.kind === 'object' && dragging.id === element.id
                  }
                >
                  <button
                    type="button"
                    aria-pressed={selectedIds.has(element.id)}
                    aria-label={`Select ${objectName(element)} on ${layer.name}`}
                    title="Select to edit; drag to another visible, unlocked layer"
                    draggable={isElementEditable(document, element.id)}
                    onDragStart={(event) =>
                      onDragStart(event, {
                        version: 1,
                        kind: 'object',
                        id: element.id,
                      })
                    }
                    onDragEnd={onDragEnd}
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
              ))}
            </ul>
          ) : (
            <p className="inspector-layer-empty">
              No objects. Drop an object here to move it.
            </p>
          )}
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
        </div>
      </div>
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
    textFormat,
    connectionFormat,
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
  const editable = isElementEditable(document, element.id)
  const layer = document.layers.find((item) => item.id === element.layerId)
  const area = document.elements.find(
    (item) => item.id === element.areaId && item.type === 'area',
  )
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
      linePattern,
      textFormat,
      connectionFormat,
      fromSide,
      toSide,
    } = draftRef.current
    const base = { color, layerId, areaId: areaId || null }
    if (element.type === 'connection') {
      return updateElement(document, element.id, {
        ...base,
        ...connectionFormat,
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
        linePattern,
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
    if (element.type === 'embed')
      return updateElement(document, element.id, dimensions)
    const typography = {
      ...dimensions,
      ...textFormat,
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
          {element.type === 'line' && (
            <label className="inspector-field">
              <span>Line type</span>
              <select
                value={draft.linePattern}
                onChange={(event) =>
                  change('linePattern', event.target.value as LinePattern)
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
          {'fontSize' in element && (
            <NumberField
              label="Font size"
              value={fontSize}
              onChange={setFontSize}
              min={8}
            />
          )}
          {'text' in element && (
            <TextFormattingFields
              value={{
                ...textFormat,
                color,
                textAlign:
                  textFormat.textAlign ??
                  (element.type === 'text' ? 'left' : 'center'),
                verticalAlign:
                  textFormat.verticalAlign ??
                  (element.type === 'text' ? 'top' : 'middle'),
              }}
              onChange={(patch) =>
                change('textFormat', { ...textFormat, ...patch })
              }
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
              <ConnectionFormattingFields
                value={connectionFormat}
                onChange={(patch) =>
                  change('connectionFormat', { ...connectionFormat, ...patch })
                }
                onReverse={() => {
                  if (
                    commit(() => reverseConnection(nextDocument(), element.id))
                  )
                    dirty.current = false
                }}
              />
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
  selectedIds,
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
  const [layerDisclosure, setLayerDisclosure] = useState({
    closed: [] as string[],
    selectionKey: '',
  })
  const [dragging, setDragging] = useState<CanvasLayerDrag | null>(null)
  const dragRef = useRef<CanvasLayerDrag | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    layerId: string
    position: LayerDropPosition
  } | null>(null)
  const layerList = useRef<HTMLUListElement>(null)
  const layerPositions = useRef(new Map<string, number>())
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
  const currentSelectedIds = selectedIds ?? (selectedId ? [selectedId] : [])
  const selectedSet = new Set(currentSelectedIds)
  const selectedElements = document.elements.filter((element) =>
    selectedSet.has(element.id),
  )
  const selectedLayerKey = JSON.stringify(
    selectedElements.map((element) => [element.id, element.layerId]),
  )
  const selectedLayers = new Set(
    selectedElements.map((element) => element.layerId),
  )
  const closedLayers =
    layerDisclosure.selectionKey === selectedLayerKey
      ? layerDisclosure.closed
      : layerDisclosure.closed.filter((id) => !selectedLayers.has(id))
  function setClosedLayers(update: (closed: string[]) => string[]) {
    setLayerDisclosure((previous) => ({
      closed: update(
        previous.selectionKey === selectedLayerKey
          ? previous.closed
          : previous.closed.filter((id) => !selectedLayers.has(id)),
      ),
      selectionKey: selectedLayerKey,
    }))
  }
  const layerOrderKey = document.layers.map((layer) => layer.id).join('\0')
  const objectLayerKey = JSON.stringify(
    document.elements.map((element) => [element.id, element.layerId]),
  )
  useLayoutEffect(() => {
    const nextPositions = new Map<string, number>()
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const row of layerList.current?.querySelectorAll<HTMLElement>(
      '[data-layer-row]',
    ) ?? []) {
      const id = row.dataset.layerRow!
      const top = row.getBoundingClientRect().top
      const previous = layerPositions.current.get(id)
      if (
        !reducedMotion &&
        previous !== undefined &&
        previous !== top &&
        typeof row.animate === 'function'
      )
        row.animate(
          [
            { transform: `translateY(${previous - top}px)` },
            { transform: 'translateY(0)' },
          ],
          { duration: 180, easing: 'ease-out' },
        )
      nextPositions.set(id, top)
    }
    layerPositions.current = nextPositions
  }, [layerOrderKey, objectLayerKey])

  function finishDrag() {
    dragRef.current = null
    setDragging(null)
    setDropTarget(null)
  }
  function startDrag(event: DragEvent, item: CanvasLayerDrag) {
    event.stopPropagation()
    if (item.kind === 'object' && !isElementEditable(document, item.id)) {
      event.preventDefault()
      return
    }
    draftFlusher.current?.()
    event.dataTransfer.setData(CANVAS_LAYER_DRAG_MIME, JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'move'
    dragRef.current = item
    setDragging(item)
  }
  function dragOverLayer(event: DragEvent<HTMLElement>, layerId: string) {
    const item = dragRef.current
    if (!item || !canDropCanvasLayerItem(document, item, layerId)) {
      setDropTarget(null)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    const position =
      item.kind === 'object'
        ? 'inside'
        : event.clientY < bounds.top + bounds.height / 2
          ? 'before'
          : 'after'
    setDropTarget((previous) =>
      previous?.layerId === layerId && previous.position === position
        ? previous
        : { layerId, position },
    )
  }
  function dropOnLayer(event: DragEvent<HTMLElement>, layerId: string) {
    event.preventDefault()
    event.stopPropagation()
    const item = readCanvasLayerDrag(
      event.dataTransfer.getData(CANVAS_LAYER_DRAG_MIME),
      document,
    )
    const internal = dragRef.current
    if (
      !internal ||
      !item ||
      internal.kind !== item.kind ||
      internal.id !== item.id ||
      !canDropCanvasLayerItem(document, item, layerId)
    ) {
      finishDrag()
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const position =
      item.kind === 'object'
        ? 'inside'
        : event.clientY < bounds.top + bounds.height / 2
          ? 'before'
          : 'after'
    if (
      commit(() => dropCanvasLayerItem(document, item, layerId, position)) &&
      item.kind === 'object'
    ) {
      setClosedLayers((closed) => closed.filter((id) => id !== layerId))
      onActiveLayerChange(layerId)
    }
    finishDrag()
  }

  function commit(operation: () => CanvasDocument): boolean {
    try {
      const next = operation()
      if (next !== document) {
        for (const row of layerList.current?.querySelectorAll<HTMLElement>(
          '[data-layer-row]',
        ) ?? [])
          layerPositions.current.set(
            row.dataset.layerRow!,
            row.getBoundingClientRect().top,
          )
        onDocumentChange(next)
      }
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
      {selectedIds && selectedIds.length > 1 ? (
        <section className="inspector-section">
          <CanvasQuickProperties
            document={document}
            ids={selectedIds}
            onChange={onDocumentChange}
            onError={(message) => {
              setError(message)
              onError?.(message)
            }}
          />
        </section>
      ) : selected ? (
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
        <p className="inspector-help">
          Front to back. Drag layers to reorder; open a layer to move its
          objects.
        </p>
        <ul className="inspector-layers" ref={layerList}>
          {[...document.layers].reverse().map((layer) => (
            <LayerItem
              key={`${layer.id}:${layer.name}`}
              document={document}
              layer={layer}
              active={layer.id === activeLayerId}
              commit={commit}
              onActiveLayerChange={onActiveLayerChange}
              expanded={!closedLayers.includes(layer.id)}
              onExpand={() =>
                setClosedLayers((closed) =>
                  closed.includes(layer.id)
                    ? closed.filter((id) => id !== layer.id)
                    : [...closed, layer.id],
                )
              }
              selectedIds={selectedSet}
              onSelect={(id) => {
                setClosedLayers((closed) =>
                  closed.filter((entry) => entry !== layer.id),
                )
                select(id)
              }}
              dragging={dragging}
              dropPosition={
                dropTarget?.layerId === layer.id
                  ? dropTarget.position
                  : undefined
              }
              onDragStart={startDrag}
              onDragEnd={finishDrag}
              onDragOver={dragOverLayer}
              onDrop={dropOnLayer}
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
    </aside>
  )
}
