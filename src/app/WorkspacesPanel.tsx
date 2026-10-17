import { useRef, useState, type ChangeEvent } from 'react'
import Icon from './Icon'
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
}: {
  state: WorkspaceSessions
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onRename: (name: string) => void
  onImport: (workspace: SavedWorkspace) => void
}) {
  const current = state.items.find((item) => item.id === state.activeId)!
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  function act(action: () => void) {
    try {
      action()
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Workspace action failed.',
      )
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
    <section className="saved-workspaces" aria-label="Saved workspaces">
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
      <div className="saved-workspace-list">
        {state.items.map((item) => (
          <button
            key={item.id}
            className="canvas-file"
            aria-pressed={item.id === state.activeId}
            title={item.name}
            onClick={() => onSelect(item.id)}
          >
            <Icon name="work" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          act(() => onCreate(draftName))
          setDraftName('')
        }}
      >
        <label htmlFor="workspace-new-name">New workspace</label>
        <div className="workspace-name-row">
          <input
            id="workspace-new-name"
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
        <label htmlFor="workspace-current-name">Workspace name</label>
        <div className="workspace-name-row">
          <input
            id="workspace-current-name"
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
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
