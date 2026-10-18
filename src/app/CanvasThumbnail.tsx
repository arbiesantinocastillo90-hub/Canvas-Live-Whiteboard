import { useId } from 'react'
import type { CanvasDocument, CanvasElement } from './lcanvas'
import { canvasFontFamily } from './canvasText'
import { ConnectionDrawing, ShapeOutline } from './RichObject'
import { lineDash } from './canvasDrawing'
import EmbedObject from './EmbedObject'
import { orderedVisibleElements } from './canvasOperations'
import Icon from './Icon'

export default function CanvasThumbnail({
  document,
}: {
  document: CanvasDocument
}) {
  const prefix = useId()
  const visible = orderedVisibleElements(document)
  const positioned = visible.filter((item) => item.type !== 'connection')
  if (!positioned.length) return <Icon name="canvas" />
  const left = Math.min(
    ...positioned.map((item) =>
      Math.min(item.x, item.type === 'line' ? item.x2 : item.x),
    ),
  )
  const top = Math.min(
    ...positioned.map((item) =>
      Math.min(item.y, item.type === 'line' ? item.y2 : item.y),
    ),
  )
  const right = Math.max(
    ...positioned.map((item) =>
      item.type === 'line' ? Math.max(item.x, item.x2) : item.x + item.width,
    ),
  )
  const bottom = Math.max(
    ...positioned.map((item) =>
      item.type === 'line' ? Math.max(item.y, item.y2) : item.y + item.height,
    ),
  )
  const padding = Math.max(16, Math.max(right - left, bottom - top) * 0.08)
  const box = `${left - padding} ${top - padding} ${Math.max(1, right - left) + padding * 2} ${Math.max(1, bottom - top) + padding * 2}`
  function object(item: CanvasElement) {
    if (item.type === 'connection')
      return (
        <ConnectionDrawing
          key={item.id}
          document={document}
          element={item}
          prefix={`${prefix}-${item.id}`}
          hitTarget={false}
        />
      )
    if (item.type === 'embed')
      return <EmbedObject key={item.id} element={item} interactive={false} />
    if (item.type === 'line')
      return (
        <line
          key={item.id}
          x1={item.x}
          y1={item.y}
          x2={item.x2}
          y2={item.y2}
          stroke={item.color}
          strokeWidth="1.4"
          strokeDasharray={lineDash(item.linePattern)}
          vectorEffect="non-scaling-stroke"
        />
      )
    const fill = 'fill' in item ? (item.fill ?? 'none') : 'none'
    const text = item.type === 'area' ? item.name : item.text
    const fontSize =
      item.type === 'area'
        ? 12
        : Math.min(
            item.fontSize,
            item.height / 3,
            (item.width / Math.max(2, Math.min(30, text.length))) * 1.4,
          )
    const lines = text
      .split('\n')
      .slice(0, 3)
      .map((line) => (line.length > 46 ? `${line.slice(0, 45)}…` : line))
    return (
      <g key={item.id} data-thumbnail-object={item.type}>
        {item.type === 'area' ? (
          <rect
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            fill={fill}
            stroke={item.color}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : item.type !== 'text' ? (
          <ShapeOutline element={item} strokeWidth={1.4} />
        ) : null}
        {text && (
          <text
            x={item.x + item.width / 2}
            y={item.y + item.height / 2 - (lines.length - 1) * fontSize * 0.6}
            fill={
              'textColor' in item ? (item.textColor ?? item.color) : item.color
            }
            fontFamily={'text' in item ? canvasFontFamily(item) : undefined}
            fontWeight={'fontWeight' in item ? item.fontWeight : undefined}
            fontStyle={'fontStyle' in item ? item.fontStyle : undefined}
            fontSize={Math.max(1, fontSize)}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {lines.map((line, index) => (
              <tspan
                key={index}
                x={item.x + item.width / 2}
                dy={index ? fontSize * 1.2 : 0}
              >
                {line}
              </tspan>
            ))}
          </text>
        )}
      </g>
    )
  }
  return (
    <svg
      className="canvas-thumbnail"
      viewBox={box}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      {visible.slice(0, 1000).map(object)}
    </svg>
  )
}
