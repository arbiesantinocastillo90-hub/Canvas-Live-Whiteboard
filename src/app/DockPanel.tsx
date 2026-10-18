import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import Icon from './Icon'
import PanelResizeHandle from './PanelResizeHandle'
import { boundedAutoHideDelay } from './layout'

type Props = {
  id: string
  label: string
  side: 'left' | 'right'
  open: boolean
  pinned: boolean
  width: number
  min: number
  max: number
  defaultWidth: number
  tabs: { id: string; label: string; icon?: ReactNode }[]
  activeTab: string
  onSelect: (id: string) => void
  onClose: () => void
  onPin: (pinned: boolean) => void
  onWidthChange: (width: number) => void
  autoHide?: boolean
  autoHideDelay?: number
  onMove?: (side: 'left' | 'right') => void
  children: ReactNode
}

export default function DockPanel({
  id,
  label,
  side,
  open,
  pinned,
  width,
  min,
  max,
  defaultWidth,
  tabs,
  activeTab,
  onSelect,
  onClose,
  onPin,
  onWidthChange,
  autoHide = true,
  autoHideDelay = 280,
  onMove,
  children,
}: Props) {
  const root = useRef<HTMLElement>(null)
  const arrangement = useRef<{
    pointerId: number
    startX: number
    side: 'left' | 'right'
    header: HTMLElement
  } | null>(null)
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null)
  const keyboardFocus = useRef(true)
  const endArrangement = useCallback(
    (cancelled = false) => {
      const drag = arrangement.current
      if (!drag) return
      arrangement.current = null
      setDropSide(null)
      if (drag.header.hasPointerCapture?.(drag.pointerId))
        drag.header.releasePointerCapture(drag.pointerId)
      if (!cancelled && drag.side !== side) onMove?.(drag.side)
    },
    [side, onMove],
  )
  function beginArrangement(event: ReactPointerEvent<HTMLDivElement>) {
    if (!onMove || event.button !== 0) return
    const target = event.target instanceof Element ? event.target : null
    if (
      target?.closest('button, input, select, textarea') &&
      !target.closest('.dock-move-handle')
    )
      return
    event.preventDefault()
    arrangement.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      side,
      header: event.currentTarget,
    }
    setDropSide(side)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  function moveArrangement(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = arrangement.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (Math.abs(event.clientX - drag.startX) < 12) return
    const bounds = root.current
      ?.closest('.workspace-deck')
      ?.getBoundingClientRect()
    const midpoint =
      bounds && bounds.width > 0
        ? bounds.left + bounds.width / 2
        : window.innerWidth / 2
    drag.side = event.clientX < midpoint ? 'left' : 'right'
    setDropSide(drag.side)
  }
  useEffect(() => {
    const pointer = () => {
      keyboardFocus.current = false
    }
    const keyboard = () => {
      keyboardFocus.current = true
    }
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [])
  const explicitClose = () => {
    onClose()
    document
      .querySelector<HTMLButtonElement>(`[data-dock-trigger="${side}"]`)
      ?.focus()
  }
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open || pinned || !autoHide) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      if (timer) clearTimeout(timer)
      timer = undefined
    }
    const protectedInteraction = () =>
      arrangement.current ||
      (root.current?.contains(document.activeElement) &&
        (keyboardFocus.current ||
          document.activeElement?.matches(
            'input, textarea, select, [contenteditable="true"]',
          ))) ||
      root.current?.querySelector('[data-resizing="true"]') ||
      document.querySelector('[aria-modal="true"]')
    const inside = (target: EventTarget | null) =>
      target instanceof Element &&
      (root.current?.contains(target) ||
        target.closest(`[data-dock-trigger="${side}"]`))
    const schedule = () => {
      if (timer || protectedInteraction()) return
      timer = setTimeout(() => {
        timer = undefined
        if (!protectedInteraction()) close.current()
      }, boundedAutoHideDelay(autoHideDelay))
    }
    const move = (event: PointerEvent) => {
      if (inside(event.target)) clear()
      else schedule()
    }
    const outside = (event: PointerEvent) => {
      if (
        !inside(event.target) &&
        !arrangement.current &&
        !root.current?.querySelector('[data-resizing="true"]') &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        clear()
        close.current()
      }
    }
    const focus = (event: FocusEvent) => {
      if (inside(event.target)) clear()
      else schedule()
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', focus)
    return () => {
      clear()
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', focus)
    }
  }, [open, pinned, side, autoHide, autoHideDelay])
  useEffect(() => {
    if (!open) endArrangement(true)
  }, [open, endArrangement])
  useEffect(
    () => () => {
      const drag = arrangement.current
      if (drag?.header.hasPointerCapture?.(drag.pointerId))
        drag.header.releasePointerCapture(drag.pointerId)
      arrangement.current = null
    },
    [],
  )
  return (
    <aside
      id={id}
      ref={root}
      className="dock-panel"
      aria-label={label}
      hidden={!open}
      inert={!open}
      data-dock-side={side}
      data-pinned={pinned}
      data-open={open}
      data-arranging={dropSide !== null}
      data-drop-side={dropSide ?? undefined}
      style={{ width }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && arrangement.current) {
          event.preventDefault()
          event.stopPropagation()
          endArrangement(true)
          return
        }
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          !(
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement
          )
        ) {
          event.preventDefault()
          event.stopPropagation()
          explicitClose()
        }
      }}
    >
      <div
        className="dock-panel-header"
        onPointerDown={beginArrangement}
        onPointerMove={moveArrangement}
        onPointerUp={(event) => {
          if (arrangement.current?.pointerId === event.pointerId) {
            moveArrangement(event)
            endArrangement()
          }
        }}
        onPointerCancel={() => endArrangement(true)}
        onLostPointerCapture={() => endArrangement(true)}
      >
        {onMove && (
          <button
            className="dock-chrome-button dock-move-handle"
            aria-label={`Move ${side} panel`}
            title="Drag to move · Alt+Left / Right"
            onClick={(event) => {
              if (event.detail === 0) onMove(side === 'left' ? 'right' : 'left')
            }}
            onKeyDown={(event) => {
              if (
                !event.defaultPrevented &&
                !event.nativeEvent.isComposing &&
                event.altKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
              ) {
                event.preventDefault()
                event.stopPropagation()
                onMove(event.key === 'ArrowLeft' ? 'left' : 'right')
              }
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="8" cy="6" r="1.5" />
              <circle cx="16" cy="6" r="1.5" />
              <circle cx="8" cy="12" r="1.5" />
              <circle cx="16" cy="12" r="1.5" />
              <circle cx="8" cy="18" r="1.5" />
              <circle cx="16" cy="18" r="1.5" />
            </svg>
          </button>
        )}
        <div
          className="dock-panel-tabs"
          role="tablist"
          aria-label={`${side === 'left' ? 'Left' : 'Right'} panel tabs`}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-label={tab.label}
              data-icon={Boolean(tab.icon)}
              aria-selected={tab.id === activeTab}
              tabIndex={tab.id === activeTab ? 0 : -1}
              aria-controls={`${id}-content`}
              title={`${tab.label} · Double-click to ${pinned ? 'unpin' : 'pin'}`}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                if (
                  event.defaultPrevented ||
                  event.altKey ||
                  event.ctrlKey ||
                  event.metaKey ||
                  !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                    event.key,
                  ) ||
                  event.nativeEvent.isComposing
                )
                  return
                event.preventDefault()
                const index = tabs.findIndex((item) => item.id === tab.id)
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (index +
                          (event.key === 'ArrowRight' ? 1 : -1) +
                          tabs.length) %
                        tabs.length
                onSelect(tabs[next].id)
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [next]?.focus()
              }}
              onDoubleClick={() => onPin(!pinned)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          className="dock-chrome-button"
          aria-label={`${pinned ? 'Unpin' : 'Pin'} ${side} panel`}
          aria-pressed={pinned}
          title={pinned ? 'Unpin panel' : 'Pin panel'}
          onClick={() => onPin(!pinned)}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill={pinned ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m8 3 8 0-1 6 3 4H6l3-4-1-6Z M12 13v8" />
          </svg>
        </button>
        <button
          className="dock-chrome-button"
          aria-label={`Close ${side} panel`}
          title="Close panel"
          onClick={explicitClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dock-panel-content" id={`${id}-content`} role="tabpanel">
        {children}
      </div>
      <PanelResizeHandle
        label={`Resize ${side} panel`}
        value={width}
        min={min}
        max={max}
        defaultValue={defaultWidth}
        edge={side === 'left' ? 'right' : 'left'}
        onChange={onWidthChange}
      />
    </aside>
  )
}
