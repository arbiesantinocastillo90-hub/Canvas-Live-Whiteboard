import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  connectionEndpoints,
  elementBounds,
  type CanvasDocument,
  type CanvasElement,
  type CanvasViewport,
} from './lcanvas'
import {
  connectElements,
  createElement,
  isElementEditable,
  moveElement,
  orderedVisibleElements,
  removeElement,
  resizeElement,
} from './canvasOperations'
import { MAX_ZOOM, MIN_ZOOM, panBy, zoomAt } from './canvasViewport'
import {
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  sameDocument,
  undoEditorHistory,
  type EditorHistory,
} from './editorHistory'
import { CanvasInspector } from './CanvasInspector'
import {
  applyCanvasCommand,
  type CanvasCommandResult,
} from '../mcp/canvasCommands'
import type { BridgeCommand } from '../mcp/bridgeProtocol'
import { PANEL_LIMITS } from './layout'
import PanelResizeHandle from './PanelResizeHandle'
import {
  useCommandsEnabled,
  useRegisterCommands,
} from './workspaceCommandsContext'
import './canvas-viewer.css'
import './canvas-editor.css'

export type CanvasEditorProps = {
  document: CanvasDocument
  grid: 'dots' | 'lines' | 'none'
  aiOpen: boolean
  onToggleAI: () => void
  onDocumentChange: (document: CanvasDocument) => void
  rightInset?: number
  focusMode?: boolean
  onToggleFocus?: () => void
  onControllerReady?: (controller: CanvasEditorController | null) => void
  propertiesOpen?: boolean
  onPropertiesOpenChange?: (open: boolean) => void
  propertiesWidth?: number
  onPropertiesWidthChange?: (width: number) => void
  dockHost?: HTMLElement | null
  toolsOpen?: boolean
  onToolsOpenChange?: (open: boolean) => void
}

export type CanvasEditorController = {
  getDocument: () => CanvasDocument
  execute: (command: BridgeCommand) => CanvasCommandResult
}

type Mode = 'select' | 'pan' | 'connect'
type SizedType = 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'area'
type Gesture = {
  kind: 'pan' | 'move' | 'resize'
  pointerId: number
  x: number
  y: number
  history: EditorHistory
  elementId?: string
}

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function ObjectText({
  element,
  prefix,
  centered,
}: {
  element: Extract<CanvasElement, { text: string }>
  prefix: string
  centered: boolean
}) {
  const padding = centered ? 12 : 0
  const lines = element.text.split('\n')
  const x = element.x + (centered ? element.width / 2 : 0)
  const y = centered
    ? element.y +
      element.height / 2 -
      ((lines.length - 1) * element.fontSize * 1.3) / 2
    : element.y
  const clipId = `${prefix}-text`
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect
            x={element.x + padding}
            y={element.y + padding}
            width={Math.max(0, element.width - padding * 2)}
            height={Math.max(0, element.height - padding * 2)}
          />
        </clipPath>
      </defs>
      <text
        x={x}
        y={y}
        fill={element.color}
        fontSize={element.fontSize}
        fontFamily="'Segoe UI', system-ui, sans-serif"
        textAnchor={centered ? 'middle' : 'start'}
        dominantBaseline={centered ? 'middle' : 'text-before-edge'}
        clipPath={`url(#${clipId})`}
        xmlSpace="preserve"
      >
        {lines.map((line, index) => (
          <tspan
            key={index}
            x={x}
            dy={index === 0 ? 0 : element.fontSize * 1.3}
          >
            {line || '\u00a0'}
          </tspan>
        ))}
      </text>
    </g>
  )
}

export function EditorObject({
  document,
  element,
  prefix,
}: {
  document: CanvasDocument
  element: CanvasElement
  prefix: string
}) {
  const common = {
    stroke: element.color,
    strokeWidth: 2,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond': {
      const fill = element.fill ?? 'none'
      return (
        <>
          {element.type === 'rectangle' ? (
            <rect
              x={element.x}
              y={element.y}
              width={element.width}
              height={element.height}
              rx="6"
              fill={fill}
              {...common}
            />
          ) : element.type === 'ellipse' ? (
            <ellipse
              cx={element.x + element.width / 2}
              cy={element.y + element.height / 2}
              rx={element.width / 2}
              ry={element.height / 2}
              fill={fill}
              {...common}
            />
          ) : (
            <polygon
              points={`${element.x + element.width / 2},${element.y} ${element.x + element.width},${element.y + element.height / 2} ${element.x + element.width / 2},${element.y + element.height} ${element.x},${element.y + element.height / 2}`}
              fill={fill}
              {...common}
            />
          )}
          <ObjectText element={element} prefix={prefix} centered />
        </>
      )
    }
    case 'area':
      return (
        <>
          <rect
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            rx="12"
            fill={element.fill ?? 'none'}
            fillOpacity="0.3"
            strokeDasharray="7 5"
            {...common}
          />
          <text
            x={element.x + 14}
            y={element.y + 24}
            fill={element.color}
            fontFamily="'Segoe UI', system-ui, sans-serif"
            fontSize="14"
            pointerEvents="none"
          >
            {element.name}
          </text>
        </>
      )
    case 'text':
      return <ObjectText element={element} prefix={prefix} centered={false} />
    case 'line':
      return (
        <line
          x1={element.x}
          y1={element.y}
          x2={element.x2}
          y2={element.y2}
          {...common}
        />
      )
    case 'connection': {
      const { x1, y1, x2, y2 } = connectionEndpoints(document, element)
      const path =
        element.style === 'elbow'
          ? `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`
          : `M ${x1} ${y1} L ${x2} ${y2}`
      const start = `${prefix}-start`
      const end = `${prefix}-end`
      return (
        <>
          <defs>
            <marker
              id={start}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={element.color} />
            </marker>
            <marker
              id={end}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={element.color} />
            </marker>
          </defs>
          <path
            d={path}
            fill="none"
            markerStart={element.startArrow ? `url(#${start})` : undefined}
            markerEnd={element.endArrow ? `url(#${end})` : undefined}
            {...common}
          />
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth="16"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )
    }
  }
}

