import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import CanvasEditor, {
  type CanvasEditorController,
  type CanvasEditorStatus,
  type EditorViewState,
} from './CanvasEditor'
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
import {
  chooseLocalCanvasFiles,
  chooseLocalCanvasSave,
  allowLocalWrite,
  localFilesFor,
  supportsLocalCanvasOpen,
  supportsLocalCanvasSave,
  writeLocalCanvas,
  type LocalCanvasBinding,
  type LocalCanvasImport,
} from './canvasLocalFiles'
import { recoveryFor, mergeRecoveredDrafts } from './canvasRecovery'
import ProjectDialog from './ProjectDialog'
import ViewLinkDialog from './ViewLinkDialog'
import { NotificationBell } from './SessionNotifications'
import { useSessionNotifications } from './notificationSession'
import { DEFAULT_LINK_OPTIONS, type LinkOptions } from './liveViewLinks'
import { localLibrary, sharedCanvasFileStore } from './localLibrary'
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
  CANVAS_FILE_ACCEPT,
  type CanvasViewport,
  type CanvasDocument,
} from './lcanvas'
import type { Preferences, Project } from './workspace'
import './file-workspace.css'
import CanvasTabs from './CanvasTabs'
import {
  normalizeProjectView,
  type ProjectViewSession,
} from './workspaceSessions'

type Entry = CanvasDraft
type FilePrompt = { kind: 'create' } | { kind: 'rename'; id: string }
export type WorkspaceOpenRequest = {
  sequence: number
  fileId?: string
  action?: 'create'
  imports?: File[]
  localImports?: LocalCanvasImport[]
}

export type WorkspaceViewCapture = {
  files: CanvasFileRecord[]
  view: ProjectViewSession
  activeView: (EditorViewState & { focusMode: boolean }) | null
  layout: WorkspaceLayout
}

function message(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : 'The file could not be opened.'
}

