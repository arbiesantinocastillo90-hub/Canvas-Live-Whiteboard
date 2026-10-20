import {
  baseCanvasStore,
  scopedCanvasRecord,
  isCanvasFileVisible,
} from './canvasStoreScope'
import type { WorkspaceActionItem } from './WorkspaceItemActions'
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
import ProjectHierarchy from './ProjectHierarchy'
import CanvasDestinationDialog from './CanvasDestinationDialog'
import ProjectContextMenu from './ProjectContextMenu'
import { projectMenuAnchor, type ProjectMenuAnchor } from './projectMenuAnchor'
import CanvasThumbnail from './CanvasThumbnail'
import WorkspaceIdentity from './WorkspaceIdentity'
import { useWorkspaceBackground } from './workspaceBackground'
import PresentationIcon from './PresentationIcon'
import {
  itemPresentationStyle,
  normalizeItemPresentation,
} from './itemPresentation'
import {
  workspaceBackgroundStyle,
  normalizeWorkspaceAppearance,
  type WorkspaceAppearance,
} from './workspaceAppearance'
import {
  DEFAULT_HOME_VIEW,
  normalizeHomeView,
  type HomeLibraryView,
} from './homeView'
import { projectDescendants, type Project } from './workspace'
import { useSessionNotifications } from './notificationSession'
import {
  hasSharedCanvasFileCatalog,
  localLibrary,
  sharedCanvasFileCatalog,
  sharedCanvasFileStore,
  type LibraryFileSummary,
} from './localLibrary'
import './home-page.css'

type HomeFile = { record: CanvasFileRecord; dirty: boolean; project: Project }

/** Keep large imported hierarchies from starting hundreds of storage reads at once. */
async function mapBounded<T, R>(
  values: readonly T[],
  limit: number,
  map: (value: T) => Promise<R>,
  cancelled: () => boolean,
): Promise<R[]> {
  const results: R[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (!cancelled()) {
        const index = next++
        if (index >= values.length) break
        results[index] = await map(values[index])
      }
    }),
  )
  return results
}