function objectLabel(element: CanvasElement) {
  return `${element.type} ${'text' in element && element.text ? element.text.slice(0, 80) : element.type === 'area' ? element.name : element.id}`
}

export default function CanvasEditor({
  document,
  grid,
  aiOpen,
  onToggleAI,
  onDocumentChange,
  rightInset = 0,
  focusMode = false,
  onToggleFocus,
  onControllerReady,
  propertiesOpen,
  onPropertiesOpenChange,
  propertiesWidth = PANEL_LIMITS.right.default,
  onPropertiesWidthChange,
  dockHost,
  toolsOpen = false,
  onToolsOpenChange,
}: CanvasEditorProps) {
  const dockMode = dockHost !== undefined
  const [history, setHistory] = useState(() => createEditorHistory(document))
  const currentHistory = useRef(history)
  const notified = useRef(document)
  const stage = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('select')
  const [spaceHeld, setSpaceHeld] = useState(false)
  const temporaryPan = useRef(false)
  const [localInspectorOpen, setLocalInspectorOpen] = useState(false)
  const inspectorOpen = propertiesOpen ?? localInspectorOpen
  const managedCommands = useCommandsEnabled()
  function setInspectorOpen(open: boolean) {
    if (onPropertiesOpenChange) onPropertiesOpenChange(open)
    else setLocalInspectorOpen(open)
  }
  const [layerId, setLayerId] = useState(document.layers[0].id)
  const [connectionSource, setConnectionSource] = useState<string | null>(null)
  const [arrowStyle, setArrowStyle] = useState<
    'end' | 'none' | 'both' | 'start'
  >('end')
  const [connectionStyle, setConnectionStyle] = useState<'straight' | 'elbow'>(
    'straight',
  )
  const [error, setError] = useState('')
  const prefix = useId().replace(/[^\w-]/gu, '')
  const board = history.present
  const view = board.viewport
  const visible = orderedVisibleElements(board)
  const selected = board.elements.find((element) => element.id === selectedId)
  const selectedVisible = visible.some((element) => element.id === selectedId)
  const activeLayerId = board.layers.some((layer) => layer.id === layerId)
    ? layerId
    : board.layers[0].id
  const selectedBounds = selected ? elementBounds(board, selected) : null
  const executeCommand = useRef<
    (command: BridgeCommand) => CanvasCommandResult
  >(() => {
    throw new Error('The canvas editor is not ready.')
  })
  const currentName = useRef(document.name)
  const controller = useRef<CanvasEditorController>({
    getDocument: () => {
      // A pointer preview is not a committed canvas change.
      const present =
        gesture.current?.history.present ?? currentHistory.current.present
      return present.name === currentName.current
        ? present
        : { ...present, name: currentName.current }
    },
    execute: (command) => executeCommand.current(command),
  })

  function openInspector() {
    if (aiOpen) onToggleAI()
    setInspectorOpen(true)
  }

  function showHistory(next: EditorHistory, committed = true) {
    const renamed =
      next.present.name === document.name
        ? next
        : { ...next, present: { ...next.present, name: document.name } }
    currentHistory.current = renamed
    setHistory(renamed)
    if (committed && !sameDocument(notified.current, renamed.present)) {
      notified.current = renamed.present
      onDocumentChange(renamed.present)
    }
  }

  function commit(next: CanvasDocument) {
    showHistory(commitEditorHistory(currentHistory.current, next))
    setError('')
  }

  function executeBridgeCommand(command: BridgeCommand): CanvasCommandResult {
    if (gesture.current) throw new Error('Finish the current drag first.')
    if (command.kind === 'undo' || command.kind === 'redo') {
      const before = controller.current.getDocument()
      showHistory(
        command.kind === 'undo'
          ? undoEditorHistory(currentHistory.current)
          : redoEditorHistory(currentHistory.current),
      )
      const after = controller.current.getDocument()
      const ids = new Set([
        ...before.elements.map((element) => element.id),
        ...after.elements.map((element) => element.id),
      ])
      const affectedIds = new Set(
        [...ids].filter(
          (id) =>
            JSON.stringify(
              before.elements.find((element) => element.id === id),
            ) !==
            JSON.stringify(after.elements.find((element) => element.id === id)),
        ),
      )
      for (const element of after.elements)
        if (
          element.type === 'connection' &&
          (affectedIds.has(element.fromId) || affectedIds.has(element.toId))
        )
          affectedIds.add(element.id)
      for (const [index, layer] of after.layers.entries())
        if (JSON.stringify(before.layers[index]) !== JSON.stringify(layer))
          affectedIds.add(layer.id)
      for (const layer of before.layers)
        if (!after.layers.some((candidate) => candidate.id === layer.id))
          affectedIds.add(layer.id)
      return {
        document: after,
        affectedIds: [...affectedIds],
        summary: sameDocument(before, after)
          ? `Nothing to ${command.kind}.`
          : command.kind === 'undo'
            ? 'Undid the latest canvas change.'
            : 'Redid the latest canvas change.',
      }
    }
    const result = applyCanvasCommand(controller.current.getDocument(), command)
    commit(result.document)
    return { ...result, document: controller.current.getDocument() }
  }

  useLayoutEffect(() => {
    currentName.current = document.name
    executeCommand.current = executeBridgeCommand
  })

  useEffect(() => {
    onControllerReady?.(controller.current)
    return () => onControllerReady?.(null)
  }, [onControllerReady])

  function safely(action: () => void) {
    try {
      action()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'This canvas change could not be completed.',
      )
    }
  }

  function center() {
    const bounds = stage.current?.getBoundingClientRect()
    return {
      x: Math.max(40, (bounds?.width ?? 600) - Math.max(0, rightInset)) / 2,
      y: (bounds?.height ?? 400) / 2,
    }
  }

  function changeView(viewport: CanvasViewport) {
    commit({ ...currentHistory.current.present, viewport })
  }

  function changeZoom(factor: number) {
    const viewport = currentHistory.current.present.viewport
    changeView(zoomAt(viewport, viewport.zoom * factor, center()))
  }

  function resetView() {
    const elements = orderedVisibleElements(currentHistory.current.present)
    if (!elements.length) {
      changeView({ x: 0, y: 0, zoom: 1 })
      return
    }
    const boxes = elements.map((element) =>
      elementBounds(currentHistory.current.present, element),
    )
    const minX = Math.min(...boxes.map((box) => box.x))
    const minY = Math.min(...boxes.map((box) => box.y))
    const maxX = Math.max(...boxes.map((box) => box.x + box.width))
    const maxY = Math.max(...boxes.map((box) => box.y + box.height))
    const bounds = stage.current?.getBoundingClientRect()
    const width = Math.max(40, (bounds?.width ?? 600) - Math.max(0, rightInset))
    const height = Math.max(1, bounds?.height ?? 400)
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(
          Math.max(1, width - 96) / Math.max(1, maxX - minX),
          Math.max(1, height - 96) / Math.max(1, maxY - minY),
        ),
      ),
    )
    changeView({
      x: Math.max(
        -1_000_000,
        Math.min(1_000_000, width / 2 - ((minX + maxX) / 2) * zoom),
      ),
      y: Math.max(
        -1_000_000,
        Math.min(1_000_000, height / 2 - ((minY + maxY) / 2) * zoom),
      ),
      zoom,
    })
  }

  function add(type: SizedType) {
    safely(() => {
      const document = currentHistory.current.present
      const viewport = document.viewport
      const middle = center()
      const width = type === 'area' ? 640 : type === 'text' ? 240 : 180
      const height = type === 'area' ? 400 : type === 'text' ? 80 : 110
      const offset =
        (document.elements.filter((element) => element.type !== 'connection')
          .length %
          5) *
        28
      const next = createElement(document, {
        type,
        x: (middle.x - viewport.x) / viewport.zoom - width / 2 + offset,
        y: (middle.y - viewport.y) / viewport.zoom - height / 2 + offset,
        width,
        height,
        layerId: activeLayerId,
      })
      commit(next)
      setSelectedId(next.elements.at(-1)?.id ?? null)
      setMode('select')
      setConnectionSource(null)
      if (type === 'text') openInspector()
    })
  }

  function beginGesture(
    event: PointerEvent,
    kind: Gesture['kind'],
    elementId?: string,
  ) {
    if (gesture.current || !stage.current) return
    gesture.current = {
      kind,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      history: currentHistory.current,
      elementId,
    }
    stage.current.focus({ preventScroll: true })
    stage.current.setPointerCapture?.(event.pointerId)
    setDragging(true)
  }

  function beginStage(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return
    if (
      mode === 'pan' ||
      temporaryPan.current ||
      event.button === 1 ||
      event.altKey
    )
      beginGesture(event, 'pan')
    else if (
      event.target === event.currentTarget ||
      event.target === event.currentTarget.querySelector('svg')
    ) {
      setSelectedId(null)
      if (mode !== 'connect') setConnectionSource(null)
      event.currentTarget.focus({ preventScroll: true })
    }
  }

  function chooseObject(id: string) {
    if (mode !== 'connect') {
      setSelectedId(id)
      return
    }
    const document = currentHistory.current.present
    const object = document.elements.find((element) => element.id === id)
    if (!object || object.type === 'connection' || object.type === 'line') {
      setError('Choose a shape, text item, or area as a connection endpoint.')
      return
    }
    if (!connectionSource) {
      setConnectionSource(id)
      setSelectedId(id)
      return
    }
    safely(() => {
      const next = connectElements(document, connectionSource, id, {
        layerId: activeLayerId,
        style: connectionStyle,
        startArrow: arrowStyle === 'both' || arrowStyle === 'start',
        endArrow: arrowStyle === 'both' || arrowStyle === 'end',
      })
      commit(next)
      setSelectedId(next.elements.at(-1)?.id ?? null)
      setConnectionSource(null)
      setMode('select')
    })
  }

  function beginObject(
    event: PointerEvent<SVGGElement>,
    element: CanvasElement,
  ) {
    if (event.button !== 0 && event.button !== 1) return
    if (
      mode === 'pan' ||
      temporaryPan.current ||
      event.button === 1 ||
      event.altKey
    )
      return
    event.stopPropagation()
    chooseObject(element.id)
    if (
      mode === 'connect' ||
      element.type === 'connection' ||
      !isElementEditable(currentHistory.current.present, element.id)
    )
      return
    beginGesture(event, 'move', element.id)
  }

  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const original = active.history.present
    const dx = event.clientX - active.x
    const dy = event.clientY - active.y
    safely(() => {
      let present: CanvasDocument
      if (active.kind === 'pan')
        present = { ...original, viewport: panBy(original.viewport, dx, dy) }
      else {
        const element = original.elements.find(
          (item) => item.id === active.elementId,
        )
        if (!element || element.type === 'connection') return
        const bounds = elementBounds(original, element)
        present =
          active.kind === 'move'
            ? moveElement(
                original,
                element.id,
                element.x + dx / original.viewport.zoom,
                element.y + dy / original.viewport.zoom,
              )
            : resizeElement(
                original,
                element.id,
                Math.max(24, bounds.width + dx / original.viewport.zoom),
                Math.max(24, bounds.height + dy / original.viewport.zoom),
              )
      }
      showHistory({ ...active.history, present }, false)
    })
  }

  function endGesture(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    showHistory(
      cancelled
        ? active.history
        : commitEditorHistory(active.history, currentHistory.current.present),
    )
    setDragging(false)
    if (stage.current?.hasPointerCapture?.(event.pointerId))
      stage.current.releasePointerCapture(event.pointerId)
  }

  function navigateByKey(event: KeyboardEvent<HTMLElement | SVGElement>) {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      gesture.current ||
      (event.target instanceof Element &&
        Boolean(
          event.target.closest('[contenteditable="true"], [role="textbox"]'),
        )) ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    )
      return
    const modifier = event.ctrlKey || event.metaKey
    if (
      managedCommands &&
      ((modifier && ['z', 'y', 'd'].includes(event.key.toLowerCase())) ||
        ['Delete', 'Backspace', '+', '=', '-', '_', '0'].includes(event.key))
    )
      return
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      showHistory(
        event.shiftKey
          ? redoEditorHistory(currentHistory.current)
          : undoEditorHistory(currentHistory.current),
      )
      return
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      showHistory(redoEditorHistory(currentHistory.current))
      return
    }
    if (modifier || event.altKey) return
    if (event.key === ' ') {
      event.preventDefault()
      if (!event.repeat) {
        temporaryPan.current = true
        setSpaceHeld(true)
      }
      return
    }
    if (event.key === 'Escape') {
      setSelectedId(null)
      setConnectionSource(null)
      setMode('select')
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
      event.preventDefault()
      safely(() =>
        commit(removeElement(currentHistory.current.present, selected.id)),
      )
      return
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      changeZoom(1.2)
      return
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      changeZoom(1 / 1.2)
      return
    }
    if (event.key === '0') {
      event.preventDefault()
      resetView()
      return
    }
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault()
      const step = event.shiftKey ? 20 : 5
      const dx =
        event.key === 'ArrowLeft'
          ? -step
          : event.key === 'ArrowRight'
            ? step
            : 0
      const dy =
        event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      if (
        selected &&
        selected.type !== 'connection' &&
        isElementEditable(currentHistory.current.present, selected.id)
      ) {
        const bounds = elementBounds(currentHistory.current.present, selected)
        safely(() =>
          commit(
            moveElement(
              currentHistory.current.present,
              selected.id,
              bounds.x + dx,
              bounds.y + dy,
            ),
          ),
        )
      } else
        changeView(
          panBy(currentHistory.current.present.viewport, -dx * 12, -dy * 12),
        )
    }
  }

  useEffect(() => {
    function releaseSpace(event: globalThis.KeyboardEvent) {
      if (event.key !== ' ') return
      temporaryPan.current = false
      setSpaceHeld(false)
    }
    function release() {
      temporaryPan.current = false
      setSpaceHeld(false)
    }
    window.addEventListener('keyup', releaseSpace)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keyup', releaseSpace)
      window.removeEventListener('blur', release)
    }
  }, [])

  useEffect(() => {
    const surface = stage.current
    if (!surface) return
    function wheel(event: WheelEvent) {
      event.preventDefault()
      if (gesture.current || !surface) return
      const bounds = surface.getBoundingClientRect()
      const present = currentHistory.current.present
      const viewport = zoomAt(
        present.viewport,
        present.viewport.zoom *
          Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002),
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      )
      const next = commitEditorHistory(currentHistory.current, {
        ...present,
        name: document.name,
        viewport,
      })
      currentHistory.current = next
      setHistory(next)
      if (!sameDocument(notified.current, next.present)) {
        notified.current = next.present
        onDocumentChange(next.present)
      }
    }
    surface.addEventListener('wheel', wheel, { passive: false })
    return () => surface.removeEventListener('wheel', wheel)
  }, [document.name, onDocumentChange])

  function runCanvas(action: () => void) {
    if (gesture.current) return
    safely(action)
    stage.current?.focus()
  }
  function duplicateSelected() {
    if (
      !selected ||
      !isElementEditable(currentHistory.current.present, selected.id)
    )
      return
    const { id, ...copy } = selected
    void id
    const shifted =
      copy.type === 'connection'
        ? copy
        : copy.type === 'line'
          ? {
              ...copy,
              x: copy.x + 24,
              y: copy.y + 24,
              x2: copy.x2 + 24,
              y2: copy.y2 + 24,
            }
          : { ...copy, x: copy.x + 24, y: copy.y + 24 }
    const next = createElement(currentHistory.current.present, shifted)
    commit(next)
    setSelectedId(next.elements[next.elements.length - 1].id)
  }
  const commandAvailable = !dragging
  useRegisterCommands([
    {
      id: 'canvas.select',
      label: 'Select tool',
      category: 'Canvas',
      execute: () =>
        runCanvas(() => {
          setMode('select')
          setConnectionSource(null)
        }),
      enabled: commandAvailable,
      scope: 'canvas',
    },
    {
      id: 'canvas.pan',
      label: 'Pan tool',
      category: 'Canvas',
      execute: () =>
        runCanvas(() => {
          setMode('pan')
          setConnectionSource(null)
        }),
      enabled: commandAvailable,
      scope: 'canvas',
    },
    ...(['rectangle', 'ellipse', 'diamond', 'text', 'area'] as const).map(
      (type) => ({
        id: `canvas.${type}` as const,
        label: `Add ${type}`,
        category: 'Canvas',
        execute: () => runCanvas(() => add(type)),
        enabled: commandAvailable,
        scope: 'canvas' as const,
      }),
    ),
    {
      id: 'canvas.connection',
      label: 'Connection tool',
      category: 'Canvas',
      execute: () =>
        runCanvas(() => {
          setMode('connect')
          setConnectionSource(null)
        }),
      enabled: commandAvailable,
      scope: 'canvas',
    },
    {
      id: 'canvas.undo',
      label: 'Undo',
      category: 'Canvas',
      execute: () =>
        runCanvas(() => showHistory(undoEditorHistory(currentHistory.current))),
      enabled: commandAvailable && history.past.length > 0,
      scope: 'canvas',
    },
    {
      id: 'canvas.redo',
      label: 'Redo',
      category: 'Canvas',
      execute: () =>
        runCanvas(() => showHistory(redoEditorHistory(currentHistory.current))),
      enabled: commandAvailable && history.future.length > 0,
      scope: 'canvas',
    },
    {
      id: 'canvas.delete',
      label: 'Delete selected object',
      category: 'Canvas',
      execute: () =>
        runCanvas(() => {
          if (selected)
            commit(removeElement(currentHistory.current.present, selected.id))
        }),
      enabled:
        commandAvailable &&
        Boolean(selected && isElementEditable(board, selected.id)),
      scope: 'canvas',
    },
    {
      id: 'canvas.duplicate',
      label: 'Duplicate selected object',
      category: 'Canvas',
      execute: () => runCanvas(duplicateSelected),
      enabled:
        commandAvailable &&
        Boolean(selected && isElementEditable(board, selected.id)),
      scope: 'canvas',
    },
    {
      id: 'canvas.zoomIn',
      label: 'Zoom in',
      category: 'View',
      execute: () => runCanvas(() => changeZoom(1.2)),
      enabled: commandAvailable && view.zoom < MAX_ZOOM,
      scope: 'canvas',
    },
    {
      id: 'canvas.zoomOut',
      label: 'Zoom out',
      category: 'View',
      execute: () => runCanvas(() => changeZoom(1 / 1.2)),
      enabled: commandAvailable && view.zoom > MIN_ZOOM,
      scope: 'canvas',
    },
    {
      id: 'canvas.resetView',
      label: 'Reset canvas view',
      category: 'View',
      execute: () => runCanvas(resetView),
      enabled: commandAvailable,
      scope: 'canvas',
    },
    {
      id: 'canvas.fitView',
      label: 'Fit canvas content',
      category: 'View',
      execute: () => runCanvas(resetView),
      enabled: commandAvailable,
      scope: 'canvas',
    },
    {
      id: 'canvas.toggleProperties',
      label: 'Toggle Properties',
      category: 'Panels',
      execute: () =>
        runCanvas(() => {
          if (inspectorOpen) setInspectorOpen(false)
          else openInspector()
        }),
      enabled: commandAvailable,
    },
    {
      id: 'canvas.focus',
      label: 'Toggle full screen canvas',
      category: 'View',
      execute: () =>
        runCanvas(() => {
          if (propertiesOpen === undefined && !focusMode)
            setInspectorOpen(false)
          onToggleFocus?.()
        }),
      enabled: commandAvailable && Boolean(onToggleFocus),
    },
  ])
  const gridStyle = {
    '--canvas-grid-size': `${(view.zoom < 0.5 ? 120 : 24) * view.zoom}px`,
    '--canvas-grid-x': `${view.x}px`,
    '--canvas-grid-y': `${view.y}px`,
  } as CSSProperties
  const inspector = (
    <CanvasInspector
      document={board}
      selectedId={selected?.id ?? null}
      activeLayerId={activeLayerId}
      onSelect={setSelectedId}
      onActiveLayerChange={setLayerId}
      onDocumentChange={(next) => safely(() => commit(next))}
      onError={setError}
    />
  )
  const connectionOptions = (
    <div className="canvas-connection-options">
      <span>
        {connectionSource
          ? 'Choose the target object'
          : 'Choose the source object'}
      </span>
      <label>
        Arrows
        <select
          aria-label="New connection arrows"
          value={arrowStyle}
          onChange={(event) =>
            setArrowStyle(event.target.value as typeof arrowStyle)
          }
        >
          <option value="end">End arrow</option>
          <option value="none">No arrows</option>
          <option value="both">Both arrows</option>
          <option value="start">Start arrow</option>
        </select>
      </label>
      <label>
        Path
        <select
          aria-label="New connection path"
          value={connectionStyle}
          onChange={(event) =>
            setConnectionStyle(event.target.value as typeof connectionStyle)
          }
        >
          <option value="straight">Straight</option>
          <option value="elbow">Elbow</option>
        </select>
      </label>
    </div>
  )
  const drawingTools = (
    <div
      className="canvas-edit-toolbar"
      role="toolbar"
      aria-label={dockMode ? 'Canvas tools' : 'Drawing tools'}
    >
      <button
        type="button"
        aria-label="Select objects"
        aria-pressed={mode === 'select'}
        onClick={() => {
          setMode('select')
          setConnectionSource(null)
        }}
        title={dockMode ? 'Select objects' : 'Select and move objects'}
      >
        <ToolIcon>
          <path d="M5 3v17l5-5 4 7 3-2-4-7h7Z" />
        </ToolIcon>
        {!dockMode && <span>Select</span>}
      </button>
      <button
        type="button"
        aria-label="Pan canvas"
        aria-pressed={mode === 'pan'}
        onClick={() => {
          setMode('pan')
          setConnectionSource(null)
        }}
        title={
          dockMode ? 'Pan canvas' : 'Drag canvas · Middle mouse / Alt also pans'
        }
      >
        <ToolIcon>
          <path d="M8 13V6a2 2 0 0 1 4 0v6-9a2 2 0 0 1 4 0v10-6a2 2 0 0 1 4 0v9c0 4-3 6-7 6-3 0-5-2-7-4l-3-4a2 2 0 0 1 3-3l2 2Z" />
        </ToolIcon>
        {!dockMode && <span>Pan</span>}
      </button>
      <span className="canvas-tool-divider" />
      <button
        type="button"
        aria-label="Add rectangle"
        title="Add rectangle"
        onClick={() => add('rectangle')}
      >
        <ToolIcon>
          <rect x="3" y="5" width="18" height="14" rx="2" />
        </ToolIcon>
      </button>
      <button
        type="button"
        aria-label="Add ellipse"
        title="Add ellipse"
        onClick={() => add('ellipse')}
      >
        <ToolIcon>
          <ellipse cx="12" cy="12" rx="9" ry="7" />
        </ToolIcon>
      </button>
      <button
        type="button"
        aria-label="Add diamond"
        title="Add diamond"
        onClick={() => add('diamond')}
      >
        <ToolIcon>
          <path d="m12 3 9 9-9 9-9-9Z" />
        </ToolIcon>
      </button>
      <button
        type="button"
        aria-label="Add text"
        title="Add text"
        onClick={() => add('text')}
      >
        <ToolIcon>
          <path d="M4 5h16M12 5v15M8 20h8" />
        </ToolIcon>
      </button>
      <button
        type="button"
        aria-label="Add area"
        title="Add containment area"
        onClick={() => add('area')}
      >
        <ToolIcon>
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="3"
            strokeDasharray="3 3"
          />
          <path d="M8 8h8v8H8Z" />
        </ToolIcon>
      </button>
      <button
        type="button"
        aria-label="Connect objects"
        aria-pressed={mode === 'connect'}
        title={
          dockMode ? 'Connect objects' : 'Choose a source object, then a target'
        }
        onClick={() => {
          setMode('connect')
          setConnectionSource(null)
        }}
      >
        <ToolIcon>
          <path d="M3 17h7V7h11m-4-4 4 4-4 4" />
        </ToolIcon>
      </button>
      {!dockMode && (
        <>
          <span className="canvas-tool-divider" />
          <button
            type="button"
            className="canvas-properties-toggle"
            aria-label={
              inspectorOpen
                ? 'Close object properties'
                : 'Open object properties'
            }
            aria-expanded={inspectorOpen}
            onClick={() => {
              if (inspectorOpen) setInspectorOpen(false)
              else openInspector()
            }}
          >
            <ToolIcon>
              <path d="M4 7h16M4 17h16" />
              <circle cx="9" cy="7" r="3" />
              <circle cx="15" cy="17" r="3" />
            </ToolIcon>
            <span>Properties</span>
          </button>
        </>
      )}
    </div>
  )
  return (
    <section
      className={`canvas-editor${inspectorOpen ? ' has-inspector' : ''}`}
      aria-label="LCANVAS editor"
      data-canvas-root
      data-dock-mode={dockMode}
    >
      {!dockMode && drawingTools}
      {dockMode &&
        dockHost &&
        createPortal(
          <div className="canvas-tools-panel" hidden={!toolsOpen}>
            {drawingTools}
            {mode === 'connect' && connectionOptions}
          </div>,
          dockHost,
        )}
      {dockMode &&
        dockHost &&
        createPortal(
          <div className="canvas-properties-panel" hidden={!inspectorOpen}>
            {inspector}
          </div>,
          dockHost,
        )}
      <div className="canvas-editor-body">
        <div
          ref={stage}
          className="lcanvas-stage canvas-edit-stage"
          data-grid={grid}
          data-dragging={dragging}
          data-mode={spaceHeld ? 'pan' : mode}
          style={gridStyle}
          tabIndex={0}
          role="region"
          aria-label={`${document.name} canvas view`}
          aria-describedby={`${prefix}-instructions`}
          onPointerDown={beginStage}
          onPointerMove={moveGesture}
          onPointerUp={endGesture}
          onPointerCancel={(event) => endGesture(event, true)}
          onLostPointerCapture={(event) => endGesture(event)}
          onKeyDown={navigateByKey}
          onBlurCapture={(event) => {
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              temporaryPan.current = false
              setSpaceHeld(false)
            }
          }}
        >
          <svg
            className="lcanvas-drawing"
            aria-label={`${document.name}: ${visible.length} visible objects`}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
              {visible.map((element, index) => {
                const bounds = elementBounds(board, element)
                return (
                  <g
                    key={element.id}
                    role="button"
                    tabIndex={0}
                    aria-label={objectLabel(element)}
                    aria-pressed={selectedId === element.id}
                    data-element-id={element.id}
                    data-layer-id={element.layerId}
                    data-area-id={element.areaId ?? ''}
                    data-editable={isElementEditable(board, element.id)}
                    className="canvas-edit-object"
                    onPointerDown={(event) => beginObject(event, element)}
                    onKeyDown={(event) => {
                      if (event.key === ' ') {
                        navigateByKey(event)
                        return
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.stopPropagation()
                        chooseObject(element.id)
                      }
                    }}
                    onDoubleClick={() => {
                      setSelectedId(element.id)
                      openInspector()
                    }}
                  >
                    {element.type !== 'connection' &&
                      element.type !== 'line' && (
                        <rect
                          className="canvas-object-hit"
                          x={bounds.x}
                          y={bounds.y}
                          width={bounds.width}
                          height={bounds.height}
                          fill="transparent"
                        />
                      )}
                    <EditorObject
                      document={board}
                      element={element}
                      prefix={`${prefix}-${index}`}
                    />
                  </g>
                )
              })}
              {selected && selectedVisible && selectedBounds && (
                <g className="canvas-selection">
                  <rect
                    x={selectedBounds.x - 4 / view.zoom}
                    y={selectedBounds.y - 4 / view.zoom}
                    width={selectedBounds.width + 8 / view.zoom}
                    height={selectedBounds.height + 8 / view.zoom}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                  {selected.type !== 'connection' &&
                    selected.type !== 'line' &&
                    isElementEditable(board, selected.id) && (
                      <rect
                        className="canvas-resize-handle"
                        role="button"
                        aria-label="Resize selected object"
                        x={
                          selectedBounds.x +
                          selectedBounds.width -
                          6 / view.zoom
                        }
                        y={
                          selectedBounds.y +
                          selectedBounds.height -
                          6 / view.zoom
                        }
                        width={12 / view.zoom}
                        height={12 / view.zoom}
                        rx={2 / view.zoom}
                        fill="var(--accent)"
                        stroke="var(--panel)"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(event) => {
                          if (event.button !== 0) return
                          event.stopPropagation()
                          beginGesture(event, 'resize', selected.id)
                        }}
                      />
                    )}
                </g>
              )}
            </g>
          </svg>
          {!board.elements.length && (
            <div className="lcanvas-empty" aria-hidden="true">
              <span className="lcanvas-empty-symbol">＋</span>
              {!dockMode && (
                <>
                  <h2>Space for your next idea.</h2>
                  <p>
                    Add a shape, a note, or an area using the toolbar above.
                  </p>
                  <small>
                    Double-click an object to edit its text and properties.
                  </small>
                </>
              )}
            </div>
          )}
          {!dockMode && mode === 'connect' && connectionOptions}
          {error && (
            <div className="canvas-edit-error" role="alert">
              {error}
              <button
                type="button"
                aria-label="Dismiss canvas error"
                onClick={() => setError('')}
              >
                ×
              </button>
            </div>
          )}
        </div>
        {!dockMode && inspectorOpen && (
          <div
            className="canvas-inspector-slot"
            style={
              { '--right-panel-width': `${propertiesWidth}px` } as CSSProperties
            }
          >
            {onPropertiesWidthChange && (
              <PanelResizeHandle
                label="Resize right panel"
                value={propertiesWidth}
                min={PANEL_LIMITS.right.min}
                max={PANEL_LIMITS.right.max}
                defaultValue={PANEL_LIMITS.right.default}
                edge="left"
                onChange={onPropertiesWidthChange}
              />
            )}
            {inspector}
          </div>
        )}
      </div>
      <div
        className="canvas-view-rail"
        role="toolbar"
        aria-label="Canvas controls"
      >
        <button
          type="button"
          aria-label="Undo"
          title="Undo edit or view change (Ctrl+Z)"
          disabled={!history.past.length || dragging}
          onClick={() => showHistory(undoEditorHistory(currentHistory.current))}
        >
          <ToolIcon>
            <path d="m8 6-5 5 5 5M3 11h10a7 7 0 0 1 7 7" />
          </ToolIcon>
        </button>
        <button
          type="button"
          aria-label="Reset view"
          title="Fit visible objects (0)"
          disabled={dragging}
          onClick={resetView}
        >
          <ToolIcon>
            <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
            <rect x="8" y="8" width="8" height="8" rx="1" />
          </ToolIcon>
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo edit or view change (Ctrl+Shift+Z)"
          disabled={!history.future.length || dragging}
          onClick={() => showHistory(redoEditorHistory(currentHistory.current))}
        >
          <ToolIcon>
            <path d="m16 6 5 5-5 5m5-5H11a7 7 0 0 0-7 7" />
          </ToolIcon>
        </button>
        <span className="canvas-rail-divider" />
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          disabled={view.zoom >= MAX_ZOOM || dragging}
          onClick={() => changeZoom(1.2)}
        >
          <ToolIcon>
            <path d="M12 5v14M5 12h14" />
          </ToolIcon>
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (−)"
          disabled={view.zoom <= MIN_ZOOM || dragging}
          onClick={() => changeZoom(1 / 1.2)}
        >
          <ToolIcon>
            <path d="M5 12h14" />
          </ToolIcon>
        </button>
        {onToggleFocus && (
          <>
            <span className="canvas-rail-divider" />
            <button
              type="button"
              aria-label={focusMode ? 'Exit full screen' : 'Full screen canvas'}
              aria-pressed={focusMode}
              title={focusMode ? 'Exit full screen' : 'Focus on this canvas'}
              onClick={() => {
                if (!focusMode && propertiesOpen === undefined)
                  setInspectorOpen(false)
                onToggleFocus()
              }}
            >
              <ToolIcon>
                {focusMode ? (
                  <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5" />
                ) : (
                  <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
                )}
              </ToolIcon>
            </button>
          </>
        )}
        <span className="canvas-rail-spacer" />
        {dockMode && (
          <>
            <button
              type="button"
              aria-label="Open canvas tools"
              aria-expanded={toolsOpen}
              title="Canvas tools and shapes"
              data-dock-trigger="right"
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') onToolsOpenChange?.(true)
              }}
              onClick={() => onToolsOpenChange?.(true)}
            >
              <ToolIcon>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <circle cx="17" cy="6.5" r="3.5" />
                <path d="m6.5 14 4 4-4 4-4-4Z" />
                <path d="M14 18h7" />
              </ToolIcon>
            </button>
            <button
              type="button"
              aria-label="Open object properties"
              aria-expanded={inspectorOpen}
              title="Object properties and layers"
              data-dock-trigger="right"
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') openInspector()
              }}
              onClick={openInspector}
            >
              <ToolIcon>
                <path d="M4 7h16M4 17h16" />
                <circle cx="9" cy="7" r="3" />
                <circle cx="15" cy="17" r="3" />
              </ToolIcon>
            </button>
          </>
        )}
        <button
          type="button"
          className={aiOpen ? 'canvas-ai-toggle active' : 'canvas-ai-toggle'}
          aria-label={
            aiOpen ? 'Close AI workspace panel' : 'Open AI workspace panel'
          }
          aria-expanded={aiOpen}
          aria-controls="workspace-ai-panel"
          data-dock-trigger={dockMode ? 'right' : undefined}
          title="Workspace AI / MCP"
          onClick={() => {
            setInspectorOpen(false)
            onToggleAI()
          }}
        >
          <ToolIcon>
            <rect x="4" y="7" width="16" height="13" rx="4" />
            <path d="M12 7V3m-2 0h4M8 12h.01M16 12h.01M9 16h6" />
          </ToolIcon>
        </button>
      </div>
      <div className="canvas-view-status">
        <p id={`${prefix}-instructions`}>
          {mode === 'pan'
            ? 'Drag to pan'
            : mode === 'connect'
              ? 'Choose two shapes to connect'
              : 'Drag to move · Corner to resize · Double-click to edit'}{' '}
          · Scroll to zoom
        </p>
        <span>
          {selected
            ? `${selected.type} · ${board.layers.find((layer) => layer.id === selected.layerId)?.name ?? 'Layer'}`
            : `${visible.length} objects`}
        </span>
        <output aria-label="Canvas zoom" aria-live="polite">
          {Math.round(view.zoom * 100)}%
        </output>
      </div>
    </section>
  )
}
