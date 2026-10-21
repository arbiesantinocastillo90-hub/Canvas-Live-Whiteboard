import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  elementBounds,
  type CanvasDocument,
  type CanvasElement,
  type CanvasViewport,
  type ConnectionSide,
  type ConnectionStyle,
  type ConnectionElement,
  connectionEndpoints,
  type ShapeType,
  type EmbedKind,
  type EmbedElement,
  SHAPE_TYPES,
} from './lcanvas'
import {
  connectElements,
  createElement,
  isElementEditable,
  orderedVisibleElements,
  reconnectConnection,
  updateElement,
} from './canvasOperations'
import {
  moveSelection,
  removeSelection,
  resizeSelection,
  selectionBounds,
  selectionIds,
} from './canvasSelection'
import {
  CANVAS_CLIPBOARD_MIME,
  createCanvasClipboard,
  duplicateSelection,
  isCanvasClipboard,
  pasteCanvasClipboard,
  pasteCanvasText,
} from './canvasClipboard'
import { MAX_ZOOM, MIN_ZOOM, panBy, zoomAt } from './canvasViewport'
import {
  commitEditorHistory,
  createEditorHistory,
  navigateEditorHistory,
  redoEditorContentHistory,
  sameDocument,
  undoEditorContentHistory,
  type EditorHistory,
} from './editorHistory'
import { CanvasInspector } from './CanvasInspector'
import {
  adaptCanvasText,
  DEFAULT_TEXT_OPTIONS,
  growCanvasText,
  layoutCanvasText,
  type TextLayoutOptions,
} from './canvasText'
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
import './smart-text.css'
import CanvasRulers from './CanvasRulers'
import CanvasBackdrop from './CanvasBackdrop'
import { useCanvasDeck } from './canvasDeck'
import {
  DEFAULT_CANVAS_CONTROLS,
  formatCanvasZoom,
  isWithinSelection,
  normalizeCanvasControls,
  selectionColor,
  snapCoordinate,
  snapResizeDelta,
  snapSelectionDelta,
  type CanvasControlSettings,
} from './canvasControls'
import './canvas-precision.css'
import { ShapeOutline, CanvasObjectText, ConnectionDrawing } from './RichObject'
import { lineDash } from './canvasDrawing'
import EmbedObject from './EmbedObject'
import CanvasQuickProperties from './CanvasQuickProperties'
import CanvasEmbedInsert from './CanvasEmbedInsert'
import { useCanvasMedia } from './canvasMedia'
import {
  snapMoveToObjects,
  snapResizeToObjects,
  type ObjectSnapGuide,
} from './canvasObjectSnapping'
import { canvasFontFamily, canvasTextPlacement } from './canvasText'
import './canvas-quick-panel.css'
import CanvasAiPresence from './CanvasAiPresence'
import type { CanvasAiPresenceEvent } from './canvasAiPresenceState'
import type { AiMiniSettings } from './useAiMiniSettings'

export type CanvasEditorProps = {
  active?: boolean
  allowBackgroundCommands?: boolean
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
  dockSide?: 'left' | 'right'
  initialSession?: EditorSession
  onSessionChange?: (session: EditorSession) => void
  initialViewState?: EditorViewState
  onStatusChange?: (status: CanvasEditorStatus) => void
  onViewStateChange?: (state: EditorViewState) => void
  statusInFooter?: boolean
  textOptions?: TextLayoutOptions
  controlOptions?: CanvasControlSettings
  aiPresence?: CanvasAiPresenceEvent | null
  aiMiniSettings?: AiMiniSettings
  aiClient?: string | null
  reduceMotion?: boolean
}

export type EditorSession = { tool: string; activeLayerId: string | null }
export type EditorViewState = EditorSession & {
  viewport: CanvasViewport
  selectedIds: string[]
  connection?: {
    arrowStyle: 'end' | 'none' | 'both' | 'start'
    style: ConnectionStyle
    sourceSide: ConnectionSide | 'fixed'
    targetSide: ConnectionSide | 'fixed'
  }
}
export type CanvasEditorStatus = {
  instructions: string
  selection: string | null
  visibleCount: number
  zoom: number
}

export type CanvasEditorController = {
  getDocument: () => CanvasDocument
  getViewState: () => EditorViewState
  execute: (command: BridgeCommand) => CanvasCommandResult
  flushDraft?: () => void
}

type Mode = 'select' | 'pan' | 'connect'
type SizedType = ShapeType | 'text' | 'area'
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type Point = { x: number; y: number }
type Box = Point & { width: number; height: number }

function intersectsAreaBorder(area: Box, selection: Box) {
  const right = selection.x + selection.width
  const bottom = selection.y + selection.height
  const areaRight = area.x + area.width
  const areaBottom = area.y + area.height
  const crossesVertical = bottom >= area.y && selection.y <= areaBottom
  const crossesHorizontal = right >= area.x && selection.x <= areaRight
  return (
    (crossesVertical &&
      ((selection.x <= area.x && right >= area.x) ||
        (selection.x <= areaRight && right >= areaRight))) ||
    (crossesHorizontal &&
      ((selection.y <= area.y && bottom >= area.y) ||
        (selection.y <= areaBottom && bottom >= areaBottom)))
  )
}
type PointerSample = Point & { shiftKey: boolean; altKey: boolean }
type InlineEdit = { id: string; value: string; original: string }
type Gesture = {
  kind: 'pan' | 'move' | 'resize' | 'marquee' | 'connect' | 'reconnect'
  pointerId: number
  x: number
  y: number
  history: EditorHistory
  ids: string[]
  handle?: ResizeHandle
  bounds?: Box | null
  selectionBefore: string[]
  copyOnDrag?: boolean
  copyDocument?: CanvasDocument
  copyIds?: string[]
  fromSide?: ConnectionSide
  endpoint?: 'start' | 'end'
  reconnectTarget?: {
    id: string
    side: ConnectionSide
    document: CanvasDocument
  }
}

type ReconnectionPreview = {
  document: CanvasDocument
  element: ConnectionElement
  target: { id: string; side: ConnectionSide; point: Point } | null
  floatingId?: string
}

const resizeHandles: {
  id: ResizeHandle
  x: number
  y: number
  label: string
}[] = [
  { id: 'nw', x: 0, y: 0, label: 'top left' },
  { id: 'n', x: 0.5, y: 0, label: 'top' },
  { id: 'ne', x: 1, y: 0, label: 'top right' },
  { id: 'e', x: 1, y: 0.5, label: 'right' },
  { id: 'se', x: 1, y: 1, label: 'bottom right' },
  { id: 's', x: 0.5, y: 1, label: 'bottom' },
  { id: 'sw', x: 0, y: 1, label: 'bottom left' },
  { id: 'w', x: 0, y: 0.5, label: 'left' },
]

function resizedBounds(
  box: Box,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepRatio: boolean,
): Box {
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.includes('n')
  const south = handle.includes('s')
  let width = Math.max(24, box.width + (west ? -dx : east ? dx : 0))
  let height = Math.max(24, box.height + (north ? -dy : south ? dy : 0))
  if (keepRatio) {
    let scale =
      west || east
        ? width / Math.max(1, box.width)
        : height / Math.max(1, box.height)
    if (
      (west || east) &&
      (north || south) &&
      Math.abs(dy / Math.max(1, box.height)) >
        Math.abs(dx / Math.max(1, box.width))
    )
      scale = height / Math.max(1, box.height)
    scale = Math.max(
      scale,
      24 / Math.max(1, box.width),
      24 / Math.max(1, box.height),
    )
    width = box.width * scale
    height = box.height * scale
  }
  return {
    x: west
      ? box.x + box.width - width
      : east
        ? box.x
        : box.x + (box.width - width) / 2,
    y: north
      ? box.y + box.height - height
      : south
        ? box.y
        : box.y + (box.height - height) / 2,
    width,
    height,
  }
}

