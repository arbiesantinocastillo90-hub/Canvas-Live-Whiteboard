import { useEffect, useRef, useState } from 'react'
import type { CanvasViewport } from './lcanvas'
import {
  RULER_UNIT_NAMES,
  rulerTicksForViewport,
  type CanvasControlSettings,
} from './canvasControls'

export default function CanvasRulers({
  viewport,
  unit,
}: {
  viewport: CanvasViewport
  unit: CanvasControlSettings['rulerUnit']
}) {
  const element = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const parent = element.current?.parentElement
    if (!parent) return
    function measure() {
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      )
    }
    measure()
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(parent)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  const ticks = rulerTicksForViewport(viewport, size.width, size.height, unit)
  return (
    <svg
      ref={element}
      className="canvas-rulers"
      role="img"
      aria-label={`Canvas rulers in ${RULER_UNIT_NAMES[unit]}`}
    >
      <rect
        className="canvas-ruler-background"
        x="0"
        y="0"
        width="100%"
        height="22"
      />
      <rect
        className="canvas-ruler-background"
        x="0"
        y="0"
        width="22"
        height="100%"
      />
      <path
        className="canvas-ruler-edge"
        d={`M22 0V${size.height}M0 22H${size.width}`}
      />
      {ticks.horizontal
        .filter((tick) => tick.position > 25)
        .map((tick) => (
          <g key={`x${tick.position}`}>
            <line
              x1={tick.position}
              x2={tick.position}
              y1={tick.major ? 12 : 17}
              y2="22"
            />
            {tick.major && (
              <text x={tick.position + 3} y="10">
                {tick.label}
              </text>
            )}
          </g>
        ))}
      {ticks.vertical
        .filter((tick) => tick.position > 25)
        .map((tick) => (
          <g key={`y${tick.position}`}>
            <line
              y1={tick.position}
              y2={tick.position}
              x1={tick.major ? 12 : 17}
              x2="22"
            />
            {tick.major && (
              <text
                transform={`translate(10 ${tick.position - 3}) rotate(-90)`}
              >
                {tick.label}
              </text>
            )}
          </g>
        ))}
      <rect className="canvas-ruler-background" width="22" height="22" />
      <text className="canvas-ruler-unit" x="11" y="14" textAnchor="middle">
        {unit}
      </text>
    </svg>
  )
}
