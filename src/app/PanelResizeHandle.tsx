import { useRef, useState } from 'react'

export default function PanelResizeHandle({
  label,
  value,
  min,
  max,
  defaultValue,
  edge = 'right',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  defaultValue: number
  edge?: 'left' | 'right' | 'top' | 'bottom'
  onChange: (width: number) => void
}) {
  const start = useRef<{ x: number; width: number; pointerId: number } | null>(
    null,
  )
  const [resizing, setResizing] = useState(false)
  const horizontal = edge === 'top' || edge === 'bottom'
  const direction = edge === 'right' || edge === 'top' ? 1 : -1
  function change(width: number) {
    onChange(Math.round(Math.max(min, Math.min(max, width))))
  }
  return (
    <div
      className="panel-resize-handle"
      role="separator"
      aria-label={label}
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      data-edge={edge}
      data-resizing={resizing}
      title="Drag to resize · Arrow keys to adjust · Double-click to reset"
      onDoubleClick={() => change(defaultValue)}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        start.current = {
          x: horizontal ? event.clientY : event.clientX,
          width: value,
          pointerId: event.pointerId,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setResizing(true)
      }}
      onPointerMove={(event) => {
        if (!start.current || start.current.pointerId !== event.pointerId)
          return
        event.stopPropagation()
        change(
          start.current.width +
            ((horizontal ? event.clientY : event.clientX) - start.current.x) *
              direction,
        )
      }}
      onPointerUp={(event) => {
        if (start.current?.pointerId !== event.pointerId) return
        start.current = null
        setResizing(false)
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        start.current = null
        setResizing(false)
      }}
      onLostPointerCapture={() => {
        start.current = null
        setResizing(false)
      }}
      onKeyDown={(event) => {
        if (
          !(
            horizontal
              ? ['ArrowUp', 'ArrowDown', 'Home', 'End']
              : ['ArrowLeft', 'ArrowRight', 'Home', 'End']
          ).includes(event.key)
        )
          return
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Home') change(min)
        else if (event.key === 'End') change(max)
        else {
          change(
            value +
              (event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : -1) *
                direction *
                (event.shiftKey ? 30 : 10),
          )
        }
      }}
    />
  )
}
