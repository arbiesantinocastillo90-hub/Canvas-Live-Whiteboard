import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import type { CanvasDocument, CanvasElement, CanvasViewport } from './lcanvas'
import {
  commitView,
  createViewHistory,
  fitView,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  redoView,
  sameViewport,
  undoView,
  zoomAt,
  type ViewHistory,
} from './canvasViewport'
import './canvas-viewer.css'

export type CanvasViewerProps = {
  document: CanvasDocument
  grid: 'dots' | 'lines' | 'none'
  aiOpen: boolean
  onToggleAI: () => void
  initialViewport?: CanvasViewport
  onViewportChange?: (viewport: CanvasViewport) => void
  rightInset?: number
}

function RailIcon({ children }: { children: ReactNode }) {
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

function CanvasObject({
  element,
  prefix,
}: {
  element: CanvasElement
  prefix: string
}) {
  switch (element.type) {
    case 'rectangle':
      return (
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          rx="5"
          fill={element.fill ?? 'none'}
          stroke={element.color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )
    case 'ellipse':
      return (
        <ellipse
          cx={element.x + element.width / 2}
          cy={element.y + element.height / 2}
          rx={element.width / 2}
          ry={element.height / 2}
          fill={element.fill ?? 'none'}
          stroke={element.color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )
    case 'line':
      return (
        <line
          x1={element.x}
          y1={element.y}
          x2={element.x2}
          y2={element.y2}
          stroke={element.color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )
    case 'text': {
      const clipId = `${prefix}-text`
      return (
        <g>
          <defs>
            <clipPath id={clipId}>
              <rect
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
              />
            </clipPath>
          </defs>
          <text
            x={element.x}
            y={element.y}
            fill={element.color}
            fontSize={element.fontSize}
            fontFamily="'Segoe UI', system-ui, sans-serif"
            dominantBaseline="text-before-edge"
            clipPath={`url(#${clipId})`}
            xmlSpace="preserve"
          >
            {element.text.split('\n').map((line, index) => (
              <tspan
                key={index}
                x={element.x}
                dy={index === 0 ? 0 : element.fontSize * 1.3}
              >
                {line || '\u00a0'}
              </tspan>
            ))}
          </text>
        </g>
      )
    }
  }
}

export default function CanvasViewer({
  document,
  grid,
  aiOpen,
  onToggleAI,
  initialViewport,
  onViewportChange,
  rightInset = 0,
}: CanvasViewerProps) {
  const [history, setHistory] = useState(() =>
    createViewHistory(initialViewport ?? document.viewport),
  )
  const currentHistory = useRef(history)
  const notifiedViewport = useRef(history.present)
  const stage = useRef<HTMLDivElement>(null)
  const gesture = useRef<{
    pointerId: number
    x: number
    y: number
    history: ViewHistory
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const prefix = useId().replaceAll(':', '')
  const view = history.present

  function showHistory(next: ViewHistory, committed = true) {
    currentHistory.current = next
    setHistory(next)
    if (committed && !sameViewport(notifiedViewport.current, next.present)) {
      notifiedViewport.current = next.present
      onViewportChange?.(next.present)
    }
  }

  function changeView(next: CanvasViewport) {
    showHistory(commitView(currentHistory.current, next))
  }

  function center() {
    const bounds = stage.current?.getBoundingClientRect()
    return {
      x: Math.max(0, (bounds?.width ?? 0) - rightInset) / 2,
      y: (bounds?.height ?? 0) / 2,
    }
  }

  function changeZoom(factor: number) {
    changeView(
      zoomAt(
        currentHistory.current.present,
        currentHistory.current.present.zoom * factor,
        center(),
      ),
    )
  }

  function resetView() {
    const bounds = stage.current?.getBoundingClientRect()
    changeView(
      fitView(
        document.elements,
        Math.max(0, (bounds?.width ?? 0) - rightInset),
        bounds?.height ?? 0,
      ),
    )
  }

  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || gesture.current) return
    event.currentTarget.focus({ preventScroll: true })
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      history: currentHistory.current,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragging(true)
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    showHistory(
      {
        ...active.history,
        present: panBy(
          active.history.present,
          event.clientX - active.x,
          event.clientY - active.y,
        ),
      },
      false,
    )
  }

  function endPan(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    const next = cancelled
      ? active.history
      : commitView(active.history, currentHistory.current.present)
    showHistory(next)
    setDragging(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function navigateByKey(event: KeyboardEvent<HTMLDivElement>) {
    if (gesture.current) return
    const modifier = event.ctrlKey || event.metaKey
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      showHistory(
        event.shiftKey
          ? redoView(currentHistory.current)
          : undoView(currentHistory.current),
      )
      return
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      showHistory(redoView(currentHistory.current))
      return
    }
    if (modifier || event.altKey) return
    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault()
        changeZoom(1.2)
        break
      case '-':
      case '_':
        event.preventDefault()
        changeZoom(1 / 1.2)
        break
      case '0':
        event.preventDefault()
        resetView()
        break
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault()
        changeView(
          panBy(
            currentHistory.current.present,
            event.key === 'ArrowLeft'
              ? 60
              : event.key === 'ArrowRight'
                ? -60
                : 0,
            event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0,
          ),
        )
        break
    }
  }

  const gridSize = (view.zoom < 0.5 ? 120 : 24) * view.zoom
  const gridStyle = {
    '--canvas-grid-size': `${gridSize}px`,
    '--canvas-grid-x': `${view.x}px`,
    '--canvas-grid-y': `${view.y}px`,
  } as CSSProperties

  useEffect(() => {
    const surface = stage.current
    if (!surface) return
    // A non-passive listener keeps canvas zoom from also scrolling the page.
    function wheel(event: WheelEvent) {
      event.preventDefault()
      if (gesture.current || !surface) return
      const bounds = surface.getBoundingClientRect()
      const next = commitView(
        currentHistory.current,
        zoomAt(
          currentHistory.current.present,
          currentHistory.current.present.zoom *
            Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002),
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        ),
      )
      currentHistory.current = next
      setHistory(next)
      if (!sameViewport(notifiedViewport.current, next.present)) {
        notifiedViewport.current = next.present
        onViewportChange?.(next.present)
      }
    }
    surface.addEventListener('wheel', wheel, { passive: false })
    return () => surface.removeEventListener('wheel', wheel)
  }, [onViewportChange])

  return (
    <section className="canvas-viewer" aria-label="LCANVAS viewer">
      <div
        ref={stage}
        className="lcanvas-stage"
        data-grid={grid}
        data-dragging={dragging}
        style={gridStyle}
        tabIndex={0}
        role="region"
        aria-label={`${document.name} canvas view`}
        aria-describedby={`${prefix}-instructions`}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={(event) => endPan(event, true)}
        onLostPointerCapture={(event) => endPan(event)}
        onKeyDown={navigateByKey}
      >
        <svg
          className="lcanvas-drawing"
          role="img"
          aria-label={`${document.name}: ${document.elements.length} objects`}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {document.elements.map((element, index) => (
              <CanvasObject
                key={element.id}
                element={element}
                prefix={`${prefix}-${index}`}
              />
            ))}
          </g>
        </svg>
        {document.elements.length === 0 && (
          <div className="lcanvas-empty" aria-hidden="true">
            <span className="lcanvas-empty-symbol">↗</span>
            <h2>Your canvas, ready to view.</h2>
            <p>Import an LCANVAS file to explore its objects.</p>
            <small>Drawing tools will come in the next step.</small>
          </div>
        )}
      </div>
      <div
        className="canvas-view-rail"
        role="toolbar"
        aria-label="Canvas view controls"
      >
        <button
          type="button"
          aria-label="Undo view"
          title="Undo view"
          disabled={history.past.length === 0 || dragging}
          onClick={() => showHistory(undoView(currentHistory.current))}
        >
          <RailIcon>
            <path d="m8 6-5 5 5 5M3 11h10a7 7 0 0 1 7 7" />
          </RailIcon>
        </button>
        <button
          type="button"
          aria-label="Reset view"
          title="Reset view · fit objects within zoom limits (0)"
          disabled={dragging}
          onClick={resetView}
        >
          <RailIcon>
            <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
            <rect x="8" y="8" width="8" height="8" rx="1" />
          </RailIcon>
        </button>
        <button
          type="button"
          aria-label="Redo view"
          title="Redo view"
          disabled={history.future.length === 0 || dragging}
          onClick={() => showHistory(redoView(currentHistory.current))}
        >
          <RailIcon>
            <path d="m16 6 5 5-5 5m5-5H11a7 7 0 0 0-7 7" />
          </RailIcon>
        </button>
        <span className="canvas-rail-divider" />
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          disabled={view.zoom >= MAX_ZOOM || dragging}
          onClick={() => changeZoom(1.2)}
        >
          <RailIcon>
            <path d="M12 5v14M5 12h14" />
          </RailIcon>
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (-)"
          disabled={view.zoom <= MIN_ZOOM || dragging}
          onClick={() => changeZoom(1 / 1.2)}
        >
          <RailIcon>
            <path d="M5 12h14" />
          </RailIcon>
        </button>
        <span className="canvas-rail-spacer" />
        <button
          type="button"
          className={aiOpen ? 'canvas-ai-toggle active' : 'canvas-ai-toggle'}
          aria-label={
            aiOpen ? 'Close AI workspace panel' : 'Open AI workspace panel'
          }
          aria-expanded={aiOpen}
          aria-controls="workspace-ai-panel"
          title="Workspace AI / MCP"
          onClick={onToggleAI}
        >
          <RailIcon>
            <rect x="4" y="7" width="16" height="13" rx="4" />
            <path d="M12 7V3m-2 0h4M8 12h.01M16 12h.01M9 16h6" />
          </RailIcon>
        </button>
      </div>
      <div className="canvas-view-status">
        <p id={`${prefix}-instructions`}>
          Drag to pan · Scroll to zoom · + / − · 0 to fit
        </p>
        <span title="Undo and redo apply to view navigation. Drawing tools are not available yet.">
          View only
        </span>
        <output aria-label="Canvas zoom" aria-live="polite">
          {Math.round(view.zoom * 100)}%
        </output>
      </div>
    </section>
  )
}