function nearestSide(box: Box, point: Point): Exclude<ConnectionSide, 'auto'> {
  return (
    [
      ['left', Math.abs(point.x - box.x)],
      ['right', Math.abs(point.x - box.x - box.width)],
      ['top', Math.abs(point.y - box.y)],
      ['bottom', Math.abs(point.y - box.y - box.height)],
    ] as const
  ).reduce((a, b) => (b[1] < a[1] ? b : a))[0]
}
function sidePoint(box: Box, side: ConnectionSide): Point {
  return {
    x:
      side === 'left'
        ? box.x
        : side === 'right'
          ? box.x + box.width
          : box.x + box.width / 2,
    y:
      side === 'top'
        ? box.y
        : side === 'bottom'
          ? box.y + box.height
          : box.y + box.height / 2,
  }
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

export function EditorObject({
  document,
  element,
  prefix,
  editing = false,
  textOptions = DEFAULT_TEXT_OPTIONS,
  interactive = false,
  onPatch,
  resolveMedia,
  onMove,
  onSelect,
}: {
  document: CanvasDocument
  element: CanvasElement
  prefix: string
  editing?: boolean
  textOptions?: TextLayoutOptions
  interactive?: boolean
  onPatch?: (patch: import('./canvasOperations').ElementPatch) => void
  resolveMedia?: (src: string) => string | undefined
  onMove?: (event: PointerEvent) => void
  onSelect?: () => void
}) {
  if ('text' in element)
    return (
      <>
        {element.type !== 'text' && <ShapeOutline element={element} />}
        {!editing && (
          <CanvasObjectText
            element={element}
            prefix={prefix}
            textOptions={textOptions}
          />
        )}
      </>
    )
  if (element.type === 'embed')
    return (
      <EmbedObject
        element={element}
        interactive={interactive}
        onPatch={onPatch}
        resolveMedia={resolveMedia}
        onMove={onMove}
        onSelect={onSelect}
      />
    )
  if (element.type === 'connection')
    return (
      <ConnectionDrawing
        document={document}
        element={element}
        prefix={prefix}
      />
    )
  if (element.type === 'line')
    return (
      <line
        x1={element.x}
        y1={element.y}
        x2={element.x2}
        y2={element.y2}
        stroke={element.color}
        strokeWidth="2"
        strokeDasharray={lineDash(element.linePattern)}
        strokeLinecap={element.linePattern === 'dotted' ? 'round' : undefined}
        vectorEffect="non-scaling-stroke"
      />
    )
  return (
    <g pointerEvents="none">
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx="12"
        fill={element.fill ?? 'none'}
        fillOpacity="0.3"
        strokeDasharray="7 5"
        stroke={element.color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {!editing && (
        <text
          x={element.x + 14}
          y={element.y + 24}
          fill={element.color}
          fontSize="14"
          pointerEvents="none"
        >
          {element.name}
        </text>
      )}
    </g>
  )
}

function objectLabel(element: CanvasElement) {
  return `${element.type} ${'text' in element && element.text ? element.text.slice(0, 80) : element.type === 'area' ? element.name : element.id}`
}

export default function CanvasEditor({
  active = true,
  allowBackgroundCommands = false,
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
  initialSession,
  onSessionChange,
  initialViewState,
  onStatusChange,
  onViewStateChange,
  statusInFooter = false,
  dockSide = 'right',
  textOptions = DEFAULT_TEXT_OPTIONS,
  controlOptions = DEFAULT_CANVAS_CONTROLS,
  aiPresence = null,
  aiMiniSettings,
  aiClient = null,
  reduceMotion = false,
}: CanvasEditorProps) {
  const controls = normalizeCanvasControls(controlOptions)
  const dockMode = dockHost !== undefined
  const [history, setHistory] = useState(() =>
    createEditorHistory(
      initialViewState
        ? { ...document, viewport: { ...initialViewState.viewport } }
        : document,
    ),
  )
  const activeRef = useRef(active)
  const mountedRef = useRef(true)
  const currentHistory = useRef(history)
  const notified = useRef(document)
  const stage = useRef<HTMLDivElement>(null)
  const [presenceSize, setPresenceSize] = useState({ width: 0, height: 0 })
  const hasAiPresence = aiPresence !== null
  useLayoutEffect(() => {
    if (!active || !stage.current || !hasAiPresence) return
    const element = stage.current
    const measure = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      setPresenceSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      )
    }
    measure()
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [active, hasAiPresence])
  const deckGeometry = useCanvasDeck(stage, active && dockMode)
  const gesture = useRef<Gesture | null>(null)
  const pointerSample = useRef<PointerSample | null>(null)
  const pointerFrame = useRef<number | null>(null)
  const wheelFrame = useRef<number | null>(null)
  const pendingWheel = useRef<CanvasViewport | null>(null)
  const [dragging, setDragging] = useState(false)
  const [gestureKind, setGestureKind] = useState<Gesture['kind'] | ''>('')
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const visibleIds = new Set(
      orderedVisibleElements(document).map((element) => element.id),
    )
    return [...new Set(initialViewState?.selectedIds ?? [])].filter((id) =>
      visibleIds.has(id),
    )
  })
  const selectedId = selectedIds.at(-1) ?? null
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [quickPanel, setQuickPanel] = useState<{
    x: number
    y: number
    point: Point
    ids: string[]
    embed?: boolean
  } | null>(null)
  const [snapGuides, setSnapGuides] = useState<ObjectSnapGuide[]>([])
  const [connectionPreview, setConnectionPreview] = useState<{
    from: Point
    to: Point
  } | null>(null)
  const [reconnectionPreview, setReconnectionPreview] =
    useState<ReconnectionPreview | null>(null)
  const quickPanelRef = useRef<HTMLDivElement>(null)
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null)
  const inlineEditRef = useRef<InlineEdit | null>(null)
  const textInput = useRef<HTMLTextAreaElement>(null)
  const lastPointer = useRef<Point | null>(null)
  const [mode, setMode] = useState<Mode>(() => {
    const tool = initialViewState?.tool ?? initialSession?.tool
    return tool === 'pan' || tool === 'connect' ? tool : 'select'
  })
  const [spaceHeld, setSpaceHeld] = useState(false)
  const temporaryPan = useRef(false)
  const [localInspectorOpen, setLocalInspectorOpen] = useState(false)
  const inspectorOpen = propertiesOpen ?? localInspectorOpen
  const managedCommands = useCommandsEnabled()
  function setInspectorOpen(open: boolean) {
    if (onPropertiesOpenChange) onPropertiesOpenChange(open)
    else setLocalInspectorOpen(open)
  }
  const [layerId, setLayerId] = useState(
    () =>
      document.layers.find(
        (layer) =>
          layer.id ===
            (initialViewState
              ? initialViewState.activeLayerId
              : initialSession?.activeLayerId) &&
          layer.visible &&
          !layer.locked,
      )?.id ?? document.layers[0].id,
  )
  const propertyFlusher = useRef<(() => boolean) | null>(null)
  const [connectionSource, setConnectionSource] = useState<string | null>(null)
  const [arrowStyle, setArrowStyle] = useState<
    'end' | 'none' | 'both' | 'start'
  >(initialViewState?.connection?.arrowStyle ?? 'end')
  const [connectionStyle, setConnectionStyle] = useState<ConnectionStyle>(
    initialViewState?.connection?.style ?? 'straight',
  )
  const [sourceSide, setSourceSide] = useState<ConnectionSide | 'fixed'>(
    initialViewState?.connection?.sourceSide ?? 'fixed',
  )
  const [targetSide, setTargetSide] = useState<ConnectionSide | 'fixed'>(
    initialViewState?.connection?.targetSide ?? 'fixed',
  )
  const [error, setError] = useState('')
  const prefix = useId().replace(/[^\w-]/gu, '')
  const board =
    inlineEdit && inlineEdit.value !== inlineEdit.original
      ? {
          ...history.present,
          elements: history.present.elements.map((element) =>
            element.id === inlineEdit.id && 'text' in element
              ? growCanvasText(
                  { ...element, text: inlineEdit.value },
                  textOptions,
                )
              : element,
          ),
        }
      : history.present
  const view = board.viewport
  const visible = orderedVisibleElements(board)
  const mediaUrls = useCanvasMedia(
    visible
      .filter(
        (e): e is EmbedElement =>
          e.type === 'embed' && !e.paused && !e.minimized,
      )
      .map((e) => e.src),
  )
  const selected = board.elements.find((element) => element.id === selectedId)
  const selectedVisible = visible.some((element) => element.id === selectedId)
  const activeLayerId = board.layers.some((layer) => layer.id === layerId)
    ? layerId
    : board.layers[0].id
  const visibleSelection = visible.filter((element) =>
    selectedIds.includes(element.id),
  )
  const selectedBounds = selectionBounds(
    board,
    visibleSelection.map((element) => element.id),
  )
  const canTransformSelection =
    visibleSelection.some((element) => element.type !== 'connection') &&
    visibleSelection
      .filter((element) => element.type !== 'connection')
      .every(
        (element) =>
          element.type !== 'line' &&
          !(element.type === 'embed' && element.minimized) &&
          isElementEditable(board, element.id),
      )
  const selectedConnection =
    visibleSelection.length === 1 &&
    selected?.type === 'connection' &&
    isElementEditable(board, selected.id) &&
    isElementEditable(board, selected.fromId) &&
    isElementEditable(board, selected.toId)
      ? selected
      : null
  const selectedEndpoints = selectedConnection
    ? connectionEndpoints(
        reconnectionPreview?.document ?? board,
        reconnectionPreview?.element ?? selectedConnection,
      )
    : null
  function setSelectedId(id: string | null) {
    propertyFlusher.current?.()
    setSelectedIds(id ? [id] : [])
  }
  useEffect(() => {
    onSessionChange?.({ tool: mode, activeLayerId })
  }, [mode, activeLayerId, onSessionChange])
  const instructions = `${
    mode === 'pan'
      ? 'Drag to pan'
      : mode === 'connect'
        ? 'Choose two shapes to connect'
        : 'Drag to move · Edge to resize · Side handle to connect · Right-click for properties'
  } · Scroll to zoom`
  const selectionDescription = selected
    ? `${selected.type} · ${board.layers.find((layer) => layer.id === selected.layerId)?.name ?? 'Layer'}`
    : null
  useEffect(() => {
    onStatusChange?.({
      instructions,
      selection: selectionDescription,
      visibleCount: visible.length,
      zoom: view.zoom,
    })
  }, [
    instructions,
    selectionDescription,
    visible.length,
    view.zoom,
    onStatusChange,
  ])
  const currentViewState = useRef<Omit<EditorViewState, 'viewport'>>({
    selectedIds,
    tool: mode,
    activeLayerId,
    connection: {
      arrowStyle,
      style: connectionStyle,
      sourceSide,
      targetSide,
    },
  })
  const executeCommand = useRef<
    (command: BridgeCommand) => CanvasCommandResult
  >(() => {
    throw new Error('The canvas editor is not ready.')
  })
  const currentName = useRef(document.name)
  const currentPresentation = useRef(document.presentation)
  function withCurrentMetadata(present: CanvasDocument): CanvasDocument {
    if (
      present.name === currentName.current &&
      present.presentation === currentPresentation.current
    )
      return present
    const next = { ...present, name: currentName.current }
    if (currentPresentation.current)
      next.presentation = currentPresentation.current
    else delete next.presentation
    return next
  }
  const flushCurrentDraft = useRef<() => void>(() => {
    throw new Error('The canvas editor is not ready.')
  })
  const controller = useRef<CanvasEditorController>({
    getDocument: () => {
      // A pointer preview is not a committed canvas change.
      let present =
        gesture.current?.history.present ?? currentHistory.current.present
      if (pendingWheel.current && !gesture.current)
        present = { ...present, viewport: pendingWheel.current }
      return withCurrentMetadata(present)
    },
    getViewState: (): EditorViewState => {
      const present: CanvasDocument = controller.current.getDocument()
      const state = currentViewState.current
      const visibleIds = new Set(
        orderedVisibleElements(present).map((element) => element.id),
      )
      return {
        viewport: { ...present.viewport },
        selectedIds: state.selectedIds.filter((id) => visibleIds.has(id)),
        tool: state.tool,
        activeLayerId: present.layers.some(
          (layer) => layer.id === state.activeLayerId,
        )
          ? state.activeLayerId
          : present.layers[0].id,
        connection: state.connection ? { ...state.connection } : undefined,
      }
    },
    execute: (command) => executeCommand.current(command),
    flushDraft: () => flushCurrentDraft.current(),
  })

  function openInspector() {
    if (aiOpen) onToggleAI()
    setInspectorOpen(true)
  }

  function showHistory(next: EditorHistory, committed = true) {
    const present = withCurrentMetadata(next.present)
    const renamed = present === next.present ? next : { ...next, present }
    currentHistory.current = renamed
    setHistory(renamed)
    if (committed && !sameDocument(notified.current, renamed.present)) {
      notified.current = renamed.present
      onDocumentChange(renamed.present)
    }
  }

  function commit(next: CanvasDocument, adaptText = true) {
    const adapted = adaptText
      ? adaptCanvasText(currentHistory.current.present, next, textOptions)
      : next
    showHistory(commitEditorHistory(currentHistory.current, adapted))
    setError('')
  }

  const flushWheel = function flushWheelBatch() {
    if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current)
    wheelFrame.current = null
    const viewport = pendingWheel.current
    pendingWheel.current = null
    if (viewport)
      showHistory(navigateEditorHistory(currentHistory.current, viewport))
  }

  function executeBridgeCommand(command: BridgeCommand): CanvasCommandResult {
    if (!mountedRef.current || (!activeRef.current && !allowBackgroundCommands))
      throw new Error('Open this canvas before editing it.')
    if (gesture.current) throw new Error('Finish the current drag first.')
    if (inlineEditRef.current)
      throw new Error('Finish the current text edit first.')
    flushWheel()
    if (command.kind === 'undo' || command.kind === 'redo') {
      const before = controller.current.getDocument()
      showHistory(
        command.kind === 'undo'
          ? undoEditorContentHistory(currentHistory.current)
          : redoEditorContentHistory(currentHistory.current),
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
    const before = controller.current.getDocument()
    const result = applyCanvasCommand(before, command)
    commit(result.document)
    const after = controller.current.getDocument()
    const oldElements = new Map(
      before.elements.map((element) => [element.id, element]),
    )
    return {
      ...result,
      document: after,
      affectedIds: [
        ...new Set([
          ...result.affectedIds,
          ...after.elements
            .filter(
              (element) =>
                JSON.stringify(element) !==
                JSON.stringify(oldElements.get(element.id)),
            )
            .map((element) => element.id),
        ]),
      ],
    }
  }

  function flushEditorDraft() {
    if (!activeRef.current)
      throw new Error('Open this canvas before editing it.')
    if (gesture.current) throw new Error('Finish the current drag first.')
    flushWheel()
    finishTextEdit()
    if (inlineEditRef.current)
      throw new Error('Correct or cancel the current text draft before saving.')
    if (propertyFlusher.current?.() === false)
      throw new Error('Correct the current object properties before saving.')
  }

  useLayoutEffect(() => {
    activeRef.current = active
    currentViewState.current = {
      selectedIds,
      tool: mode,
      activeLayerId,
      connection: {
        arrowStyle,
        style: connectionStyle,
        sourceSide,
        targetSide,
      },
    }
    currentName.current = document.name
    currentPresentation.current = document.presentation
    executeCommand.current = executeBridgeCommand
    flushCurrentDraft.current = flushEditorDraft
  })

  useEffect(() => {
    onViewStateChange?.({
      ...controller.current.getViewState(),
      viewport: { ...view },
    })
  }, [
    onViewStateChange,
    view,
    selectedIds,
    mode,
    activeLayerId,
    arrowStyle,
    connectionStyle,
    sourceSide,
    targetSide,
  ])

  useEffect(() => {
    activeRef.current = active
    return () => {
      activeRef.current = false
    }
  }, [active])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

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
    showHistory(navigateEditorHistory(currentHistory.current, viewport))
  }

  function changeZoom(factor: number) {
    flushWheel()
    const viewport = currentHistory.current.present.viewport
    changeView(zoomAt(viewport, viewport.zoom * factor, center()))
  }

  function resetView() {
    flushWheel()
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

  function add(type: SizedType, position?: Point) {
    if (propertyFlusher.current?.() === false) return
    flushWheel()
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
      const x =
        position?.x ??
        (middle.x - viewport.x) / viewport.zoom - width / 2 + offset
      const y =
        position?.y ??
        (middle.y - viewport.y) / viewport.zoom - height / 2 + offset
      const next = createElement(document, {
        type,
        x: controls.snapToGrid ? snapCoordinate(x, controls.gridSpacing) : x,
        y: controls.snapToGrid ? snapCoordinate(y, controls.gridSpacing) : y,
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

  function addLine(position?: Point) {
    runCanvas(() => {
      const current = currentHistory.current.present
      const middle = center()
      const point = position ?? {
        x: (middle.x - current.viewport.x) / current.viewport.zoom - 90,
        y: (middle.y - current.viewport.y) / current.viewport.zoom,
      }
      const next = createElement(current, {
        type: 'line',
        ...point,
        x2: point.x + 180,
        y2: point.y,
        layerId: activeLayerId,
      })
      commit(next)
      setSelectedId(next.elements.at(-1)!.id)
      setQuickPanel(null)
    })
  }

  function openQuick(event: MouseEvent, id?: string) {
    if (!active || gesture.current || isTyping(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    if (inlineEditRef.current) finishTextEdit()
    if (propertyFlusher.current?.() === false || inlineEditRef.current) return
    const rect = stage.current?.getBoundingClientRect()
    if (!rect) return
    const ids = id ? (selectedIds.includes(id) ? selectedIds : [id]) : []
    if (id) setSelectedIds(ids)
    else setSelectedIds([])
    setQuickPanel({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 340)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 480)),
      point: {
        x: (event.clientX - rect.left - view.x) / view.zoom,
        y: (event.clientY - rect.top - view.y) / view.zoom,
      },
      ids,
    })
  }

  function insertEmbed(kind: EmbedKind, src: string, title: string) {
    runCanvas(() => {
      const current = currentHistory.current.present
      const middle = center()
      const point = quickPanel?.point ?? {
        x: (middle.x - view.x) / view.zoom - 180,
        y: (middle.y - view.y) / view.zoom - 120,
      }
      const next = createElement(current, {
        type: 'embed',
        ...point,
        width: 360,
        height: kind === 'audio' ? 140 : 260,
        kind,
        src,
        title,
        paused: true,
        layerId: activeLayerId,
      })
      commit(next)
      setSelectedId(next.elements.at(-1)!.id)
      setQuickPanel(null)
    })
  }

  function beginConnection(event: PointerEvent, side: ConnectionSide) {
    if (
      event.button !== 0 ||
      !selected ||
      !selectedBounds ||
      !isElementEditable(board, selected.id)
    )
      return
    event.stopPropagation()
    beginGesture(event, 'connect', [selected.id])
    if (!gesture.current) return
    gesture.current.fromSide = side
    const point = sidePoint(selectedBounds, side)
    setConnectionPreview({ from: point, to: point })
  }

  function reconnectPreviewAt(active: Gesture, sample: Point) {
    const original = active.history.present
    const connection = original.elements.find(
      (element) => element.id === active.ids[0],
    )
    const rect = stage.current?.getBoundingClientRect()
    if (!rect || connection?.type !== 'connection' || !active.endpoint)
      return null
    if (Math.hypot(sample.x - active.x, sample.y - active.y) < 3) {
      active.reconnectTarget = undefined
      return { document: original, element: connection, target: null }
    }
    const point = {
      x: (sample.x - rect.left - original.viewport.x) / original.viewport.zoom,
      y: (sample.y - rect.top - original.viewport.y) / original.viewport.zoom,
    }
    const otherId =
      active.endpoint === 'start' ? connection.toId : connection.fromId
    const tolerance = 12 / original.viewport.zoom
    const target = orderedVisibleElements(original)
      .toReversed()
      .find((element) => {
        if (
          element.id === otherId ||
          element.type === 'connection' ||
          element.type === 'line' ||
          !isElementEditable(original, element.id)
        )
          return false
        const box = elementBounds(original, element)
        const within =
          point.x >= box.x - tolerance &&
          point.x <= box.x + box.width + tolerance &&
          point.y >= box.y - tolerance &&
          point.y <= box.y + box.height + tolerance
        if (!within || element.type !== 'area') return within
        return (
          Math.min(
            Math.abs(point.x - box.x),
            Math.abs(point.x - box.x - box.width),
            Math.abs(point.y - box.y),
            Math.abs(point.y - box.y - box.height),
          ) <= tolerance
        )
      })
    if (target) {
      const side = nearestSide(elementBounds(original, target), point)
      try {
        if (
          active.reconnectTarget?.id !== target.id ||
          active.reconnectTarget.side !== side
        )
          active.reconnectTarget = {
            id: target.id,
            side,
            document: reconnectConnection(
              original,
              connection.id,
              active.endpoint,
              target.id,
              side,
            ),
          }
        const next = active.reconnectTarget.document
        const element = next.elements.find(
          (item) => item.id === connection.id,
        ) as ConnectionElement
        const ends = connectionEndpoints(next, element)
        return {
          document: next,
          element,
          target: {
            id: target.id,
            side,
            point:
              active.endpoint === 'start'
                ? { x: ends.x1, y: ends.y1 }
                : { x: ends.x2, y: ends.y2 },
          },
        }
      } catch {
        // An invalid target is only a temporary visual preview, never an edit.
      }
    }
    active.reconnectTarget = undefined
    // A tiny virtual node gives the existing path/pointer renderer a floating
    // endpoint. It exists only in this visual value, never in editor history,
    // the controller snapshot, imports, exports or persisted documents.
    const pointId = `${prefix}-floating-endpoint`
    const floating: CanvasElement = {
      id: pointId,
      type: 'rectangle',
      x: point.x - 0.001,
      y: point.y - 0.001,
      width: 0.002,
      height: 0.002,
      color: connection.color,
      fill: null,
      text: '',
      fontSize: 8,
      layerId: connection.layerId,
      areaId: null,
    }
    const element =
      active.endpoint === 'start'
        ? { ...connection, fromId: pointId }
        : { ...connection, toId: pointId }
    return {
      document: { ...original, elements: [...original.elements, floating] },
      element,
      target: null,
      floatingId: pointId,
    }
  }

  function beginReconnect(event: PointerEvent, endpoint: 'start' | 'end') {
    if (event.button !== 0 || !selectedConnection) return
    event.stopPropagation()
    beginGesture(event, 'reconnect', [selectedConnection.id])
    if (!gesture.current) return
    gesture.current.endpoint = endpoint
    setReconnectionPreview(
      reconnectPreviewAt(gesture.current, {
        x: event.clientX,
        y: event.clientY,
      }),
    )
  }

  function cancelReconnectGesture() {
    const current = gesture.current
    if (current?.kind !== 'reconnect') return
    gesture.current = null
    pointerSample.current = null
    if (pointerFrame.current !== null)
      cancelAnimationFrame(pointerFrame.current)
    pointerFrame.current = null
    setReconnectionPreview(null)
    setDragging(false)
    setGestureKind('')
    if (stage.current?.hasPointerCapture?.(current.pointerId))
      stage.current.releasePointerCapture(current.pointerId)
  }

  const quickPanelOpen = quickPanel !== null
  useEffect(() => {
    if (!quickPanelOpen) return
    quickPanelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const close = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Node &&
        !quickPanelRef.current?.contains(event.target)
      )
        setQuickPanel(null)
    }
    globalThis.document.addEventListener('pointerdown', close)
    return () => globalThis.document.removeEventListener('pointerdown', close)
  }, [quickPanelOpen])

  function beginGesture(
    event: PointerEvent,
    kind: Gesture['kind'],
    ids: string[] = [],
    handle?: ResizeHandle,
    copyOnDrag = false,
  ) {
    if (!active || gesture.current || !stage.current) return
    setQuickPanel(null)
    setSnapGuides([])
    if (inlineEditRef.current) finishTextEdit()
    if (inlineEditRef.current) return
    propertyFlusher.current?.()
    flushWheel()
    event.preventDefault()
    gesture.current = {
      kind,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      history: currentHistory.current,
      ids,
      handle,
      bounds: selectionBounds(currentHistory.current.present, ids),
      selectionBefore: selectedIds,
      copyOnDrag,
    }
    stage.current.focus({ preventScroll: true })
    stage.current.setPointerCapture?.(event.pointerId)
    setDragging(true)
    setGestureKind(kind)
  }

  function beginStage(event: PointerEvent<HTMLDivElement>) {
    if (!active) return
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
      if (mode !== 'connect') {
        setConnectionSource(null)
        beginGesture(event, 'marquee', event.shiftKey ? selectedIds : [])
        if (!event.shiftKey) setSelectedIds([])
      } else event.currentTarget.focus({ preventScroll: true })
    }
  }

  function chooseObject(id: string, additive = false) {
    propertyFlusher.current?.()
    if (mode !== 'connect') {
      if (additive)
        setSelectedIds((ids) =>
          ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
        )
      else setSelectedId(id)
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
        ...(sourceSide === 'fixed' ? {} : { fromSide: sourceSide }),
        ...(targetSide === 'fixed' ? {} : { toSide: targetSide }),
      })
      commit(next)
      setSelectedId(next.elements.at(-1)?.id ?? null)
      setConnectionSource(null)
      setMode('select')
    })
  }

  function beginObject(event: PointerEvent, element: CanvasElement) {
    if (!active) return
    if (inlineEditRef.current) finishTextEdit()
    if (inlineEditRef.current) return
    if (event.button !== 0 && event.button !== 1) return
    if (
      mode === 'pan' ||
      temporaryPan.current ||
      event.button === 1 ||
      (event.altKey && !controls.snapToGrid && !controls.snapToObjects)
    )
      return
    event.stopPropagation()
    if (mode === 'connect') chooseObject(element.id)
    else if (event.shiftKey) {
      chooseObject(element.id, true)
      stage.current?.focus({ preventScroll: true })
      return
    } else if (!selectedIds.includes(element.id)) setSelectedId(element.id)
    if (
      mode === 'connect' ||
      element.type === 'connection' ||
      !isElementEditable(currentHistory.current.present, element.id)
    )
      return
    const ids = selectedIds.includes(element.id) ? selectedIds : [element.id]
    beginGesture(
      event,
      'move',
      ids.filter((id) => {
        const candidate = currentHistory.current.present.elements.find(
          (item) => item.id === id,
        )
        return candidate?.type !== 'connection'
      }),
      undefined,
      event.ctrlKey || event.metaKey,
    )
  }

  function applyPointerSample(sample: PointerSample) {
    const active = gesture.current
    if (!active) return
    let original = active.history.present
    const dx = sample.x - active.x
    const dy = sample.y - active.y
    safely(() => {
      if (active.kind === 'connect') {
        const rect = stage.current?.getBoundingClientRect()
        const source = original.elements.find((e) => e.id === active.ids[0])
        if (rect && source)
          setConnectionPreview({
            from: sidePoint(
              elementBounds(original, source),
              active.fromSide ?? 'auto',
            ),
            to: {
              x:
                (sample.x - rect.left - original.viewport.x) /
                original.viewport.zoom,
              y:
                (sample.y - rect.top - original.viewport.y) /
                original.viewport.zoom,
            },
          })
        return
      }
      if (active.kind === 'reconnect') {
        setReconnectionPreview(reconnectPreviewAt(active, sample))
        return
      }
      if (active.kind === 'marquee') {
        const rect = stage.current?.getBoundingClientRect()
        if (!rect) return
        const x =
          (Math.min(active.x, sample.x) - rect.left - original.viewport.x) /
          original.viewport.zoom
        const y =
          (Math.min(active.y, sample.y) - rect.top - original.viewport.y) /
          original.viewport.zoom
        const bounds = {
          x,
          y,
          width: Math.abs(dx) / original.viewport.zoom,
          height: Math.abs(dy) / original.viewport.zoom,
        }
        setMarquee(bounds)
        const inside = orderedVisibleElements(original)
          .filter((element) => {
            const box = elementBounds(original, element)
            return (
              element.type !== 'connection' &&
              (element.type === 'area'
                ? intersectsAreaBorder(box, bounds)
                : isWithinSelection(box, bounds, controls.selectionBehavior))
            )
          })
          .map((element) => element.id)
        setSelectedIds([...new Set([...active.ids, ...inside])])
        return
      }
      if (active.kind !== 'pan' && Math.abs(dx) + Math.abs(dy) < 3) {
        showHistory(active.history, false)
        if (active.copyDocument) setSelectedIds(active.selectionBefore)
        return
      }
      if (active.copyOnDrag) {
        if (!active.copyDocument) {
          const copy = duplicateSelection(original, active.ids, {
            layerId: activeLayerId,
            offset: 0,
          })
          active.copyDocument = copy.document
          active.copyIds = copy.selectedIds
        }
        original = active.copyDocument
        setSelectedIds(active.copyIds!)
      }
      let present: CanvasDocument
      const delta = {
        x: dx / original.viewport.zoom,
        y: dy / original.viewport.zoom,
      }
      const snap = controls.snapToGrid && !sample.altKey
      const excludeIds = [
        ...selectionIds(original, active.ids),
        ...(active.copyIds ?? []),
      ]
      const targets = orderedVisibleElements(original)
        .filter((e) => e.type !== 'connection' && e.type !== 'line')
        .map((e) => ({
          id: e.id,
          bounds: elementBounds(original, e),
          locked: !isElementEditable(original, e.id),
        }))
      const objectSnap = {
        enabled: controls.snapToObjects && !sample.altKey,
        zoom: original.viewport.zoom,
        excludeIds,
      }
      if (active.kind === 'pan')
        present = { ...original, viewport: panBy(original.viewport, dx, dy) }
      else if (active.kind === 'move') {
        let moved =
          snap && active.bounds
            ? snapSelectionDelta(
                active.bounds,
                delta.x,
                delta.y,
                controls.gridSpacing,
              )
            : delta
        if (active.bounds) {
          const result = snapMoveToObjects(
            active.bounds,
            moved.x,
            moved.y,
            targets,
            objectSnap,
          )
          moved = result
          setSnapGuides(result.guides)
        }
        present = moveSelection(
          original,
          active.copyIds ?? active.ids,
          moved.x,
          moved.y,
        )
      } else {
        if (!active.bounds || !active.handle) return
        let resized = snap
          ? snapResizeDelta(
              active.bounds,
              active.handle,
              delta.x,
              delta.y,
              controls.gridSpacing,
            )
          : delta
        const result = snapResizeToObjects(
          active.bounds,
          active.handle,
          resized.x,
          resized.y,
          targets,
          { ...objectSnap, enabled: objectSnap.enabled && !sample.shiftKey },
        )
        resized = result
        setSnapGuides(result.guides)
        present = resizeSelection(
          original,
          active.ids,
          resizedBounds(
            active.bounds,
            active.handle,
            resized.x,
            resized.y,
            sample.shiftKey,
          ),
        )
      }
      showHistory({ ...active.history, present }, false)
    })
  }

  function flushPointer() {
    if (pointerFrame.current !== null)
      cancelAnimationFrame(pointerFrame.current)
    pointerFrame.current = null
    const sample = pointerSample.current
    pointerSample.current = null
    if (sample) applyPointerSample(sample)
  }

  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    const rect = stage.current?.getBoundingClientRect()
    if (rect)
      lastPointer.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    pointerSample.current = {
      x: event.clientX,
      y: event.clientY,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    }
    if (pointerFrame.current === null)
      pointerFrame.current = requestAnimationFrame(() => {
        pointerFrame.current = null
        const sample = pointerSample.current
        pointerSample.current = null
        if (sample) applyPointerSample(sample)
      })
  }

  function endGesture(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    if (
      !cancelled &&
      event.type === 'pointerup' &&
      'pointerType' in event.nativeEvent
    )
      pointerSample.current = {
        x: event.clientX,
        y: event.clientY,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      }
    if (cancelled) {
      pointerSample.current = null
      if (pointerFrame.current !== null)
        cancelAnimationFrame(pointerFrame.current)
      pointerFrame.current = null
      if (active.kind === 'marquee' || active.copyOnDrag)
        setSelectedIds(active.selectionBefore)
    } else flushPointer()
    gesture.current = null
    setMarquee(null)
    setSnapGuides([])
    setConnectionPreview(null)
    setReconnectionPreview(null)
    if (active.kind === 'reconnect') {
      if (!cancelled && activeRef.current && event.type === 'pointerup')
        safely(() => {
          const preview = reconnectPreviewAt(active, {
            x: event.clientX,
            y: event.clientY,
          })
          if (!preview?.target) return
          // Revalidate against the committed board at release. Preview state
          // never replaces the current document or becomes its own Undo step.
          const next = reconnectConnection(
            currentHistory.current.present,
            active.ids[0],
            active.endpoint!,
            preview.target.id,
            preview.target.side,
          )
          showHistory(commitEditorHistory(active.history, next))
        })
      setDragging(false)
      setGestureKind('')
      if (stage.current?.hasPointerCapture?.(event.pointerId))
        stage.current.releasePointerCapture(event.pointerId)
      return
    }
    if (active.kind === 'connect') {
      if (!cancelled && event.type === 'pointerup')
        safely(() => {
          const original = active.history.present
          const rect = stage.current?.getBoundingClientRect()
          if (!rect) return
          const point = {
            x:
              (event.clientX - rect.left - original.viewport.x) /
              original.viewport.zoom,
            y:
              (event.clientY - rect.top - original.viewport.y) /
              original.viewport.zoom,
          }
          const tolerance = 12 / original.viewport.zoom
          const target = orderedVisibleElements(original)
            .toReversed()
            .find((e) => {
              if (
                e.id === active.ids[0] ||
                e.type === 'line' ||
                e.type === 'connection' ||
                !isElementEditable(original, e.id)
              )
                return false
              const box = elementBounds(original, e)
              return (
                point.x >= box.x - tolerance &&
                point.x <= box.x + box.width + tolerance &&
                point.y >= box.y - tolerance &&
                point.y <= box.y + box.height + tolerance
              )
            })
          if (target) {
            const source = original.elements.find(
              (e) => e.id === active.ids[0],
            )!
            const next = connectElements(original, source.id, target.id, {
              layerId: source.layerId,
              fromSide: active.fromSide,
              toSide: nearestSide(elementBounds(original, target), point),
              style: connectionStyle,
              startArrow: arrowStyle === 'both' || arrowStyle === 'start',
              endArrow: arrowStyle === 'both' || arrowStyle === 'end',
            })
            showHistory(commitEditorHistory(active.history, next))
            setSelectedIds([next.elements.at(-1)!.id])
          }
        })
      setDragging(false)
      setGestureKind('')
      if (stage.current?.hasPointerCapture?.(event.pointerId))
        stage.current.releasePointerCapture(event.pointerId)
      return
    }
    showHistory(
      cancelled
        ? active.history
        : active.kind === 'pan' || active.kind === 'marquee'
          ? { ...active.history, present: currentHistory.current.present }
          : commitEditorHistory(active.history, currentHistory.current.present),
    )
    setDragging(false)
    setGestureKind('')
    if (stage.current?.hasPointerCapture?.(event.pointerId))
      stage.current.releasePointerCapture(event.pointerId)
  }

  function navigateByKey(event: KeyboardEvent<HTMLElement | SVGElement>) {
    if (!active) return
    if (event.key === 'Escape' && gesture.current) {
      event.preventDefault()
      const current = gesture.current
      pointerSample.current = null
      if (pointerFrame.current !== null)
        cancelAnimationFrame(pointerFrame.current)
      pointerFrame.current = null
      gesture.current = null
      showHistory(current.history, false)
      if (current.kind === 'marquee' || current.copyOnDrag)
        setSelectedIds(current.selectionBefore)
      setMarquee(null)
      setSnapGuides([])
      setConnectionPreview(null)
      setReconnectionPreview(null)
      setDragging(false)
      setGestureKind('')
      if (stage.current?.hasPointerCapture?.(current.pointerId))
        stage.current.releasePointerCapture(current.pointerId)
      return
    }
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
          ? redoEditorContentHistory(currentHistory.current)
          : undoEditorContentHistory(currentHistory.current),
      )
      return
    }
    if (!managedCommands && modifier && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selectAll()
      return
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      showHistory(redoEditorContentHistory(currentHistory.current))
      return
    }
    if (!managedCommands && modifier && event.key.toLowerCase() === 'd') {
      event.preventDefault()
      safely(duplicateSelected)
      return
    }
    const arrowKey = [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
    ].includes(event.key)
    if (
      modifier ||
      (event.altKey && !(controls.snapToGrid && arrowKey && selectedIds.length))
    )
      return
    if ((event.key === 'Enter' || event.key === 'F2') && selected) {
      event.preventDefault()
      startTextEdit(selected)
      return
    }
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
      safely(() => removeSelected())
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
      const step =
        controls.snapToGrid && !event.altKey && selectedIds.length
          ? controls.gridSpacing * (event.shiftKey ? 10 : 1)
          : event.shiftKey
            ? 10
            : 1
      const dx =
        event.key === 'ArrowLeft'
          ? -step
          : event.key === 'ArrowRight'
            ? step
            : 0
      const dy =
        event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      if (selectedIds.length) {
        safely(() => {
          const current = currentHistory.current.present
          const bounds = selectionBounds(current, selectedIds)
          const delta =
            controls.snapToGrid && !event.altKey && bounds
              ? snapSelectionDelta(bounds, dx, dy, controls.gridSpacing)
              : { x: dx, y: dy }
          commit(
            moveSelection(
              current,
              selectedIds,
              dx ? delta.x : 0,
              dy ? delta.y : 0,
            ),
          )
        })
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
      cancelReconnectGesture()
    }
    window.addEventListener('keyup', releaseSpace)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keyup', releaseSpace)
      window.removeEventListener('blur', release)
    }
  }, [active])

  const hideEditor = useEffectEvent(() => {
    temporaryPan.current = false
    setSpaceHeld(false)
    if (gesture.current) {
      const previous = gesture.current
      gesture.current = null
      pointerSample.current = null
      if (pointerFrame.current !== null)
        cancelAnimationFrame(pointerFrame.current)
      pointerFrame.current = null
      showHistory(previous.history, false)
      if (previous.copyOnDrag) setSelectedIds(previous.selectionBefore)
      setDragging(false)
      setGestureKind('')
      setMarquee(null)
      setConnectionPreview(null)
      setReconnectionPreview(null)
    }
    flushWheel()
  })

  useEffect(() => {
    if (active) return
    const frame = requestAnimationFrame(() => hideEditor())
    return () => cancelAnimationFrame(frame)
  }, [active])

  const surfaceWheel = useEffectEvent((event: WheelEvent) => {
    const surface = stage.current
    if (
      !active ||
      (event.target instanceof Element &&
        event.target.closest('textarea,input,select,[contenteditable="true"]'))
    )
      return
    event.preventDefault()
    if (gesture.current || inlineEditRef.current || !surface) return
    const bounds = surface.getBoundingClientRect()
    const current =
      pendingWheel.current ?? currentHistory.current.present.viewport
    const deltaScale =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1
    const deltaY = event.deltaY * deltaScale
    const deltaX = event.deltaX * deltaScale
    pendingWheel.current =
      event.shiftKey && !event.ctrlKey && !event.metaKey
        ? panBy(current, -(deltaX || deltaY), deltaX ? -deltaY : 0)
        : deltaX && !event.ctrlKey && !event.metaKey
          ? panBy(current, -deltaX, -deltaY)
          : zoomAt(
              current,
              current.zoom *
                Math.exp(-Math.max(-160, Math.min(160, deltaY)) * 0.002),
              {
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
              },
            )
    if (wheelFrame.current === null)
      wheelFrame.current = requestAnimationFrame(flushWheel)
  })
  useEffect(() => {
    const surface = stage.current
    if (!surface) return
    surface.addEventListener('wheel', surfaceWheel, { passive: false })
    return () => {
      surface.removeEventListener('wheel', surfaceWheel)
    }
  }, [])

  useEffect(
    () => () => {
      gesture.current = null
      pointerSample.current = null
      if (pointerFrame.current !== null)
        cancelAnimationFrame(pointerFrame.current)
      if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current)
      pointerFrame.current = null
      wheelFrame.current = null
      pendingWheel.current = null
    },
    [],
  )

  function runCanvas(action: () => void) {
    if (!active || gesture.current || inlineEditRef.current) return
    flushWheel()
    if (propertyFlusher.current?.() === false) return
    safely(action)
    stage.current?.focus()
  }

  function startTextEdit(element: CanvasElement) {
    if (
      !active ||
      gesture.current ||
      !isElementEditable(currentHistory.current.present, element.id)
    )
      return
    if (propertyFlusher.current?.() === false) return
    element =
      currentHistory.current.present.elements.find(
        (item) => item.id === element.id,
      ) ?? element
    if (!('text' in element) && element.type !== 'area') {
      setSelectedId(element.id)
      openInspector()
      return
    }
    const value = element.type === 'area' ? element.name : element.text
    const draft = { id: element.id, value, original: value }
    inlineEditRef.current = draft
    setInlineEdit(draft)
    setSelectedId(element.id)
    setError('')
  }

  function editAtPointer(event: MouseEvent<HTMLDivElement>) {
    if (!active || event.defaultPrevented) return
    const direct = event.target instanceof Element ? event.target : null
    if (
      direct?.closest(
        'textarea, input, select, [data-resize-handle], .canvas-resize-handle',
      )
    )
      return
    // Captured pointer-up events make Chrome dispatch double-click on the stage.
    // Resolve the actual object under the pointer before opening its text editor.
    const pointed = event.currentTarget.ownerDocument.elementFromPoint?.(
      event.clientX,
      event.clientY,
    )
    const hit = pointed ?? direct
    if (!hit || !event.currentTarget.contains(hit)) return
    const id = hit.closest('[data-element-id]')?.getAttribute('data-element-id')
    const element = currentHistory.current.present.elements.find(
      (item) => item.id === id,
    )
    if (element) startTextEdit(element)
  }

  function finishTextEdit(cancelled = false) {
    const draft = inlineEditRef.current
    if (!draft) return
    if (cancelled || draft.value === draft.original) {
      inlineEditRef.current = null
      setInlineEdit(null)
      return
    }
    safely(() => {
      const current = currentHistory.current.present
      const element = current.elements.find((item) => item.id === draft.id)
      if (!element || (!('text' in element) && element.type !== 'area'))
        throw new Error('The edited object no longer exists.')
      const value = element.type === 'area' ? element.name : element.text
      if (value !== draft.original)
        throw new Error(
          'This text changed while you were editing. Reopen it to edit the latest version.',
        )
      commit(
        updateElement(
          current,
          draft.id,
          element.type === 'area'
            ? { name: draft.value }
            : { text: draft.value },
        ),
      )
      inlineEditRef.current = null
      setInlineEdit(null)
    })
  }

  useLayoutEffect(() => {
    if (inlineEdit?.id && active) {
      textInput.current?.focus({ preventScroll: true })
      textInput.current?.select()
    }
  }, [inlineEdit?.id, active])

  function selectAll() {
    setSelectedIds(
      orderedVisibleElements(currentHistory.current.present).map(
        (element) => element.id,
      ),
    )
    setMode('select')
    setConnectionSource(null)
  }

  function removeSelected() {
    commit(removeSelection(currentHistory.current.present, selectedIds))
    setSelectedIds([])
  }

  function isTyping(target: EventTarget | null) {
    return (
      target instanceof Element &&
      Boolean(
        target.closest(
          'input,textarea,select,[contenteditable="true"],[role="textbox"]',
        ),
      )
    )
  }

  function clipboardCopy(event: ClipboardEvent<HTMLElement>, cut = false) {
    if (
      !active ||
      gesture.current ||
      inlineEditRef.current ||
      isTyping(event.target)
    )
      return
    safely(() => {
      const current = currentHistory.current.present
      const raw = createCanvasClipboard(current, selectedIds)
      if (!raw) return
      // Plain text is the portable fallback when a browser rejects custom MIME.
      event.clipboardData.setData('text/plain', raw)
      try {
        event.clipboardData.setData(CANVAS_CLIPBOARD_MIME, raw)
      } catch {
        // The validated text envelope still carries every object relationship.
      }
      event.preventDefault()
      if (cut)
        commit(removeSelection(current, selectionIds(current, selectedIds)))
    })
  }

  function pasteAtPointer(raw: string, structured = false, bypassSnap = false) {
    if (!activeRef.current || gesture.current || inlineEditRef.current || !raw)
      return
    const current = currentHistory.current.present
    const screenPoint = lastPointer.current ?? center()
    const point = {
      x: (screenPoint.x - current.viewport.x) / current.viewport.zoom,
      y: (screenPoint.y - current.viewport.y) / current.viewport.zoom,
    }
    const isStructured = structured || isCanvasClipboard(raw)
    const result = isStructured
      ? pasteCanvasClipboard(current, raw, {
          layerId: activeLayerId,
          center: point,
        })
      : pasteCanvasText(current, raw, {
          layerId: activeLayerId,
          center: point,
        })
    // Structured copies preserve deliberately sized objects and their layout.
    const bounds = selectionBounds(result.document, result.selectedIds)
    const delta =
      controls.snapToGrid && !bypassSnap && bounds
        ? snapSelectionDelta(bounds, 0, 0, controls.gridSpacing)
        : { x: 0, y: 0 }
    commit(
      delta.x || delta.y
        ? moveSelection(result.document, result.selectedIds, delta.x, delta.y)
        : result.document,
      !isStructured,
    )
    setSelectedIds(result.selectedIds)
    setMode('select')
    setConnectionSource(null)
  }

  function clipboardPaste(event: ClipboardEvent<HTMLElement>) {
    if (
      !active ||
      gesture.current ||
      inlineEditRef.current ||
      isTyping(event.target)
    )
      return
    const structured = event.clipboardData.getData(CANVAS_CLIPBOARD_MIME)
    const raw = structured || event.clipboardData.getData('text/plain')
    if (!raw) return
    event.preventDefault()
    safely(() => pasteAtPointer(raw, Boolean(structured)))
  }

  async function copyToSystem(cut = false) {
    if (!active || gesture.current || inlineEditRef.current) return
    try {
      const current = currentHistory.current.present
      const raw = createCanvasClipboard(current, selectedIds)
      if (!raw) return
      if (!navigator.clipboard?.writeText)
        throw new Error(
          'Clipboard access is unavailable. Use the browser copy action while the canvas is focused.',
        )
      await navigator.clipboard.writeText(raw)
      if (cut) {
        if (!activeRef.current) return
        if (gesture.current || inlineEditRef.current)
          throw new Error(
            'Finish the current edit before cutting. Copied objects remain on the canvas.',
          )
        if (!sameDocument(current, currentHistory.current.present))
          throw new Error(
            'The canvas changed while copying. Copied objects remain on the canvas.',
          )
        commit(removeSelection(current, selectionIds(current, selectedIds)))
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The clipboard could not be written.',
      )
    }
  }

  async function pasteFromSystem() {
    if (!active || gesture.current || inlineEditRef.current) return
    try {
      if (!navigator.clipboard?.readText)
        throw new Error(
          'Clipboard access is unavailable. Paste while the canvas is focused.',
        )
      const raw = await navigator.clipboard.readText()
      pasteAtPointer(raw)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The clipboard could not be read.',
      )
    }
  }
  function duplicateSelected() {
    const result = duplicateSelection(
      currentHistory.current.present,
      selectedIds,
      { layerId: activeLayerId },
    )
    const bounds = selectionBounds(result.document, result.selectedIds)
    const delta =
      controls.snapToGrid && bounds
        ? snapSelectionDelta(bounds, 0, 0, controls.gridSpacing)
        : { x: 0, y: 0 }
    commit(
      delta.x || delta.y
        ? moveSelection(result.document, result.selectedIds, delta.x, delta.y)
        : result.document,
      false,
    )
    setSelectedIds(result.selectedIds)
  }
  const commandAvailable = active && !dragging && !inlineEdit
  useRegisterCommands([
    {
      id: 'canvas.copy',
      label: 'Copy selected objects',
      category: 'Canvas',
      execute: () => {
        void copyToSystem()
      },
      enabled: commandAvailable && selectedIds.length > 0,
      scope: 'canvas',
    },
    {
      id: 'canvas.cut',
      label: 'Cut selected objects',
      category: 'Canvas',
      execute: () => {
        void copyToSystem(true)
      },
      enabled:
        commandAvailable &&
        selectedIds.length > 0 &&
        selectedIds.every((id) => isElementEditable(board, id)),
      scope: 'canvas',
    },
    {
      id: 'canvas.paste',
      label: 'Paste',
      category: 'Canvas',
      execute: () => {
        void pasteFromSystem()
      },
      enabled: commandAvailable,
      scope: 'canvas',
    },
    {
      id: 'canvas.selectAll',
      label: 'Select all objects',
      category: 'Canvas',
      execute: () => runCanvas(selectAll),
      enabled: commandAvailable,
      scope: 'canvas',
    },
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
    ...([...SHAPE_TYPES, 'text', 'area'] as const).map((type) => ({
      id: `canvas.${type}` as const,
      label: `Add ${type}`,
      category: 'Canvas',
      execute: () => runCanvas(() => add(type)),
      enabled: commandAvailable,
      scope: 'canvas' as const,
    })),
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
        runCanvas(() =>
          showHistory(undoEditorContentHistory(currentHistory.current)),
        ),
      enabled: commandAvailable && history.past.length > 0,
      scope: 'canvas',
    },
    {
      id: 'canvas.redo',
      label: 'Redo',
      category: 'Canvas',
      execute: () =>
        runCanvas(() =>
          showHistory(redoEditorContentHistory(currentHistory.current)),
        ),
      enabled: commandAvailable && history.future.length > 0,
      scope: 'canvas',
    },
    {
      id: 'canvas.delete',
      label: 'Delete selected object',
      category: 'Canvas',
      execute: () =>
        runCanvas(() => {
          if (selectedIds.length) removeSelected()
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
    '--canvas-grid-size': `${controls.gridSpacing * (view.zoom < 0.5 ? 5 : 1) * view.zoom}px`,
    '--canvas-grid-x': `${view.x}px`,
    '--canvas-grid-y': `${view.y}px`,
  } as CSSProperties
  const inspector = (
    <CanvasInspector
      document={board}
      selectedId={selected?.id ?? null}
      selectedIds={selectedIds}
      activeLayerId={activeLayerId}
      onSelect={setSelectedId}
      onActiveLayerChange={setLayerId}
      onDocumentChange={(next) =>
        safely(() =>
          commit({
            ...next,
            name: currentName.current,
            viewport:
              pendingWheel.current ?? currentHistory.current.present.viewport,
          }),
        )
      }
      onError={setError}
      onDraftFlusherChange={(flush) => {
        propertyFlusher.current = flush
      }}
    />
  )
  const editedElement = inlineEdit
    ? board.elements.find((element) => element.id === inlineEdit.id)
    : null
  const editLayout =
    editedElement && 'text' in editedElement
      ? layoutCanvasText(
          { ...editedElement, text: inlineEdit?.value ?? editedElement.text },
          textOptions,
        )
      : null
  const editBounds = editLayout
    ? {
        ...editLayout.box,
        y:
          editedElement && 'text' in editedElement
            ? canvasTextPlacement(editedElement, editLayout).y
            : editLayout.box.y,
        height: editLayout.height,
      }
    : editedElement && 'width' in editedElement
      ? {
          x: editedElement.x + 14,
          y: editedElement.y + 8,
          width: Math.max(1, editedElement.width - 28),
          height: 28,
        }
      : null
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
          <option value="curve">Curve</option>
          <option value="step">Step</option>
        </select>
      </label>
      {(['source', 'target'] as const).map((endpoint) => (
        <label key={endpoint}>
          {endpoint === 'source' ? 'Source side' : 'Target side'}
          <select
            aria-label={`New connection ${endpoint} side`}
            value={endpoint === 'source' ? sourceSide : targetSide}
            onChange={(event) =>
              (endpoint === 'source' ? setSourceSide : setTargetSide)(
                event.target.value as ConnectionSide | 'fixed',
              )
            }
          >
            <option value="fixed">Automatic fixed side</option>
            <option value="auto">Auto (follow direction)</option>
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
              <option key={side} value={side}>
                {side[0].toUpperCase() + side.slice(1)}
              </option>
            ))}
          </select>
        </label>
      ))}
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
      {SHAPE_TYPES.filter(
        (type) => !['rectangle', 'ellipse', 'diamond'].includes(type),
      ).map((type) => (
        <button
          type="button"
          key={type}
          aria-label={`Add ${type}`}
          title={`Add ${type}`}
          onClick={() => add(type)}
        >
          <ToolIcon>
            <ShapeOutline
              element={{
                id: 'tool',
                type,
                x: 3,
                y: 3,
                width: 18,
                height: 18,
                color: 'currentColor',
                fill: null,
                text: '',
                fontSize: 10,
                layerId: 'tool',
                areaId: null,
              }}
            />
          </ToolIcon>
        </button>
      ))}
      <button
        type="button"
        aria-label="Add line"
        title="Add line"
        onClick={() => addLine()}
      >
        <ToolIcon>
          <path d="M4 20 20 4" />
        </ToolIcon>
      </button>
      <button
        type="button"
        aria-label="Add media or website"
        title="Add media or website"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const middle = center()
          setQuickPanel({
            x: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
            y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 480)),
            point: {
              x: (middle.x - view.x) / view.zoom - 180,
              y: (middle.y - view.y) / view.zoom - 120,
            },
            ids: [],
            embed: true,
          })
        }}
      >
        <ToolIcon>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="m9 9 7 3-7 3Z" />
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
  const hasDeck = Boolean(deckGeometry)
  const backdropElements = useMemo(
    () =>
      reconnectionPreview
        ? reconnectionPreview.document.elements.map((element) =>
            element.id === reconnectionPreview.element.id
              ? reconnectionPreview.element
              : element,
          )
        : board.elements,
    [board.elements, reconnectionPreview],
  )
  const floatingBackdropId = reconnectionPreview?.floatingId
  const backdropLayers = board.layers
  const editingId = inlineEdit?.id
  const { autoGrowShapes, fitTextToShape, minTextSize } = textOptions
  const backdropObjects = useMemo(() => {
    if (!hasDeck) return null
    // Geometry arrays stay identical during camera navigation. Reusing the
    // children means pan/zoom only updates the outer transform and grid.
    const document: CanvasDocument = {
      format: 'LCANVAS',
      version: 2,
      name: 'Backdrop',
      viewport: { x: 0, y: 0, zoom: 1 },
      layers: backdropLayers,
      elements: backdropElements,
    }
    const options = { autoGrowShapes, fitTextToShape, minTextSize }
    return orderedVisibleElements(document)
      .filter((element) => element.id !== floatingBackdropId)
      .map((element, index) => (
        <EditorObject
          key={element.id}
          document={document}
          element={element}
          prefix={`${prefix}-backdrop-${index}`}
          editing={editingId === element.id}
          textOptions={options}
        />
      ))
  }, [
    hasDeck,
    backdropElements,
    backdropLayers,
    floatingBackdropId,
    editingId,
    prefix,
    autoGrowShapes,
    fitTextToShape,
    minTextSize,
  ])
  const viewRail = (
    <div
      className={`canvas-view-rail${deckGeometry ? ' canvas-deck-rail' : ''}`}
      style={
        deckGeometry
          ? ({
              '--deck-rail-right': `${deckGeometry.railRight}px`,
            } as CSSProperties)
          : undefined
      }
      role="toolbar"
      aria-label="Canvas controls"
    >
      {dockMode && (
        <button
          type="button"
          aria-label="Open right panel"
          aria-expanded={toolsOpen || inspectorOpen || aiOpen}
          title="Tools, properties and AI"
          data-dock-trigger={dockSide}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') onToolsOpenChange?.(true)
          }}
          onClick={() => onToolsOpenChange?.(true)}
        >
          <ToolIcon>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
          </ToolIcon>
        </button>
      )}
      <button
        type="button"
        aria-label="Undo"
        title="Undo edit (Ctrl+Z)"
        disabled={!history.past.length || dragging}
        onClick={() =>
          runCanvas(() =>
            showHistory(undoEditorContentHistory(currentHistory.current)),
          )
        }
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
        title="Redo edit (Ctrl+Shift+Z)"
        disabled={!history.future.length || dragging}
        onClick={() =>
          runCanvas(() =>
            showHistory(redoEditorContentHistory(currentHistory.current)),
          )
        }
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
      {!dockMode && (
        <button
          type="button"
          className={aiOpen ? 'canvas-ai-toggle active' : 'canvas-ai-toggle'}
          aria-label={
            aiOpen ? 'Close AI workspace panel' : 'Open AI workspace panel'
          }
          aria-expanded={aiOpen}
          aria-controls="workspace-ai-panel"
          data-dock-trigger={dockMode ? dockSide : undefined}
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
      )}
    </div>
  )
  return (
    <section
      className={`canvas-editor${inspectorOpen ? ' has-inspector' : ''}`}
      aria-label="LCANVAS editor"
      data-canvas-root
      data-dock-mode={dockMode}
      onCopy={clipboardCopy}
      onCut={(event) => clipboardCopy(event, true)}
      onPaste={clipboardPaste}
    >
      {deckGeometry && (
        <CanvasBackdrop
          geometry={deckGeometry}
          viewport={view}
          grid={grid}
          gridSize={
            controls.gridSpacing * (view.zoom < 0.5 ? 5 : 1) * view.zoom
          }
        >
          {backdropObjects}
        </CanvasBackdrop>
      )}
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
          data-gesture={gestureKind}
          data-selection-count={selectedIds.length}
          data-snap-to-grid={controls.snapToGrid}
          data-rulers={controls.rulers}
          data-mode={spaceHeld ? 'pan' : mode}
          style={gridStyle}
          tabIndex={0}
          role="region"
          aria-label={`${document.name} canvas view`}
          aria-describedby={`${prefix}-instructions`}
          onPointerDown={beginStage}
          onPointerMove={moveGesture}
          onPointerUp={endGesture}
          onDoubleClick={editAtPointer}
          onContextMenu={(event) => openQuick(event)}
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
              cancelReconnectGesture()
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
                    aria-pressed={selectedIds.includes(element.id)}
                    data-element-id={element.id}
                    data-layer-id={element.layerId}
                    data-area-id={element.areaId ?? ''}
                    data-editable={isElementEditable(board, element.id)}
                    data-selected={selectedIds.includes(element.id)}
                    data-reconnecting={
                      gestureKind === 'reconnect' &&
                      element.id === selectedConnection?.id
                    }
                    className="canvas-edit-object"
                    onPointerDown={(event) => beginObject(event, element)}
                    onContextMenu={(event) => openQuick(event, element.id)}
                    onKeyDown={(event) => {
                      if (event.key === ' ') {
                        navigateByKey(event)
                        return
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.stopPropagation()
                        if (mode === 'connect') chooseObject(element.id)
                        else startTextEdit(element)
                      }
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      startTextEdit(element)
                    }}
                  >
                    {element.type !== 'connection' &&
                      element.type !== 'line' && (
                        <rect
                          className="canvas-object-hit"
                          data-area-border-hit={
                            element.type === 'area' || undefined
                          }
                          x={bounds.x}
                          y={bounds.y}
                          width={bounds.width}
                          height={bounds.height}
                          rx={element.type === 'area' ? 12 : undefined}
                          fill={
                            element.type === 'area' ? 'none' : 'transparent'
                          }
                          stroke={
                            element.type === 'area' ? 'transparent' : undefined
                          }
                          strokeWidth={element.type === 'area' ? 8 : undefined}
                          vectorEffect={
                            element.type === 'area'
                              ? 'non-scaling-stroke'
                              : undefined
                          }
                          pointerEvents={
                            element.type === 'area' ? 'stroke' : undefined
                          }
                        />
                      )}
                    <EditorObject
                      document={board}
                      element={element}
                      prefix={`${prefix}-${index}`}
                      editing={inlineEdit?.id === element.id}
                      interactive={active && element.type === 'embed'}
                      resolveMedia={(src) => mediaUrls[src]}
                      onPatch={(patch) =>
                        runCanvas(() =>
                          commit(
                            updateElement(
                              currentHistory.current.present,
                              element.id,
                              patch,
                            ),
                          ),
                        )
                      }
                      onMove={(event) => beginObject(event, element)}
                      onSelect={() => {
                        if (!selectedIds.includes(element.id))
                          setSelectedId(element.id)
                      }}
                      textOptions={textOptions}
                    />
                  </g>
                )
              })}
              {(visibleSelection.length > 1 || marquee) &&
                visibleSelection.map((element) => {
                  const bounds = elementBounds(board, element)
                  return (
                    <rect
                      key={`selection-${element.id}`}
                      className="canvas-selected-member"
                      data-selection-member={element.id}
                      x={bounds.x - 2 / view.zoom}
                      y={bounds.y - 2 / view.zoom}
                      width={bounds.width + 4 / view.zoom}
                      height={bounds.height + 4 / view.zoom}
                      fill="none"
                      stroke={selectionColor(controls.selectionStroke)}
                      strokeWidth={controls.selectionStrokeWidth}
                      strokeDasharray={
                        controls.selectionDashed ? '5 4' : undefined
                      }
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )
                })}
              {selected && selectedVisible && selectedBounds && (
                <g className="canvas-selection">
                  {gestureKind !== 'reconnect' && (
                    <rect
                      x={selectedBounds.x - 4 / view.zoom}
                      y={selectedBounds.y - 4 / view.zoom}
                      width={selectedBounds.width + 8 / view.zoom}
                      height={selectedBounds.height + 8 / view.zoom}
                      fill="none"
                      stroke={selectionColor(controls.selectionStroke)}
                      strokeWidth={controls.selectionStrokeWidth}
                      strokeDasharray={
                        controls.selectionDashed ? '5 4' : undefined
                      }
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
                  {canTransformSelection &&
                    !inlineEdit &&
                    resizeHandles.map((handle) => (
                      <rect
                        key={handle.id}
                        className="canvas-resize-handle"
                        role="button"
                        aria-label={
                          handle.id === 'se'
                            ? 'Resize selected object'
                            : `Resize selected object ${handle.label}`
                        }
                        data-resize-handle={handle.id}
                        x={
                          selectedBounds.x +
                          (handle.id === 'n' || handle.id === 's'
                            ? 12 / view.zoom
                            : selectedBounds.width * handle.x - 6 / view.zoom)
                        }
                        y={
                          selectedBounds.y +
                          (handle.id === 'e' || handle.id === 'w'
                            ? 12 / view.zoom
                            : selectedBounds.height * handle.y - 6 / view.zoom)
                        }
                        width={
                          handle.id === 'n' || handle.id === 's'
                            ? Math.max(1, selectedBounds.width - 24 / view.zoom)
                            : 12 / view.zoom
                        }
                        height={
                          handle.id === 'e' || handle.id === 'w'
                            ? Math.max(
                                1,
                                selectedBounds.height - 24 / view.zoom,
                              )
                            : 12 / view.zoom
                        }
                        fill="transparent"
                        stroke="none"
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(event) => {
                          if (event.button !== 0) return
                          event.stopPropagation()
                          beginGesture(event, 'resize', selectedIds, handle.id)
                        }}
                      >
                        <title>{`Resize ${handle.label} · Shift keeps proportions`}</title>
                      </rect>
                    ))}
                  {visibleSelection.length === 1 &&
                    isElementEditable(board, selected.id) &&
                    selected.type !== 'line' &&
                    selected.type !== 'connection' &&
                    !inlineEdit &&
                    (['top', 'right', 'bottom', 'left'] as const).map(
                      (side) => {
                        const point = sidePoint(selectedBounds, side)
                        return (
                          <circle
                            key={side}
                            className="canvas-connect-handle"
                            role="button"
                            tabIndex={0}
                            aria-label={`Connect from ${side}`}
                            cx={point.x}
                            cy={point.y}
                            r={5 / view.zoom}
                            fill="var(--accent)"
                            stroke="var(--panel)"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                            onPointerDown={(event) =>
                              beginConnection(event, side)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setConnectionSource(selected.id)
                                setSourceSide(side)
                                setMode('connect')
                              }
                            }}
                          >
                            <title>{`Drag to connect from ${side}`}</title>
                          </circle>
                        )
                      },
                    )}
                  {selectedConnection &&
                    selectedEndpoints &&
                    !inlineEdit &&
                    (['start', 'end'] as const).map((endpoint) => (
                      <circle
                        key={endpoint}
                        className="canvas-connection-endpoint"
                        role="button"
                        aria-label={`Reconnect relationship ${endpoint}`}
                        data-connection-endpoint={endpoint}
                        cx={
                          endpoint === 'start'
                            ? selectedEndpoints.x1
                            : selectedEndpoints.x2
                        }
                        cy={
                          endpoint === 'start'
                            ? selectedEndpoints.y1
                            : selectedEndpoints.y2
                        }
                        r={7 / view.zoom}
                        fill="var(--panel)"
                        stroke="var(--accent)"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(event) =>
                          beginReconnect(event, endpoint)
                        }
                      >
                        <title>{`Drag the ${endpoint} to an object side to reconnect · Escape cancels`}</title>
                      </circle>
                    ))}
                </g>
              )}
              {reconnectionPreview && (
                <g
                  className="canvas-reconnection-preview"
                  data-testid="relationship-endpoint-preview"
                  aria-hidden="true"
                  pointerEvents="none"
                >
                  <ConnectionDrawing
                    document={reconnectionPreview.document}
                    element={reconnectionPreview.element}
                    prefix={`${prefix}-reconnection`}
                    hitTarget={false}
                  />
                  {reconnectionPreview.target && (
                    <circle
                      data-testid="relationship-endpoint-target"
                      data-target-id={reconnectionPreview.target.id}
                      data-target-side={reconnectionPreview.target.side}
                      cx={reconnectionPreview.target.point.x}
                      cy={reconnectionPreview.target.point.y}
                      r={11 / view.zoom}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="3"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              )}
              {connectionPreview && (
                <path
                  data-testid="connection-preview"
                  d={`M ${connectionPreview.from.x} ${connectionPreview.from.y} L ${connectionPreview.to.x} ${connectionPreview.to.y}`}
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}
              {snapGuides.map((guide) => (
                <line
                  key={`${guide.axis}-${guide.targetId}`}
                  data-testid="object-snap-guide"
                  x1={
                    guide.axis === 'x' ? guide.coordinate : -view.x / view.zoom
                  }
                  x2={
                    guide.axis === 'x'
                      ? guide.coordinate
                      : ((stage.current?.clientWidth ?? 1000) - view.x) /
                        view.zoom
                  }
                  y1={
                    guide.axis === 'y' ? guide.coordinate : -view.y / view.zoom
                  }
                  y2={
                    guide.axis === 'y'
                      ? guide.coordinate
                      : ((stage.current?.clientHeight ?? 800) - view.y) /
                        view.zoom
                  }
                  stroke="var(--accent)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ))}
              {marquee && (
                <rect
                  className="canvas-marquee"
                  data-testid="canvas-marquee"
                  x={marquee.x}
                  y={marquee.y}
                  width={marquee.width}
                  height={marquee.height}
                  fill={selectionColor(controls.selectionFill)}
                  fillOpacity={controls.selectionOpacity}
                  stroke={selectionColor(controls.selectionStroke)}
                  strokeWidth={controls.selectionStrokeWidth}
                  strokeDasharray={controls.selectionDashed ? '5 4' : undefined}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}
            </g>
          </svg>
          {active && aiMiniSettings && aiPresence && (
            <CanvasAiPresence
              event={aiPresence}
              document={board}
              viewport={view}
              width={presenceSize.width}
              height={presenceSize.height}
              settings={aiMiniSettings}
              client={aiClient}
              reduceMotion={reduceMotion}
              onOpenAI={() => {
                if (!aiOpen) onToggleAI()
              }}
            />
          )}
          {controls.rulers && (
            <CanvasRulers viewport={view} unit={controls.rulerUnit} />
          )}
          {inlineEdit && editBounds && editedElement && (
            <div
              className="canvas-inline-edit"
              data-centered={
                editedElement.type !== 'text' && editedElement.type !== 'area'
              }
              style={{
                left: editBounds.x * view.zoom + view.x,
                top: editBounds.y * view.zoom + view.y,
                width: editBounds.width * view.zoom,
                height: Math.max(1, editBounds.height * view.zoom + 2),
              }}
            >
              <textarea
                ref={textInput}
                aria-label={
                  editedElement.type === 'area'
                    ? 'Edit area name'
                    : 'Edit object text'
                }
                title="Enter for a new line · Ctrl+Enter to apply · Escape to cancel"
                value={inlineEdit.value}
                maxLength={editedElement.type === 'area' ? 120 : 20000}
                spellCheck
                style={{
                  fontSize: (editLayout?.fontSize ?? 14) * view.zoom,
                  color:
                    'text' in editedElement
                      ? (editedElement.textColor ?? editedElement.color)
                      : editedElement.color,
                  fontFamily:
                    'text' in editedElement
                      ? canvasFontFamily(editedElement)
                      : undefined,
                  fontWeight:
                    'text' in editedElement
                      ? editedElement.fontWeight
                      : undefined,
                  fontStyle:
                    'text' in editedElement
                      ? editedElement.fontStyle
                      : undefined,
                  textAlign:
                    'text' in editedElement
                      ? (editedElement.textAlign ??
                        (editedElement.type === 'text' ? 'left' : 'center'))
                      : undefined,
                }}
                onChange={(event) => {
                  const draft = { ...inlineEdit, value: event.target.value }
                  inlineEditRef.current = draft
                  setInlineEdit(draft)
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onBlur={() => finishTextEdit()}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.nativeEvent.isComposing) return
                  if (
                    event.key === 'Escape' ||
                    ((event.ctrlKey || event.metaKey) && event.key === 'Enter')
                  ) {
                    event.preventDefault()
                    finishTextEdit(event.key === 'Escape')
                    stage.current?.focus({ preventScroll: true })
                  }
                }}
              />
            </div>
          )}
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
      {quickPanel &&
        active &&
        createPortal(
          <div
            ref={quickPanelRef}
            className="canvas-quick-panel"
            role="dialog"
            aria-label={
              quickPanel.ids.length
                ? 'Quick object properties'
                : quickPanel.embed
                  ? 'Add media or website'
                  : 'Add to canvas'
            }
            style={{
              left: quickPanel.x,
              top: quickPanel.y,
              maxHeight: `calc(100vh - ${quickPanel.y + 12}px)`,
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape') {
                event.preventDefault()
                setQuickPanel(null)
                stage.current?.focus()
              }
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <header>
              <strong>
                {quickPanel.ids.length
                  ? 'Quick properties'
                  : quickPanel.embed
                    ? 'Media & embeds'
                    : 'Add to canvas'}
              </strong>
              <button
                type="button"
                aria-label="Close quick panel"
                onClick={() => {
                  setQuickPanel(null)
                  stage.current?.focus()
                }}
              >
                ×
              </button>
            </header>
            {quickPanel.ids.length ? (
              <CanvasQuickProperties
                document={board}
                ids={quickPanel.ids}
                onChange={(next) => safely(() => commit(next))}
                onError={setError}
                onDelete={() => {
                  runCanvas(removeSelected)
                  setQuickPanel(null)
                }}
                onDuplicate={() => {
                  runCanvas(duplicateSelected)
                  setQuickPanel(null)
                }}
              />
            ) : quickPanel.embed ? (
              <CanvasEmbedInsert onInsert={insertEmbed} />
            ) : (
              <div className="canvas-quick-add">
                {[...SHAPE_TYPES, 'text', 'area'].map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => {
                      add(type as SizedType, quickPanel.point)
                      setQuickPanel(null)
                    }}
                  >
                    {type[0].toUpperCase() + type.slice(1)}
                  </button>
                ))}
                <button type="button" onClick={() => addLine(quickPanel.point)}>
                  Line
                </button>
                <button
                  type="button"
                  onClick={() => setQuickPanel({ ...quickPanel, embed: true })}
                >
                  Media or website
                </button>
              </div>
            )}
          </div>,
          stage.current?.closest('.app-shell') ?? globalThis.document.body,
        )}
      {deckGeometry ? createPortal(viewRail, deckGeometry.host) : viewRail}
      {statusInFooter ? (
        <p id={`${prefix}-instructions`} hidden>
          {instructions}
        </p>
      ) : (
        <div className="canvas-view-status">
          <p id={`${prefix}-instructions`}>{instructions}</p>
          <span>{selectionDescription ?? `${visible.length} objects`}</span>
          <output aria-label="Canvas zoom" aria-live="polite">
            {formatCanvasZoom(view.zoom, controls)}
          </output>
        </div>
      )}
    </section>
  )
}
