import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import CanvasEditor from './CanvasEditor'
import useCanvasFocus from './useCanvasFocus'
import {
  projectDrafts,
  useCanvasDraftProtection,
  type CanvasDraft,
} from './canvasDrafts'
import Icon from './Icon'
import ProjectDialog from './ProjectDialog'
import {
  canvasFileStore,
  createCanvasFileRecord,
  type CanvasFileRecord,
} from './canvasFiles'
import {
  canvasExportFilename,
  createCanvasDocument,
  parseLCANVAS,
  serializeLCANVAS,
  type CanvasDocument,
} from './lcanvas'
import type { Preferences, Project } from './workspace'
import './file-workspace.css'

type Entry = CanvasDraft
type FilePrompt = { kind: 'create' } | { kind: 'rename'; id: string }

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The file could not be opened.'
}

function sameDocument(left: CanvasDocument, right: CanvasDocument) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function openingTimestamp(entries: Entry[]) {
  return (
    Math.max(Date.now(), ...entries.map((item) => item.record.lastOpenedAt)) + 1
  )
}

export default function FileWorkspace({
  project,
  preferences,
  onRenameProject,
  store = canvasFileStore,
  onFocusChange,
}: {
  project: Project
  preferences: Preferences
  onRenameProject: () => void
  store?: typeof canvasFileStore
  onFocusChange?: (focused: boolean) => void
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [openIds, setOpenIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filesOpen, setFilesOpen] = useState(true)
  const [aiOpen, setAiOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<FilePrompt | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const fileToggle = useRef<HTMLButtonElement>(null)
  const alive = useRef(false)
  const openingSequence = useRef(0)
  const focusRoot = useRef<HTMLElement>(null)
  const { focused, toggle } = useCanvasFocus(focusRoot, onFocusChange)
  useCanvasDraftProtection(store)
  const active = entries.find((entry) => entry.record.id === activeId)
  const visible = entries.filter((entry) =>
    entry.record.document.name
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  )

  function toggleFocus() {
    if (!focused) setAiOpen(false)
    void toggle()
  }

  useEffect(() => {
    alive.current = true
    let cancelled = false
    store
      .list(project.id)
      .then((result) => {
        if (cancelled) return
        const files = [...result.value].sort(
          (a, b) => b.lastOpenedAt - a.lastOpenedAt,
        )
        openingSequence.current = Math.max(
          0,
          ...files.map((file) => file.lastOpenedAt),
        )
        const cachedDrafts = projectDrafts(store).get(project.id) ?? []
        setEntries(
          files.map(
            (record) =>
              cachedDrafts.find(
                (entry) => entry.record.id === record.id && entry.dirty,
              ) ?? {
                record,
                dirty: false,
                savedDocument: record.document,
                persistence: result.persistence,
              },
          ),
        )
        setOpenIds(files.length ? [files[0].id] : [])
        setActiveId(files[0]?.id ?? null)
        setNotice(result.error ?? null)
        setLoading(false)
      })
      .catch((failure: unknown) => {
        if (cancelled) return
        setError(message(failure))
        setLoading(false)
      })
    return () => {
      cancelled = true
      alive.current = false
    }
  }, [project.id, store])

  useEffect(() => {
    if (!loading)
      projectDrafts(store).set(
        project.id,
        entries.filter((entry) => entry.dirty),
      )
  }, [entries, loading, project.id, store])

  function accept(record: CanvasFileRecord, persistence: Entry['persistence']) {
    openingSequence.current = Math.max(
      openingSequence.current,
      record.lastOpenedAt,
    )
    setEntries((current) => [
      ...current.filter((entry) => entry.record.id !== record.id),
      {
        record,
        dirty: false,
        savedDocument: record.document,
        persistence,
      },
    ])
    setOpenIds((current) =>
      current.includes(record.id) ? current : [...current, record.id],
    )
    setActiveId(record.id)
  }

  async function submitFile(name: string) {
    try {
      const document = createCanvasDocument(name)
      const existing =
        prompt?.kind === 'rename'
          ? entries.find((entry) => entry.record.id === prompt.id)
          : undefined
      const record = existing
        ? {
            ...existing.record,
            document: { ...existing.record.document, name: document.name },
            updatedAt: Math.max(Date.now(), existing.record.updatedAt),
          }
        : createCanvasFileRecord(
            project.id,
            document,
            Math.max(openingTimestamp(entries), openingSequence.current + 1),
          )
      const result = await store.save(record)
      if (!alive.current) return null
      accept(result.value, result.persistence)
      setNotice(result.error ?? null)
      setError(null)
      setPrompt(null)
      return null
    } catch (failure) {
      return message(failure)
    }
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length) return
    setBusy(true)
    setError(null)
    const failures: string[] = []
    for (const file of selected) {
      try {
        if (!/\.lcanvas$/iu.test(file.name))
          throw new Error('Choose an .lcanvas file.')
        if (file.size > 10 * 1024 * 1024)
          throw new Error('LCANVAS files must be 10 MiB or smaller.')
        const document = parseLCANVAS(await file.text())
        const result = await store.save(
          createCanvasFileRecord(
            project.id,
            document,
            Math.max(openingTimestamp(entries), openingSequence.current + 1),
          ),
        )
        if (!alive.current) break
        accept(result.value, result.persistence)
        setNotice(result.error ?? null)
      } catch (failure) {
        failures.push(`${file.name}: ${message(failure)}`)
      }
    }
    if (!alive.current) return
    setError(failures.length ? failures.join('\n') : null)
    setBusy(false)
  }

  function openFile(entry: Entry) {
    const id = entry.record.id
    setOpenIds((current) => (current.includes(id) ? current : [...current, id]))
    setActiveId(id)
    // Remember the open file without committing unsaved canvas changes.
    const openedAt = Math.max(
      openingTimestamp(entries),
      openingSequence.current + 1,
    )
    openingSequence.current = openedAt
    store
      .markOpened(project.id, id, openedAt)
      .then((result) => {
        if (!result.value) return
        if (!alive.current) return
        setEntries((current) =>
          current.map((item) =>
            item.record.id === id
              ? {
                  ...item,
                  record: {
                    ...item.record,
                    lastOpenedAt: result.value!.lastOpenedAt,
                  },
                  persistence: result.persistence,
                }
              : item,
          ),
        )
        if (result.error) setNotice(result.error)
      })
      .catch((failure: unknown) => {
        if (alive.current) setError(message(failure))
      })
  }

  function closeTab(id: string) {
    const next = openIds.filter((open) => open !== id)
    setOpenIds(next)
    if (activeId === id) {
      const previousIndex = openIds.indexOf(id)
      setActiveId(next[Math.min(previousIndex, next.length - 1)] ?? null)
    }
    requestAnimationFrame(() => {
      const selected = document.querySelector<HTMLButtonElement>(
        '[role="tab"][aria-selected="true"]',
      )
      ;(selected ?? fileToggle.current)?.focus()
    })
  }

  function changeDocument(document: CanvasDocument) {
    if (!activeId) return
    setEntries((current) =>
      current.map((entry) =>
        entry.record.id === activeId
          ? {
              ...entry,
              dirty: !sameDocument(entry.savedDocument, document),
              record: {
                ...entry.record,
                document,
              },
            }
          : entry,
      ),
    )
  }

  async function saveFile() {
    if (!active || busy) return
    const snapshot = {
      ...active.record,
      updatedAt: Math.max(Date.now(), active.record.updatedAt),
    }
    setBusy(true)
    try {
      const result = await store.save(snapshot)
      if (!alive.current) return
      setEntries((current) =>
        current.map((entry) =>
          entry.record.id === snapshot.id
            ? {
                ...entry,
                savedDocument: snapshot.document,
                dirty: !sameDocument(entry.record.document, snapshot.document),
                persistence: result.persistence,
                record: { ...entry.record, updatedAt: result.value.updatedAt },
              }
            : entry,
        ),
      )
      setNotice(result.error ?? null)
      setError(null)
    } catch (failure) {
      if (alive.current) setError(message(failure))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  function exportFile() {
    if (!active) return
    try {
      const url = URL.createObjectURL(
        new Blob([serializeLCANVAS(active.record.document)], {
          type: 'application/json',
        }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = canvasExportFilename(active.record.document.name)
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setError(null)
    } catch (failure) {
      setError(message(failure))
    }
  }

  return (
    <section
      ref={focusRoot}
      className="file-workspace"
      data-focus={focused}
      aria-label={
        focused
          ? `${active?.record.document.name ?? 'Canvas'} fullscreen editor`
          : undefined
      }
      aria-labelledby={focused ? undefined : 'work-title'}
    >
      {focused && (
        <header className="focus-file-header">
          <span>
            <Icon name="canvas" />
            <strong>{active?.record.document.name}</strong>
            <small>
              {active?.dirty
                ? 'Unsaved changes'
                : active?.persistence === 'browser'
                  ? 'Saved in this browser'
                  : 'Session only'}
            </small>
          </span>
          <button
            className="button secondary"
            disabled={busy}
            onClick={saveFile}
          >
            <Icon name="save" />
            Save
          </button>
          <button className="button secondary" onClick={exportFile}>
            <Icon name="export" />
            Export
          </button>
          <button
            className="button secondary"
            onClick={toggleFocus}
            aria-label="Exit fullscreen layout"
          >
            Exit fullscreen
          </button>
        </header>
      )}
      <header className="file-work-heading">
        <div>
          <p className="eyebrow">Your project workspace</p>
          <h1 id="work-title">{project.name}</h1>
        </div>
        <button
          className="icon-button"
          title="Rename project"
          aria-label="Rename project"
          onClick={onRenameProject}
        >
          <Icon name="edit" />
        </button>
      </header>
      <div className="file-work-toolbar">
        <button
          ref={fileToggle}
          className="button secondary"
          aria-label={filesOpen ? 'Close file panel' : 'Open file panel'}
          aria-expanded={filesOpen}
          aria-controls="project-files"
          onClick={() => setFilesOpen(!filesOpen)}
        >
          <Icon name="files" />
          <span>Files</span>
        </button>
        <button
          className="button secondary"
          disabled={loading || busy}
          onClick={() => setPrompt({ kind: 'create' })}
        >
          <Icon name="plus" />
          New canvas
        </button>
        <button
          className="button secondary"
          disabled={loading || busy}
          onClick={() => importInput.current?.click()}
        >
          <Icon name="import" />
          {busy ? 'Working…' : 'Import'}
        </button>
        <input
          className="file-import-input"
          ref={importInput}
          type="file"
          multiple
          accept=".lcanvas"
          aria-label="Import LCANVAS files"
          onChange={importFiles}
        />
        <span className="toolbar-space" />
        <button
          className="button secondary"
          disabled={!active || busy}
          onClick={saveFile}
          title="Save this canvas in your browser"
        >
          <Icon name="save" />
          <span>Save</span>
        </button>
        <button
          className="button secondary"
          disabled={!active}
          onClick={exportFile}
          title="Download a portable LCANVAS file"
        >
          <Icon name="export" />
          <span>Export</span>
        </button>
      </div>
      {error && (
        <div className="file-message error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="file-message" role="status">
          {notice} Export your files to keep a backup.
        </div>
      )}
      <div className="workspace-deck">
        {filesOpen && !focused && (
          <aside
            id="project-files"
            className="file-explorer"
            aria-label="Project files"
          >
            <div className="file-panel-heading">
              <h2>
                Canvas files <span>{entries.length}</span>
              </h2>
              <button
                className="icon-button"
                aria-label="Close project files"
                onClick={() => {
                  setFilesOpen(false)
                  fileToggle.current?.focus()
                }}
              >
                <Icon name="close" />
              </button>
            </div>
            <label className="file-search">
              <Icon name="search" />
              <input
                type="search"
                aria-label="Search canvas files"
                placeholder="Find a canvas…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="file-list">
              {loading ? (
                <p className="file-list-empty">Opening your files…</p>
              ) : !entries.length ? (
                <p className="file-list-empty">
                  A project is a home for your canvases. Create one or import
                  LCANVAS files.
                </p>
              ) : !visible.length ? (
                <p className="file-list-empty">No matching canvas files.</p>
              ) : (
                visible.map((entry) => (
                  <button
                    key={entry.record.id}
                    className={`canvas-file ${entry.record.id === activeId ? 'is-active' : ''}`}
                    aria-label={`Open canvas ${entry.record.document.name}`}
                    onClick={() => openFile(entry)}
                    title={`${entry.record.document.name}.lcanvas`}
                  >
                    <Icon name="canvas" />
                    <span>
                      {entry.record.document.name}
                      <small>.lcanvas</small>
                    </span>
                    {entry.dirty && (
                      <span
                        className="file-dirty"
                        aria-label="Unsaved changes"
                      />
                    )}
                  </button>
                ))
              )}
            </div>
            <p className="file-explorer-note">
              Files belong to this project.
              <br />
              Export a copy to take them with you.
            </p>
          </aside>
        )}
        <div className="canvas-column">
          <div
            className="canvas-tabs"
            role="tablist"
            aria-label="Open canvas files"
          >
            {openIds.map((id) => {
              const entry = entries.find((item) => item.record.id === id)
              if (!entry) return null
              return (
                <div
                  className="canvas-tab"
                  key={id}
                  data-active={id === activeId}
                >
                  <button
                    role="tab"
                    aria-selected={id === activeId}
                    aria-controls="canvas-file-pane"
                    onClick={() => openFile(entry)}
                  >
                    <Icon name="canvas" />
                    <span>{entry.record.document.name}</span>
                    {entry.dirty && <span aria-label="Unsaved changes">•</span>}
                  </button>
                  <button
                    className="tab-close"
                    aria-label={`Close canvas ${entry.record.document.name}`}
                    title="Close tab; keep file"
                    onClick={() => closeTab(id)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              )
            })}
            {!openIds.length && (
              <span className="no-open-tabs">LCANVAS workspace</span>
            )}
          </div>
          <div
            className="canvas-file-pane"
            id="canvas-file-pane"
            role="tabpanel"
            aria-label={
              active
                ? `${active.record.document.name} canvas`
                : 'Canvas workspace'
            }
          >
            {active ? (
              <CanvasEditor
                key={active.record.id}
                document={active.record.document}
                grid={preferences.grid}
                aiOpen={aiOpen}
                rightInset={aiOpen ? 260 : 0}
                onToggleAI={() => setAiOpen(!aiOpen)}
                onDocumentChange={changeDocument}
                focusMode={focused}
                onToggleFocus={toggleFocus}
              />
            ) : (
              <div className="viewer-empty" data-grid={preferences.grid}>
                <span className="canvas-empty-icon">
                  <Icon name="canvas" />
                </span>
                <h2>
                  {loading
                    ? 'Opening your workspace…'
                    : 'Open a canvas. Make room for ideas.'}
                </h2>
                <p>
                  Create a blank LCANVAS file or import one to start creating.
                </p>
                <button
                  className="button primary"
                  disabled={loading || busy}
                  onClick={() => setPrompt({ kind: 'create' })}
                >
                  <Icon name="plus" />
                  New canvas
                </button>
                <button
                  className="empty-ai-toggle button secondary"
                  aria-expanded={aiOpen}
                  aria-controls="workspace-ai-panel"
                  onClick={() => setAiOpen(!aiOpen)}
                >
                  Workspace AI
                </button>
              </div>
            )}
          </div>
          <div className="file-statusbar">
            <span className={`save-dot ${active?.dirty ? 'unsaved' : ''}`} />
            <span>
              {active
                ? active.dirty
                  ? 'Unsaved changes · Save to remember'
                  : active.persistence === 'browser'
                    ? 'Saved in this browser'
                    : 'Session only · Export a backup'
                : 'No canvas open'}
            </span>
            <span>
              {active
                ? `${active.record.document.elements.length} objects · LCANVAS`
                : `${entries.length} canvas files`}
            </span>
          </div>
        </div>
        {aiOpen && (
          <aside
            className="workspace-ai-panel"
            id="workspace-ai-panel"
            aria-labelledby="workspace-ai-title"
          >
            <div className="file-panel-heading">
              <h2 id="workspace-ai-title">Workspace AI</h2>
              <button
                className="icon-button"
                aria-label="Close AI panel"
                onClick={() => {
                  setAiOpen(false)
                  document
                    .querySelector<HTMLButtonElement>(
                      '[aria-controls="workspace-ai-panel"]',
                    )
                    ?.focus()
                }}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="ai-context-mark">
              <Icon name="work" />
            </div>
            <p className="eyebrow">Current context</p>
            <dl className="ai-context">
              <dt>Project</dt>
              <dd>{project.name}</dd>
              <dt>Canvas</dt>
              <dd>{active?.record.document.name ?? 'No canvas open'}</dd>
              <dt>Client</dt>
              <dd>ChatGPT · planned integration</dd>
            </dl>
            <div className="ai-status-card">
              <span className="status-dot" />
              <strong>AI not connected</strong>
              <p>
                MCP service is not available yet. This panel follows your
                current project and canvas.
              </p>
            </div>
            <p className="ai-panel-note">
              No workspace data is being sent to an AI client.
            </p>
          </aside>
        )}
      </div>
      <p className="viewer-scope-note">
        LCANVAS editor · Add shapes, text, areas and connections. Use Properties
        for layers and object details. Save to remember your changes.
      </p>
      {prompt && (
        <ProjectDialog
          entity="file"
          kind={prompt.kind}
          initialName={
            prompt.kind === 'rename'
              ? (entries.find((entry) => entry.record.id === prompt.id)?.record
                  .document.name ?? '')
              : ''
          }
          onClose={() => setPrompt(null)}
          onSubmit={submitFile}
        />
      )}
      {active && (
        <button
          className="text-button rename-canvas"
          onClick={() => setPrompt({ kind: 'rename', id: active.record.id })}
        >
          Rename canvas
        </button>
      )}
    </section>
  )
}
