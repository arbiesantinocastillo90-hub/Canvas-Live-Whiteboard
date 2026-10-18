import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Project } from './workspace'
import type { ProjectMenuAnchor } from './projectMenuAnchor'
import './project-context-menu.css'

export default function ProjectContextMenu({
  anchor,
  project,
  onClose,
  onOpen,
  onNewChild,
  onRename,
  onCustomize,
}: {
  anchor: ProjectMenuAnchor
  project: Project
  onClose: () => void
  onOpen: (id: string) => void
  onNewChild?: (parentId: string) => void
  onRename?: (project: Project) => void
  onCustomize?: (project: Project) => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = menu.current
    if (!element) return
    const bounds = element.getBoundingClientRect()
    element.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - bounds.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - bounds.height - 8))}px`
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [anchor])
  useEffect(() => {
    const element = menu.current
    function outside(event: PointerEvent) {
      if (!element?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', onClose)
      if (element?.contains(document.activeElement)) anchor.trigger.focus()
    }
  }, [anchor, onClose])
  function action(run: () => void) {
    onClose()
    run()
  }
  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      onClose()
      anchor.trigger.focus()
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ) ?? [],
    )
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    items[
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
            items.length
    ]?.focus()
  }
  return createPortal(
    <div
      className="project-context-menu"
      ref={menu}
      role="menu"
      aria-label={`Actions for project ${project.name}`}
      onKeyDown={keys}
      style={{ left: anchor.x, top: anchor.y }}
    >
      <button
        role="menuitem"
        disabled
        title="This project has no linked local folder. Imported project archives do not expose their file location."
        aria-describedby="project-location-unavailable"
      >
        Open file location
      </button>
      <small id="project-location-unavailable">
        No local folder is linked to this project.
      </small>
      <button role="menuitem" onClick={() => action(() => onOpen(project.id))}>
        Open project
      </button>
      <button
        role="menuitem"
        disabled={!onNewChild}
        onClick={() => action(() => onNewChild?.(project.id))}
      >
        New subproject
      </button>
      <button
        role="menuitem"
        disabled={!onRename}
        onClick={() => action(() => onRename?.(project))}
      >
        Rename project
      </button>
      <button
        role="menuitem"
        disabled={!onCustomize}
        onClick={() => action(() => onCustomize?.(project))}
      >
        Customize project
      </button>
    </div>,
    anchor.trigger.closest('.app-shell') ?? document.body,
  )
}
