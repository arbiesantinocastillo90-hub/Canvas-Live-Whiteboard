import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import Icon from './Icon'
import PresentationIcon from './PresentationIcon'
import { normalizeWorkspaceAppearance } from './workspaceAppearance'
import {
  DEFAULT_WORKSPACE_VIEW,
  normalizeWorkspaceLibraryView,
  type WorkspaceLibraryView,
} from './homeView'
import {
  parseSavedWorkspace,
  serializeSavedWorkspace,
  workspaceExportFilename,
  WORKSPACE_FILE_ACCEPT,
  type SavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'
import './workspace-sessions.css'

export default function WorkspacesPanel({
  state,
  onSelect,
  onCreate,
  onRename,
  onImport,
  variant = 'compact',
  view,
  onViewChange,
}: {
  state: WorkspaceSessions
  variant?: 'compact' | 'page'
  view?: WorkspaceLibraryView
  onViewChange?: (value: WorkspaceLibraryView) => void
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onRename: (name: string) => void
  onImport: (workspace: SavedWorkspace) => void
}) {
  const panelId = useId()
  const current = state.items.find((item) => item.id === state.activeId)!
  const [managementOpen, setManagementOpen] = useState(false)
  const management = useRef<HTMLDivElement>(null)
  const managementButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!managementOpen || variant !== 'page') return
    const pointer = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        !management.current?.contains(target) &&
        !managementButton.current?.contains(target)
      )
        setManagementOpen(false)
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setManagementOpen(false)
        managementButton.current?.focus()
      }
    }
    window.addEventListener('pointerdown', pointer)
    window.addEventListener('keydown', keyboard)
    return () => {
      window.removeEventListener('pointerdown', pointer)
      window.removeEventListener('keydown', keyboard)
    }
  }, [managementOpen, variant])
  const [localView, setLocalView] = useState(DEFAULT_WORKSPACE_VIEW)
  const currentView = normalizeWorkspaceLibraryView(view ?? localView)
  function changeView(patch: Partial<WorkspaceLibraryView>) {
    const next = normalizeWorkspaceLibraryView({ ...currentView, ...patch })
    setLocalView(next)
    onViewChange?.(next)
  }
  const sorted = [...state.items].sort((a, b) =>
    currentView.sort === 'name'
      ? a.name.localeCompare(b.name)
      : currentView.sort === 'created'
        ? (b.createdAt ?? 0) - (a.createdAt ?? 0)
        : currentView.sort === 'modified'
          ? (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
          : (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0),
  )
  const visible =
    currentView.perspective === 'recent' && variant === 'page'
      ? [...state.items]
          .filter(
            (item) =>
              item.id === state.activeId || (item.lastOpenedAt ?? 0) > 0,
          )
          .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
          .slice(0, 12)
      : sorted
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  function act(action: () => void) {
    try {
      action()
      setError(null)
      return true
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Workspace action failed.',
      )
      return false
    }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error('The workspace exceeds the import size limit.')
      onImport(parseSavedWorkspace(await file.text()))
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'The workspace could not be imported.',
      )
    }
  }
  function exportFile() {
    act(() => {
      const blob = new Blob([serializeSavedWorkspace(current)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = workspaceExportFilename(current.name)
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  return (
    <section
      className={`saved-workspaces ${variant === 'page' ? 'workspaces-page' : ''}`}
      aria-label="Saved workspaces"
    >
      {variant === 'page' && (
        <>
          <div className="workspaces-page-heading">
            <h1>Workspaces</h1>
            <button
              ref={managementButton}
              className="button primary"
              aria-expanded={managementOpen}
              aria-controls={`workspace-management-${panelId}`}
              onClick={() => setManagementOpen(!managementOpen)}
            >
              <Icon name="plus" />
              <span>Create/Add Workspaces</span>
            </button>
          </div>
          <div className="workspaces-page-controls">
            <div
              className="home-perspective"
              role="group"
              aria-label="Workspace perspective"
            >
              <button
                className="button secondary"
                aria-pressed={currentView.perspective === 'recent'}
                onClick={() => changeView({ perspective: 'recent' })}
              >
                Recent workspaces
              </button>
              <button
                className="button secondary"
                aria-pressed={currentView.perspective === 'all'}
                onClick={() => changeView({ perspective: 'all' })}
              >
                All workspaces
              </button>
            </div>
            {currentView.perspective === 'all' && (
              <label className="library-order">
                <span>Order</span>
                <select
                  aria-label="Order workspaces"
                  value={currentView.sort}
                  onChange={(event) =>
                    changeView({
                      sort: event.target.value as WorkspaceLibraryView['sort'],
                    })
                  }
                >
                  <option value="recent">Recently opened</option>
                  <option value="created">Date created</option>
                  <option value="modified">Last modified</option>
                  <option value="name">Name</option>
                </select>
              </label>
            )}
          </div>
        </>
      )}
      <div className="saved-workspace-list">
        {(variant === 'page' ? visible : state.items).map((item) => {
          const appearance = normalizeWorkspaceAppearance(
            item.preferences.homeAppearance,
          )
          return (
            <button
              key={item.id}
              className="canvas-file"
              aria-pressed={item.id === state.activeId}
              title={item.name}
              onClick={() => onSelect(item.id)}
            >
              <PresentationIcon
                name={appearance.icon}
                color={appearance.iconColor ?? undefined}
                fill={appearance.iconFill ?? undefined}
                strokeWidth={appearance.iconStrokeWidth}
              />
              <span>
                <strong>{item.name}</strong>
                {variant === 'page' && appearance.description && (
                  <small>{appearance.description}</small>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div
        ref={management}
        id={`workspace-management-${panelId}`}
        className="workspace-management"
        hidden={variant === 'page' && !managementOpen}
      >
        <div className="file-panel-actions">
          <button
            className="icon-button"
            aria-label="Import workspace"
            title="Import workspace"
            onClick={() => importInput.current?.click()}
          >
            <Icon name="import" />
          </button>
          <button
            className="icon-button"
            aria-label="Export workspace"
            title="Export workspace"
            onClick={exportFile}
          >
            <Icon name="export" />
          </button>
        </div>
        <input
          ref={importInput}
          type="file"
          accept={WORKSPACE_FILE_ACCEPT}
          hidden
          aria-label="Import workspace file"
          onChange={(event) => {
            void importFile(event)
          }}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (act(() => onCreate(draftName))) setDraftName('')
          }}
        >
          <label htmlFor={`workspace-new-name-${panelId}`}>New workspace</label>
          <div className="workspace-name-row">
            <input
              id={`workspace-new-name-${panelId}`}
              maxLength={80}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <button
              className="icon-button"
              type="submit"
              aria-label="Create workspace"
              title="Create workspace"
              disabled={!draftName.trim()}
            >
              <Icon name="plus" />
            </button>
          </div>
        </form>
        <form
          key={current.id + current.name}
          onSubmit={(event) => {
            event.preventDefault()
            const input = event.currentTarget.elements.namedItem(
              'name',
            ) as HTMLInputElement
            act(() => onRename(input.value))
          }}
        >
          <label htmlFor={`workspace-current-name-${panelId}`}>
            Workspace name
          </label>
          <div className="workspace-name-row">
            <input
              id={`workspace-current-name-${panelId}`}
              name="name"
              maxLength={80}
              defaultValue={current.name}
            />
            <button
              className="icon-button"
              type="submit"
              aria-label="Rename workspace"
              title="Rename workspace"
            >
              <Icon name="edit" />
            </button>
          </div>
        </form>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
