import { useEffect, useState, type CSSProperties } from 'react'
import AppearanceOptions from './AppearanceOptions'
import { resolveAppearanceVariables } from './appearance'
import FileWorkspace from './FileWorkspace'
import {
  DEFAULT_LAYOUT,
  loadLayout,
  PANEL_LIMITS,
  persistLayout,
} from './layout'
import PanelResizeHandle from './PanelResizeHandle'
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

type Section = 'work' | 'projects' | 'options'
type ProjectPrompt = { kind: 'create' } | { kind: 'rename'; project: Project }

function openedDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(timestamp)
}

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
  const [section, setSection] = useState<Section>(() =>
    workspace.lastProjectId ? 'work' : 'projects',
  )
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

  function enterProject(id: string) {
    updateWorkspace(openProject(workspace, id))
    setSection('work')
  }

  function updateWorkspace(next: WorkspaceState) {
    setStorageError(!persistWorkspace(next))
    setWorkspace(next)
  }
  function navigate(next: Section) {
    if (next === 'work' && workspace.lastProjectId)
      enterProject(workspace.lastProjectId)
    else setSection(next)
    setSearch('')
  }
  function submitProject(name: string) {
    try {
      const updated =
        prompt?.kind === 'rename'
          ? renameProject(workspace, prompt.project.id, name)
          : createProject(workspace, name)
      updateWorkspace(updated)
      setSection('work')
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
  useRegisterCommands([
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
      execute: () => navigate('projects'),
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
      label: 'Toggle navigation',
      category: 'Panels',
      execute: () =>
        updateLayout({ ...layout, sidebarOpen: !layout.sidebarOpen }),
      enabled: !canvasFocused,
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
      data-sidebar-open={layout.sidebarOpen}
      data-section={section}
      style={colors}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        className="sidebar"
        data-collapsed={!layout.sidebarOpen}
        aria-label="Workspace sidebar"
        inert={canvasFocused}
        aria-hidden={canvasFocused}
      >
        <button
          className="icon-button sidebar-layout-toggle"
          aria-label={
            layout.sidebarOpen
              ? 'Collapse workspace sidebar'
              : 'Expand workspace sidebar'
          }
          aria-expanded={layout.sidebarOpen}
          onClick={() =>
            updateLayout({ ...layout, sidebarOpen: !layout.sidebarOpen })
          }
          title={
            layout.sidebarOpen ? 'Collapse navigation' : 'Expand navigation'
          }
        >
          <Icon name="files" />
        </button>
        <a className="brand" href="/" aria-label="Canvas Live home">
          <span className="brand-mark">
            <img src="/canvas-live-logo.png" alt="" />
          </span>
          <span>
            Canvas <strong>Live</strong>
            <small>A space for your ideas</small>
          </span>
        </a>
        <p className="rail-label">Your space</p>
        <nav className="section-nav" aria-label="Main navigation">
          <button
            className="nav-item"
            aria-label="Work"
            title="Work"
            aria-current={section === 'work' ? 'page' : undefined}
            onClick={() => navigate('work')}
          >
            <Icon name="work" />
            <span>Work</span>
            <Icon name="arrow" />
          </button>
          <button
            className="nav-item"
            aria-label="Projects"
            title="Projects"
            aria-current={section === 'projects' ? 'page' : undefined}
            onClick={() => navigate('projects')}
          >
            <Icon name="folder" />
            <span>Projects</span>
            <span className="nav-count">{projects.length}</span>
          </button>
          <button
            className="nav-item"
            aria-label="Options"
            title="Options"
            aria-current={section === 'options' ? 'page' : undefined}
            onClick={() => navigate('options')}
          >
            <Icon name="options" />
            <span>Options</span>
          </button>
        </nav>
        <div className="recent-heading">
          <p className="rail-label">Recent projects</p>
          <button
            className="icon-button"
            aria-label="Create a new project"
            onClick={() => setPrompt({ kind: 'create' })}
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="recent-list">
          {projects.length === 0 ? (
            <p className="rail-empty">
              Your recently opened projects will appear here.
            </p>
          ) : (
            projects.slice(0, 5).map((project) => (
              <button
                key={project.id}
                className={`recent-project ${section === 'work' && activeProject?.id === project.id ? 'is-active' : ''}`}
                onClick={() => enterProject(project.id)}
                title={project.name}
                aria-label={`Open ${project.name}`}
              >
                <span className="project-glyph">
                  <Icon name="canvas" />
                </span>
                <span className="recent-name">{project.name}</span>
              </button>
            ))
          )}
        </div>
        <button
          className="new-project-rail"
          onClick={() => setPrompt({ kind: 'create' })}
        >
          <Icon name="plus" />
          New project
        </button>
        <div className="sidebar-bottom">
          <div className="connection-status">
            <span className="status-dot" />
            AI controls in Work
          </div>
          <p>On your device. At your pace.</p>
          <span className="version-label">Canvas Live · Early workspace</span>
        </div>
        {layout.sidebarOpen && (
          <PanelResizeHandle
            label="Resize workspace sidebar"
            value={layout.sidebarWidth}
            {...PANEL_LIMITS.sidebar}
            defaultValue={PANEL_LIMITS.sidebar.default}
            onChange={(sidebarWidth) =>
              updateLayout({ ...layout, sidebarWidth })
            }
          />
        )}
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Canvas Live</span>
            <span aria-hidden="true">/</span>
            <strong>
              {section === 'work'
                ? 'Work'
                : section === 'projects'
                  ? 'Projects'
                  : 'Options'}
            </strong>
          </div>
          <WorkspaceLauncher />
          <span className="local-badge">
            <span />
            Local workspace
          </span>
        </header>
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
                <p>
                  Drag panel edges to resize. Collapse panels when you need more
                  space.
                </p>
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
          {section === 'projects' && (
            <section
              className="page projects-page"
              aria-labelledby="projects-title"
            >
              <div className="page-heading">
                <div>
                  <p className="eyebrow">A place for every idea</p>
                  <h1 id="projects-title">
                    Your projects<span className="heading-dot">.</span>
                  </h1>
                  <p className="page-description">
                    Start something new, or pick up where you left off.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setPrompt({ kind: 'create' })}
                >
                  <Icon name="plus" />
                  Create project
                </button>
              </div>
              <div className="project-tools">
                <h2>
                  Recently opened{' '}
                  <span className="count-pill">{projects.length}</span>
                </h2>
                <label className="search-field">
                  <Icon name="search" />
                  <input
                    type="search"
                    aria-label="Search projects"
                    placeholder="Find a project…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              {projects.length === 0 ? (
                <div className="empty-projects">
                  <div className="empty-art" aria-hidden="true">
                    <span className="art-card back">
                      <Icon name="canvas" />
                    </span>
                    <span className="art-card front">
                      <Icon name="plus" />
                    </span>
                  </div>
                  <p className="eyebrow">The beginning of something</p>
                  <h2>Give your next idea a home.</h2>
                  <p>
                    Create your first project. It will be waiting here whenever
                    you return.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setPrompt({ kind: 'create' })}
                  >
                    Create your first project
                    <Icon name="arrow" />
                  </button>
                  <span className="quiet-note">
                    Project names are remembered in this browser.
                  </span>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="search-empty">
                  <Icon name="search" />
                  <h2>No projects found</h2>
                  <p>Try a different name.</p>
                  <button
                    className="button secondary"
                    onClick={() => setSearch('')}
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="project-grid">
                  {filteredProjects.map((project, index) => (
                    <button
                      className="project-card"
                      key={project.id}
                      onClick={() => enterProject(project.id)}
                      aria-label={`Open project ${project.name}`}
                    >
                      <div
                        className={`project-card-preview motif-${index % 3}`}
                      >
                        <span className="preview-outline">
                          <Icon name="canvas" />
                        </span>
                        <span className="open-project-arrow">
                          <Icon name="arrow" />
                        </span>
                      </div>
                      <div className="project-card-details">
                        <h3>{project.name}</h3>
                        <p>
                          <Icon name="clock" />
                          Opened {openedDate(project.lastOpenedAt)}
                          {project.id === projects[0]?.id && (
                            <span>Most recent</span>
                          )}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="section-footnote">
                <Icon name="device" />
                <p>
                  Each project organizes its LCANVAS files. Import, view and
                  export your canvases from Work.
                </p>
              </div>
            </section>
          )}
          {section === 'work' &&
            (activeProject ? (
              <FileWorkspace
                key={activeProject.id}
                project={activeProject}
                preferences={workspace.preferences}
                layout={layout}
                onLayoutChange={updateLayout}
                onFocusChange={setCanvasFocused}
                onRenameProject={() =>
                  setPrompt({ kind: 'rename', project: activeProject })
                }
              />
            ) : (
              <section className="page work-page" aria-labelledby="work-title">
                <p className="eyebrow">Your work space</p>
                <h1 id="work-title">
                  A fresh start<span className="heading-dot">.</span>
                </h1>
                <div className="empty-projects work-empty">
                  <span className="canvas-empty-icon">
                    <Icon name="work" />
                  </span>
                  <h2>Your latest project will open here.</h2>
                  <p>
                    Create a project to get started. Work will bring you back to
                    the last project you opened.
                  </p>
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
        <footer className="workspace-footer">
          <span>Space to explore. Room to connect.</span>
          <span>
            {storageError
              ? 'Session only'
              : 'Preferences & project names · This browser'}
          </span>
        </footer>
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
