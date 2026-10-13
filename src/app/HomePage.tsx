import { useEffect, useRef, useState } from 'react'
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
import type { Project } from './workspace'
import './home-page.css'

type HomeFile = { record: CanvasFileRecord; dirty: boolean; project: Project }

export default function HomePage({
  projects,
  selectedProjectId,
  onSelectProject,
  onNewProject,
  onRenameProject,
  onOpenFile,
  onNewCanvas,
  onImport,
  onLocalImport,
  store = canvasFileStore,
}: {
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
  onNewProject: () => void
  onRenameProject: (project: Project) => void
  onOpenFile: (projectId: string, fileId: string) => void
  onNewCanvas: (projectId: string) => void
  onImport: (projectId: string, files: File[]) => void
  onLocalImport?: (projectId: string, files: LocalCanvasImport[]) => void
  store?: CanvasFileStore
}) {
  const [files, setFiles] = useState<HomeFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
              'Draft recovery could not be loaded. Open a saved LCANVAS file if needed.',
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
              const savedRecord = bound
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
  }, [projectSignature, store])
  const visible = files.filter(
    (file) =>
      (!selected || file.project.id === selected.id) &&
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
      label: 'Import LCANVAS',
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
      <aside className="home-projects" aria-label="Home projects">
        <div className="home-projects-heading">
          <h2>Projects</h2>
          <button
            className="icon-button"
            aria-label="Create a new project"
            title="New project"
            onClick={onNewProject}
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
        {projects.map((project) => (
          <div className="home-project-row" key={project.id}>
            <button
              className="home-project"
              aria-label={`Open project ${project.name}`}
              aria-pressed={selected?.id === project.id}
              title={project.name}
              onClick={() => onSelectProject(project.id)}
            >
              <Icon name="folder" />
              <span>{project.name}</span>
              <small>
                {files.filter((file) => file.project.id === project.id).length}
              </small>
            </button>
            <button
              className="icon-button home-project-rename"
              aria-label={`Rename project ${project.name}`}
              title="Rename project"
              onClick={() => onRenameProject(project)}
            >
              <Icon name="edit" />
            </button>
          </div>
        ))}
      </aside>
      <div className="home-library">
        <div className="home-library-heading">
          <h1>{selected?.name ?? 'Canvases'}</h1>
          <div className="home-actions">
            <button
              className="button secondary"
              aria-label="Import"
              title="Import LCANVAS files"
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
          accept=".lcanvas"
          aria-label="Import LCANVAS files"
          ref={importInput}
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (targetProject && selectedFiles.length)
              onImport(targetProject.id, selectedFiles)
          }}
        />
        {error && (
          <div className="file-message" role="status">
            {error}
          </div>
        )}
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
            <button className="button primary" onClick={onNewProject}>
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
                title={`${record.document.name}.lcanvas`}
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
                  <small>.lcanvas</small>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
