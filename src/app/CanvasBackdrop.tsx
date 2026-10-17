import { type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CanvasViewport } from './lcanvas'
import type { CanvasDeckGeometry } from './canvasDeck'
import './canvas-backdrop.css'

/** Decorative continuation only: all interactions remain on the real stage. */
export default function CanvasBackdrop({
  geometry,
  viewport,
  grid,
  gridSize,
  children,
}: {
  geometry: CanvasDeckGeometry
  viewport: CanvasViewport
  grid: 'dots' | 'lines' | 'none'
  gridSize: number
  children: ReactNode
}) {
  const x = viewport.x + geometry.x
  const y = viewport.y + geometry.y
  return createPortal(
    <div
      className="canvas-backdrop"
      aria-hidden="true"
      inert
      data-grid={grid}
      style={
        {
          '--canvas-grid-size': `${gridSize}px`,
          '--canvas-grid-x': `${x}px`,
          '--canvas-grid-y': `${y}px`,
        } as CSSProperties
      }
    >
      <svg className="canvas-backdrop-drawing" focusable="false">
        <g transform={`translate(${x} ${y}) scale(${viewport.zoom})`}>
          {children}
        </g>
      </svg>
    </div>,
    geometry.host,
  )
}
