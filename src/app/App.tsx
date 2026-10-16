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

export default function App() {
  const [viewHash, setViewHash] = useState(() =>
    window.location.hash.startsWith('#view=') ? window.location.hash : '',
  )
  const hasViewLink = !!viewHash
  const [launch, setLaunch] = useState<{
    restored?: RestoredViewLink
    error?: string
  } | null>(() => (hasViewLink ? null : {}))
  const pendingLaunch = useRef<{
    hash: string
    promise: Promise<RestoredViewLink | null>
  } | null>(null)
  useEffect(() => {
    const changed = () => {
      const hash = window.location.hash
      if (hash.startsWith('#view=') && hash !== viewHash) {
        setLaunch(null)
        setViewHash(hash)
      }
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [viewHash])
  useEffect(() => {
    if (!hasViewLink) return
    let active = true
    if (pendingLaunch.current?.hash !== viewHash)
      pendingLaunch.current = {
        hash: viewHash,
        promise: decodeViewLink(viewHash).then((snapshot) =>
          snapshot ? restoreViewLink(snapshot) : null,
        ),
      }
    void pendingLaunch.current.promise
      .then((restored) => {
        if (active) setLaunch(restored ? { restored } : {})
      })
      .catch((failure: unknown) => {
        if (active)
          setLaunch({
            error:
              failure instanceof Error
                ? failure.message
                : 'This snapshot link could not be opened.',
          })
      })
    return () => {
      active = false
    }
  }, [hasViewLink, viewHash])
  if (!launch)
    return (
      <main className="snapshot-opening" role="status">
        Opening snapshot…
      </main>
    )
  return (
    <WorkspaceCommandsProvider>
      <WorkspaceApp
        key={viewHash}
        restored={launch.restored}
        linkError={launch.error}
      />
    </WorkspaceCommandsProvider>
  )
}

function WorkspaceApp({
  restored,
  linkError,
}: {
  restored?: RestoredViewLink
  linkError?: string
}) {
  useCanvasDraftProtection(restored?.store)
  // A portable link owns an isolated editing session. Its settings and file
  // copies must not replace the main app's library or grant native file access.
  const saveMetadata = (value: WorkspaceState) =>
    restored ? true : persistWorkspace(value)
  const saveSessions = (value: WorkspaceSessions) =>
    restored ? true : persistWorkspaceSessions(value)
  const saveLayout = (value: typeof DEFAULT_LAYOUT) =>
    restored ? true : persistLayout(value)
  const [startup] = useState(() => {
    if (restored)
      return {
        workspace: restored.workspace,
        layout: restored.snapshot.workspace.layout,
        sessions: restored.sessions,
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
  const [section, setSection] = useState<Section>(restored ? 'work' : 'home')
  const [workspaceStarted, setWorkspaceStarted] = useState(!!restored)
  const [homeProjectId, setHomeProjectId] = useState(workspace.lastProjectId)
  const [openRequest, setOpenRequest] = useState<WorkspaceOpenRequest>()
  const requestSequence = useRef(0)
  const [prompt, setPrompt] = useState<ProjectPrompt | null>(null)
  const [search, setSearch] = useState('')
  const [visibleLinkError, setVisibleLinkError] = useState(linkError)
  const [storageError, setStorageError] = useState(
    restored?.storageError ?? false,
  )
  const [canvasFocused, setCanvasFocused] = useState(
    restored?.snapshot.activeView.focusMode ?? false,
  )
  const [layout, setLayout] = useState(startup.layout)
  const [sessions, setSessions] = useState(startup.sessions)
  const [sessionStorageError, setSessionStorageError] = useState(false)
  const [initialLinkView, setInitialLinkView] = useState(
    restored?.snapshot.activeView,
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
    setVisibleLinkError(undefined)
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
      setSessionStorageError(!saveSessions(next))
      return next
    })
  }
  function selectSavedWorkspace(id: string, state = sessions) {
    const saved = state.items.find((item) => item.id === id)
    if (!saved) return
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
    setStorageError(!saveMetadata(updated) || !saveLayout(saved.layout))
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
  function copyViewLink(capture: WorkspaceViewCapture) {
    if (!activeProject)
      throw new Error('Open a canvas before copying a view link.')
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
    setVisibleLinkError(undefined)
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
          {visibleLinkError && (
            <div className="storage-alert" role="alert">
              {visibleLinkError} Your existing projects are available below.
            </div>
          )}
          {(storageError || sessionStorageError) && (
            <div className="storage-alert" role="alert">
              Your browser couldn’t remember these changes. They’ll remain
              available in this tab for this session.
            </div>
          )}
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
              <HotkeyOptions />
            </>
          )}
          {section === 'workspaces' && (
            <div className="outer-workspaces">{workspacesPanel}</div>
          )}
          {(section === 'home' || section === 'projects') && (
            <HomePage
              store={restored?.store}
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
                  store={restored?.store}
                  key={`${savedWorkspace.id}:${activeProject.id}`}
                  project={activeProject}
                  preferences={workspace.preferences}
                  layout={layout}
                  onLayoutChange={updateLayout}
                  showFileToggle={false}
                  workspaceActive={section === 'work'}
                  openRequest={openRequest}
                  viewSession={savedWorkspace.views[activeProject.id]}
                  onCopyViewLink={copyViewLink}
                  initialViewState={
                    savedWorkspace.id === restored?.snapshot.workspace.id &&
                    activeProject.id === restored.snapshot.project.id
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
      <WorkspaceOverlays />
    </div>
  )
}
