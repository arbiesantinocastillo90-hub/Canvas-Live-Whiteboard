import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import AppearanceOptions from './AppearanceOptions'
import { resolveAppearanceVariables } from './appearance'
import FileWorkspace, {
  type WorkspaceOpenRequest,
  type WorkspaceViewCapture,
} from './FileWorkspace'
import { decodeViewLink, encodeViewLink } from './viewLinks'
import CanvasLiveLinksOptions from './CanvasLiveLinksOptions'
import {
  encodeExactLiveLink,
  encodeLatestLiveLink,
  parseLiveLink,
  loadLinkOptions,
  persistLinkOptions,
  type LinkOptions,
  type LiveViewState,
} from './liveViewLinks'
import {
  readLatestLiveView,
  resolveLiveView,
  saveLatestLiveView,
  LATEST_WORKSPACE_STORAGE_KEY,
  type LiveViewLaunch,
} from './liveViewState'
import {
  bootstrapLocalLibrary,
  syncWorkspaceChanges,
  syncSessionChanges,
  METADATA_LIBRARY_KEY,
  SESSIONS_LIBRARY_KEY,
  parseLibrarySessions,
  parseLibraryWorkspace,
} from './librarySync'
import { localLibrary, libraryKey, sharedCanvasFileStore } from './localLibrary'
import { canvasFileStore } from './canvasFiles'
import { NotificationBell, NotificationsProvider } from './SessionNotifications'
import { useSessionNotifications } from './notificationSession'
import type { CanvasViewport } from './lcanvas'
import ProjectTransfer from './ProjectTransfer'
import { collectProjectTree, type ProjectArchive } from './projectArchive'
import { projectDrafts } from './canvasDrafts'
import { restoreViewLink, type RestoredViewLink } from './viewLinkRestore'
import HomePage from './HomePage'
import { DEFAULT_LAYOUT, loadLayout, persistLayout } from './layout'
import HotkeyOptions, {
  WorkspaceCommandsProvider,
  WorkspaceLauncher,
  WorkspaceOverlays,
} from './WorkspaceCommands'
import { useRegisterCommands } from './workspaceCommandsContext'
import { useCanvasDraftProtection } from './canvasDrafts'
import Icon from './Icon'
import ProjectDialog from './ProjectDialog'
import ProjectExplorer from './ProjectExplorer'
import WorkspacesPanel from './WorkspacesPanel'
import {
  addSavedWorkspace,
  createSavedWorkspace,
  loadWorkspaceSessions,
  persistWorkspaceSessions,
  updateSavedWorkspace,
  type ProjectViewSession,
  type SavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'
import {
  createProject,
  loadWorkspace,
  openProject,
  persistWorkspace,
  moveProject,
  pinProject,
  hideRecentProject,
  projectDescendants,
  renameProject,
  type Project,
  type WorkspaceState,
} from './workspace'

type Section = 'home' | 'work' | 'projects' | 'options' | 'workspaces'
type ProjectPrompt =
  | { kind: 'create'; parentId?: string | null }
  | { kind: 'rename'; project: Project }

function snapshotIdentity() {
  return { id: crypto.randomUUID(), createdAt: Date.now() }
}

type AppLaunch = {
  restored?: RestoredViewLink
  linked?: LiveViewLaunch
  error?: string
}
function needsLibraryStartup(hash: string) {
  if (hash) return true
  if (
    document.querySelector(
      'meta[name="canvas-live-storage"][content="local-v1"]',
    )
  )
    return true
  try {
    return (
      loadLinkOptions().resumeLatest &&
      !!localStorage.getItem(LATEST_WORKSPACE_STORAGE_KEY)
    )
  } catch {
    return false
  }
}
async function openAppView(hash: string): Promise<AppLaunch> {
  // Old portable snapshots retain their isolated file copies and permissions.
  if (hash && !hash.startsWith('#view=2')) {
    const snapshot = await decodeViewLink(hash)
    return snapshot ? { restored: await restoreViewLink(snapshot) } : {}
  }
  const library = await bootstrapLocalLibrary()
  if (library.error) throw new Error(library.error)
  const options = loadLinkOptions()
  const route = hash ? parseLiveLink(hash) : null
  const view =
    route?.kind === 'exact'
      ? route.view
      : route?.kind === 'latest'
        ? await readLatestLiveView(route.workspaceId)
        : options.resumeLatest
          ? await readLatestLiveView()
          : null
  if (route && !view)
    throw new Error(
      'This workspace has no saved latest view yet. Open it in Canvas Live first.',
    )
  return view ? { linked: await resolveLiveView(view, options) } : {}
}
export default function App() {
  const [viewHash, setViewHash] = useState(() =>
    window.location.hash.startsWith('#view=') ? window.location.hash : '',
  )
  const [launch, setLaunch] = useState<AppLaunch | null>(() =>
    needsLibraryStartup(
      window.location.hash.startsWith('#view=') ? window.location.hash : '',
    )
      ? null
      : {},
  )
  const pendingLaunch = useRef<{
    hash: string
    promise: Promise<AppLaunch>
  } | null>(null)
  useEffect(() => {
    const changed = () => {
      const hash = window.location.hash.startsWith('#view=')
        ? window.location.hash
        : ''
      if (hash !== viewHash) {
        setLaunch(null)
        setViewHash(hash)
      }
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [viewHash])
  useEffect(() => {
    if (!needsLibraryStartup(viewHash)) {
      setLaunch({})
      return
    }
    let active = true
    if (pendingLaunch.current?.hash !== viewHash)
      pendingLaunch.current = { hash: viewHash, promise: openAppView(viewHash) }
    void pendingLaunch.current.promise
      .then((result) => {
        if (active) setLaunch(result)
      })
      .catch((failure: unknown) => {
        if (active)
          setLaunch({
            error:
              failure instanceof Error
                ? failure.message
                : 'This view could not be opened. Existing files were retained.',
          })
      })
    return () => {
      active = false
    }
    // A completed launch is not restarted by its own state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewHash])
  if (!launch)
    return (
      <main className="snapshot-opening" role="status">
        Opening workspace...
      </main>
    )
  return (
    <WorkspaceCommandsProvider>
      <NotificationsProvider key={viewHash}>
        <WorkspaceApp
          key={viewHash}
          restored={launch.restored}
          linked={launch.linked}
          linkError={launch.error}
        />
      </NotificationsProvider>
    </WorkspaceCommandsProvider>
  )
}

function WorkspaceApp({
  restored,
  linked,
  linkError,
}: {
  restored?: RestoredViewLink
  linked?: LiveViewLaunch
  linkError?: string
}) {
  const fileStore =
    restored?.store ??
    linked?.fileStore ??
    (localLibrary.available ? sharedCanvasFileStore : canvasFileStore)
  useCanvasDraftProtection(fileStore)
  // A portable link owns an isolated editing session. Its settings and file
  // copies must not replace the main app's library or grant native file access.
  const saveMetadata = (value: WorkspaceState, before = workspace) => {
    if (restored) return true
    const result = persistWorkspace(value)
    void syncWorkspaceChanges(before, value).catch(reportSaveFailure)
    return result
  }
  const saveSessions = (value: WorkspaceSessions, before = sessions) => {
    if (restored) return true
    const result = persistWorkspaceSessions(value)
    void syncSessionChanges(before, value).catch(reportSaveFailure)
    return result
  }
  const saveLayout = (value: typeof DEFAULT_LAYOUT) =>
    restored ? true : persistLayout(value)
  const [startup] = useState(() => {
    if (restored)
      return {
        workspace: restored.workspace,
        layout: restored.snapshot.workspace.layout,
        sessions: restored.sessions,
      }
    if (linked)
      return {
        workspace: linked.workspace,
        layout: linked.layout,
        sessions: linked.sessions,
      }
    const metadata = loadWorkspace()
    const saved = loadWorkspaceSessions(
      metadata.preferences,
      loadLayout(),
      metadata.lastProjectId,
    )
    const active = saved.items.find((item) => item.id === saved.activeId)!
    const projectId = metadata.projects.some(
      (project) => project.id === active.projectId,
    )
      ? active.projectId
      : metadata.lastProjectId
    return {
      workspace: {
        ...metadata,
        preferences: active.preferences,
        lastProjectId: projectId,
      },
      layout: active.layout,
      sessions: saved,
    }
  })
  const [workspace, setWorkspace] = useState(startup.workspace)
  const [section, setSection] = useState<Section>(
    linked?.section ?? (restored ? 'work' : 'home'),
  )
  const [workspaceStarted, setWorkspaceStarted] = useState(
    !!(restored || linked?.view.projectId),
  )
  const [homeProjectId, setHomeProjectId] = useState(workspace.lastProjectId)
  const [openRequest, setOpenRequest] = useState<WorkspaceOpenRequest>()
  const requestSequence = useRef(0)
  const prepareProjectExport = useRef<
    (() => import('./canvasFiles').CanvasFileRecord[]) | null
  >(null)
  const registerProjectExport = useCallback(
    (prepare: (() => import('./canvasFiles').CanvasFileRecord[]) | null) => {
      prepareProjectExport.current = prepare
    },
    [],
  )
  const [prompt, setPrompt] = useState<ProjectPrompt | null>(null)
  const [search, setSearch] = useState('')
  const [storageError, setStorageError] = useState(
    restored?.storageError ?? false,
  )
  const [canvasFocused, setCanvasFocused] = useState(
    linked?.view.activeView?.focusMode ??
      restored?.snapshot.activeView.focusMode ??
      false,
  )
  const [layout, setLayout] = useState(startup.layout)
  const [sessions, setSessions] = useState(startup.sessions)
  const [sessionStorageError, setSessionStorageError] = useState(false)
  const [initialLinkView, setInitialLinkView] = useState(
    linked?.initialView ?? restored?.snapshot.activeView,
  )
  const acknowledgeInitialView = useCallback(
    () => setInitialLinkView(undefined),
    [],
  )
  const savedWorkspace = sessions.items.find(
    (item) => item.id === sessions.activeId,
  )!
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  const notificationScopeId = `${savedWorkspace.id}:${window.location.hash || 'main'}`
  const { notify } = useSessionNotifications(notificationScopeId)
  const [linkOptions, setLinkOptions] = useState(loadLinkOptions)
  const cameras = useRef<Record<string, CanvasViewport>>(
    linked?.initialCameras ?? {},
  )
  const cameraHistory = useRef<Record<string, Record<string, CanvasViewport>>>({
    [savedWorkspace.id]: linked?.initialCameras ?? {},
  })
  const [rememberedCameras, setRememberedCameras] = useState<
    Record<string, Record<string, CanvasViewport>>
  >(() => ({ [savedWorkspace.id]: linked?.initialCameras ?? {} }))
  const lastCapture = useRef<WorkspaceViewCapture | null>(null)
  const [captureVersion, setCaptureVersion] = useState(0)
  const latestSignature = useRef('')
  const latestToSave = useRef<LiveViewState | null>(null)
  const saveFailure = useRef('')
  const reportSaveFailure = useCallback(
    (failure: unknown) => {
      const message =
        failure instanceof Error
          ? failure.message
          : 'The local library could not save these changes. Keep this tab open and export a copy.'
      if (saveFailure.current !== message) {
        saveFailure.current = message
        notify(message, 'error')
      }
    },
    [notify],
  )
  const projects = workspace.projects
  const activeProject = workspace.projects.find(
    (project) => project.id === workspace.lastProjectId,
  )
  const theme =
    workspace.preferences.mode === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : workspace.preferences.mode

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const update = () => setSystemDark(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  function enterProject(
    id: string,
    request?: Omit<WorkspaceOpenRequest, 'sequence'>,
  ) {
    if (id !== workspace.lastProjectId) lastCapture.current = null
    updateWorkspace(openProject(workspace, id))
    setWorkspaceStarted(true)
    setHomeProjectId(id)
    setOpenRequest({ ...request, sequence: ++requestSequence.current })
    setSection('work')
    updateLayout({
      ...layout,
      leftPanel: 'files',
      filesOpen: layout.leftPinned,
    })
  }

  function updateWorkspace(next: WorkspaceState) {
    setStorageError(!saveMetadata(next))
    setWorkspace(next)
    updateSessions((current) =>
      updateSavedWorkspace(current, current.activeId, {
        preferences: next.preferences,
        projectId: next.lastProjectId,
      }),
    )
  }
  function updateSessions(
    change: (state: WorkspaceSessions) => WorkspaceSessions,
  ) {
    setSessions((current) => {
      const next = change(current)
      if (JSON.stringify(next) === JSON.stringify(current)) return current
      setSessionStorageError(!saveSessions(next, current))
      return next
    })
  }
  function selectSavedWorkspace(id: string, state = sessions) {
    const saved = state.items.find((item) => item.id === id)
    if (!saved) return
    lastCapture.current = null
    cameras.current = cameraHistory.current[id] ?? {}
    setInitialLinkView(undefined)
    const next = { ...state, activeId: id }
    setSessionStorageError(!saveSessions(next))
    setSessions(next)
    const projectId = workspace.projects.some(
      (project) => project.id === saved.projectId,
    )
      ? saved.projectId
      : null
    const updated = {
      ...workspace,
      preferences: saved.preferences,
      lastProjectId: projectId,
    }
    setStorageError(
      (!restored && !persistWorkspace(updated)) || !saveLayout(saved.layout),
    )
    setWorkspace(updated)
    setLayout(saved.layout)
    setHomeProjectId(projectId)
    setOpenRequest(undefined)
    setWorkspaceStarted(!!projectId)
    setSection(projectId ? 'work' : 'home')
  }
  function createNamedWorkspace(name: string) {
    const created = {
      ...createSavedWorkspace(
        workspace.preferences,
        layout,
        workspace.lastProjectId,
        name,
      ),
      views: structuredClone(savedWorkspace.views),
    }
    selectSavedWorkspace(created.id, addSavedWorkspace(sessions, created))
  }
  function rememberView(projectId: string, view: ProjectViewSession) {
    const workspaceId = savedWorkspace.id
    updateSessions((current) => {
      const saved = current.items.find((item) => item.id === workspaceId)
      return saved
        ? updateSavedWorkspace(current, workspaceId, {
            views: { ...saved.views, [projectId]: view },
          })
        : current
    })
  }
  const captureLiveView = useCallback(
    (capture: WorkspaceViewCapture) => {
      const previous = lastCapture.current
      for (const file of capture.files)
        cameras.current[file.id] = file.document.viewport
      if (capture.activeView && capture.view.activeId)
        cameras.current[capture.view.activeId] = capture.activeView.viewport
      const snapshot = { ...cameras.current }
      cameraHistory.current[savedWorkspace.id] = snapshot
      setRememberedCameras((current) =>
        JSON.stringify(current[savedWorkspace.id]) === JSON.stringify(snapshot)
          ? current
          : { ...current, [savedWorkspace.id]: snapshot },
      )
      lastCapture.current = capture
      if (
        JSON.stringify(
          previous && {
            view: previous.view,
            activeView: previous.activeView,
            layout: previous.layout,
          },
        ) !==
        JSON.stringify({
          view: capture.view,
          activeView: capture.activeView,
          layout: capture.layout,
        })
      )
        setCaptureVersion((version) => version + 1)
    },
    [savedWorkspace.id],
  )
  function buildLiveView(capture = lastCapture.current): LiveViewState {
    const projectId = workspace.lastProjectId
    const view =
      capture && capture.files.every((file) => file.projectId === projectId)
        ? capture
        : null
    return {
      format: 'CanvasLiveLink',
      version: 2,
      workspaceId: savedWorkspace.id,
      workspace: structuredClone({
        ...savedWorkspace,
        preferences: workspace.preferences,
        layout,
        projectId,
        views:
          view && projectId
            ? { ...savedWorkspace.views, [projectId]: view.view }
            : savedWorkspace.views,
      }),
      projectId,
      projectPresentation: Object.fromEntries(
        projects.map((project) => [
          project.id,
          {
            pinned: !!project.pinned,
            recentHidden: !!project.recentHidden,
            lastOpenedAt: project.lastOpenedAt,
          },
        ]),
      ),
      cameras: structuredClone(cameras.current),
      activeView: view?.activeView ?? null,
      section: section === 'projects' ? 'home' : section,
      updatedAt: Date.now(),
    }
  }
  async function copyViewLink(
    capture: WorkspaceViewCapture,
    mode: 'exact' | 'latest' = 'exact',
  ) {
    if (!activeProject || !capture.activeView)
      throw new Error('Open a canvas before copying a view link.')
    if (restored) {
      if (mode === 'latest')
        throw new Error(
          'This older snapshot is isolated. Open your main workspace to copy a latest link.',
        )
      return encodeViewLink(
        {
          format: 'CanvasLiveView',
          version: 1,
          ...snapshotIdentity(),
          workspace: structuredClone({
            ...savedWorkspace,
            preferences: workspace.preferences,
            layout: capture.layout,
            projectId: activeProject.id,
            views: { [activeProject.id]: capture.view },
          }),
          project: structuredClone(activeProject),
          files: capture.files,
          activeView: capture.activeView,
        },
        window.location.href,
      )
    }
    captureLiveView(capture)
    const view = buildLiveView(capture)
    view.workspace.layout = capture.layout
    if (mode === 'latest') {
      await saveLatestLiveView(view)
      return encodeLatestLiveLink(savedWorkspace.id, window.location.href)
    }
    return encodeExactLiveLink(view, window.location.href)
  }
  useEffect(() => {
    if (restored || (!linkOptions.latestEnabled && !linkOptions.resumeLatest))
      return
    const view = buildLiveView()
    const signature = JSON.stringify({ ...view, updatedAt: 0 })
    if (signature === latestSignature.current) return
    latestSignature.current = signature
    latestToSave.current = view
    // Workspace definitions are saved separately from this per-view state.
    persistWorkspaceSessions(sessions)
    const timer = window.setTimeout(() => {
      void saveLatestLiveView(view).catch(reportSaveFailure)
    }, 300)
    return () => window.clearTimeout(timer)
    // Capture changes are signaled only for UI state, never document content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workspace,
    sessions,
    savedWorkspace.id,
    section,
    layout,
    captureVersion,
    linkOptions.latestEnabled,
    linkOptions.resumeLatest,
    restored,
    reportSaveFailure,
  ])
  useEffect(() => {
    if (restored || (!linkOptions.latestEnabled && !linkOptions.resumeLatest))
      return
    const flush = () => {
      if (latestToSave.current)
        void saveLatestLiveView(latestToSave.current).catch(reportSaveFailure)
    }
    window.addEventListener('pagehide', flush)
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [
    restored,
    linkOptions.latestEnabled,
    linkOptions.resumeLatest,
    reportSaveFailure,
  ])
  useEffect(() => {
    if (linkError) notify(linkError, 'error')
  }, [linkError, notify])
  useEffect(() => {
    if (storageError || sessionStorageError)
      notify(
        'Your browser could not remember these changes. Keep this tab open and export a copy.',
        'error',
      )
  }, [storageError, sessionStorageError, notify])
  useEffect(() => {
    if (restored || !localLibrary.available) return
    let alive = true
    let pending = false
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      try {
        await localLibrary.refresh()
        if (!alive) return
        const metadata = localLibrary.cached(METADATA_LIBRARY_KEY).value
        const saved = parseLibrarySessions(
          localLibrary.cached(SESSIONS_LIBRARY_KEY).value,
        )
        if (!saved)
          throw new Error(
            'The local workspace list is invalid. Your current workspace was retained.',
          )
        if (metadata) {
          const current = parseLibraryWorkspace(metadata)
          if (!current)
            throw new Error(
              'The local project library is invalid. Your current workspace was retained.',
            )
          setWorkspace((previous) => {
            const projects = current.projects.map((project) => {
              const local = previous.projects.find(
                (item) => item.id === project.id,
              )
              return local
                ? {
                    ...project,
                    pinned: local.pinned,
                    recentHidden: local.recentHidden,
                    lastOpenedAt: local.lastOpenedAt,
                  }
                : project
            })
            if (JSON.stringify(projects) === JSON.stringify(previous.projects))
              return previous
            const next = { ...previous, projects }
            persistWorkspace(next)
            return next
          })
        }
        if (saved)
          setSessions((previous) => {
            const items = saved.items.map((item) => {
              const local = previous.items.find((old) => old.id === item.id)
              return local ? { ...local, name: item.name } : item
            })
            if (JSON.stringify(items) === JSON.stringify(previous.items))
              return previous
            const next = { ...previous, items }
            persistWorkspaceSessions(next)
            return next
          })
      } catch (failure) {
        if (alive) reportSaveFailure(failure)
      } finally {
        pending = false
      }
    }
    const timer = window.setInterval(() => {
      void refresh()
    }, 1800)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [restored, reportSaveFailure])
  function changeLinkOptions(next: LinkOptions) {
    setLinkOptions(next)
    if (!persistLinkOptions(next))
      notify('Link settings could not be remembered in this browser.', 'error')
    if (localLibrary.available)
      void localLibrary
        .transform(libraryKey('settings', 'links'), () => next)
        .catch(reportSaveFailure)
  }
  async function exportProject(): Promise<ProjectArchive> {
    const rootId =
      section === 'home' || section === 'projects'
        ? homeProjectId
        : activeProject?.id
    if (!rootId) throw new Error('Select a project to export.')
    // Flush a live editor before reading its draft cache or saved records.
    const activeFiles = prepareProjectExport.current?.() ?? []
    const tree = collectProjectTree(projects, rootId)
    const files = new Map<string, import('./canvasFiles').CanvasFileRecord>()
    for (const project of tree) {
      const saved = await fileStore.list(project.id)
      for (const record of saved.value) files.set(record.id, record)
      for (const draft of projectDrafts(fileStore).get(project.id) ?? [])
        files.set(draft.record.id, draft.record)
    }
    const ids = new Set(tree.map((project) => project.id))
    for (const file of activeFiles)
      if (ids.has(file.projectId)) files.set(file.id, file)
    return { rootProjectId: rootId, projects: tree, files: [...files.values()] }
  }
  async function importProject(archive: ProjectArchive) {
    if (projects.length + archive.projects.length > 100)
      throw new Error(
        'This library can hold up to 100 projects. Import into a separate library or export existing projects first.',
      )
    if (
      archive.projects.some((project) =>
        projects.some((existing) => existing.id === project.id),
      )
    )
      throw new Error(
        'A project identifier is already in use. Import the file again to generate fresh identifiers.',
      )
    for (const file of archive.files)
      if ((await fileStore.get(file.projectId, file.id)).value)
        throw new Error(
          'A canvas identifier is already in use. No existing file was replaced.',
        )
    // Publish project metadata only after every new file has been saved.
    for (const file of archive.files) await fileStore.save(file)
    updateWorkspace({
      ...workspace,
      projects: [...projects, ...archive.projects],
      lastProjectId: archive.rootProjectId,
    })
    setHomeProjectId(archive.rootProjectId)
    setWorkspaceStarted(false)
    setSection('home')
  }
  const projectTransfer = (
    <ProjectTransfer
      onExport={exportProject}
      onImport={importProject}
      scopeId={notificationScopeId}
      exportDisabled={
        !(section === 'home' || section === 'projects'
          ? homeProjectId
          : activeProject?.id)
      }
    />
  )
  const workspacesPanel = (
    <WorkspacesPanel
      state={sessions}
      onSelect={selectSavedWorkspace}
      onCreate={createNamedWorkspace}
      onRename={(name) => {
        if (!name.trim() || name.trim().length > 80)
          throw new Error('Enter a workspace name between 1 and 80 characters.')
        updateSessions((current) =>
          updateSavedWorkspace(current, current.activeId, {
            name: name.trim(),
          }),
        )
      }}
      onImport={(imported: SavedWorkspace) =>
        selectSavedWorkspace(imported.id, addSavedWorkspace(sessions, imported))
      }
    />
  )
  function navigate(next: Section) {
    if (next === 'work' && (homeProjectId ?? workspace.lastProjectId))
      enterProject((homeProjectId ?? workspace.lastProjectId)!)
    else setSection(next === 'work' ? 'home' : next)
    setSearch('')
  }
  function submitProject(name: string, parentId?: string | null) {
    try {
      const updated =
        prompt?.kind === 'rename'
          ? moveProject(
              renameProject(workspace, prompt.project.id, name),
              prompt.project.id,
              parentId ?? null,
            )
          : createProject(workspace, name, undefined, undefined, parentId)
      updateWorkspace(updated)
      if (prompt?.kind !== 'rename') {
        setHomeProjectId(updated.lastProjectId)
        setOpenRequest(undefined)
        setWorkspaceStarted(false)
        setSection('home')
      }
      setPrompt(null)
      return null
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'This project could not be created. Please try again.'
    }
  }
  function updateLayout(next: typeof layout) {
    setStorageError(!saveLayout(next))
    setLayout(next)
    updateSessions((current) =>
      updateSavedWorkspace(current, current.activeId, { layout: next }),
    )
  }
  function resetLayout() {
    updateLayout({ ...DEFAULT_LAYOUT })
  }
  function openLeft(leftPanel: 'files' | 'projects' | 'workspaces') {
    if (!activeProject) {
      navigate(leftPanel === 'workspaces' ? 'workspaces' : 'projects')
      return
    }
    if (!workspaceStarted) {
      enterProject(activeProject.id)
    } else setSection('work')
    updateLayout({ ...layout, filesOpen: true, leftPanel })
  }
  useRegisterCommands([
    {
      id: 'app.home',
      label: 'Return to Home',
      category: 'Workspace',
      execute: () => navigate('home'),
      enabled: !canvasFocused,
      allowWhileTyping: true,
    },
    {
      id: 'app.options',
      label: 'Open Options',
      category: 'Workspace',
      execute: () => navigate('options'),
      enabled: !canvasFocused,
      allowWhileTyping: true,
    },
    {
      id: 'app.projects',
      label: 'Open Projects',
      category: 'Workspace',
      execute: () =>
        section === 'work' ? openLeft('projects') : navigate('home'),
      enabled: !canvasFocused,
      allowWhileTyping: true,
    },
    {
      id: 'app.work',
      label: 'Return to Work',
      category: 'Workspace',
      execute: () => navigate('work'),
      enabled: !canvasFocused,
      allowWhileTyping: true,
    },
    {
      id: 'app.toggleSidebar',
      label: 'Toggle left panel',
      category: 'Panels',
      execute: () => updateLayout({ ...layout, filesOpen: !layout.filesOpen }),
      enabled: !canvasFocused && section === 'work',
      allowWhileTyping: true,
    },
    {
      id: 'app.resetLayout',
      label: 'Reset panel layout',
      category: 'Panels',
      execute: resetLayout,
      enabled: !canvasFocused,
    },
  ])
  const colors = {
    ...resolveAppearanceVariables(workspace.preferences, theme),
    '--sidebar-width': `${layout.sidebarWidth}px`,
    '--file-panel-width': `${layout.filesWidth}px`,
    '--right-panel-width': `${layout.rightWidth}px`,
    '--ribbon-width': `${layout.ribbonWidth}px`,
    '--controls-width': `${layout.controlsWidth}px`,
    '--tab-bar-height': `${layout.tabBarHeight}px`,
    '--status-bar-height': `${layout.statusBarHeight}px`,
  } as CSSProperties

  return (
    <div
      className="app-shell"
      data-theme={theme}
      data-density={workspace.preferences.density}
      data-motion={workspace.preferences.reduceMotion ? 'reduced' : 'normal'}
      data-motion-style={workspace.preferences.motionStyle}
      data-focused={canvasFocused}
      data-sidebar-open={layout.filesOpen}
      data-section={section}
      data-outer={section !== 'work'}
      data-separate-rails={workspace.preferences.railButtonBackground}
      data-autohide-tabs={layout.autoHideTabs}
      data-autohide-status={layout.autoHideStatus}
      style={colors}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {section === 'work' && (
        <aside
          className="sidebar workspace-ribbon"
          aria-label="Workspace sidebar"
          inert={canvasFocused}
          aria-hidden={canvasFocused}
        >
          <a
            className="brand"
            href="/"
            aria-label="Canvas Live home"
            title="Canvas Live"
            onClick={(event) => {
              event.preventDefault()
              navigate('home')
            }}
          >
            <span className="brand-mark">
              <img src="/canvas-live-logo.png" alt="" />
            </span>
          </a>
          <nav className="section-nav" aria-label="Main navigation">
            <button
              className="nav-item"
              aria-label="Work"
              title="Work"
              aria-current={section === 'work' ? 'page' : undefined}
              onClick={() => navigate('work')}
            >
              <Icon name="work" />
            </button>
            {(['files', 'projects', 'workspaces'] as const).map((panel) => (
              <button
                key={panel}
                className="nav-item"
                data-dock-trigger={layout.panelsSwapped ? 'right' : 'left'}
                aria-label={
                  panel === 'files'
                    ? 'Files'
                    : panel === 'projects'
                      ? 'Projects'
                      : 'Workspaces'
                }
                title={
                  panel === 'files'
                    ? 'Files · double-click to pin'
                    : panel === 'projects'
                      ? 'Projects · double-click to pin'
                      : 'Workspaces · double-click to pin'
                }
                aria-expanded={
                  section === 'work' &&
                  layout.filesOpen &&
                  layout.leftPanel === panel
                }
                aria-controls="project-files"
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse' && activeProject)
                    openLeft(panel)
                }}
                onClick={() => openLeft(panel)}
                onDoubleClick={() => {
                  if (activeProject)
                    updateLayout({
                      ...layout,
                      filesOpen: true,
                      leftPanel: panel,
                      leftPinned: !layout.leftPinned,
                    })
                }}
              >
                <Icon
                  name={
                    panel === 'files'
                      ? 'files'
                      : panel === 'projects'
                        ? 'folder'
                        : 'workspaces'
                  }
                />
              </button>
            ))}
            <button
              className="nav-item"
              aria-label="Create a new project"
              title="New project"
              onClick={() => setPrompt({ kind: 'create' })}
            >
              <Icon name="plus" />
            </button>
          </nav>
          <WorkspaceLauncher />
          <button
            className="icon-button ribbon-options"
            aria-label="Options"
            title="Options"
            onClick={() => navigate('options')}
          >
            <Icon name="options" />
          </button>
        </aside>
      )}
      <div className="main-shell">
        {section !== 'work' && (
          <header className="outer-header">
            <a
              className="brand"
              href="/"
              aria-label="Canvas Live home"
              title="Home"
              onClick={(event) => {
                event.preventDefault()
                navigate('home')
              }}
            >
              <span className="brand-mark">
                <img src="/canvas-live-logo.png" alt="" />
              </span>
              <span>
                Canvas <strong>Live</strong>
              </span>
            </a>
            <nav aria-label="Main navigation">
              <button
                className="nav-item"
                aria-label="Home"
                aria-current={
                  section === 'home' || section === 'projects'
                    ? 'page'
                    : undefined
                }
                onClick={() => navigate('home')}
              >
                Home
              </button>
              {activeProject && (
                <button
                  className="nav-item"
                  aria-label="Work"
                  title="Resume workspace"
                  onClick={() => navigate('work')}
                >
                  Work
                </button>
              )}
              <button
                className="nav-item"
                aria-label="Workspaces"
                title="Workspaces"
                aria-current={section === 'workspaces' ? 'page' : undefined}
                onClick={() => navigate('workspaces')}
              >
                <Icon name="workspaces" />
              </button>
              <button
                className="nav-item"
                aria-label="Options"
                title="Options"
                aria-current={section === 'options' ? 'page' : undefined}
                onClick={() => navigate('options')}
              >
                Options
              </button>
            </nav>
            <WorkspaceLauncher />
          </header>
        )}
        <main id="main-content" tabIndex={-1}>
          {section === 'options' && (
            <>
              <AppearanceOptions
                preferences={workspace.preferences}
                mode={theme}
                layout={layout}
                onLayoutChange={updateLayout}
                onChange={(preferences) =>
                  updateWorkspace({ ...workspace, preferences })
                }
              />
              <section
                className="layout-options"
                aria-labelledby="layout-options-title"
              >
                <h2 id="layout-options-title">Workspace layout</h2>

                <button
                  className="button secondary layout-reset-button"
                  onClick={resetLayout}
                >
                  Reset workspace layout
                </button>
              </section>
              <CanvasLiveLinksOptions
                value={linkOptions}
                onChange={changeLinkOptions}
                localStorageAvailable={!storageError}
              />
              <HotkeyOptions />
            </>
          )}
          {section === 'workspaces' && (
            <div className="outer-workspaces">{workspacesPanel}</div>
          )}
          {(section === 'home' || section === 'projects') && (
            <HomePage
              store={fileStore}
              workspaceName={savedWorkspace.name}
              projectActions={projectTransfer}
              notificationScopeId={notificationScopeId}
              allProjectsCollapsed={layout.allProjectsCollapsed}
              onAllProjectsCollapsedChange={(collapsed) =>
                updateLayout({ ...layout, allProjectsCollapsed: collapsed })
              }
              projects={projects}
              selectedProjectId={homeProjectId}
              onSelectProject={setHomeProjectId}
              onNewProject={(parentId) =>
                setPrompt({ kind: 'create', parentId })
              }
              onRenameProject={(project) =>
                setPrompt({ kind: 'rename', project })
              }
              onPinProject={(id, pinned) =>
                updateWorkspace(pinProject(workspace, id, pinned))
              }
              onHideRecentProject={(id) =>
                updateWorkspace(hideRecentProject(workspace, id))
              }
              projectRecentsCollapsed={workspace.projectRecentsCollapsed}
              onProjectRecentsCollapsedChange={(collapsed) =>
                updateWorkspace({
                  ...workspace,
                  projectRecentsCollapsed: collapsed,
                })
              }
              onOpenFile={(id, fileId) => enterProject(id, { fileId })}
              onNewCanvas={(id) => enterProject(id, { action: 'create' })}
              onImport={(id, imports) => enterProject(id, { imports })}
              onLocalImport={(id, localImports) =>
                enterProject(id, { localImports })
              }
            />
          )}
          {workspaceStarted &&
            (activeProject ? (
              <div
                className="workspace-holder"
                hidden={section !== 'work'}
                inert={section !== 'work'}
                aria-hidden={section !== 'work'}
              >
                <FileWorkspace
                  store={fileStore}
                  key={`${savedWorkspace.id}:${activeProject.id}`}
                  project={activeProject}
                  preferences={workspace.preferences}
                  layout={layout}
                  onLayoutChange={updateLayout}
                  showFileToggle={false}
                  workspaceActive={section === 'work'}
                  openRequest={openRequest}
                  viewSession={savedWorkspace.views[activeProject.id]}
                  notificationScopeId={notificationScopeId}
                  linkOptions={
                    restored
                      ? { ...linkOptions, latestEnabled: false }
                      : linkOptions
                  }
                  onCopyViewLink={copyViewLink}
                  onLiveViewChange={captureLiveView}
                  onPrepareProjectExportReady={registerProjectExport}
                  initialCameras={rememberedCameras[savedWorkspace.id]}
                  initialViewState={
                    (savedWorkspace.id === restored?.snapshot.workspace.id &&
                      activeProject.id === restored.snapshot.project.id) ||
                    (savedWorkspace.id === linked?.view.workspaceId &&
                      activeProject.id === linked.view.projectId)
                      ? initialLinkView
                      : undefined
                  }
                  onInitialViewApplied={acknowledgeInitialView}
                  onViewSessionChange={(view) =>
                    rememberView(activeProject.id, view)
                  }
                  workspacesPanel={
                    section === 'workspaces' ? null : workspacesPanel
                  }
                  projectPanel={
                    <div className="project-explorer">
                      <div className="file-panel-actions">
                        {projectTransfer}
                        <button
                          className="icon-button"
                          aria-label="New project"
                          title="New project"
                          onClick={() => setPrompt({ kind: 'create' })}
                        >
                          <Icon name="plus" />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Manage projects"
                          title="Manage projects"
                          onClick={() => navigate('projects')}
                        >
                          <Icon name="folder" />
                        </button>
                      </div>
                      <label className="file-search">
                        <Icon name="search" />
                        <input
                          type="search"
                          aria-label="Search projects"
                          placeholder="Search"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </label>
                      <ProjectExplorer
                        projects={projects}
                        selectedId={activeProject.id}
                        onOpen={enterProject}
                        onNewChild={(parentId) =>
                          setPrompt({ kind: 'create', parentId })
                        }
                        onRename={(project) =>
                          setPrompt({ kind: 'rename', project })
                        }
                        onPin={(id, pinned) =>
                          updateWorkspace(pinProject(workspace, id, pinned))
                        }
                        onHideRecent={(id) =>
                          updateWorkspace(hideRecentProject(workspace, id))
                        }
                        recentsCollapsed={workspace.projectRecentsCollapsed}
                        onRecentsCollapsedChange={(collapsed) =>
                          updateWorkspace({
                            ...workspace,
                            projectRecentsCollapsed: collapsed,
                          })
                        }
                        allProjectsCollapsed={layout.allProjectsCollapsed}
                        onAllProjectsCollapsedChange={(collapsed) =>
                          updateLayout({
                            ...layout,
                            allProjectsCollapsed: collapsed,
                          })
                        }
                        search={search}
                        variant="work"
                      />
                    </div>
                  }
                  onFocusChange={setCanvasFocused}
                  onRenameProject={() =>
                    setPrompt({ kind: 'rename', project: activeProject })
                  }
                />
              </div>
            ) : (
              <section className="page work-page" aria-labelledby="work-title">
                <div className="empty-projects work-empty">
                  <span className="canvas-empty-icon">
                    <Icon name="work" />
                  </span>
                  <h2 id="work-title">No project open</h2>

                  <button
                    className="button primary"
                    onClick={() => setPrompt({ kind: 'create' })}
                  >
                    <Icon name="plus" />
                    Create project
                  </button>
                </div>
              </section>
            ))}
        </main>
      </div>
      {prompt && (
        <ProjectDialog
          kind={prompt.kind}
          initialName={prompt.kind === 'rename' ? prompt.project.name : ''}
          initialParentId={
            prompt.kind === 'rename'
              ? (prompt.project.parentId ?? null)
              : (prompt.parentId ?? null)
          }
          projectParents={
            prompt.kind === 'rename'
              ? projects.filter(
                  (project) =>
                    !projectDescendants(projects, prompt.project.id).has(
                      project.id,
                    ),
                )
              : projects
          }
          onClose={() => setPrompt(null)}
          onSubmit={submitProject}
        />
      )}
      {section !== 'work' && (
        <div className="outer-notifications">
          <NotificationBell scopeId={notificationScopeId} />
        </div>
      )}
      <WorkspaceOverlays />
    </div>
  )
}
