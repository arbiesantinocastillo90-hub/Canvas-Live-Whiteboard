import { useEffect, useRef, type ReactNode } from 'react'
import Icon from './Icon'
import PanelResizeHandle from './PanelResizeHandle'

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
  children,
}: Props) {
  const root = useRef<HTMLElement>(null)
  const keyboardFocus = useRef(true)
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
    if (!open || pinned) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      if (timer) clearTimeout(timer)
      timer = undefined
    }
    const protectedInteraction = () =>
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
      }, 280)
    }
    const move = (event: PointerEvent) => {
      if (inside(event.target)) clear()
      else schedule()
    }
    const outside = (event: PointerEvent) => {
      if (
        !inside(event.target) &&
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
  }, [open, pinned, side])
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
      style={{ width }}
      onKeyDown={(event) => {
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
      <div className="dock-panel-header">
        <div
          className="dock-panel-tabs"
          role="tablist"
          aria-label={`${side === 'left' ? 'Left' : 'Right'} panel tabs`}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
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
