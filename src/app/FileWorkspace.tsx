import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import CanvasEditor, { type CanvasEditorController } from './CanvasEditor'
import WorkspaceAI from './WorkspaceAI'
import useMcpBridge from './useMcpBridge'
import useCanvasFocus from './useCanvasFocus'
import {
  loadLayout,
  PANEL_LIMITS,
  persistLayout,
  type WorkspaceLayout,
} from './layout'
import PanelResizeHandle from './PanelResizeHandle'
import {
  useRegisterCommands,
  useRegisterFiles,
} from './workspaceCommandsContext'
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

function savingTimestamp(previous: number) {
  return Math.max(Date.now(), previous)
}

export default function FileWorkspace({
  project,
  preferences,
  onRenameProject,
  store = canvasFileStore,
  onFocusChange,
  layout: controlledLayout,
  onLayoutChange,
}: {
  project: Project
  preferences: Preferences
  onRenameProject: () => void
  store?: typeof canvasFileStore
  onFocusChange?: (focused: boolean) => void
  layout?: WorkspaceLayout
  onLayoutChange?: (layout: WorkspaceLayout) => void
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [openIds, setOpenIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [localLayout, setLocalLayout] = useState(loadLayout)
  const layout = controlledLayout ?? localLayout
  const filesOpen = layout.filesOpen
  const [focusRightPanel, setFocusRightPanel] =
    useState<WorkspaceLayout['rightPanel']>('none')
  function changeLayout(next: WorkspaceLayout) {
    if (onLayoutChange) onLayoutChange(next)
    else {
      persistLayout(next)
      setLocalLayout(next)
    }
  }
  function setFilesOpen(open: boolean) {
    changeLayout({ ...layout, filesOpen: open })
  }
  function setAiOpen(open: boolean) {
    if (focused) setFocusRightPanel(open ? 'ai' : 'none')
    else changeLayout({ ...layout, rightPanel: open ? 'ai' : 'none' })
  }
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<FilePrompt | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const fileToggle = useRef<HTMLButtonElement>(null)
  const alive = useRef(false)
  const openingSequence = useRef(0)
  const focusRoot = useRef<HTMLElement>(null)
  const aiDock = useRef<HTMLDivElement>(null)
  const [aiInset, setAiInset] = useState(0)
  const { focused, toggle } = useCanvasFocus(focusRoot, onFocusChange)
  const rightPanel = focused ? focusRightPanel : layout.rightPanel
  const aiOpen = rightPanel === 'ai'
  useCanvasDraftProtection(store)
  const active = entries.find((entry) => entry.record.id === activeId)
  const editorController = useRef<{
    fileId: string
    controller: CanvasEditorController
  } | null>(null)
  const registerController = useCallback(
    (controller: CanvasEditorController | null) => {
      if (controller && activeId)
        editorController.current = { fileId: activeId, controller }
      else if (editorController.current?.fileId === activeId)
        editorController.current = null
    },
    [activeId],
  )
  const getController = useCallback(
    () =>
      editorController.current?.fileId === activeId
        ? editorController.current.controller
        : null,
    [activeId],
  )
  const bridge = useMcpBridge({
    projectId: project.id,
    projectName: project.name,
    fileId: activeId,
    getController,
  })
  const visible = entries.filter((entry) =>
    entry.record.document.name
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  )

  function toggleFocus() {
    if (!focused) setFocusRightPanel('none')
    void toggle()
  }

  useEffect(() => {
    if (!aiOpen || !aiDock.current) {
      setAiInset(0)
      return
    }
    const panel = aiDock.current
    const measure = () => setAiInset(panel.getBoundingClientRect().width)
    measure()
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(panel)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [aiOpen, layout.rightWidth, focused])

  function nextTab(direction: number) {
    const index = openIds.indexOf(activeId ?? '')
    const id = openIds[(index + direction + openIds.length) % openIds.length]
    const entry = entries.find((item) => item.record.id === id)
    if (entry) openFile(entry)
  }
  useRegisterCommands([
    {
      id: 'file.new',
      label: 'New canvas',
      category: 'Files',
      execute: () => setPrompt({ kind: 'create' }),
      enabled: !loading && !busy && !focused,
    },
    {
      id: 'file.import',
      label: 'Import LCANVAS',
      category: 'Files',
      execute: () => importInput.current?.click(),
      enabled: !loading && !busy && !focused,
    },
    {
      id: 'file.save',
      label: 'Save current canvas',
      category: 'Files',
      execute: () => {
        void saveFile()
      },
      enabled: Boolean(active) && !busy,
      allowWhileTyping: true,
    },
    {
      id: 'file.export',
      label: 'Export current canvas',
      category: 'Files',
      execute: exportFile,
      enabled: Boolean(active),
    },
    {
      id: 'file.toggleFiles',
      label: 'Toggle files panel',
      category: 'Panels',
      execute: () => setFilesOpen(!filesOpen),
      enabled: !focused,
    },
    {
      id: 'file.toggleAI',
      label: 'Toggle Workspace AI',
      category: 'Panels',
      execute: () => setAiOpen(!aiOpen),
    },
    {
      id: 'file.next',
      label: 'Next canvas tab',
      category: 'Files',
      execute: () => nextTab(1),
      enabled: openIds.length > 1 && !focused,
    },
    {
      id: 'file.previous',
      label: 'Previous canvas tab',
      category: 'Files',
      execute: () => nextTab(-1),
      enabled: openIds.length > 1 && !focused,
    },
    {
      id: 'file.close',
      label: 'Close current canvas tab',
      category: 'Files',
      execute: () => {
        if (activeId) closeTab(activeId)
      },
      enabled: Boolean(activeId) && !focused,
    },
  ])
  useRegisterFiles(
    entries.map((entry) => ({
      id: entry.record.id,
      name: entry.record.document.name,
      projectName: project.name,
      open: () => {
        void (async () => {
          if (focused) await toggle()
          openFile(entry)
        })()
      },
    })),
  )

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
      updatedAt: savingTimestamp(active.record.updatedAt),
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
      style={
        {
          '--file-panel-width': `${layout.filesWidth}px`,
          '--right-panel-width': `${layout.rightWidth}px`,
        } as CSSProperties
      }
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
            {bridge.status === 'sharing' && (
              <span
                className="mcp-focus-sharing"
                role="status"
                title="This canvas is shared through MCP"
              >
                MCP
              </span>
            )}
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
          aria-label="Save"
          title="Save this canvas in your browser"
        >
          <Icon name="save" />
          <span>Save</span>
        </button>
        <button
          className="button secondary"
          disabled={!active}
          onClick={exportFile}
          aria-label="Export"
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
            <PanelResizeHandle
              label="Resize project files"
              value={layout.filesWidth}
              min={PANEL_LIMITS.files.min}
              max={PANEL_LIMITS.files.max}
              defaultValue={PANEL_LIMITS.files.default}
              onChange={(filesWidth) => changeLayout({ ...layout, filesWidth })}
            />
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
                rightInset={aiInset}
                onToggleAI={() => setAiOpen(!aiOpen)}
                propertiesOpen={rightPanel === 'properties'}
                onPropertiesOpenChange={(open) => {
                  if (focused) setFocusRightPanel(open ? 'properties' : 'none')
                  else
                    changeLayout({
                      ...layout,
                      rightPanel: open ? 'properties' : 'none',
                    })
                }}
                propertiesWidth={layout.rightWidth}
                onPropertiesWidthChange={(rightWidth) =>
                  changeLayout({ ...layout, rightWidth })
                }
                onDocumentChange={changeDocument}
                focusMode={focused}
                onToggleFocus={toggleFocus}
                onControllerReady={registerController}
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
            {bridge.status === 'sharing' && (
              <span className="mcp-sharing-status" role="status">
                MCP sharing
              </span>
            )}
            <span>
              {active
                ? `${active.record.document.elements.length} objects · LCANVAS`
                : `${entries.length} canvas files`}
            </span>
          </div>
        </div>
        {aiOpen && (
          <div className="workspace-ai-dock" ref={aiDock}>
            <PanelResizeHandle
              label="Resize right panel"
              value={layout.rightWidth}
              min={PANEL_LIMITS.right.min}
              max={PANEL_LIMITS.right.max}
              defaultValue={PANEL_LIMITS.right.default}
              edge="left"
              onChange={(rightWidth) => changeLayout({ ...layout, rightWidth })}
            />
            <WorkspaceAI
              projectName={project.name}
              canvasName={active?.record.document.name ?? null}
              bridge={bridge}
              onClose={() => {
                setAiOpen(false)
                document
                  .querySelector<HTMLButtonElement>(
                    '[aria-controls="workspace-ai-panel"]',
                  )
                  ?.focus()
              }}
            />
          </div>
        )}
      </div>
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