export default function HomePage({
  workspaceName,
  workspaceAppearance,
  onCustomizeWorkspace,
  onCustomizeProject,
  onCustomizeFile,
  onManageItem,
  onOpenTrash,
  view,
  onViewChange,
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
  workspaceAppearance?: WorkspaceAppearance
  onCustomizeWorkspace?: () => void
  onCustomizeProject?: (project: Project) => void
  onCustomizeFile?: (projectId: string, fileId: string) => void
  onManageItem?: (item: WorkspaceActionItem) => void
  onOpenTrash?: () => void
  view?: HomeLibraryView
  onViewChange?: (value: HomeLibraryView) => void
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
  onImport: (projectId: string | null, files: File[]) => void
  onLocalImport?: (projectId: string | null, files: LocalCanvasImport[]) => void
  store?: CanvasFileStore
  notificationScopeId?: string
}) {
  const [localView, setLocalView] = useState<HomeLibraryView>(() => ({
    ...DEFAULT_HOME_VIEW,
    openedProjectId: selectedProjectId,
  }))
  const [choosingCanvasProject, setChoosingCanvasProject] = useState(false)
  const [projectMenu, setProjectMenu] = useState<ProjectMenuAnchor | null>(null)
  const closeProjectMenu = useCallback(() => setProjectMenu(null), [])
  const [dialogScope, setDialogScope] = useState({ store, notificationScopeId })
  if (
    dialogScope.store !== store ||
    dialogScope.notificationScopeId !== notificationScopeId
  ) {
    setDialogScope({ store, notificationScopeId })
    setChoosingCanvasProject(false)
    setProjectMenu(null)
  }
  function newCanvas() {
    if (projects.length) setChoosingCanvasProject(true)
    else onNewProject()
  }
  const currentView = normalizeHomeView(view ?? localView)
  const appearance = normalizeWorkspaceAppearance(workspaceAppearance)
  const background = useWorkspaceBackground(appearance.backgroundAssetId)
  function changeView(patch: Partial<HomeLibraryView>) {
    const next = normalizeHomeView({ ...currentView, ...patch })
    setLocalView(next)
    onViewChange?.(next)
  }
  const projectSignature = JSON.stringify(projects)
  const selected = projects.find(
    (project) => project.id === currentView.openedProjectId,
  )
  const browsingProjects = currentView.perspective === 'projects' && !selected
  const nativeCatalogAvailable = hasSharedCanvasFileCatalog(
    baseCanvasStore(store),
  )
  const catalogOnly = browsingProjects && nativeCatalogAvailable
  const listingScope = nativeCatalogAvailable ? (selected?.id ?? '*') : '*'
  const [fileSnapshot, setFileSnapshot] = useState<{
    store: CanvasFileStore
    projectSignature: string
    files: HomeFile[]
    catalogOnly: boolean
    listingScope: string
    summaries: LibraryFileSummary[]
    warning: string | null
  } | null>(null)
  // A workspace switch must never paint the previous workspace's file rows
  // while its own scoped store is still loading.
  const snapshotCurrent =
    fileSnapshot?.store === store &&
    fileSnapshot.projectSignature === projectSignature &&
    fileSnapshot.catalogOnly === catalogOnly &&
    fileSnapshot.listingScope === listingScope
  const files = snapshotCurrent
    ? fileSnapshot.files.filter(({ record }) =>
        isCanvasFileVisible(store, record.id),
      )
    : []
  const fileMetrics = new Map(
    (snapshotCurrent ? fileSnapshot.summaries : [])
      .filter((file) => isCanvasFileVisible(store, file.id))
      .map((file) => [file.id, file]),
  )
  for (const { record } of files)
    fileMetrics.set(record.id, {
      ...record,
      key: '',
      revision: 0,
      name: record.document.name,
    })
  const [loading, setLoading] = useState(true)
  const { notify } = useSessionNotifications(notificationScopeId)
  const setError = useCallback(
    (message: string | null) => {
      if (message) notify(message, 'error')
    },
    [notify],
  )
  const [search, setSearch] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1)
    window.addEventListener('canvas-live-library-updated', reload)
    return () =>
      window.removeEventListener('canvas-live-library-updated', reload)
  }, [])
  const importInput = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const targetProject =
    selected ??
    projects.find((project) => project.id === selectedProjectId) ??
    projects[0]
  useEffect(() => {
    let cancelled = false
    const snapshot = JSON.parse(projectSignature) as Project[]
    void (async () => {
      let nativeCatalog: Awaited<ReturnType<typeof sharedCanvasFileCatalog>> =
        null
      let catalogError: string | null = null
      if (nativeCatalogAvailable) {
        try {
          nativeCatalog = await sharedCanvasFileCatalog(baseCanvasStore(store))
        } catch (error) {
          catalogError =
            error instanceof Error
              ? error.message
              : 'The local library could not be reached.'
        }
      }
      const results = await mapBounded(
        snapshot,
        4,
        async (project) => {
          const recovery = await recoveryFor(store)
            .list(project.id)
            .then((drafts) => ({ drafts, error: null as string | null }))
            .catch(() => ({
              drafts: [],
              error:
                'Draft recovery could not be loaded. Open a saved .CLF file if needed.',
            }))
          if (cancelled) return { files: [], error: null }
          const drafts = mergeRecoveredDrafts(
            recovery.drafts,
            projectDrafts(store).get(project.id) ?? [],
          )
          if (
            catalogOnly ||
            (listingScope !== '*' &&
              !projectDescendants(snapshot, listingScope).has(project.id))
          )
            return {
              files: drafts.map((draft) => ({
                record: scopedCanvasRecord(store, draft.record),
                dirty: draft.dirty,
                project,
              })),
              error: catalogError ?? nativeCatalog?.error ?? recovery.error,
            }
          try {
            const result = await store.list(project.id)
            if (cancelled) return { files: [], error: null }
            const savedEntries = await mapBounded(
              result.value.filter((record) => record.projectId === project.id),
              8,
              async (record) => {
                const bound = await localFilesFor(store)
                  .get(project.id, record.id)
                  .catch(() => null)
                const savedRecord = scopedCanvasRecord(
                  store,
                  bound &&
                    !(
                      baseCanvasStore(store) === sharedCanvasFileStore &&
                      localLibrary.available
                    )
                    ? { ...record, document: bound.savedDocument }
                    : record,
                )
                return {
                  record: savedRecord,
                  dirty: false,
                  savedDocument: savedRecord.document,
                  persistence: result.persistence,
                }
              },
              () => cancelled,
            )
            const restored = mergeRecoveredDrafts(
              savedEntries,
              drafts.map((draft) => ({
                ...draft,
                record: scopedCanvasRecord(store, draft.record),
                savedDocument: scopedCanvasRecord(store, {
                  ...draft.record,
                  document: draft.savedDocument,
                }).document,
              })),
            )
            return {
              files: restored.map((draft) => ({
                record: draft.record,
                project,
                dirty: draft.dirty,
              })),
              error: result.error ?? recovery.error,
            }
          } catch (error) {
            return {
              files: drafts.map((draft) => ({
                record: draft.record,
                dirty: draft.dirty,
                project,
              })),
              error:
                `Saved files could not be reached. Your open drafts are still available. Reconnect your drive and retry loading. ${error instanceof Error ? error.message : ''}`.trim(),
            }
          }
        },
        () => cancelled,
      )
      if (cancelled) return
      const warning = results.find((result) => result.error)?.error ?? null
      setFileSnapshot({
        store,
        projectSignature,
        files: results
          .flatMap((result) => result.files)
          .sort((a, b) => b.record.lastOpenedAt - a.record.lastOpenedAt),
        catalogOnly,
        listingScope,
        summaries:
          nativeCatalog?.files.filter(
            (file) =>
              isCanvasFileVisible(store, file.id) &&
              snapshot.some((project) => project.id === file.projectId),
          ) ?? [],
        warning,
      })
      setError(warning)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [
    projectSignature,
    store,
    setError,
    refresh,
    catalogOnly,
    nativeCatalogAvailable,
    listingScope,
  ])
  const selectedIds = selected
    ? projectDescendants(projects, selected.id)
    : null
  const query = search.trim().toLocaleLowerCase()
  const sortedFiles = [...files].sort((a, b) =>
    currentView.sort === 'name'
      ? a.record.document.name.localeCompare(b.record.document.name)
      : currentView.sort === 'created'
        ? b.record.createdAt - a.record.createdAt
        : currentView.sort === 'modified'
          ? b.record.updatedAt - a.record.updatedAt
          : b.record.lastOpenedAt - a.record.lastOpenedAt,
  )
  const hierarchyFiles = currentView.hierarchyShowCanvases
    ? [...fileMetrics.values()]
        .sort((a, b) =>
          currentView.sort === 'name'
            ? a.name.localeCompare(b.name)
            : currentView.sort === 'created'
              ? b.createdAt - a.createdAt
              : currentView.sort === 'modified'
                ? b.updatedAt - a.updatedAt
                : b.lastOpenedAt - a.lastOpenedAt,
        )
        .map((file) => ({
          id: file.id,
          name: file.name,
          projectId: file.projectId,
          dirty: files.some((item) => item.record.id === file.id && item.dirty),
        }))
    : []
  const visible = sortedFiles.filter(
    (file) =>
      (!selectedIds || selectedIds.has(file.project.id)) &&
      `${file.record.document.name} ${file.project.name}`
        .toLocaleLowerCase()
        .includes(query),
  )
  const projectModified = (project: Project) =>
    Math.max(
      project.updatedAt ?? project.createdAt,
      ...[...fileMetrics.values()]
        .filter((file) =>
          projectDescendants(projects, project.id).has(file.projectId),
        )
        .map((file) => file.updatedAt),
    )
  const sortedProjects = [...projects].sort((a, b) =>
    currentView.sort === 'name'
      ? a.name.localeCompare(b.name)
      : currentView.sort === 'created'
        ? b.createdAt - a.createdAt
        : currentView.sort === 'modified'
          ? projectModified(b) - projectModified(a)
          : b.lastOpenedAt - a.lastOpenedAt,
  )
  const matchingProjects = sortedProjects.filter((project) =>
    `${project.name} ${project.presentation?.description ?? ''}`
      .toLocaleLowerCase()
      .includes(query),
  )
  const recentFiles = [...files]
    .sort((a, b) => b.record.lastOpenedAt - a.record.lastOpenedAt)
    .slice(0, 12)
  const canvasSidebarFiles =
    currentView.canvasesSection === 'recent'
      ? visible.filter((file) =>
          recentFiles.some(
            (recent) =>
              recent.record.projectId === file.record.projectId &&
              recent.record.id === file.record.id,
          ),
        )
      : visible
  function openProject(id: string) {
    changeView({ perspective: 'projects', openedProjectId: id })
    onSelectProject(id)
    setSearch('')
  }
  function fileShortcut({ record, project }: HomeFile) {
    return (
      <button
        className="home-project"
        key={`${project.id}:${record.id}`}
        onClick={() => onOpenFile(project.id, record.id)}
        title={record.document.name}
      >
        <Icon name="canvas" />
        <span>{record.document.name}</span>
      </button>
    )
  }
  async function openImport() {
    if (supportsLocalCanvasOpen() && onLocalImport) {
      try {
        const selectedFiles = await chooseLocalCanvasFiles()
        if (alive.current && selectedFiles?.length)
          onLocalImport(targetProject?.id ?? null, selectedFiles)
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
      enabled: true,
      execute: newCanvas,
    },
    {
      id: 'file.import',
      label: 'Import CLF',
      category: 'Files',
      enabled: true,
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
    <section
      className="home-page"
      aria-label="Canvas Live home"
      style={workspaceBackgroundStyle(appearance, background)}
    >
      <div className="home-background" aria-hidden="true" />
      <div className="home-gradient" aria-hidden="true" />
      <div className="home-workspace-header">
        {workspaceName && (
          <WorkspaceIdentity
            name={workspaceName}
            appearance={appearance}
            className="home-workspace-name"
          />
        )}
        <div
          className="home-perspective"
          role="group"
          aria-label="Library perspective"
        >
          <button
            className="button secondary"
            aria-pressed={currentView.perspective === 'projects'}
            onClick={() => {
              changeView({ perspective: 'projects', openedProjectId: null })
              setSearch('')
            }}
          >
            Projects
          </button>
          <button
            className="button secondary"
            aria-pressed={currentView.perspective === 'canvas'}
            onClick={() => {
              changeView({ perspective: 'canvas', openedProjectId: null })
              setSearch('')
            }}
          >
            Canvas
          </button>
        </div>
        {onCustomizeWorkspace && (
          <button
            className="icon-button"
            aria-label="Customize workspace"
            title="Customize workspace"
            onClick={onCustomizeWorkspace}
          >
            <Icon name="options" />
          </button>
        )}
      </div>
      <aside
        className="home-projects"
        aria-label={
          currentView.perspective === 'projects'
            ? 'Home projects'
            : 'Home canvases'
        }
      >
        <div className="home-projects-heading">
          <h2>
            {currentView.perspective === 'projects' ? 'Projects' : 'Canvases'}
          </h2>
          {currentView.perspective === 'projects' && (
            <>
              {projectActions}
              <button
                className="icon-button"
                aria-label="Create a new project"
                title="New project"
                onClick={() => onNewProject()}
              >
                <Icon name="plus" />
              </button>
            </>
          )}
          {currentView.perspective === 'canvas' && (
            <button
              className="icon-button"
              aria-label="Create a new canvas"
              title="New canvas"
              onClick={newCanvas}
            >
              <Icon name="plus" />
            </button>
          )}
        </div>
        {currentView.perspective === 'projects' ? (
          <>
            <ProjectExplorer
              projects={sortedProjects}
              selectedId={selected?.id}
              onOpen={openProject}
              onNewChild={onNewProject}
              onRename={onRenameProject}
              onPin={onPinProject}
              onHideRecent={onHideRecentProject}
              recentsCollapsed={projectRecentsCollapsed}
              onRecentsCollapsedChange={onProjectRecentsCollapsedChange}
              allProjectsCollapsed={allProjectsCollapsed}
              onAllProjectsCollapsedChange={onAllProjectsCollapsedChange}
              flat
              count={(id) => {
                const ids = projectDescendants(projects, id)
                return [...fileMetrics.values()].filter((file) =>
                  ids.has(file.projectId),
                ).length
              }}
            />
            <section
              className="home-hierarchy-section"
              aria-label="Project hierarchy section"
            >
              <button
                className="project-section-toggle"
                aria-expanded={!currentView.hierarchyCollapsed}
                onClick={() =>
                  changeView({
                    hierarchyCollapsed: !currentView.hierarchyCollapsed,
                  })
                }
              >
                <span aria-hidden="true">
                  {currentView.hierarchyCollapsed ? '▸' : '▾'}
                </span>
                Project hierarchy
              </button>
              {!currentView.hierarchyCollapsed && (
                <ProjectHierarchy
                  key={`${notificationScopeId}:sidebar`}
                  projects={sortedProjects}
                  files={hierarchyFiles}
                  showCanvases={currentView.hierarchyShowCanvases}
                  onOpenFile={onOpenFile}
                  closedIds={currentView.closedProjectIds}
                  onClosedIdsChange={(closedProjectIds) =>
                    changeView({ closedProjectIds })
                  }
                  selectedId={selected?.id}
                  onOpen={openProject}
                  onNewChild={onNewProject}
                  onRename={onRenameProject}
                  onCustomize={onCustomizeProject}
                  onManageItem={onManageItem}
                />
              )}
            </section>
          </>
        ) : (
          <div className="home-canvas-organizer">
            <section aria-label="Recent canvases">
              <button
                className="project-section-toggle"
                aria-expanded={!currentView.recentCanvasesCollapsed}
                onClick={() =>
                  changeView({
                    recentCanvasesCollapsed:
                      !currentView.recentCanvasesCollapsed,
                  })
                }
              >
                <span aria-hidden="true">
                  {currentView.recentCanvasesCollapsed ? '▸' : '▾'}
                </span>
                Recent canvases
              </button>
              {!currentView.recentCanvasesCollapsed && (
                <div>
                  {recentFiles.map(fileShortcut)}
                  {!recentFiles.length && (
                    <p className="project-list-empty">No recent canvases</p>
                  )}
                </div>
              )}
            </section>
            <section aria-label="All canvases">
              <button
                className="project-section-toggle"
                aria-expanded={!currentView.allCanvasesCollapsed}
                onClick={() =>
                  changeView({
                    allCanvasesCollapsed: !currentView.allCanvasesCollapsed,
                  })
                }
              >
                <span aria-hidden="true">
                  {currentView.allCanvasesCollapsed ? '▸' : '▾'}
                </span>
                All canvases
              </button>
              {!currentView.allCanvasesCollapsed && (
                <div>{sortedFiles.map(fileShortcut)}</div>
              )}
            </section>
          </div>
        )}
      </aside>
      <div className="home-library">
        <div className="home-library-heading">
          <div className="home-heading-title">
            {selected && (
              <button
                className="icon-button home-back"
                aria-label="Back to projects"
                title="Back to projects"
                onClick={() => {
                  changeView({ openedProjectId: null })
                  onSelectProject(null)
                }}
              >
                <Icon name="arrow" />
              </button>
            )}
            <h1>
              {selected?.name ?? (browsingProjects ? 'Projects' : 'Canvases')}
            </h1>
            {selected && onManageItem && (
              <button
                className="button secondary"
                onClick={() =>
                  onManageItem({
                    kind: 'project',
                    id: selected.id,
                    projectId: selected.id,
                    name: selected.name,
                  })
                }
              >
                Manage project
              </button>
            )}
          </div>
          <div className="home-actions">
            {onOpenTrash && (
              <button className="button secondary" onClick={onOpenTrash}>
                Trash
              </button>
            )}
            {browsingProjects ? (
              <>
                <button
                  className="button secondary"
                  aria-pressed={currentView.display === 'hierarchy'}
                  onClick={() =>
                    changeView({
                      display:
                        currentView.display === 'hierarchy'
                          ? 'cards'
                          : 'hierarchy',
                    })
                  }
                >
                  <Icon name="folder" />
                  <span>Project hierarchy</span>
                </button>
                <button
                  className="button primary"
                  onClick={() => onNewProject()}
                >
                  <Icon name="plus" />
                  <span>New project</span>
                </button>
              </>
            ) : (
              <>
                <button
                  className="button secondary"
                  aria-label="Import"
                  title="Import .CLF files"
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
                  onClick={newCanvas}
                >
                  <Icon name="plus" />
                  <span>New canvas</span>
                </button>
              </>
            )}
          </div>
        </div>
        <div className="home-library-controls">
          <label className="search-field home-search">
            <Icon name="search" />
            <input
              type="search"
              aria-label={
                browsingProjects ? 'Search projects' : 'Search canvases'
              }
              placeholder={
                browsingProjects ? 'Search projects' : 'Search canvases'
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="library-order">
            <span>Order</span>
            <select
              aria-label={
                browsingProjects ? 'Order projects' : 'Order canvases'
              }
              value={currentView.sort}
              onChange={(event) =>
                changeView({
                  sort: event.target.value as HomeLibraryView['sort'],
                })
              }
            >
              <option value="recent">Recently opened</option>
              <option value="modified">Last modified</option>
              <option value="created">Date created</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
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
            if (selectedFiles.length)
              onImport(targetProject?.id ?? null, selectedFiles)
          }}
        />
        {snapshotCurrent && fileSnapshot.warning && (
          <div className="home-library-recovery" role="status">
            <p>{fileSnapshot.warning}</p>
            <button
              className="button secondary"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Retry loading saved files
            </button>
          </div>
        )}
        {loading || !snapshotCurrent ? (
          <div className="home-empty" role="status">
            Loading files…
          </div>
        ) : !projects.length ? (
          <div className="home-empty">
            <span className="home-empty-mark">
              <Icon name="folder" />
            </span>
            <h2>No projects yet</h2>
            <p>
              Create a project in this workspace before adding a new canvas.
            </p>
            <button
              className="button secondary"
              onClick={() => void openImport()}
            >
              Import canvas files
            </button>
            <button className="button primary" onClick={() => onNewProject()}>
              <Icon name="plus" />
              Create project
            </button>
          </div>
        ) : browsingProjects ? (
          currentView.display === 'hierarchy' ? (
            <div className="home-main-hierarchy">
              <label className="home-hierarchy-options">
                <input
                  type="checkbox"
                  checked={currentView.hierarchyShowCanvases}
                  onChange={(event) =>
                    changeView({ hierarchyShowCanvases: event.target.checked })
                  }
                />
                Show canvas files
              </label>
              <ProjectHierarchy
                key={`${notificationScopeId}:main`}
                projects={sortedProjects}
                files={hierarchyFiles}
                showCanvases={currentView.hierarchyShowCanvases}
                onOpenFile={onOpenFile}
                closedIds={currentView.closedProjectIds}
                onClosedIdsChange={(closedProjectIds) =>
                  changeView({ closedProjectIds })
                }
                onOpen={openProject}
                onNewChild={onNewProject}
                onRename={onRenameProject}
                onCustomize={onCustomizeProject}
                onManageItem={onManageItem}
                search={search}
              />
            </div>
          ) : (
            <div className="home-file-grid home-project-grid">
              {matchingProjects.map((project) => {
                const presentation = normalizeItemPresentation(
                  project.presentation,
                  'folder',
                )
                const count = [...fileMetrics.values()].filter((file) =>
                  projectDescendants(projects, project.id).has(file.projectId),
                ).length
                return (
                  <article
                    className="home-card home-project-card"
                    key={project.id}
                    style={itemPresentationStyle(presentation)}
                  >
                    <button
                      className="home-file"
                      aria-label={`Browse project ${project.name}`}
                      title={project.name}
                      onClick={() => openProject(project.id)}
                      aria-haspopup="menu"
                      onContextMenu={(event) =>
                        setProjectMenu(projectMenuAnchor(event, project.id))
                      }
                      onKeyDown={(event) => {
                        const anchor = projectMenuAnchor(event, project.id)
                        if (anchor) setProjectMenu(anchor)
                      }}
                    >
                      <div className="home-project-preview" aria-hidden="true">
                        <PresentationIcon
                          name={presentation.icon}
                          color={presentation.color ?? undefined}
                          fill={presentation.fill ?? undefined}
                        />
                        <span>
                          {count} {count === 1 ? 'canvas' : 'canvases'}
                        </span>
                      </div>
                      <div className="home-file-name">
                        <strong>{project.name}</strong>
                      </div>
                      {presentation.description && (
                        <p className="home-card-description">
                          {presentation.description}
                        </p>
                      )}
                      <div className="home-file-details">
                        <span>
                          {projects.find((item) => item.id === project.parentId)
                            ?.name ?? 'Project'}
                        </span>
                        <small>.CLP</small>
                      </div>
                    </button>
                    {onManageItem && (
                      <button
                        className="button secondary"
                        aria-label={`Manage project ${project.name}`}
                        onClick={() =>
                          onManageItem({
                            kind: 'project',
                            id: project.id,
                            projectId: project.id,
                            name: project.name,
                          })
                        }
                      >
                        Manage
                      </button>
                    )}
                    {onCustomizeProject && (
                      <button
                        className="icon-button home-card-customize"
                        aria-label={`Customize project ${project.name}`}
                        title="Customize project"
                        onClick={() => onCustomizeProject(project)}
                      >
                        <Icon name="options" />
                      </button>
                    )}
                  </article>
                )
              })}
              {!matchingProjects.length && (
                <div className="home-empty">
                  <h2>No matching projects</h2>
                </div>
              )}
            </div>
          )
        ) : !canvasSidebarFiles.length ? (
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
              <button className="button secondary" onClick={newCanvas}>
                Create canvas
              </button>
            )}
          </div>
        ) : (
          <div className="home-file-grid">
            {canvasSidebarFiles.map(({ record, project, dirty }) => {
              const presentation = normalizeItemPresentation(
                record.document.presentation,
              )
              return (
                <article
                  className="home-card"
                  key={`${project.id}:${record.id}`}
                  style={itemPresentationStyle(presentation)}
                >
                  <button
                    className="home-file"
                    aria-label={`Open canvas ${record.document.name} in ${project.name}`}
                    title={`${record.document.name}.CLF`}
                    onClick={() => onOpenFile(project.id, record.id)}
                    onContextMenu={
                      onManageItem
                        ? (event) => {
                            event.preventDefault()
                            onManageItem({
                              kind: 'file',
                              id: record.id,
                              projectId: project.id,
                              name: record.document.name,
                            })
                          }
                        : undefined
                    }
                  >
                    <div className="home-file-preview" aria-hidden="true">
                      <CanvasThumbnail document={record.document} />
                      <span>{record.document.elements.length}</span>
                    </div>
                    <div className="home-file-name">
                      <PresentationIcon
                        name={presentation.icon}
                        color={presentation.color ?? undefined}
                        size={16}
                      />
                      <strong>{record.document.name}</strong>
                      {dirty && (
                        <span
                          className="file-dirty"
                          aria-label="Unsaved changes"
                        />
                      )}
                    </div>
                    {presentation.description && (
                      <p className="home-card-description">
                        {presentation.description}
                      </p>
                    )}
                    <div className="home-file-details">
                      <span>{project.name}</span>
                      <small>.CLF</small>
                    </div>
                  </button>
                  {onManageItem && (
                    <button
                      className="button secondary"
                      aria-label={`Manage canvas ${record.document.name}`}
                      onClick={() =>
                        onManageItem({
                          kind: 'file',
                          id: record.id,
                          projectId: project.id,
                          name: record.document.name,
                        })
                      }
                    >
                      Manage
                    </button>
                  )}
                  {onCustomizeFile && (
                    <button
                      className="icon-button home-card-customize"
                      aria-label={`Customize canvas ${record.document.name}`}
                      title="Customize canvas"
                      onClick={() => onCustomizeFile(project.id, record.id)}
                    >
                      <Icon name="options" />
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
      {choosingCanvasProject && projects.length > 0 && (
        <CanvasDestinationDialog
          projects={projects}
          onClose={() => setChoosingCanvasProject(false)}
          onChoose={(projectId) => {
            if (!projects.some((project) => project.id === projectId)) return
            setChoosingCanvasProject(false)
            onNewCanvas(projectId)
          }}
        />
      )}
      {projectMenu &&
        projects.some((project) => project.id === projectMenu.projectId) && (
          <ProjectContextMenu
            anchor={projectMenu}
            project={projects.find(
              (project) => project.id === projectMenu.projectId,
            )!}
            onClose={closeProjectMenu}
            onOpen={openProject}
            onNewChild={onNewProject}
            onRename={onRenameProject}
            onCustomize={onCustomizeProject}
            onManage={
              onManageItem
                ? (project) =>
                    onManageItem({
                      kind: 'project',
                      id: project.id,
                      projectId: project.id,
                      name: project.name,
                    })
                : undefined
            }
          />
        )}
    </section>
  )
}
