import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import Icon from './Icon'
import {
  orderedTabs,
  type TabGroup,
  type TabPresentation,
} from './workspaceSessions'
import './workspace-sessions.css'
import { reorderDraggedTabs, type TabDropTarget } from './canvasTabDrag'

type TabFile = { id: string; name: string; dirty: boolean }
type Props = {
  ids: string[]
  files: TabFile[]
  activeId: string | null
  tabs: TabPresentation[]
  groups: TabGroup[]
  onOpen: (id: string) => void
  onClose: (id: string) => void
  onOrder: (ids: string[]) => void
  onPresentation: (tabs: TabPresentation[], groups: TabGroup[]) => void
  onNavigate: (event: KeyboardEvent<HTMLButtonElement>, id: string) => void
}
export default function CanvasTabs({
  ids,
  files,
  activeId,
  tabs,
  groups,
  onOpen,
  onClose,
  onOrder,
  onPresentation,
  onNavigate,
}: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [menu, setMenu] = useState<{
    x: number
    y: number
    ids: string[]
  } | null>(null)
  const [groupName, setGroupName] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const dragged = useRef<string[]>([])
  const [dragging, setDragging] = useState<string[]>([])
  const [dropTarget, setDropTarget] = useState<TabDropTarget | null>(null)
  const [settling, setSettling] = useState<string[]>([])
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollFrame = useRef<number | null>(null)
  const pointerX = useRef<number | null>(null)
  const previousPositions = useRef(new Map<string, number>())
  const ordered = orderedTabs(ids, tabs)
  const orderSignature = JSON.stringify(ordered)
  const motionReduced = () =>
    !!root.current?.closest('[data-motion="reduced"]') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  function stopScrolling() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = null
    pointerX.current = null
  }
  useEffect(
    () => () => {
      stopScrolling()
      if (settleTimer.current !== null) clearTimeout(settleTimer.current)
    },
    [],
  )
  useLayoutEffect(() => {
    if (previousPositions.current.size && !motionReduced()) {
      const style = root.current && getComputedStyle(root.current)
      const duration = Math.max(
        0,
        Number.parseFloat(style?.getPropertyValue('--motion-duration') ?? '') ||
          180,
      )
      root.current
        ?.querySelectorAll<HTMLElement>('.tab-unit')
        .forEach((tab) => {
          const previous = previousPositions.current.get(
            tab.dataset.tabId ?? '',
          )
          const delta =
            (previous ?? tab.getBoundingClientRect().left) -
            tab.getBoundingClientRect().left
          if (Math.abs(delta) > 1)
            tab.animate?.(
              [
                { transform: `translateX(${delta}px)` },
                { transform: 'translateX(0)' },
              ],
              { duration, easing: 'ease-out' },
            )
        })
    }
    previousPositions.current.clear()
  }, [orderSignature])
  useEffect(() => {
    if (!menu) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setMenu(null)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [menu])
  const presentation = (id: string): TabPresentation =>
    tabs.find((tab) => tab.id === id) ?? {
      id,
      pinned: false,
      compact: false,
      groupId: null,
    }
  function patch(change: Partial<TabPresentation>) {
    if (!menu) return
    const next = ids.map((id) =>
      menu.ids.includes(id)
        ? { ...presentation(id), ...change }
        : presentation(id),
    )
    onPresentation(next, groups)
    setMenu(null)
  }
  function context(id: string, x: number, y: number) {
    const targets = selected.includes(id)
      ? selected.filter((item) => ids.includes(item))
      : [id]
    setSelected(targets)
    setGroupName('')
    setMenu({
      ids: targets,
      x: Math.max(0, Math.min(x, window.innerWidth - 230)),
      y: Math.max(0, Math.min(y, window.innerHeight - 390)),
    })
  }
  function targetAt(event: DragEvent<HTMLDivElement>): TabDropTarget | null {
    const unit =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('.tab-unit')
        : null
    if (unit?.dataset.tabId && root.current?.contains(unit)) {
      const box = unit.getBoundingClientRect()
      return {
        id: unit.dataset.tabId,
        edge:
          box.width > 0 && event.clientX >= box.left + box.width / 2
            ? 'after'
            : 'before',
      }
    }
    const units = root.current?.querySelectorAll<HTMLElement>('.tab-unit')
    if (!units?.length) return null
    const first = units[0]
    const last = units[units.length - 1]
    return event.clientX <= first.getBoundingClientRect().left
      ? { id: first.dataset.tabId!, edge: 'before' }
      : { id: last.dataset.tabId!, edge: 'after' }
  }
  function scrollAtEdge(x: number) {
    pointerX.current = x
    if (scrollFrame.current !== null) return
    const tick = () => {
      const strip = root.current?.closest<HTMLElement>('.canvas-tabs')
      if (!strip || pointerX.current === null || !dragged.current.length) {
        scrollFrame.current = null
        return
      }
      const box = strip.getBoundingClientRect()
      const edge = Math.min(44, box.width / 4)
      const left = pointerX.current - box.left
      const right = box.right - pointerX.current
      const speed =
        left < edge
          ? -Math.min(18, (edge - left) / 2)
          : right < edge
            ? Math.min(18, (edge - right) / 2)
            : 0
      if (speed) strip.scrollLeft += speed
      scrollFrame.current = requestAnimationFrame(tick)
    }
    scrollFrame.current = requestAnimationFrame(tick)
  }
  function finishDrag() {
    const released = [...dragged.current]
    dragged.current = []
    setDragging([])
    setDropTarget(null)
    stopScrolling()
    if (settleTimer.current !== null) clearTimeout(settleTimer.current)
    setSettling(released)
    settleTimer.current = setTimeout(() => setSettling([]), 280)
  }
  const emittedGroups = new Set<string>()
  return (
    <div
      ref={root}
      className="canvas-tabs-content"
      data-drag-active={dragging.length > 0}
      onDragOver={(event) => {
        if (!dragged.current.length) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const target = targetAt(event)
        const next =
          target && reorderDraggedTabs(ordered, tabs, dragged.current, target)
        setDropTarget(
          target && next?.some((id, index) => id !== ordered[index])
            ? target
            : null,
        )
        scrollAtEdge(event.clientX)
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          root.current?.contains(event.relatedTarget)
        )
          return
        setDropTarget(null)
        stopScrolling()
      }}
      onDrop={(event) => {
        if (!dragged.current.length) return
        event.preventDefault()
        const target = targetAt(event)
        const next =
          target && reorderDraggedTabs(ordered, tabs, dragged.current, target)
        if (next?.some((id, index) => id !== ordered[index])) {
          root.current
            ?.querySelectorAll<HTMLElement>('.tab-unit')
            .forEach((tab) => {
              if (tab.dataset.tabId)
                previousPositions.current.set(
                  tab.dataset.tabId,
                  tab.getBoundingClientRect().left,
                )
            })
          onOrder(next)
        }
        finishDrag()
      }}
    >
      {ordered.map((id) => {
        const file = files.find((item) => item.id === id)
        if (!file) return null
        const tab = presentation(id)
        const group = groups.find((item) => item.id === tab.groupId)
        const header = group && !emittedGroups.has(group.id)
        if (group) emittedGroups.add(group.id)
        return (
          <div
            className="tab-unit"
            key={id}
            data-tab-id={id}
            data-drop-edge={dropTarget?.id === id ? dropTarget.edge : undefined}
            data-settling={settling.includes(id)}
          >
            {header && (
              <button
                className="tab-group-toggle"
                aria-expanded={!group.collapsed}
                aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} tab group ${group.name}`}
                title={group.name}
                onClick={() =>
                  onPresentation(
                    tabs,
                    groups.map((item) =>
                      item.id === group.id
                        ? { ...item, collapsed: !item.collapsed }
                        : item,
                    ),
                  )
                }
              >
                {group.collapsed ? '▸' : '▾'} {group.name}
              </button>
            )}
            {(!group?.collapsed || activeId === id) && (
              <div
                className="canvas-tab"
                data-active={id === activeId}
                data-selected={selected.includes(id)}
                data-compact={tab.compact}
                data-pinned={tab.pinned}
                data-dragging={dragging.includes(id)}
                draggable
                onDragStart={(event) => {
                  dragged.current = selected.includes(id)
                    ? ordered.filter((item) => selected.includes(item))
                    : [id]
                  setDragging([...dragged.current])
                  setSettling([])
                  setMenu(null)
                  event.dataTransfer.setData(
                    'application/x-canvas-live-tab',
                    id,
                  )
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  if (dragged.current.length) finishDrag()
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  context(id, event.clientX, event.clientY)
                }}
              >
                <button
                  role="tab"
                  aria-selected={id === activeId}
                  aria-label={file.name}
                  aria-controls="canvas-file-pane"
                  title={`${file.name}${tab.pinned ? ' · Pinned' : ''}`}
                  tabIndex={id === activeId ? 0 : -1}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'ContextMenu' ||
                      (event.shiftKey && event.key === 'F10')
                    ) {
                      event.preventDefault()
                      const box = event.currentTarget.getBoundingClientRect()
                      context(id, box.left, box.bottom)
                      return
                    }
                    if (
                      event.altKey &&
                      ['ArrowLeft', 'ArrowRight'].includes(event.key)
                    ) {
                      event.preventDefault()
                      const index = ordered.indexOf(id)
                      const targetIndex = Math.max(
                        0,
                        Math.min(
                          ordered.length - 1,
                          index + (event.key === 'ArrowLeft' ? -1 : 1),
                        ),
                      )
                      const next = [...ordered]
                      next.splice(index, 1)
                      next.splice(targetIndex, 0, id)
                      onOrder(orderedTabs(next, tabs))
                      return
                    }
                    onNavigate(event, id)
                  }}
                  onClick={(event) => {
                    if (event.ctrlKey || event.metaKey) {
                      setSelected((current) =>
                        current.includes(id)
                          ? current.filter((item) => item !== id)
                          : [...current, id],
                      )
                      return
                    }
                    setSelected([id])
                    onOpen(id)
                  }}
                >
                  <Icon name="canvas" />
                  <span className="tab-name">{file.name}</span>
                  {file.dirty && <span aria-label="Unsaved changes">•</span>}
                </button>
                <button
                  className="tab-close"
                  aria-label={`Close canvas ${file.name}`}
                  title="Close tab; keep file"
                  tabIndex={id === activeId ? 0 : -1}
                  onClick={() => onClose(id)}
                >
                  <Icon name="close" />
                </button>
              </div>
            )}
          </div>
        )
      })}
      {!ids.length && <span className="no-open-tabs">Canvas workspace</span>}
      {menu && (
        <div
          className="tab-context-menu"
          role="dialog"
          aria-label="Tab actions"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setMenu(null)
            }
          }}
        >
          <button onClick={() => patch({ pinned: true, compact: true })}>
            Pin tabs
          </button>
          <button onClick={() => patch({ pinned: false })}>Unpin tabs</button>
          <button onClick={() => patch({ compact: true })}>
            Collapse tabs
          </button>
          <button onClick={() => patch({ compact: false })}>Expand tabs</button>
          <button onClick={() => patch({ groupId: null })}>Ungroup tabs</button>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!groupName.trim() || groupName.trim().length > 80) return
              const groupId = crypto.randomUUID()
              onPresentation(
                ids.map((id) =>
                  menu.ids.includes(id)
                    ? { ...presentation(id), groupId }
                    : presentation(id),
                ),
                [
                  ...groups,
                  { id: groupId, name: groupName.trim(), collapsed: false },
                ],
              )
              setMenu(null)
            }}
          >
            <input
              autoFocus
              aria-label="Tab group name"
              maxLength={80}
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Group name"
            />
            <button type="submit" disabled={!groupName.trim()}>
              Group tabs
            </button>
          </form>
          <button
            onClick={() => {
              menu.ids.forEach(onClose)
              setMenu(null)
            }}
          >
            Close tabs
          </button>
          <button onClick={() => setMenu(null)}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
