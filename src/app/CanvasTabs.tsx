import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Icon from './Icon'
import {
  orderedTabs,
  type TabGroup,
  type TabPresentation,
} from './workspaceSessions'
import './workspace-sessions.css'

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
  const ordered = orderedTabs(ids, tabs)
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
  function moveTab(id: string, target: string) {
    const moving = dragged.current.length
      ? ordered.filter((item) => dragged.current.includes(item))
      : [id]
    if (moving.includes(target)) return
    const remainder = ordered.filter((item) => !moving.includes(item))
    remainder.splice(remainder.indexOf(target), 0, ...moving)
    onOrder(orderedTabs(remainder, tabs))
  }
  const emittedGroups = new Set<string>()
  return (
    <div ref={root} className="canvas-tabs-content">
      {ordered.map((id) => {
        const file = files.find((item) => item.id === id)
        if (!file) return null
        const tab = presentation(id)
        const group = groups.find((item) => item.id === tab.groupId)
        const header = group && !emittedGroups.has(group.id)
        if (group) emittedGroups.add(group.id)
        return (
          <div className="tab-unit" key={id}>
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
                draggable
                onDragStart={(event) => {
                  dragged.current = selected.includes(id)
                    ? selected.filter((item) => ids.includes(item))
                    : [id]
                  event.dataTransfer.setData(
                    'application/x-canvas-live-tab',
                    id,
                  )
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  dragged.current = []
                }}
                onDragOver={(event) => {
                  if (dragged.current.length) event.preventDefault()
                }}
                onDrop={(event) => {
                  if (!dragged.current.length) return
                  event.preventDefault()
                  moveTab(id, id)
                  dragged.current = []
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
      {!ids.length && <span className="no-open-tabs">LCANVAS workspace</span>}
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
