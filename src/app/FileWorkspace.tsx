import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
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
import DockPanel from './DockPanel'
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
  projectPanel,
  showFileToggle = true,
}: {
  project: Project
  preferences: Preferences
  onRenameProject: () => void
  store?: typeof canvasFileStore
  onFocusChange?: (focused: boolean) => void
  layout?: WorkspaceLayout
  onLayoutChange?: (layout: WorkspaceLayout) => void
  projectPanel?: ReactNode
  showFileToggle?: boolean
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
  const [focusRightPinned, setFocusRightPinned] = useState(false)
  function changeLayout(next: WorkspaceLayout) {
    if (onLayoutChange) onLayoutChange(next)
    else {
      persistLayout(next)
      setLocalLayout(next)
    }
  }
  function setFilesOpen(open: boolean) {
    changeLayout({ ...layout, filesOpen: open, leftPanel: 'files' })
  }
  function setAiOpen(open: boolean) {
    setRightPanel(open ? 'ai' : 'none')
  }
  function setRightPanel(panel: WorkspaceLayout['rightPanel']) {
    if (focused) setFocusRightPanel(panel)
    else changeLayout({ ...layout, rightPanel: panel })
  }
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<FilePrompt | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const fileToggle = useRef<HTMLButtonElement>(null)
  const fileTabs = useRef<HTMLDivElement>(null)
  const alive = useRef(false)
  const openingSequence = useRef(0)
  const focusRoot = useRef<HTMLElement>(null)
  const [rightHost, setRightHost] = useState<HTMLDivElement | null>(null)
  const [rightInset, setRightInset] = useState(0)
  const { focused, toggle } = useCanvasFocus(focusRoot, onFocusChange)
  const rightPanel = focused ? focusRightPanel : layout.rightPanel
  const rightPinned = focused ? focusRightPinned : layout.rightPinned
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
    if (!focused) {
      setFocusRightPanel('none')
      setFocusRightPinned(false)
    }
    void toggle()
  }

  useEffect(() => {
    if (rightPanel === 'none' || !rightHost) {
      return
    }
    const panel = rightHost.closest<HTMLElement>('[data-dock-side="right"]')
    if (!panel) return
    // Pinned panels reserve their own width. Peek panels cover the stage.
    const measure = () =>
      setRightInset(
        getComputedStyle(panel).position === 'absolute'
          ? panel.getBoundingClientRect().width
          : 0,
      )
    measure()
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(panel)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [rightPanel, rightHost, rightPinned, layout.rightWidth, focused])

  function nextTab(direction: number) {
    const index = openIds.indexOf(activeId ?? '')
    const id = openIds[(index + direction + openIds.length) % openIds.length]
    const entry = entries.find((item) => item.record.id === id)
    if (entry) openFile(entry)
  }
  function navigateTab(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const index = openIds.indexOf(id)
    let nextIndex: number
    if (event.key === 'ArrowLeft')
      nextIndex = (index - 1 + openIds.length) % openIds.length
    else if (event.key === 'ArrowRight')
      nextIndex = (index + 1) % openIds.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = openIds.length - 1
    else return
    const entry = entries.find((item) => item.record.id === openIds[nextIndex])
    if (!entry) return
    event.preventDefault()
    openFile(entry)
    fileTabs.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [nextIndex]?.focus()
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
      const selected = fileTabs.current?.querySelector<HTMLButtonElement>(
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
          : `${project.name} workspace`
      }
    >
      <input
        className="file-import-input"
        ref={importInput}
        type="file"
        multiple
        accept=".lcanvas"
        aria-label="Import LCANVAS files"
        onChange={importFiles}
      />
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
        <DockPanel
          id="project-files"
          label="Project files"
          side="left"
          open={filesOpen && !focused}
          pinned={layout.leftPinned}
          width={layout.filesWidth}
          min={PANEL_LIMITS.files.min}
          max={PANEL_LIMITS.files.max}
          defaultWidth={PANEL_LIMITS.files.default}
          activeTab={layout.leftPanel}
          tabs={[
            { id: 'files', label: 'Files', icon: <Icon name="files" /> },
            { id: 'projects', label: 'Projects', icon: <Icon name="folder" /> },
          ]}
          onSelect={(id) =>
            changeLayout({
              ...layout,
              filesOpen: true,
              leftPanel: id === 'projects' ? 'projects' : 'files',
            })
          }
          onClose={() => {
            changeLayout({ ...layout, filesOpen: false })
          }}
          onPin={(leftPinned) => changeLayout({ ...layout, leftPinned })}
          onWidthChange={(filesWidth) =>
            changeLayout({ ...layout, filesWidth })
          }
        >
          {layout.leftPanel === 'projects' ? (
            (projectPanel ?? (
              <div className="workspace-project-summary">
                <h2>{project.name}</h2>
                <p>{entries.length} canvas files</p>
                <button className="button secondary" onClick={onRenameProject}>
                  <Icon name="edit" /> Rename project
                </button>
              </div>
            ))
          ) : (
            <div className="file-explorer">
              <div className="file-panel-heading">
                <h2 title={project.name}>{project.name}</h2>
                <button
                  className="icon-button"
                  title="Rename project"
                  aria-label="Rename project"
                  onClick={onRenameProject}
                >
                  <Icon name="edit" />
                </button>
              </div>
              <div className="file-panel-actions">
                <button
                  className="icon-button"
                  title="New canvas"
                  aria-label="New canvas"
                  disabled={loading || busy}
                  onClick={() => setPrompt({ kind: 'create' })}
                >
                  <Icon name="plus" />
                </button>
                <button
                  className="icon-button"
                  title="Import LCANVAS files"
                  aria-label="Import"
                  disabled={loading || busy}
                  onClick={() => importInput.current?.click()}
                >
                  <Icon name="import" />
                </button>
                <span>{entries.length} canvas files</span>
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
                  <p className="file-list-empty">No canvas files yet.</p>
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
            </div>
          )}
        </DockPanel>
        <div className="canvas-column">
          <div className="workspace-tab-bar">
            {showFileToggle && !focused && (
              <button
                ref={fileToggle}
                className="icon-button workspace-files-toggle"
                data-dock-trigger="left"
                aria-label="Open file panel"
                aria-expanded={filesOpen}
                aria-controls="project-files"
                title="Files · double-click to pin"
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') setFilesOpen(true)
                }}
                onClick={() => setFilesOpen(true)}
                onDoubleClick={() =>
                  changeLayout({
                    ...layout,
                    filesOpen: true,
                    leftPanel: 'files',
                    leftPinned: !layout.leftPinned,
                  })
                }
              >
                <Icon name="files" />
              </button>
            )}
            <div
              ref={fileTabs}
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
                      tabIndex={id === activeId ? 0 : -1}
                      onKeyDown={(event) => navigateTab(event, id)}
                      onClick={() => openFile(entry)}
                    >
                      <Icon name="canvas" />
                      <span>{entry.record.document.name}</span>
                      {entry.dirty && (
                        <span aria-label="Unsaved changes">•</span>
                      )}
                    </button>
                    <button
                      className="tab-close"
                      tabIndex={id === activeId ? 0 : -1}
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
            <div className="workspace-tab-actions">
              {!focused && (
                <button
                  className="icon-button"
                  aria-label="New canvas"
                  title="New canvas"
                  disabled={loading || busy}
                  onClick={() => setPrompt({ kind: 'create' })}
                >
                  <Icon name="plus" />
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Rename canvas"
                title="Rename canvas"
                disabled={!active}
                onClick={() =>
                  active && setPrompt({ kind: 'rename', id: active.record.id })
                }
              >
                <Icon name="edit" />
              </button>
              <button
                className="icon-button"
                disabled={!active || busy}
                onClick={saveFile}
                aria-label="Save"
                title="Save this canvas · Ctrl+S"
              >
                <Icon name="save" />
              </button>
              <button
                className="icon-button"
                disabled={!active}
                onClick={exportFile}
                aria-label="Export"
                title="Export LCANVAS"
              >
                <Icon name="export" />
              </button>
              {focused && (
                <button
                  className="icon-button"
                  aria-label="Exit fullscreen layout"
                  title="Exit fullscreen"
                  onClick={toggleFocus}
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
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
                rightInset={rightPanel === 'none' ? 0 : rightInset}
                onToggleAI={() => setAiOpen(!aiOpen)}
                toolsOpen={rightPanel === 'tools'}
                onToolsOpenChange={(open) =>
                  setRightPanel(open ? 'tools' : 'none')
                }
                dockHost={rightHost}
                propertiesOpen={rightPanel === 'properties'}
                onPropertiesOpenChange={(open) =>
                  setRightPanel(open ? 'properties' : 'none')
                }
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
                <h2>{loading ? 'Opening workspace…' : 'Canvas workspace'}</h2>
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
                  data-dock-trigger="right"
                  aria-label="Open AI workspace panel"
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
            <span
              title={
                active?.dirty
                  ? 'Save this canvas in your browser'
                  : active?.persistence === 'browser'
                    ? 'Saved in this browser'
                    : active
                      ? 'Export a backup to keep this canvas'
                      : undefined
              }
            >
              {active
                ? active.dirty
                  ? 'Unsaved changes'
                  : active.persistence === 'browser'
                    ? 'Saved'
                    : 'Session only'
                : 'No canvas open'}
            </span>
            {bridge.status === 'sharing' && (
              <span className="mcp-sharing-status" role="status">
                MCP sharing
              </span>
            )}
            <span>
              {active
                ? `${active.record.document.elements.length} objects`
                : `${entries.length} canvas files`}
            </span>
          </div>
        </div>
        <DockPanel
          id="workspace-right-panel"
          label="Canvas panels"
          side="right"
          open={rightPanel !== 'none'}
          pinned={rightPinned}
          width={layout.rightWidth}
          min={PANEL_LIMITS.right.min}
          max={PANEL_LIMITS.right.max}
          defaultWidth={PANEL_LIMITS.right.default}
          tabs={[
            { id: 'tools', label: 'Tools', icon: <Icon name="canvas" /> },
            {
              id: 'properties',
              label: 'Properties',
              icon: <Icon name="options" />,
            },
            { id: 'ai', label: 'AI', icon: <Icon name="work" /> },
          ]}
          activeTab={rightPanel}
          onSelect={(id) =>
            setRightPanel(
              id === 'ai' ? 'ai' : id === 'properties' ? 'properties' : 'tools',
            )
          }
          onClose={() => setRightPanel('none')}
          onPin={(pinned) => {
            if (focused) setFocusRightPinned(pinned)
            else changeLayout({ ...layout, rightPinned: pinned })
          }}
          onWidthChange={(rightWidth) =>
            changeLayout({ ...layout, rightWidth })
          }
        >
          <div
            className="workspace-right-host"
            ref={setRightHost}
            data-canvas-root
          >
            <div
              className="workspace-ai-content"
              hidden={!aiOpen}
              inert={!aiOpen}
            >
              <WorkspaceAI
                projectName={project.name}
                canvasName={active?.record.document.name ?? null}
                bridge={bridge}
                onClose={() => setAiOpen(false)}
              />
            </div>
          </div>
        </DockPanel>
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
    </section>
  )
}
