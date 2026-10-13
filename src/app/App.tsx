import { useEffect, useRef, useState, type CSSProperties } from 'react'
import AppearanceOptions from './AppearanceOptions'
import { resolveAppearanceVariables } from './appearance'
import FileWorkspace, { type WorkspaceOpenRequest } from './FileWorkspace'
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
import {
  createProject,
  loadWorkspace,
  openProject,
  persistWorkspace,
  recentProjects,
  renameProject,
  type Project,
  type WorkspaceState,
} from './workspace'

type Section = 'home' | 'work' | 'projects' | 'options'
type ProjectPrompt = { kind: 'create' } | { kind: 'rename'; project: Project }

export default function App() {
  return (
    <WorkspaceCommandsProvider>
      <WorkspaceApp />
    </WorkspaceCommandsProvider>
  )
}

function WorkspaceApp() {
  useCanvasDraftProtection()
  const [workspace, setWorkspace] = useState(loadWorkspace)
  const [section, setSection] = useState<Section>('home')
  const [workspaceStarted, setWorkspaceStarted] = useState(false)
  const [homeProjectId, setHomeProjectId] = useState(workspace.lastProjectId)
  const [openRequest, setOpenRequest] = useState<WorkspaceOpenRequest>()
  const requestSequence = useRef(0)
  const [prompt, setPrompt] = useState<ProjectPrompt | null>(null)
  const [search, setSearch] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [canvasFocused, setCanvasFocused] = useState(false)
  const [layout, setLayout] = useState(loadLayout)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  const projects = recentProjects(workspace)
  const activeProject = workspace.projects.find(
    (project) => project.id === workspace.lastProjectId,
  )
  const filteredProjects = projects.filter((project) =>
    project.name
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
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
    setStorageError(!persistWorkspace(next))
    setWorkspace(next)
  }
  function navigate(next: Section) {
    if (next === 'work' && (homeProjectId ?? workspace.lastProjectId))
      enterProject((homeProjectId ?? workspace.lastProjectId)!)
    else setSection(next === 'work' ? 'home' : next)
    setSearch('')
  }
  function submitProject(name: string) {
    try {
      const updated =
        prompt?.kind === 'rename'
          ? renameProject(workspace, prompt.project.id, name)
          : createProject(workspace, name)
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
    persistLayout(next)
    setLayout(next)
  }
  function resetLayout() {
    updateLayout({ ...DEFAULT_LAYOUT })
  }
  function openLeft(leftPanel: 'files' | 'projects') {
    if (!activeProject) {
      navigate('projects')
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
            {(['files', 'projects'] as const).map((panel) => (
              <button
                key={panel}
                className="nav-item"
                data-dock-trigger="left"
                aria-label={panel === 'files' ? 'Files' : 'Projects'}
                title={
                  panel === 'files'
                    ? 'Files · double-click to pin'
                    : 'Projects · double-click to pin'
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
                <Icon name={panel === 'files' ? 'files' : 'folder'} />
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
          {storageError && (
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
          {(section === 'home' || section === 'projects') && (
            <HomePage
              projects={projects}
              selectedProjectId={homeProjectId}
              onSelectProject={setHomeProjectId}
              onNewProject={() => setPrompt({ kind: 'create' })}
              onRenameProject={(project) =>
                setPrompt({ kind: 'rename', project })
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
                  key={activeProject.id}
                  project={activeProject}
                  preferences={workspace.preferences}
                  layout={layout}
                  onLayoutChange={updateLayout}
                  showFileToggle={false}
                  workspaceActive={section === 'work'}
                  openRequest={openRequest}
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
                      <div className="recent-list">
                        {filteredProjects.map((project) => (
                          <button
                            key={project.id}
                            className={`recent-project ${activeProject.id === project.id ? 'is-active' : ''}`}
                            aria-label={`Open ${project.name}`}
                            title={project.name}
                            onClick={() => enterProject(project.id)}
                          >
                            <Icon name="folder" />
                            <span className="recent-name">{project.name}</span>
                          </button>
                        ))}
                        {!filteredProjects.length && (
                          <p className="file-list-empty">No projects found</p>
                        )}
                      </div>
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
          onClose={() => setPrompt(null)}
          onSubmit={submitProject}
        />
      )}
      <WorkspaceOverlays />
    </div>
  )
}
