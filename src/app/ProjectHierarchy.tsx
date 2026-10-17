import type { CSSProperties } from 'react'
import Icon from './Icon'
import { projectTree, type Project } from './workspace'

export default function ProjectHierarchy({
  projects,
  closedIds,
  onClosedIdsChange,
  onOpen,
  selectedId,
  search = '',
}: {
  projects: Project[]
  closedIds: string[]
  onClosedIdsChange: (ids: string[]) => void
  onOpen: (id: string) => void
  selectedId?: string | null
  search?: string
}) {
  const query = search.trim().toLocaleLowerCase()
  const include = new Set<string>()
  for (const project of projects) {
    if (!project.name.toLocaleLowerCase().includes(query)) continue
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
        const branch = projects.some((item) => item.parentId === project.id)
        const closed = !query && closedIds.includes(project.id)
        return (
          <div
            className="project-tree-row"
            role="treeitem"
            key={project.id}
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
            >
              <Icon name="folder" />
              <span>{project.name}</span>
            </button>
          </div>
        )
      })}
      {!rows.length && (
        <p className="project-list-empty">No matching projects</p>
      )}
    </div>
  )
}
