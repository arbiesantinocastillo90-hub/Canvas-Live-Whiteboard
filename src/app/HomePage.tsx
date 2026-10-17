import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  canvasFileStore,
  type CanvasFileRecord,
  type CanvasFileStore,
} from './canvasFiles'
import { projectDrafts } from './canvasDrafts'
import { mergeRecoveredDrafts, recoveryFor } from './canvasRecovery'
import {
  chooseLocalCanvasFiles,
  localFilesFor,
  supportsLocalCanvasOpen,
  type LocalCanvasImport,
} from './canvasLocalFiles'
import {
  useRegisterCommands,
  useRegisterFiles,
} from './workspaceCommandsContext'
import Icon from './Icon'
import ProjectExplorer from './ProjectExplorer'
import { projectDescendants, type Project } from './workspace'
import { useSessionNotifications } from './notificationSession'
import { localLibrary, sharedCanvasFileStore } from './localLibrary'
import './home-page.css'

type HomeFile = { record: CanvasFileRecord; dirty: boolean; project: Project }

export default function HomePage({
  workspaceName,
  projectActions,
  projects,
  selectedProjectId,
  onSelectProject,
  onNewProject,
  onRenameProject,
  onPinProject,
  onHideRecentProject,
  projectRecentsCollapsed,
  onProjectRecentsCollapsedChange,
  allProjectsCollapsed,
  onAllProjectsCollapsedChange,
  onOpenFile,
  onNewCanvas,
  onImport,
  onLocalImport,
  store = canvasFileStore,
  notificationScopeId = 'home',
}: {
  workspaceName?: string
  projectActions?: ReactNode
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
  onNewProject: (parentId?: string | null) => void
  onRenameProject: (project: Project) => void
  onPinProject?: (id: string, pinned: boolean) => void
  onHideRecentProject?: (id: string) => void
  projectRecentsCollapsed?: boolean
  onProjectRecentsCollapsedChange?: (collapsed: boolean) => void
  allProjectsCollapsed?: boolean
  onAllProjectsCollapsedChange?: (collapsed: boolean) => void
  onOpenFile: (projectId: string, fileId: string) => void
  onNewCanvas: (projectId: string) => void
  onImport: (projectId: string, files: File[]) => void
  onLocalImport?: (projectId: string, files: LocalCanvasImport[]) => void
  store?: CanvasFileStore
  notificationScopeId?: string
}) {
  const [files, setFiles] = useState<HomeFile[]>([])
  const [loading, setLoading] = useState(true)
  const { notify } = useSessionNotifications(notificationScopeId)
  const setError = useCallback(
    (message: string | null) => {
      if (message) notify(message, 'error')
    },
    [notify],
  )
  const [search, setSearch] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const projectSignature = JSON.stringify(projects)
  const selected = projects.find((project) => project.id === selectedProjectId)
  const targetProject = selected ?? projects[0]
  useEffect(() => {
    let cancelled = false
    const snapshot = JSON.parse(projectSignature) as Project[]
    void Promise.all(
      snapshot.map(async (project) => {
        const recovery = await recoveryFor(store)
          .list(project.id)
          .then((drafts) => ({ drafts, error: null as string | null }))
          .catch(() => ({
            drafts: [],
            error:
              'Draft recovery could not be loaded. Open a saved .CLF file if needed.',
          }))
        const drafts = mergeRecoveredDrafts(
          recovery.drafts,
          projectDrafts(store).get(project.id) ?? [],
        )
        try {
          const result = await store.list(project.id)
          const savedEntries = await Promise.all(
            result.value.map(async (record) => {
              const bound = await localFilesFor(store)
                .get(project.id, record.id)
                .catch(() => null)
              const savedRecord =
                bound &&
                !(store === sharedCanvasFileStore && localLibrary.available)
                  ? { ...record, document: bound.savedDocument }
                  : record
              return {
                record: savedRecord,
                dirty: false,
                savedDocument: savedRecord.document,
                persistence: result.persistence,
              }
            }),
          )
          const restored = mergeRecoveredDrafts(savedEntries, drafts)
          return {
            files: restored.map((draft) => ({
              record: draft.record,
              project,
              dirty: draft.dirty,
            })),
            error: result.error ?? recovery.error,
          }
        } catch {
          return {
            files: drafts.map((draft) => ({
              record: draft.record,
              dirty: draft.dirty,
              project,
            })),
            error:
              'Some saved files could not be loaded. Your open drafts are still available.',
          }
        }
      }),
    ).then((results) => {
      if (cancelled) return
      setFiles(
        results
          .flatMap((result) => result.files)
          .sort((a, b) => b.record.lastOpenedAt - a.record.lastOpenedAt),
      )
      setError(results.find((result) => result.error)?.error ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [projectSignature, store, setError])
  const selectedIds = selected
    ? projectDescendants(projects, selected.id)
    : null
  const visible = files.filter(
    (file) =>
      (!selectedIds || selectedIds.has(file.project.id)) &&
      `${file.record.document.name} ${file.project.name}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  )
  async function openImport() {
    if (!targetProject) return
    if (supportsLocalCanvasOpen() && onLocalImport) {
      try {
        const selectedFiles = await chooseLocalCanvasFiles()
        if (alive.current && selectedFiles?.length)
          onLocalImport(targetProject.id, selectedFiles)
      } catch (failure) {
        if (alive.current)
          setError(
            failure instanceof Error
              ? failure.message
              : 'The local files could not be opened.',
          )
      }
    } else importInput.current?.click()
  }
  useRegisterCommands([
    {
      id: 'file.new',
      label: 'New canvas',
      category: 'Files',
      enabled: !!targetProject,
      execute: () => {
        if (targetProject) onNewCanvas(targetProject.id)
      },
    },
    {
      id: 'file.import',
      label: 'Import CLF',
      category: 'Files',
      enabled: !!targetProject,
      execute: () => {
        void openImport()
      },
    },
  ])
  useRegisterFiles(
    files.map(({ record, project }) => ({
      id: record.id,
      name: record.document.name,
      projectName: project.name,
      open: () => onOpenFile(project.id, record.id),
    })),
  )

  return (
    <section className="home-page" aria-label="Canvas Live home">
      {workspaceName && (
        <h2 className="home-workspace-name" aria-label="Current workspace">
          <Icon name="work" />
          <span>{workspaceName}</span>
        </h2>
      )}
      <aside className="home-projects" aria-label="Home projects">
        <div className="home-projects-heading">
          <h2>Projects</h2>
          {projectActions}
          <button
            className="icon-button"
            aria-label="Create a new project"
            title="New project"
            onClick={() => onNewProject()}
          >
            <Icon name="plus" />
          </button>
        </div>
        <button
          className="home-project"
          aria-pressed={!selected}
          onClick={() => onSelectProject(null)}
        >
          <Icon name="clock" />
          <span>Recent files</span>
          <small>{files.length}</small>
        </button>
        <ProjectExplorer
          projects={projects}
          selectedId={selected?.id}
          onOpen={onSelectProject}
          onNewChild={onNewProject}
          onRename={onRenameProject}
          onPin={onPinProject}
          onHideRecent={onHideRecentProject}
          recentsCollapsed={projectRecentsCollapsed}
          onRecentsCollapsedChange={onProjectRecentsCollapsedChange}
          allProjectsCollapsed={allProjectsCollapsed}
          onAllProjectsCollapsedChange={onAllProjectsCollapsedChange}
          count={(id) => {
            const ids = projectDescendants(projects, id)
            return files.filter((file) => ids.has(file.project.id)).length
          }}
        />
      </aside>
      <div className="home-library">
        <div className="home-library-heading">
          <h1>{selected?.name ?? 'Canvases'}</h1>
          <div className="home-actions">
            <button
              className="button secondary"
              aria-label="Import"
              title="Import .CLF files"
              disabled={!targetProject}
              onClick={() => {
                void openImport()
              }}
            >
              <Icon name="import" />
              <span>Import</span>
            </button>
            <button
              className="button primary"
              aria-label="New canvas"
              disabled={!targetProject}
              onClick={() => {
                if (targetProject) onNewCanvas(targetProject.id)
              }}
            >
              <Icon name="plus" />
              <span>New canvas</span>
            </button>
          </div>
        </div>
        <label className="search-field home-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search canvases"
            placeholder="Search canvases"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <input
          className="file-import-input"
          type="file"
          multiple
          accept=".clf,.CLF,.lcanvas"
          aria-label="Import CLF files"
          ref={importInput}
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (targetProject && selectedFiles.length)
              onImport(targetProject.id, selectedFiles)
          }}
        />
        {loading ? (
          <div className="home-empty" role="status">
            Loading files…
          </div>
        ) : !projects.length ? (
          <div className="home-empty">
            <span className="home-empty-mark">
              <Icon name="canvas" />
            </span>
            <h2>No projects yet</h2>
            <button className="button primary" onClick={() => onNewProject()}>
              <Icon name="plus" />
              Create project
            </button>
          </div>
        ) : !visible.length ? (
          <div className="home-empty">
            <span className="home-empty-mark">
              <Icon name={search ? 'search' : 'canvas'} />
            </span>
            <h2>{search ? 'No matching canvases' : 'No canvas files yet'}</h2>
            {search ? (
              <button
                className="button secondary"
                onClick={() => setSearch('')}
              >
                Clear search
              </button>
            ) : (
              <button
                className="button secondary"
                onClick={() => {
                  if (targetProject) onNewCanvas(targetProject.id)
                }}
              >
                Create canvas
              </button>
            )}
          </div>
        ) : (
          <div className="home-file-grid">
            {visible.map(({ record, project, dirty }) => (
              <button
                className="home-file"
                key={record.id}
                aria-label={`Open canvas ${record.document.name} in ${project.name}`}
                title={`${record.document.name}.CLF`}
                onClick={() => onOpenFile(project.id, record.id)}
              >
                <div className="home-file-preview" aria-hidden="true">
                  <Icon name="canvas" />
                  <span>{record.document.elements.length}</span>
                </div>
                <div className="home-file-name">
                  <strong>{record.document.name}</strong>
                  {dirty && (
                    <span className="file-dirty" aria-label="Unsaved changes" />
                  )}
                </div>
                <div className="home-file-details">
                  <span>{project.name}</span>
                  <small>.CLF</small>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
