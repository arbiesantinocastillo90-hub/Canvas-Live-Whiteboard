import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { projectTree, type Project } from './workspace'

export default function CanvasDestinationDialog({
  projects,
  onChoose,
  onClose,
}: {
  projects: Project[]
  onChoose: (projectId: string) => void
  onClose: () => void
}) {
  const [projectId, setProjectId] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const select = useRef<HTMLSelectElement>(null)
  const valid = projects.some((project) => project.id === projectId)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    select.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
    if (event.key !== 'Tab') return
    const items = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled)',
    )
    if (!items?.length) return
    const first = items[0],
      last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  return (
    <div className="modal-backdrop">
      <div
        className="project-dialog canvas-destination-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-destination-title"
        onKeyDown={keys}
      >
        <h2 id="canvas-destination-title">Choose a canvas destination</h2>
        <p className="dialog-description">
          Choose the project in this workspace where your new canvas will
          belong.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) onChoose(projectId)
          }}
        >
          <label className="input-label" htmlFor="canvas-destination-project">
            Destination project
          </label>
          <select
            className="project-parent-select"
            id="canvas-destination-project"
            ref={select}
            value={valid ? projectId : ''}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="" disabled>
              Choose a project…
            </option>
            {projectTree(projects).map(({ project, depth }) => (
              <option key={project.id} value={project.id}>
                {`${'\u00a0\u00a0'.repeat(depth)}${project.name}`}
              </option>
            ))}
          </select>
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={!valid}>
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
