import { Fragment, useCallback, useState, type CSSProperties } from 'react'
import Icon from './Icon'
import { projectTree, type Project } from './workspace'
import ProjectContextMenu from './ProjectContextMenu'
import { projectMenuAnchor, type ProjectMenuAnchor } from './projectMenuAnchor'

export type HierarchyCanvasFile = {
  id: string
  projectId: string
  name: string
  dirty?: boolean
}

export default function ProjectHierarchy({
  projects,
  closedIds,
  onClosedIdsChange,
  onOpen,
  selectedId,
  search = '',
  files = [],
  showCanvases = false,
  onOpenFile,
  onNewChild,
  onRename,
  onCustomize,
}: {
  projects: Project[]
  closedIds: string[]
  onClosedIdsChange: (ids: string[]) => void
  onOpen: (id: string) => void
  selectedId?: string | null
  search?: string
  files?: HierarchyCanvasFile[]
  showCanvases?: boolean
  onOpenFile?: (projectId: string, fileId: string) => void
  onNewChild?: (parentId: string) => void
  onRename?: (project: Project) => void
  onCustomize?: (project: Project) => void
}) {
  const [menu, setMenu] = useState<ProjectMenuAnchor | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const query = search.trim().toLocaleLowerCase()
  const include = new Set<string>()
  for (const project of projects) {
    if (
      !project.name.toLocaleLowerCase().includes(query) &&
      !(
        showCanvases &&
        files.some(
          (file) =>
            file.projectId === project.id &&
            file.name.toLocaleLowerCase().includes(query),
        )
      )
    )
      continue
    let cursor: Project | undefined = project
    while (cursor && !include.has(cursor.id)) {
      include.add(cursor.id)
      cursor = projects.find((entry) => entry.id === cursor?.parentId)
    }
  }
  const rows = projectTree(
    projects.filter((project) => include.has(project.id)),
  ).filter(({ project }) => {
    if (query) return true
    const seen = new Set<string>()
    let parent = project.parentId
    while (parent && !seen.has(parent)) {
      if (closedIds.includes(parent)) return false
      seen.add(parent)
      parent = projects.find((item) => item.id === parent)?.parentId
    }
    return true
  })
  return (
    <div
      className="project-hierarchy"
      role="tree"
      aria-label="Project hierarchy"
    >
      {rows.map(({ project, depth }) => {
        const projectFiles = showCanvases
          ? files.filter(
              (file) =>
                file.projectId === project.id &&
                (!query ||
                  project.name.toLocaleLowerCase().includes(query) ||
                  file.name.toLocaleLowerCase().includes(query)),
            )
          : []
        const branch =
          projects.some((item) => item.parentId === project.id) ||
          projectFiles.length > 0
        const closed = !query && closedIds.includes(project.id)
        return (
          <Fragment key={project.id}>
            <div
              className="project-tree-row"
              role="treeitem"
              aria-level={depth + 1}
              aria-expanded={branch ? !closed : undefined}
              aria-selected={selectedId === project.id}
              style={{ '--project-depth': depth } as CSSProperties}
            >
              {branch ? (
                <button
                  className="project-tree-toggle"
                  aria-label={`${closed ? 'Expand' : 'Collapse'} hierarchy project ${project.name}`}
                  onClick={() =>
                    onClosedIdsChange(
                      closed
                        ? closedIds.filter((id) => id !== project.id)
                        : [...closedIds, project.id],
                    )
                  }
                >
                  <span aria-hidden="true">{closed ? '▸' : '▾'}</span>
                </button>
              ) : (
                <span className="project-tree-spacer" />
              )}
              <button
                className="project-open"
                aria-label={`Browse project ${project.name}`}
                aria-pressed={selectedId === project.id}
                onClick={() => onOpen(project.id)}
                aria-haspopup="menu"
                onContextMenu={(event) =>
                  setMenu(projectMenuAnchor(event, project.id))
                }
                onKeyDown={(event) => {
                  const anchor = projectMenuAnchor(event, project.id)
                  if (anchor) setMenu(anchor)
                }}
              >
                <Icon name="folder" />
                <span>{project.name}</span>
              </button>
            </div>
            {!closed &&
              projectFiles.map((file) => (
                <div
                  className="project-tree-row project-tree-file"
                  role="treeitem"
                  key={`${project.id}:${file.id}`}
                  aria-level={depth + 2}
                  style={{ '--project-depth': depth + 1 } as CSSProperties}
                >
                  <span className="project-tree-spacer" />
                  <button
                    className="project-open"
                    aria-label={`Open canvas ${file.name} in ${project.name}`}
                    onClick={() => onOpenFile?.(project.id, file.id)}
                  >
                    <Icon name="canvas" />
                    <span>{file.name}</span>
                    {file.dirty && (
                      <span
                        className="file-dirty"
                        aria-label="Unsaved changes"
                      />
                    )}
                  </button>
                </div>
              ))}
          </Fragment>
        )
      })}
      {!rows.length && (
        <p className="project-list-empty">No matching projects</p>
      )}
      {menu && projects.some((project) => project.id === menu.projectId) && (
        <ProjectContextMenu
          anchor={menu}
          project={projects.find((project) => project.id === menu.projectId)!}
          onClose={closeMenu}
          onOpen={onOpen}
          onNewChild={onNewChild}
          onRename={onRename}
          onCustomize={onCustomize}
        />
      )}
    </div>
  )
}
