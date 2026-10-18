import type {
  CanvasDocument,
  CanvasElement,
  ConnectionElement,
  PointerType,
  ShapeElement,
} from './lcanvas'
import { connectionPath, shapePolygon } from './lcanvas'
import { lineDash } from './canvasDrawing'
import {
  canvasFontFamily,
  canvasTextPlacement,
  DEFAULT_TEXT_OPTIONS,
  layoutCanvasText,
  type TextLayoutOptions,
} from './canvasText'

/** The same shape outline is used on the live board and in static previews. */
export function ShapeOutline({
  element,
  strokeWidth = 2,
}: {
  element: ShapeElement
  strokeWidth?: number
}) {
  const { x, y, width, height } = element
  const common = {
    fill: element.fill ?? 'none',
    stroke: element.color,
    strokeWidth,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  if (element.type === 'ellipse')
    return (
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        rx={width / 2}
        ry={height / 2}
        {...common}
      />
    )
  const points = shapePolygon(element)
  if (points)
    return (
      <polygon
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        {...common}
      />
    )
  if (element.type === 'cylinder') {
    const cap = height * 0.16
    return (
      <g>
        <path
          d={`M ${x} ${y + cap} A ${width / 2} ${cap} 0 0 1 ${x + width} ${y + cap} V ${y + height - cap} A ${width / 2} ${cap} 0 0 1 ${x} ${y + height - cap} Z`}
          {...common}
        />
        <ellipse
          cx={x + width / 2}
          cy={y + cap}
          rx={width / 2}
          ry={cap}
          {...common}
        />
      </g>
    )
  }
  return <rect x={x} y={y} width={width} height={height} rx={6} {...common} />
}

export function CanvasObjectText({
  element,
  prefix,
  textOptions = DEFAULT_TEXT_OPTIONS,
}: {
  element: Extract<CanvasElement, { text: string }>
  prefix: string
  textOptions?: TextLayoutOptions
}) {
  const layout = layoutCanvasText(element, textOptions)
  const { x, y, textAnchor } = canvasTextPlacement(element, layout)
  const clipId = `${prefix}-text`
  const left =
    textAnchor === 'end'
      ? x - layout.width
      : textAnchor === 'middle'
        ? x - layout.width / 2
        : x
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect
            x={Math.min(layout.box.x, left)}
            y={y}
            width={Math.max(layout.box.width, layout.width)}
            height={Math.max(layout.box.height, layout.height)}
          />
        </clipPath>
      </defs>
      <text
        x={x}
        y={y}
        fill={element.textColor ?? element.color}
        fontSize={layout.fontSize}
        fontFamily={canvasFontFamily(element)}
        fontWeight={element.fontWeight ?? 'normal'}
        fontStyle={element.fontStyle ?? 'normal'}
        textAnchor={textAnchor}
        dominantBaseline="text-before-edge"
        clipPath={`url(#${clipId})`}
        aria-label={element.text}
        data-text-overflow={layout.overflow}
        xmlSpace="preserve"
      >
        {layout.lines.map((line, index) => (
          <tspan key={index} x={x} dy={index ? layout.lineHeight : 0}>
            {line || '\u00a0'}
          </tspan>
        ))}
      </text>
    </g>
  )
}

function Pointer({ type, color }: { type: PointerType; color: string }) {
  const common = {
    stroke: color,
    strokeWidth: 1.5,
    strokeLinejoin: 'round' as const,
  }
  switch (type) {
    case 'arrow':
      return <path d="M 1 1 L 9 5 L 1 9 Z" fill={color} />
    case 'open-arrow':
      return <path d="M 1 1 L 9 5 L 1 9" fill="none" {...common} />
    case 'circle':
      return <circle cx="5" cy="5" r="3.5" fill={color} />
    case 'diamond':
      return <path d="M 1 5 L 5 1 L 9 5 L 5 9 Z" fill={color} />
    case 'bar':
      return <path d="M 8 1 V 9" {...common} />
    default:
      return null
  }
}

export function ConnectionDrawing({
  document,
  element,
  prefix,
  hitTarget = true,
}: {
  document: CanvasDocument
  element: ConnectionElement
  prefix: string
  hitTarget?: boolean
}) {
  const path = connectionPath(document, element)
  const start = element.startPointer ?? (element.startArrow ? 'arrow' : 'none')
  const end = element.endPointer ?? (element.endArrow ? 'arrow' : 'none')
  const marker = (type: PointerType, endpoint: 'start' | 'end') =>
    type === 'none' ? null : (
      <marker
        id={`${prefix}-${endpoint}`}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient={endpoint === 'start' ? 'auto-start-reverse' : 'auto'}
      >
        <Pointer type={type} color={element.color} />
      </marker>
    )
  return (
    <>
      <defs>
        {marker(start, 'start')}
        {marker(end, 'end')}
      </defs>
      <path
        data-connection-path="true"
        d={path}
        fill="none"
        stroke={element.color}
        strokeWidth="2"
        strokeDasharray={lineDash(element.linePattern)}
        strokeLinecap={element.linePattern === 'dotted' ? 'round' : undefined}
        vectorEffect="non-scaling-stroke"
        markerStart={start === 'none' ? undefined : `url(#${prefix}-start)`}
        markerEnd={end === 'none' ? undefined : `url(#${prefix}-end)`}
      />
      {hitTarget && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth="14"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </>
  )
}
