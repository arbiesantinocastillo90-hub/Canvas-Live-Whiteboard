import { useEffect, useState, type CSSProperties } from 'react'
import AppearanceOptions from './AppearanceOptions'
import { resolveAppearanceVariables } from './appearance'
import FileWorkspace from './FileWorkspace'
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
  function openLeft(leftPanel: 'files' | 'projects') {
    if (!activeProject) {
      navigate('projects')
      return
    }
    setSection('work')
    updateLayout({ ...layout, filesOpen: true, leftPanel })
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
      execute: () => openLeft('projects'),
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
      data-sidebar-open={layout.filesOpen}
      data-section={section}
      style={colors}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
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
            navigate('work')
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
          aria-current={section === 'options' ? 'page' : undefined}
          onClick={() => navigate('options')}
        >
          <Icon name="options" />
        </button>
      </aside>
      <div className="main-shell">
        {section !== 'work' && (
          <header className="topbar">
            <strong>{section === 'projects' ? 'Projects' : 'Options'}</strong>
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
          {section === 'projects' && (
            <section
              className="page projects-page"
              aria-labelledby="projects-title"
            >
              <div className="page-heading">
                <div>
                  <h1 id="projects-title">Projects</h1>
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
                  <h2>No projects yet</h2>
                  <button
                    className="button primary"
                    onClick={() => setPrompt({ kind: 'create' })}
                  >
                    Create your first project
                    <Icon name="arrow" />
                  </button>
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
                showFileToggle={false}
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
