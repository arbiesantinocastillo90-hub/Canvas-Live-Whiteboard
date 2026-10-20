import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Project } from './workspace'
import type { SavedWorkspace } from './workspaceSessions'
import type { WorkspaceTrash, WorkspaceTrashItem } from './workspaceTrash'

export type WorkspaceActionItem = {
  kind: 'project' | 'file'
  id: string
  name: string
  projectId: string
}
export default function WorkspaceItemActions({
  item,
  sourceWorkspaceId,
  workspaces,
  projects,
  trash,
  onClose,
  onTrash,
  onMove,
  onRestore,
}: {
  item: WorkspaceActionItem | null
  sourceWorkspaceId: string
  workspaces: SavedWorkspace[]
  projects: Project[]
  trash: WorkspaceTrash
  onClose: () => void
  onTrash: (item: WorkspaceActionItem) => Promise<void>
  onMove: (
    item: WorkspaceActionItem,
    workspaceId: string,
    projectId: string | null,
  ) => Promise<void>
  onRestore: (item: WorkspaceTrashItem) => Promise<void>
}) {
  const [workspaceId, setWorkspaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const destination = workspaces.find((value) => value.id === workspaceId)
  const targets = projects.filter((project) =>
    destination?.projectIds?.includes(project.id),
  )
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  async function action(run: () => Promise<void>, close = true) {
    if (pendingRef.current) return
    pendingRef.current = true
    dialog.current?.focus()
    setPending(true)
    setError(null)
    try {
      await run()
      if (close) onClose()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'This change could not be saved. The original was retained.',
      )
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!pendingRef.current) onClose()
    }
    if (event.key !== 'Tab') return
    const elements = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled)',
      ) ?? [],
    )
    if (!elements.length) {
      event.preventDefault()
      dialog.current?.focus()
      return
    }
    if (event.shiftKey && document.activeElement === elements[0]) {
      event.preventDefault()
      elements.at(-1)?.focus()
    } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
      event.preventDefault()
      elements[0]?.focus()
    }
  }
  return (
    <div className="modal-backdrop">
      <div
        className="project-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={pending}
        aria-label={item ? `Manage ${item.name}` : 'Workspace Trash'}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={keys}
      >
        <button
          className="button secondary"
          disabled={pending}
          onClick={onClose}
        >
          Close
        </button>
        <h2>{item ? item.name : 'Workspace Trash'}</h2>
        {error && <p role="alert">{error}</p>}
        {item ? (
          <>
            <p>
              Move to Trash removes this{' '}
              {item.kind === 'file' ? 'canvas' : 'project and its subprojects'}{' '}
              from this workspace. Saved contents are retained and can be
              restored. Other workspaces keep their own access.
            </p>
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => void action(() => onTrash(item))}
            >
              Move to Trash
            </button>
            <h3>Move to another workspace or project</h3>
            <label>
              Destination workspace
              <select
                aria-label="Destination workspace"
                value={workspaceId}
                disabled={pending}
                onChange={(event) => {
                  setWorkspaceId(event.target.value)
                  setProjectId('')
                }}
              >
                <option value="">Choose a workspace</option>
                {workspaces
                  .filter(
                    (workspace) =>
                      item.kind === 'file' ||
                      workspace.id !== sourceWorkspaceId,
                  )
                  .map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
              </select>
            </label>
            {item.kind === 'file' && (
              <label>
                Destination project
                <select
                  aria-label="Destination project"
                  value={projectId}
                  disabled={pending || !workspaceId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">Choose a project</option>
                  {targets.map((project) => (
                    <option value={project.id} key={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>
              {item.kind === 'file'
                ? 'The destination is saved first. The original remains recoverable in this workspace’s Trash. A shared project already in the destination uses its existing canvas.'
                : 'The whole project tree moves together. Its saved canvas records keep their existing identities.'}
            </p>
            <button
              className="button primary"
              disabled={
                pending ||
                !destination ||
                (item.kind === 'file' &&
                  !targets.some((project) => project.id === projectId))
              }
              onClick={() =>
                void action(() =>
                  onMove(
                    item,
                    workspaceId,
                    item.kind === 'file' ? projectId : null,
                  ),
                )
              }
            >
              {pending ? 'Saving…' : 'Move'}
            </button>
          </>
        ) : (
          <>
            <p>
              These references belong to this workspace. Saved project and
              canvas contents remain in the library.
            </p>
            {!trash.items.length && <p>Trash is empty.</p>}
            <ul>
              {trash.items.map((entry) => (
                <li key={`${entry.kind}:${entry.id}`}>
                  <strong>{entry.name}</strong>{' '}
                  <span>{entry.kind === 'file' ? 'Canvas' : 'Project'}</span>{' '}
                  <button
                    className="button secondary"
                    disabled={pending}
                    aria-label={`Restore ${entry.name}`}
                    onClick={() => void action(() => onRestore(entry), false)}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