function sameDocument(left: CanvasDocument, right: CanvasDocument) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameContent(left: CanvasDocument, right: CanvasDocument) {
  return (
    JSON.stringify({ ...left, viewport: undefined }) ===
    JSON.stringify({ ...right, viewport: undefined })
  )
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
  workspaceActive = true,
  openRequest,
  viewSession,
  onViewSessionChange,
  workspacesPanel,
  onCopyViewLink,
  initialViewState,
  onInitialViewApplied,
  notificationScopeId = project.id,
  linkOptions = DEFAULT_LINK_OPTIONS,
  onLiveViewChange,
  initialCameras,
  onPrepareProjectExportReady,
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
  workspaceActive?: boolean
  openRequest?: WorkspaceOpenRequest
  viewSession?: ProjectViewSession
  onViewSessionChange?: (view: ProjectViewSession) => void
  workspacesPanel?: ReactNode
  onCopyViewLink?: (
    capture: WorkspaceViewCapture,
    mode?: 'exact' | 'latest',
  ) => Promise<string>
  initialViewState?: EditorViewState & { focusMode?: boolean }
  onInitialViewApplied?: () => void
  notificationScopeId?: string
  linkOptions?: LinkOptions
  onLiveViewChange?: (capture: WorkspaceViewCapture) => void
  initialCameras?: Record<string, CanvasViewport>
  onPrepareProjectExportReady?: (
    prepare: (() => CanvasFileRecord[]) | null,
  ) => void
}) {
  const notifications = useSessionNotifications(notificationScopeId)
  const { notify } = notifications
  const setError = useCallback(
    (text: string | null) => {
      if (text) notify(text, 'error')
    },
    [notify],
  )
  const setNotice = useCallback(
    (text: string | null) => {
      if (text) notify(text, 'info')
    },
    [notify],
  )
  const [entries, setEntries] = useState<Entry[]>([])
  const [openIds, setOpenIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const initialView = useRef(
    viewSession ? normalizeProjectView(viewSession) : null,
  )
  const [initialEditorView, setInitialEditorView] = useState(initialViewState)
  const camerasToRestore = useRef({ ...initialCameras })
  const replacementViews = useRef(new Map<string, EditorViewState>())
  const [editorEpochs, setEditorEpochs] = useState<Record<string, number>>({})
  const [liveViewRevision, setLiveViewRevision] = useState(0)
  const currentEditorView = useRef<{
    fileId: string
    state: EditorViewState
  } | null>(null)
  const lastPublishedView = useRef('')
  const [viewMeta, setViewMeta] = useState(() =>
    normalizeProjectView(viewSession),
  )
  const rememberEditorSession = useCallback(
    (session: { tool: string; activeLayerId: string | null }) => {
      setViewMeta((current) =>
        JSON.stringify(current.editorSession) === JSON.stringify(session)
          ? current
          : { ...current, editorSession: session },
      )
    },
    [],
  )
  const publishView = useEffectEvent(() => {
    onViewSessionChange?.(
      normalizeProjectView({ ...viewMeta, openIds, activeId }),
    )
  })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!loading) publishView()
  }, [openIds, activeId, viewMeta, loading])
  const [busy, setBusy] = useState(false)
  const [copyingView, setCopyingView] = useState(false)
  const [viewLink, setViewLink] = useState<string | null>(null)
  const [linkMenuOpen, setLinkMenuOpen] = useState(false)
  const [linkMenuPosition, setLinkMenuPosition] = useState({ left: 0, top: 0 })
  const linkMenu = useRef<HTMLDivElement>(null)
  const linkButton = useRef<HTMLButtonElement>(null)
  const [editorStatus, setEditorStatus] = useState<CanvasEditorStatus | null>(
    null,
  )
  const rememberStatus = useCallback((status: CanvasEditorStatus) => {
    setEditorStatus((current) =>
      JSON.stringify(current) === JSON.stringify(status) ? current : status,
    )
  }, [])
  const [localBindings, setLocalBindings] = useState(
    new Map<string, LocalCanvasBinding>(),
  )
  const [downloadedIds, setDownloadedIds] = useState(new Set<string>())
  const [savingIds, setSavingIds] = useState(new Set<string>())
  const [permissionIds, setPermissionIds] = useState(new Set<string>())
  const [failedSaveIds, setFailedSaveIds] = useState(new Set<string>())
  const entriesRef = useRef<Entry[]>([])
  const remoteConflicts = useRef(new Map<string, string>())
  const bindingsRef = useRef(localBindings)
  const workspaceActiveRef = useRef(workspaceActive)
  const manualSaving = useRef(false)
  const pendingFileSaves = useRef(new Map<string, Promise<void>>())
  const [localLayout, setLocalLayout] = useState(loadLayout)
  const layout = controlledLayout ?? localLayout
  const filesOpen = layout.filesOpen
  const [focusRightPanel, setFocusRightPanel] = useState<
    WorkspaceLayout['rightPanel']
  >(initialViewState?.focusMode ? layout.rightPanel : 'none')
  const [focusRightPinned, setFocusRightPinned] = useState(
    initialViewState?.focusMode ? layout.rightPinned : false,
  )
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
  const [prompt, setPrompt] = useState<FilePrompt | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const fileToggle = useRef<HTMLButtonElement>(null)
  const fileTabs = useRef<HTMLDivElement>(null)
  const alive = useRef(false)
  const openingSequence = useRef(0)
  const handledOpenRequest = useRef<number | null>(null)
  const initialOpenRequest = useRef(openRequest)
  const focusRoot = useRef<HTMLElement>(null)
  const [rightHost, setRightHost] = useState<HTMLDivElement | null>(null)
  const [rightInset, setRightInset] = useState(0)
  const { focused, toggle } = useCanvasFocus(
    focusRoot,
    onFocusChange,
    initialViewState?.focusMode ?? false,
  )
  const rightPanel = focused ? focusRightPanel : layout.rightPanel
  const rightPinned = focused ? focusRightPinned : layout.rightPinned
  const aiOpen = rightPanel === 'ai'
  const filesSide = layout.panelsSwapped ? 'right' : 'left'
  const toolsSide = layout.panelsSwapped ? 'left' : 'right'
  useCanvasDraftProtection(store)
  const active = entries.find((entry) => entry.record.id === activeId)
  const sharedStoreActive =
    store === sharedCanvasFileStore && localLibrary.available
  const localBinding = activeId ? localBindings.get(activeId) : undefined
  const localDirty = Boolean(
    active &&
    localBinding &&
    !(sharedStoreActive ? sameContent : sameDocument)(
      active.record.document,
      localBinding.savedDocument,
    ),
  )
  useLayoutEffect(() => {
    entriesRef.current = entries
    bindingsRef.current = localBindings
    workspaceActiveRef.current = workspaceActive
  })
  const editorController = useRef<{
    fileId: string
    controller: CanvasEditorController
  } | null>(null)
  const registerController = useCallback(
    (controller: CanvasEditorController | null) => {
      if (controller && activeId) {
        editorController.current = { fileId: activeId, controller }
        const state = controller.getViewState()
        currentEditorView.current = { fileId: activeId, state }
        replacementViews.current.delete(activeId)
        if (
          camerasToRestore.current[activeId] ||
          (activeId === initialView.current?.activeId && initialEditorView)
        ) {
          delete camerasToRestore.current[activeId]
          setEntries((current) =>
            current.map((entry) =>
              entry.record.id === activeId &&
              JSON.stringify(entry.record.document.viewport) !==
                JSON.stringify(state.viewport)
                ? {
                    ...entry,
                    record: {
                      ...entry.record,
                      document: {
                        ...entry.record.document,
                        viewport: state.viewport,
                      },
                    },
                  }
                : entry,
            ),
          )
        }
        if (activeId === initialView.current?.activeId && initialEditorView) {
          setInitialEditorView(undefined)
          onInitialViewApplied?.()
        }
      } else if (editorController.current?.fileId === activeId)
        editorController.current = null
    },
    [activeId, initialEditorView, onInitialViewApplied],
  )
  const rememberEditorView = useCallback(
    (state: EditorViewState) => {
      if (!activeId) return
      const previous = currentEditorView.current
      if (
        previous?.fileId === activeId &&
        JSON.stringify(previous.state) === JSON.stringify(state)
      )
        return
      currentEditorView.current = { fileId: activeId, state }
      setLiveViewRevision((current) => current + 1)
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
    fileId: workspaceActive ? activeId : null,
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
    const panel = rightHost.closest<HTMLElement>('[data-dock-side]')
    if (!panel) return
    // Pinned panels reserve their own width. Peek panels cover the stage.
    const measure = () =>
      setRightInset(
        toolsSide === 'right' && getComputedStyle(panel).position === 'absolute'
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
  }, [
    rightPanel,
    rightHost,
    rightPinned,
    layout.rightWidth,
    focused,
    toolsSide,
  ])

  function nextTab(direction: number) {
    const index = openIds.indexOf(activeId ?? '')
    const id = openIds[(index + direction + openIds.length) % openIds.length]
    const entry = entries.find((item) => item.record.id === id)
    if (entry) openFile(entry)
  }
  function captureCurrentView(): WorkspaceViewCapture {
    const current =
      editorController.current?.fileId === activeId
        ? editorController.current.controller
        : null
    const state =
      current?.getViewState() ??
      (currentEditorView.current?.fileId === activeId
        ? currentEditorView.current.state
        : null)
    return structuredClone({
      files: openIds
        .map((id) => currentSnapshot(id))
        .filter((file): file is CanvasFileRecord => !!file),
      view: normalizeProjectView({
        ...viewMeta,
        openIds,
        activeId,
        editorSession: state ?? viewMeta.editorSession,
      }),
      activeView: activeId && state ? { ...state, focusMode: focused } : null,
      layout: { ...layout, rightPanel, rightPinned },
    })
  }
  const publishLiveView = useEffectEvent(() => {
    if (!onLiveViewChange || !workspaceActive) return
    const capture = captureCurrentView()
    const signature = JSON.stringify({
      view: capture.view,
      activeView: capture.activeView,
      layout: capture.layout,
      cameras: capture.files.map((file) => [file.id, file.document.viewport]),
    })
    if (signature === lastPublishedView.current) return
    lastPublishedView.current = signature
    onLiveViewChange(capture)
  })
  useEffect(() => {
    if (!loading) publishLiveView()
  }, [
    loading,
    openIds,
    activeId,
    viewMeta,
    layout,
    rightPanel,
    rightPinned,
    focused,
    liveViewRevision,
    entries,
    workspaceActive,
  ])
  const prepareProjectExport = useCallback(() => {
    if (workspaceActive) editorController.current?.controller.flushDraft?.()
    return entriesRef.current
      .map((entry) => currentSnapshot(entry.record.id))
      .filter((file): file is CanvasFileRecord => !!file)
  }, [workspaceActive])
  useEffect(() => {
    onPrepareProjectExportReady?.(prepareProjectExport)
    return () => onPrepareProjectExportReady?.(null)
  }, [onPrepareProjectExportReady, prepareProjectExport])
  useEffect(() => {
    if (!linkMenuOpen) return
    linkMenu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !linkMenu.current?.contains(event.target) &&
        !linkButton.current?.contains(event.target)
      )
        setLinkMenuOpen(false)
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setLinkMenuOpen(false)
      linkButton.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [linkMenuOpen])
  async function copyViewLink(mode: 'exact' | 'latest' = 'exact') {
    const current = editorController.current
    if (!current || !activeId || !onCopyViewLink || copyingView) return
    if (
      mode === 'exact' ? !linkOptions.exactEnabled : !linkOptions.latestEnabled
    )
      return
    setLinkMenuOpen(false)
    linkButton.current?.focus()
    setCopyingView(true)
    setError(null)
    try {
      current.controller.flushDraft?.()
      // Capture synchronously before compression/clipboard work, including drafts.
      const capture = captureCurrentView()
      const pendingLink = onCopyViewLink(capture, mode)
      // Promise-backed ClipboardItem keeps the initiating click's permission.
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        const content = pendingLink.then(
          (url) => new Blob([url], { type: 'text/plain' }),
        )
        // Some embedded browsers reject a promise-backed item synchronously.
        void content.catch(() => undefined)
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/plain': content,
            }),
          ])
          if (alive.current)
            setNotice(
              `${mode === 'exact' ? 'Exact view' : 'Latest view'} link copied.`,
            )
          return
        } catch {
          // The selectable link below also works in embedded browsers.
        }
      }
      const url = await pendingLink
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error('Clipboard unavailable')
        await navigator.clipboard.writeText(url)
        if (alive.current)
          setNotice(
            `${mode === 'exact' ? 'Exact view' : 'Latest view'} link copied.`,
          )
      } catch {
        if (alive.current) setViewLink(url)
      }
    } catch (failure) {
      if (alive.current) setError(message(failure))
    } finally {
      if (alive.current) setCopyingView(false)
    }
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
  useRegisterCommands(
    workspaceActive
      ? [
          {
            id: 'file.new',
            label: 'New canvas',
            category: 'Files',
            execute: () => setPrompt({ kind: 'create' }),
            enabled: !loading && !busy && !focused,
          },
          {
            id: 'file.import',
            label: 'Import CLF',
            category: 'Files',
            execute: () => {
              void openLocalFiles()
            },
            enabled: !loading && !busy && !focused,
          },
          {
            id: 'file.saveAs',
            label: 'Save canvas as local file',
            category: 'Files',
            execute: () => {
              void saveFile(true)
            },
            enabled: Boolean(active) && !busy,
            allowWhileTyping: true,
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
            allowWhileTyping: true,
          },
          {
            id: 'file.copyViewLink',
            label: 'Copy exact view link',
            category: 'Files',
            execute: () => {
              void copyViewLink()
            },
            enabled:
              Boolean(active && onCopyViewLink && linkOptions.exactEnabled) &&
              !copyingView,
            allowWhileTyping: true,
          },
          {
            id: 'file.copyLatestViewLink',
            label: 'Copy latest view link',
            category: 'Files',
            execute: () => {
              void copyViewLink('latest')
            },
            enabled:
              Boolean(active && onCopyViewLink && linkOptions.latestEnabled) &&
              !copyingView,
            allowWhileTyping: true,
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
        ]
      : [],
  )
  useRegisterFiles(
    workspaceActive
      ? entries.map((entry) => ({
          id: entry.record.id,
          name: entry.record.document.name,
          projectName: project.name,
          open: () => {
            void (async () => {
              if (focused) await toggle()
              openFile(entry)
            })()
          },
        }))
      : [],
  )

  function restoreTabs(restored: Entry[]) {
    setViewMeta((current) =>
      current.recentIds.length
        ? current
        : {
            ...current,
            recentIds: [...restored]
              .sort((a, b) => b.record.lastOpenedAt - a.record.lastOpenedAt)
              .slice(0, 1000)
              .map((entry) => entry.record.id),
          },
    )
    const requested = initialOpenRequest.current
    const retained = (initialView.current?.openIds ?? []).filter((id) =>
      restored.some((entry) => entry.record.id === id),
    )
    const initial =
      requested?.action || requested?.imports || requested?.localImports
        ? null
        : requested?.fileId
          ? restored.find((entry) => entry.record.id === requested.fileId)
          : initialView.current
            ? restored.find(
                (entry) => entry.record.id === initialView.current?.activeId,
              )
            : restored[0]
    const ids =
      initial && !retained.includes(initial.record.id)
        ? [...retained, initial.record.id]
        : retained
    setOpenIds(ids)
    setActiveId(initial?.record.id ?? ids[0] ?? null)
  }

  useEffect(() => {
    alive.current = true
    let cancelled = false
    const recovered = recoveryFor(store)
      .list(project.id)
      .catch((failure: unknown) => {
        if (!cancelled) setNotice(message(failure))
        return []
      })
    Promise.all([store.list(project.id), recovered])
      .then(async ([result, recoveredDrafts]) => {
        if (cancelled) return
        const files = [...result.value].sort(
          (a, b) => b.lastOpenedAt - a.lastOpenedAt,
        )
        openingSequence.current = Math.max(
          0,
          ...files.map((file) => file.lastOpenedAt),
        )
        const cachedDrafts = projectDrafts(store).get(project.id) ?? []
        const savedEntries = files.map((record) => {
          const draft = cachedDrafts.find(
            (entry) => entry.record.id === record.id && entry.dirty,
          )
          if (
            draft &&
            sharedStoreActive &&
            sameContent(draft.savedDocument, record.document)
          )
            return {
              ...draft,
              record: {
                ...draft.record,
                ...record,
                document: draft.record.document,
              },
            }
          return (
            draft ?? {
              record,
              dirty: false,
              savedDocument: record.document,
              persistence: result.persistence,
            }
          )
        })
        // Drafts can exist without a saved record (for example after a failed write).
        savedEntries.push(
          ...cachedDrafts.filter(
            (draft) =>
              !savedEntries.some(
                (entry) => entry.record.id === draft.record.id,
              ),
          ),
        )
        let restored = mergeRecoveredDrafts(savedEntries, recoveredDrafts)
        const remembered = await Promise.all(
          restored.map(async (entry) => {
            try {
              return [
                entry.record.id,
                await localFilesFor(store).get(project.id, entry.record.id),
              ] as const
            } catch (failure) {
              if (!cancelled) setNotice(message(failure))
              return [entry.record.id, null] as const
            }
          }),
        )
        if (cancelled) return
        const rememberedBindings = new Map(
          remembered.filter(
            (entry): entry is readonly [string, LocalCanvasBinding] =>
              entry[1] !== null,
          ),
        )
        // Physical commits remain authoritative if updating their browser copy failed.
        // Reconcile the saved baseline before merging recovery to retain later drafts too.
        restored = mergeRecoveredDrafts(
          savedEntries.map((entry) => {
            const local = rememberedBindings.get(entry.record.id)
            return local && !entry.dirty && !sharedStoreActive
              ? {
                  ...entry,
                  record: { ...entry.record, document: local.savedDocument },
                  savedDocument: local.savedDocument,
                }
              : entry
          }),
          recoveredDrafts,
        )
        if (sharedStoreActive)
          restored = restored.map((entry) => {
            const saved = files.find((record) => record.id === entry.record.id)
            if (!saved || !entry.dirty) return entry
            if (!sameContent(entry.savedDocument, saved.document)) {
              remoteConflicts.current.set(
                saved.id,
                JSON.stringify({ ...saved.document, viewport: undefined }),
              )
              setNotice(
                'A recovered draft differs from the current local-library file. Export the draft before reopening the latest file.',
              )
              return entry
            }
            return {
              ...entry,
              record: {
                ...entry.record,
                ...saved,
                document: entry.record.document,
              },
            }
          })
        setLocalBindings(rememberedBindings)
        setEntries(restored)
        restoreTabs(restored)
        if (result.error) setNotice(result.error)
        setLoading(false)
      })
      .catch(async (failure: unknown) => {
        if (cancelled) return
        const cached = mergeRecoveredDrafts(
          projectDrafts(store).get(project.id) ?? [],
          await recovered,
        )
        if (cancelled) return
        setEntries(cached)
        restoreTabs(cached)
        setError(message(failure))
        setLoading(false)
      })
    return () => {
      cancelled = true
      alive.current = false
    }
  }, [project.id, store, sharedStoreActive, setError, setNotice])

  const remoteReadFailed = useRef(false)
  useEffect(() => {
    if (loading || !sharedStoreActive) return
    let cancelled = false
    let reading = false
    async function poll() {
      if (reading || manualSaving.current || pendingFileSaves.current.size)
        return
      reading = true
      try {
        const result = await store.list(project.id)
        if (
          cancelled ||
          !alive.current ||
          manualSaving.current ||
          pendingFileSaves.current.size
        )
          return
        remoteReadFailed.current = false
        const incoming = new Map(result.value.map((file) => [file.id, file]))
        const replacements: string[] = []
        let changed = false
        const restored = entriesRef.current.map((entry) => {
          const remote = incoming.get(entry.record.id)
          if (!remote) return entry
          incoming.delete(entry.record.id)
          const controller =
            editorController.current?.fileId === entry.record.id
              ? editorController.current.controller
              : null
          const document = controller?.getDocument() ?? entry.record.document
          const changedContent = !sameContent(
            remote.document,
            entry.savedDocument,
          )
          const locallyEdited = !sameContent(document, entry.savedDocument)
          const activeElement = globalThis.document.activeElement
          const editing =
            !!controller &&
            (!!focusRoot.current?.querySelector(
              '.canvas-inline-edit, .lcanvas-stage[data-dragging="true"], .canvas-inspector [aria-invalid="true"]',
            ) ||
              (activeElement instanceof Element &&
                !!activeElement.closest('.canvas-inspector') &&
                activeElement.matches('input, textarea, select')))
          if (changedContent && (locallyEdited || editing)) {
            const signature = JSON.stringify({
              ...remote.document,
              viewport: undefined,
            })
            if (remoteConflicts.current.get(remote.id) !== signature) {
              remoteConflicts.current.set(remote.id, signature)
              setNotice(
                'This canvas changed in another view. Your local edits were kept; export them before reopening the latest file.',
              )
            }
            return entry
          }
          remoteConflicts.current.delete(remote.id)
          const sameRevision = Object.getOwnPropertySymbols(remote).every(
            (key) =>
              Reflect.get(remote, key) === Reflect.get(entry.record, key),
          )
          if (
            !changedContent &&
            sameRevision &&
            remote.updatedAt === entry.record.updatedAt
          )
            return entry
          changed = true
          const viewport = document.viewport
          if (changedContent) {
            if (controller)
              replacementViews.current.set(remote.id, controller.getViewState())
            replacements.push(remote.id)
            return {
              record: {
                ...remote,
                document: { ...remote.document, viewport },
                lastOpenedAt: Math.max(
                  remote.lastOpenedAt,
                  entry.record.lastOpenedAt,
                ),
              },
              savedDocument: { ...remote.document, viewport },
              dirty: false,
              persistence: result.persistence,
            }
          }
          // A revision that kept the same saved content is safe to rebase onto.
          // Spreading the acknowledgement carries its opaque CAS symbol too.
          return {
            ...entry,
            record: {
              ...entry.record,
              ...remote,
              document,
              lastOpenedAt: Math.max(
                remote.lastOpenedAt,
                entry.record.lastOpenedAt,
              ),
            },
            persistence: result.persistence,
          }
        })
        for (const remote of incoming.values()) {
          changed = true
          restored.push({
            record: remote,
            savedDocument: remote.document,
            dirty: false,
            persistence: result.persistence,
          })
        }
        if (changed) {
          entriesRef.current = restored
          setEntries(restored)
        }
        if (replacements.length) {
          setEditorEpochs((current) => {
            const next = { ...current }
            replacements.forEach((id) => {
              next[id] = (next[id] ?? 0) + 1
            })
            return next
          })
          setNotice(
            'Updated from another Canvas Live view. Undo starts from the updated version.',
          )
        }
      } catch (failure) {
        if (!cancelled && alive.current && !remoteReadFailed.current) {
          remoteReadFailed.current = true
          setNotice(`Live file updates paused: ${message(failure)}`)
        }
      } finally {
        reading = false
      }
    }
    const timer = setInterval(() => {
      void poll()
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [loading, sharedStoreActive, project.id, store, setNotice])

  useEffect(() => {
    if (!loading)
      projectDrafts(store).set(
        project.id,
        entries.filter((entry) => entry.dirty),
      )
  }, [entries, loading, project.id, store])

  useEffect(() => {
    if (loading) return
    const snapshot = entries.filter((entry) => entry.dirty)
    const timer = setTimeout(() => {
      void recoveryFor(store)
        .replace(project.id, snapshot)
        .catch((failure: unknown) => {
          if (alive.current) setNotice(message(failure))
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [entries, loading, project.id, store, setNotice])
  useEffect(() => {
    function flushRecovery() {
      const drafts = entriesRef.current.filter((entry) => entry.dirty)
      void recoveryFor(store)
        .replace(project.id, drafts)
        .catch((failure: unknown) => {
          if (alive.current) setNotice(message(failure))
        })
    }
    window.addEventListener('pagehide', flushRecovery)
    return () => {
      window.removeEventListener('pagehide', flushRecovery)
      flushRecovery()
    }
  }, [project.id, store, setNotice])
  useEffect(() => {
    if (!workspaceActive && !loading)
      void recoveryFor(store)
        .replace(
          project.id,
          entriesRef.current.filter((entry) => entry.dirty),
        )
        .catch((failure: unknown) => {
          if (alive.current) setNotice(message(failure))
        })
  }, [workspaceActive, loading, project.id, store, setNotice])

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
    setViewMeta((current) => ({
      ...current,
      recentIds: [
        record.id,
        ...current.recentIds.filter((id) => id !== record.id),
      ].slice(0, 1000),
    }))
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
            updatedAt: savingTimestamp(existing.record.updatedAt),
          }
        : createCanvasFileRecord(
            project.id,
            document,
            Math.max(openingTimestamp(entries), openingSequence.current + 1),
          )
      if (existing && bindingsRef.current.has(existing.record.id)) {
        setEntries((current) =>
          current.map((entry) =>
            entry.record.id === existing.record.id
              ? {
                  ...entry,
                  record,
                  dirty: !sameDocument(entry.savedDocument, record.document),
                }
              : entry,
          ),
        )
        setError(null)
        setPrompt(null)
        return null
      }
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
    await importSelectedFiles(selected)
  }
  async function importSelectedFiles(selected: File[]) {
    if (!selected.length) return
    setBusy(true)
    setError(null)
    const failures: string[] = []
    for (const file of selected) {
      try {
        if (!/\.(?:clf|lcanvas)$/iu.test(file.name))
          throw new Error(
            'Choose a .CLF file (legacy .lcanvas is also supported).',
          )
        if (file.size > 10 * 1024 * 1024)
          throw new Error('Canvas files must be 10 MiB or smaller.')
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

  async function importBoundFiles(selected: LocalCanvasImport[]) {
    if (!selected.length) return
    setBusy(true)
    const failures: string[] = []
    for (const source of selected) {
      try {
        if (
          !/\.(?:clf|lcanvas)$/iu.test(source.file.name) ||
          source.file.size > 10 * 1024 * 1024
        )
          throw new Error(
            'Choose a .CLF file no larger than 10 MiB (legacy .lcanvas is also supported).',
          )
        const document = parseLCANVAS(await source.file.text())
        if (!alive.current) break
        let prior: Entry | undefined
        for (const [id, bound] of bindingsRef.current) {
          if (
            bound.handle === source.handle ||
            (bound.handle.isSameEntry &&
              (await bound.handle.isSameEntry(source.handle)))
          ) {
            prior = entriesRef.current.find((entry) => entry.record.id === id)
            if (prior) break
          }
        }
        if (
          prior?.dirty ||
          (prior &&
            !sameDocument(
              prior.record.document,
              bindingsRef.current.get(prior.record.id)!.savedDocument,
            ))
        ) {
          openFile(prior, true)
          setNotice(
            'This local file is already open. Your unsaved edits have been kept.',
          )
          continue
        }
        const record = prior
          ? {
              ...prior.record,
              document,
              updatedAt: savingTimestamp(prior.record.updatedAt),
              lastOpenedAt: Math.max(
                openingTimestamp(entriesRef.current),
                openingSequence.current + 1,
              ),
            }
          : createCanvasFileRecord(
              project.id,
              document,
              Math.max(
                openingTimestamp(entriesRef.current),
                openingSequence.current + 1,
              ),
            )
        const result = await store.save(record)
        if (!alive.current) break
        const bound = {
          handle: source.handle,
          autoSave: bindingsRef.current.get(record.id)?.autoSave ?? true,
          savedDocument: document,
        }
        await localFilesFor(store)
          .set(project.id, record.id, bound)
          .catch((failure: unknown) => {
            failures.push(message(failure))
          })
        if (!alive.current) break
        bindingsRef.current = new Map(bindingsRef.current).set(record.id, bound)
        setLocalBindings((current) => new Map(current).set(record.id, bound))
        setFailedSaveIds((current) => {
          const next = new Set(current)
          next.delete(record.id)
          return next
        })
        setNotice(
          result.error
            ? 'This .CLF file is stored locally. Browser recovery is unavailable.'
            : null,
        )
        accept(result.value, result.persistence)
      } catch (failure) {
        failures.push(`${source.file.name}: ${message(failure)}`)
      }
    }
    if (!alive.current) return
    setBusy(false)
    setError(failures.length ? failures.join('\n') : null)
  }

  async function openLocalFiles() {
    if (!supportsLocalCanvasOpen()) {
      importInput.current?.click()
      return
    }
    try {
      const selected = await chooseLocalCanvasFiles()
      if (selected && alive.current) await importBoundFiles(selected)
    } catch (failure) {
      if (alive.current) setError(message(failure))
    }
  }

  function openFile(entry: Entry, keepNotice = false) {
    const id = entry.record.id
    setOpenIds((current) => (current.includes(id) ? current : [...current, id]))
    setActiveId(id)
    setViewMeta((current) => ({
      ...current,
      recentIds: [
        id,
        ...current.recentIds.filter((recentId) => recentId !== id),
      ].slice(0, 1000),
      shortcuts: current.shortcuts.map((item) =>
        item.id === id ? { ...item, hidden: false } : item,
      ),
    }))
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
        if (result.error && !keepNotice) setNotice(result.error)
      })
      .catch((failure: unknown) => {
        if (alive.current) setError(message(failure))
      })
  }

  const handleOpenRequest = useEffectEvent((request: WorkspaceOpenRequest) => {
    handledOpenRequest.current = request.sequence
    if (request.action === 'create') setPrompt({ kind: 'create' })
    else if (request.localImports) void importBoundFiles(request.localImports)
    else if (request.imports) void importSelectedFiles(request.imports)
    else if (request.fileId) {
      const entry = entries.find((item) => item.record.id === request.fileId)
      if (entry) openFile(entry)
      else
        setError(
          'This canvas could not be found. Choose another file from Home.',
        )
    }
  })
  useEffect(() => {
    if (
      !workspaceActive ||
      loading ||
      !openRequest ||
      handledOpenRequest.current === openRequest.sequence
    )
      return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled && alive.current) handleOpenRequest(openRequest)
    })
    return () => {
      cancelled = true
    }
  }, [workspaceActive, loading, openRequest])

  function closeTab(id: string) {
    setOpenIds((current) => {
      const next = current.filter((open) => open !== id)
      setActiveId((active) =>
        active === id
          ? (next[Math.min(current.indexOf(id), next.length - 1)] ?? null)
          : active,
      )
      return next
    })
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
              dirty: !(sharedStoreActive ? sameContent : sameDocument)(
                entry.savedDocument,
                document,
              ),
              record: {
                ...entry.record,
                document,
              },
            }
          : entry,
      ),
    )
  }

  function rememberSaved(
    snapshot: CanvasFileRecord,
    persistence: Entry['persistence'],
  ) {
    const update = (current: Entry[]) =>
      current.map((entry) =>
        entry.record.id === snapshot.id
          ? {
              ...entry,
              savedDocument: snapshot.document,
              dirty: !(sharedStoreActive ? sameContent : sameDocument)(
                entry.record.document,
                snapshot.document,
              ),
              persistence,
              record: {
                ...entry.record,
                ...snapshot,
                document: entry.record.document,
                lastOpenedAt: Math.max(
                  entry.record.lastOpenedAt,
                  snapshot.lastOpenedAt,
                ),
              },
            }
          : entry,
      )
    // Update refs before awaiting anything else so a newly requested save sees this commit.
    entriesRef.current = update(entriesRef.current)
    projectDrafts(store).set(
      project.id,
      entriesRef.current.filter((entry) => entry.dirty),
    )
    if (alive.current) setEntries(update)
  }

  function currentSnapshot(id: string) {
    const entry = entriesRef.current.find((item) => item.record.id === id)
    if (!entry) return null
    const document =
      editorController.current?.fileId === id
        ? editorController.current.controller.getDocument()
        : entry.record.document
    return {
      ...entry.record,
      document,
      updatedAt: savingTimestamp(entry.record.updatedAt),
    }
  }

  async function cacheSaved(snapshot: CanvasFileRecord) {
    try {
      const result = await store.save(snapshot)
      rememberSaved(result.value, result.persistence)
      if (alive.current && result.error)
        setNotice(
          'Saved to file. Browser recovery is unavailable; the .CLF file is stored locally.',
        )
    } catch (failure) {
      // A completed physical file remains saved even if its browser copy fails.
      // A failed shared-library commit must keep its original baseline and CAS
      // revision, so polling cannot replace the unsynchronized physical edit.
      if (!sharedStoreActive) rememberSaved(snapshot, 'session')
      if (alive.current)
        setNotice(
          sharedStoreActive
            ? `The .CLF file is saved. Its local-library copy could not be updated; your edits remain open: ${message(failure)}`
            : `The local file is saved. Its browser copy could not be updated: ${message(failure)}`,
        )
    }
  }

  async function saveBoundFile(
    id: string,
    target: LocalCanvasBinding,
    newTarget: boolean,
    interactive: boolean,
  ) {
    const previousSave = pendingFileSaves.current.get(id)
    // Ask only during the explicit save gesture; autosave may query existing grants only.
    const permission = newTarget
      ? Promise.resolve(true)
      : allowLocalWrite(target.handle, interactive)
    const task = (async () => {
      if (!(await permission)) {
        if (alive.current)
          setPermissionIds((current) => new Set(current).add(id))
        if (interactive)
          throw new Error(
            'Local file permission was not granted. Save again to allow access, or use Save as.',
          )
        return
      }
      await previousSave?.catch(() => undefined)
      if (!alive.current || (!interactive && !workspaceActiveRef.current))
        return
      const snapshot = currentSnapshot(id)
      if (!snapshot) return
      const latest = bindingsRef.current.get(id)
      const expected = newTarget
        ? undefined
        : (latest?.savedDocument ?? target.savedDocument)
      await writeLocalCanvas(target.handle, snapshot.document, expected)
      const nextBinding = {
        ...target,
        autoSave: bindingsRef.current.get(id)?.autoSave ?? target.autoSave,
        savedDocument: snapshot.document,
      }
      bindingsRef.current = new Map(bindingsRef.current).set(id, nextBinding)
      if (alive.current) {
        setLocalBindings((current) => new Map(current).set(id, nextBinding))
        setFailedSaveIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
        setPermissionIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
      await localFilesFor(store)
        .set(project.id, id, nextBinding)
        .catch((failure: unknown) => {
          if (alive.current)
            setNotice(
              `Saved to file. The browser could not remember its handle: ${message(failure)}`,
            )
        })
      await cacheSaved(snapshot)
    })()
    pendingFileSaves.current.set(id, task)
    if (alive.current) setSavingIds((current) => new Set(current).add(id))
    try {
      await task
    } finally {
      const lastSave = pendingFileSaves.current.get(id) === task
      if (lastSave) pendingFileSaves.current.delete(id)
      if (alive.current && lastSave)
        setSavingIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
    }
  }

  async function saveFile(saveAs = false) {
    if (!activeId || busy || manualSaving.current) return
    const id = activeId
    manualSaving.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (editorController.current?.fileId === id)
        editorController.current.controller.flushDraft?.()
      if (sharedStoreActive && !saveAs && remoteConflicts.current.has(id))
        throw new Error(
          'This canvas changed in another view. Export your local edits before reopening the latest file.',
        )
      const existing = bindingsRef.current.get(id)
      if (sharedStoreActive && !saveAs && !existing) {
        const snapshot = currentSnapshot(id)
        if (!snapshot) return
        const result = await store.save(snapshot)
        rememberSaved(result.value, result.persistence)
        if (alive.current)
          setNotice(result.error ?? 'Saved to the local library.')
        return
      }
      if (!supportsLocalCanvasSave() && saveAs && existing) {
        exportFile()
        return
      }
      if (!supportsLocalCanvasSave() && !existing) {
        const snapshot = currentSnapshot(id)
        if (!snapshot) return
        const result = await store.save(snapshot)
        rememberSaved(result.value, result.persistence)
        if (alive.current)
          setNotice(
            'Browser copy only. Use Export to download a local .CLF backup, or open Canvas Live in Chrome or Edge for Save and Save as.',
          )
        return
      }
      let target = existing
      if (saveAs || !target) {
        // Invoke the picker directly from the user's click, before any other awaited work.
        const chosen = await chooseLocalCanvasSave(
          active?.record.document.name ?? 'Canvas',
        )
        if (!chosen || !alive.current) return
        for (const [boundId, bound] of bindingsRef.current) {
          if (
            boundId !== id &&
            (bound.handle === chosen ||
              (bound.handle.isSameEntry &&
                (await bound.handle.isSameEntry(chosen))))
          )
            throw new Error(
              'This file already belongs to another canvas in this project. Use Save as to choose a different local file.',
            )
        }
        target = {
          handle: chosen,
          autoSave: existing?.autoSave ?? true,
          savedDocument: active!.record.document,
        }
      }
      await saveBoundFile(id, target, saveAs || !existing, true)
    } catch (failure) {
      if (alive.current) {
        setError(message(failure))
        setFailedSaveIds((current) => new Set(current).add(id))
      }
    } finally {
      manualSaving.current = false
      if (alive.current) setBusy(false)
    }
  }

  const autosaveCurrent = useEffectEvent(() => {
    if (manualSaving.current || !workspaceActiveRef.current) return
    for (const entry of entriesRef.current) {
      const id = entry.record.id
      const target = bindingsRef.current.get(id)
      if (
        !target?.autoSave ||
        permissionIds.has(id) ||
        pendingFileSaves.current.has(id) ||
        (sharedStoreActive ? sameContent : sameDocument)(
          entry.record.document,
          target.savedDocument,
        )
      )
        continue
      void saveBoundFile(id, target, false, false).catch((failure: unknown) => {
        if (alive.current) {
          setError(message(failure))
          setFailedSaveIds((current) => new Set(current).add(id))
          // A denied write or external conflict waits for explicit Save rather than retrying forever.
          setPermissionIds((current) => new Set(current).add(id))
        }
      })
    }
  })
  useEffect(() => {
    if (loading || !workspaceActive || busy) return
    const timer = setTimeout(() => autosaveCurrent(), 900)
    return () => clearTimeout(timer)
  }, [
    entries,
    localBindings,
    permissionIds,
    loading,
    workspaceActive,
    busy,
    savingIds,
  ])

  async function toggleLocalAutosave() {
    if (!activeId) return
    const id = activeId
    const previous = bindingsRef.current.get(id)
    if (!previous) return
    const next = { ...previous, autoSave: !previous.autoSave }
    bindingsRef.current = new Map(bindingsRef.current).set(id, next)
    setLocalBindings((current) => new Map(current).set(id, next))
    try {
      await localFilesFor(store).set(project.id, id, next)
    } catch (failure) {
      if (alive.current) setNotice(message(failure))
    }
  }

  function exportFile() {
    if (!activeId) return
    const id = activeId
    try {
      if (editorController.current?.fileId === id)
        editorController.current.controller.flushDraft?.()
      const snapshot = currentSnapshot(id)
      if (!snapshot) return
      const url = URL.createObjectURL(
        new Blob([serializeLCANVAS(snapshot.document)], {
          type: 'application/json',
        }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = canvasExportFilename(snapshot.document.name)
      link.click()
      const revoke = URL.revokeObjectURL.bind(URL)
      setTimeout(() => revoke(url), 1000)
      setDownloadedIds((current) => new Set(current).add(id))
      setNotice(
        'Download copy requested. Keep the .CLF file from Downloads or your chosen folder as a backup.',
      )
      setError(null)
    } catch (failure) {
      setError(message(failure))
    }
  }

  function shortcut(id: string) {
    return viewMeta.shortcuts.find((item) => item.id === id)
  }
  function updateShortcut(
    id: string,
    patch: { pinned?: boolean; hidden?: boolean },
  ) {
    setViewMeta((current) => {
      const existing = current.shortcuts.find((item) => item.id === id) ?? {
        id,
        pinned: false,
        hidden: false,
      }
      return {
        ...current,
        shortcuts: [
          ...current.shortcuts.filter((item) => item.id !== id),
          { ...existing, ...patch },
        ],
      }
    })
  }
  function fileRow(entry: Entry, section: 'all' | 'recent' | 'pinned') {
    const pinned = shortcut(entry.record.id)?.pinned ?? false
    return (
      <div key={entry.record.id} className="file-shortcut-row">
        <button
          className={`canvas-file ${entry.record.id === activeId ? 'is-active' : ''}`}
          aria-label={`Open ${section === 'all' ? '' : section + ' '}canvas ${entry.record.document.name}`}
          onClick={() => openFile(entry)}
          title={`${entry.record.document.name}.CLF`}
        >
          <Icon name="canvas" />
          <span>
            {entry.record.document.name}
            <small>.CLF</small>
          </span>
          {entry.dirty && (
            <span className="file-dirty" aria-label="Unsaved changes" />
          )}
        </button>
        <div className="file-shortcut-actions">
          <button
            className="icon-button"
            aria-label={`${pinned ? 'Unpin' : 'Pin'} ${section} file ${entry.record.document.name}`}
            title={pinned ? 'Unpin file' : 'Pin file'}
            aria-pressed={pinned}
            onClick={() =>
              updateShortcut(entry.record.id, {
                pinned: !pinned,
                hidden: false,
              })
            }
          >
            <Icon name="pin" />
          </button>
          {section !== 'all' && (
            <button
              className="icon-button"
              aria-label={`Remove ${section} file ${entry.record.document.name} from list`}
              title="Remove shortcut; keep file"
              onClick={() =>
                updateShortcut(entry.record.id, { pinned: false, hidden: true })
              }
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>
    )
  }
  const pinnedFiles = visible.filter(
    (entry) => shortcut(entry.record.id)?.pinned,
  )
  const recentOrder = new Map(
    viewMeta.recentIds.map((id, index) => [id, index]),
  )
  const recentFiles = visible
    .filter(
      (entry) =>
        !shortcut(entry.record.id)?.pinned &&
        !shortcut(entry.record.id)?.hidden,
    )
    .sort((a, b) => {
      const aIndex = recentOrder.get(a.record.id)
      const bIndex = recentOrder.get(b.record.id)
      if (aIndex !== undefined || bIndex !== undefined)
        return (
          (aIndex ?? Number.MAX_SAFE_INTEGER) -
          (bIndex ?? Number.MAX_SAFE_INTEGER)
        )
      return b.record.lastOpenedAt - a.record.lastOpenedAt
    })

  return (
    <section
      ref={focusRoot}
      className="file-workspace"
      data-focus={focused}
      data-autohide-tabs={layout.autoHideTabs}
      data-autohide-status={layout.autoHideStatus}
      style={
        {
          '--file-panel-width': `${layout.filesWidth}px`,
          '--right-panel-width': `${layout.rightWidth}px`,
          '--ribbon-width': `${layout.ribbonWidth}px`,
          '--controls-width': `${layout.controlsWidth}px`,
          '--tab-bar-height': `${layout.tabBarHeight}px`,
          '--status-bar-height': `${layout.statusBarHeight}px`,
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
        accept={CANVAS_FILE_ACCEPT}
        aria-label="Import CLF files"
        onChange={importFiles}
      />
      <div
        className="workspace-deck"
        data-panels-swapped={layout.panelsSwapped}
      >
        <DockPanel
          id="project-files"
          label="Project files"
          side={filesSide}
          autoHide={layout.autoHidePanels}
          autoHideDelay={layout.autoHideDelay}
          onMove={(side) =>
            changeLayout({ ...layout, panelsSwapped: side === 'right' })
          }
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
            {
              id: 'workspaces',
              label: 'Workspaces',
              icon: <Icon name="work" />,
            },
          ]}
          onSelect={(id) =>
            changeLayout({
              ...layout,
              filesOpen: true,
              leftPanel:
                id === 'projects'
                  ? 'projects'
                  : id === 'workspaces'
                    ? 'workspaces'
                    : 'files',
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
          {layout.leftPanel === 'workspaces' ? (
            workspacesPanel
          ) : layout.leftPanel === 'projects' ? (
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
                  title="Import CLF files"
                  aria-label="Import"
                  disabled={loading || busy}
                  onClick={() => {
                    void openLocalFiles()
                  }}
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
              {!!pinnedFiles.length && (
                <section
                  aria-label="Pinned files"
                  className="file-list-section"
                >
                  <h3 className="project-section-title">Pinned</h3>
                  {pinnedFiles.map((entry) => fileRow(entry, 'pinned'))}
                </section>
              )}
              {!loading && (
                <section
                  aria-label="Recent files"
                  className="file-list-section"
                >
                  <button
                    className="project-section-toggle"
                    aria-expanded={!viewMeta.recentsCollapsed}
                    onClick={() =>
                      setViewMeta((current) => ({
                        ...current,
                        recentsCollapsed: !current.recentsCollapsed,
                      }))
                    }
                  >
                    {viewMeta.recentsCollapsed ? '▸' : '▾'} Recent
                  </button>
                  <div hidden={viewMeta.recentsCollapsed}>
                    {recentFiles.map((entry) => fileRow(entry, 'recent'))}
                  </div>
                </section>
              )}
              <div className="file-list">
                {loading ? (
                  <p className="file-list-empty">Opening your files…</p>
                ) : !entries.length ? (
                  <p className="file-list-empty">No canvas files yet.</p>
                ) : !visible.length ? (
                  <p className="file-list-empty">No matching canvas files.</p>
                ) : (
                  <section aria-label="All files" className="file-list-section">
                    <h3 className="project-section-title">All files</h3>
                    {visible.map((entry) => fileRow(entry, 'all'))}
                  </section>
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
                data-dock-trigger={filesSide}
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
              <CanvasTabs
                ids={openIds}
                files={entries.map((entry) => ({
                  id: entry.record.id,
                  name: entry.record.document.name,
                  dirty: entry.dirty,
                }))}
                activeId={activeId}
                tabs={viewMeta.tabs}
                groups={viewMeta.groups}
                onOrder={setOpenIds}
                onOpen={(id) => {
                  const entry = entries.find((item) => item.record.id === id)
                  if (entry) openFile(entry)
                }}
                onClose={closeTab}
                onNavigate={navigateTab}
                onPresentation={(tabs, groups) =>
                  setViewMeta((current) => ({ ...current, tabs, groups }))
                }
              />
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
                onClick={() => {
                  void saveFile()
                }}
                aria-label="Save"
                title="Save this canvas · Ctrl+S"
              >
                <Icon name="save" />
              </button>
              <button
                className="icon-button"
                disabled={!active || busy}
                onClick={() => {
                  void saveFile(true)
                }}
                aria-label="Save as"
                title="Save as a local .CLF file · Ctrl+Shift+S"
              >
                <Icon name="files" />
              </button>
              {localBinding && (
                <button
                  className="icon-button"
                  aria-label="Auto-save local file"
                  aria-pressed={localBinding.autoSave}
                  title={
                    localBinding.autoSave
                      ? 'Auto-save local file on · click to pause'
                      : 'Auto-save local file off · click to enable'
                  }
                  onClick={() => {
                    void toggleLocalAutosave()
                  }}
                >
                  <Icon name="clock" />
                </button>
              )}
              {onCopyViewLink && (
                <button
                  ref={linkButton}
                  className="icon-button"
                  disabled={
                    !active ||
                    copyingView ||
                    (!linkOptions.exactEnabled && !linkOptions.latestEnabled)
                  }
                  onClick={() => {
                    const box = linkButton.current?.getBoundingClientRect()
                    if (box)
                      setLinkMenuPosition({
                        left: Math.max(
                          8,
                          Math.min(box.left, window.innerWidth - 228),
                        ),
                        top: Math.max(
                          8,
                          Math.min(box.bottom + 5, window.innerHeight - 110),
                        ),
                      })
                    setLinkMenuOpen((current) => !current)
                  }}
                  aria-label="Copy view link"
                  aria-haspopup="menu"
                  aria-expanded={linkMenuOpen}
                  title="Copy an exact or latest workspace view"
                >
                  <Icon name="link" />
                </button>
              )}
              <button
                className="icon-button"
                disabled={!active}
                onClick={exportFile}
                aria-label="Export"
                title="Export .CLF"
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
                key={`${active.record.id}:${editorEpochs[active.record.id] ?? 0}`}
                document={active.record.document}
                active={workspaceActive}
                grid={preferences.grid}
                aiOpen={aiOpen}
                rightInset={rightPanel === 'none' ? 0 : rightInset}
                onToggleAI={() => setAiOpen(!aiOpen)}
                toolsOpen={rightPanel === 'tools'}
                onToolsOpenChange={(open) =>
                  setRightPanel(open ? 'tools' : 'none')
                }
                dockHost={rightHost}
                dockSide={toolsSide}
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
                initialSession={viewMeta.editorSession ?? undefined}
                onSessionChange={rememberEditorSession}
                initialViewState={
                  replacementViews.current.get(active.record.id) ??
                  (active.record.id === initialView.current?.activeId &&
                  initialEditorView
                    ? initialEditorView
                    : camerasToRestore.current[active.record.id]
                      ? {
                          viewport: camerasToRestore.current[active.record.id],
                          selectedIds: [],
                          tool: viewMeta.editorSession?.tool ?? 'select',
                          activeLayerId:
                            viewMeta.editorSession?.activeLayerId ??
                            active.record.document.layers[0].id,
                        }
                      : undefined)
                }
                onViewStateChange={rememberEditorView}
                textOptions={{
                  autoGrowShapes: preferences.autoGrowShapes,
                  fitTextToShape: preferences.fitTextToShape,
                  minTextSize: preferences.minTextSize,
                }}
                statusInFooter
                onStatusChange={rememberStatus}
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
                  data-dock-trigger={toolsSide}
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
          <div
            className="file-statusbar"
            role="group"
            aria-label="Canvas status"
            tabIndex={0}
            title={editorStatus?.instructions}
          >
            <span
              className={`save-dot ${active?.dirty || localDirty ? 'unsaved' : ''}`}
            />
            <span
              title={
                localBinding
                  ? `${localBinding.handle.name} · ${permissionIds.has(activeId!) ? 'Click Save to resume local writes' : localBinding.autoSave ? 'Auto-save enabled' : 'Auto-save paused'}`
                  : sharedStoreActive
                    ? 'Saved canvas contents live in the local Canvas Live library. Save as creates a separate .CLF file.'
                    : active?.dirty
                      ? 'Save to a local .CLF file to keep these changes'
                      : active?.persistence === 'browser'
                        ? 'Browser copy only; Save or Export to keep a physical .CLF file'
                        : active
                          ? 'This tab only; Save or Export to keep a physical .CLF file'
                          : undefined
              }
            >
              {active
                ? savingIds.has(active.record.id)
                  ? 'Saving to file…'
                  : active.dirty || localDirty
                    ? 'Unsaved changes'
                    : failedSaveIds.has(active.record.id)
                      ? 'Save failed'
                      : permissionIds.has(active.record.id)
                        ? 'File access needed'
                        : localBinding
                          ? 'Saved to file'
                          : downloadedIds.has(active.record.id)
                            ? 'Download copy requested'
                            : active.persistence === 'browser'
                              ? sharedStoreActive
                                ? 'Local library'
                                : 'Browser copy'
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
                ? `${editorStatus?.visibleCount ?? active.record.document.elements.length} objects`
                : `${entries.length} canvas files`}
            </span>
            {active && editorStatus?.selection && (
              <span className="canvas-selection-status">
                {editorStatus.selection}
              </span>
            )}
            {active && (
              <output aria-label="Canvas zoom" aria-live="polite">
                {Math.round(
                  (editorStatus?.zoom ?? active.record.document.viewport.zoom) *
                    100,
                )}
                %
              </output>
            )}
            {active && (
              <button
                className="status-help"
                aria-label="Canvas controls help"
                title={
                  editorStatus?.instructions ??
                  'Drag to move · Corner to resize · Double-click to edit · Scroll to zoom'
                }
              >
                ?
              </button>
            )}
            <NotificationBell
              scopeId={notificationScopeId}
              channel={notifications}
            />
          </div>
        </div>
        <DockPanel
          id="workspace-right-panel"
          label="Canvas panels"
          side={toolsSide}
          autoHide={layout.autoHidePanels}
          autoHideDelay={layout.autoHideDelay}
          onMove={(side) =>
            changeLayout({ ...layout, panelsSwapped: side === 'left' })
          }
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
      {viewLink && (
        <ViewLinkDialog url={viewLink} onClose={() => setViewLink(null)} />
      )}
      {linkMenuOpen && (
        <div
          ref={linkMenu}
          className="tab-context-menu view-link-menu"
          role="menu"
          aria-label="Copy workspace link"
          style={linkMenuPosition}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
              return
            const items = Array.from(
              linkMenu.current?.querySelectorAll<HTMLButtonElement>('button') ??
                [],
            )
            if (!items.length) return
            event.preventDefault()
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            )
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (index +
                      (event.key === 'ArrowDown' ? 1 : -1) +
                      items.length) %
                    items.length
            items[next]?.focus()
          }}
        >
          {linkOptions.exactEnabled && (
            <button
              role="menuitem"
              onClick={() => {
                void copyViewLink('exact')
              }}
            >
              Copy exact view
            </button>
          )}
          {linkOptions.latestEnabled && (
            <button
              role="menuitem"
              onClick={() => {
                void copyViewLink('latest')
              }}
            >
              Copy latest view
            </button>
          )}
        </div>
      )}
    </section>
  )
}
