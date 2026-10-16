import { useState, type CSSProperties } from 'react'
import Icon from './Icon'
import { projectTree, type Project } from './workspace'

function PinMark() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m8 4 12 12-4 1-3 4-4-4-5 3 3-5-4-4 4-3Z" />
    </svg>
  )
}

export default function ProjectExplorer({
  projects,
  selectedId,
  onOpen,
  onNewChild,
  onRename,
  onPin,
  onHideRecent,
  recentsCollapsed,
  onRecentsCollapsedChange,
  search = '',
  variant = 'home',
  count,
}: {
  projects: Project[]
  selectedId?: string | null
  onOpen: (id: string) => void
  onNewChild?: (parentId: string) => void
  onRename?: (project: Project) => void
  onPin?: (id: string, pinned: boolean) => void
  onHideRecent?: (id: string) => void
  recentsCollapsed?: boolean
  onRecentsCollapsedChange?: (collapsed: boolean) => void
  search?: string
  variant?: 'home' | 'work'
  count?: (id: string) => number
}) {
  const [localRecentsCollapsed, setLocalRecentsCollapsed] = useState(false)
  const [closedParents, setClosedParents] = useState<Set<string>>(new Set())
  const query = search.trim().toLocaleLowerCase()
  const matching = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(query),
  )
  const matches = new Set(matching.map((project) => project.id))
  const ancestors = new Set(matches)
  for (const project of matching) {
    let parent = project.parentId
    const seen = new Set<string>()
    while (parent && !seen.has(parent)) {
      seen.add(parent)
      ancestors.add(parent)
      parent = projects.find((entry) => entry.id === parent)?.parentId
    }
  }
  const tree = projectTree(
    projects.filter((project) => ancestors.has(project.id)),
  )
  const recent = matching
    .filter((project) => !project.pinned && !project.recentHidden)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
  const pinned = matching
    .filter((project) => project.pinned)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
  const collapsed = recentsCollapsed ?? localRecentsCollapsed
  function shortcut(project: Project, isPinned: boolean) {
    return (
      <div className="project-shortcut-row" key={project.id}>
        <button
          className="project-open"
          aria-label={
            variant === 'work'
              ? `Open ${project.name}`
              : `Select ${isPinned ? 'pinned' : 'recent'} project ${project.name}`
          }
          aria-pressed={selectedId === project.id}
          title={project.name}
          onClick={() => onOpen(project.id)}
        >
          {isPinned ? <PinMark /> : <Icon name="folder" />}
          <span>{project.name}</span>
        </button>
        <div className="project-row-actions">
          {onPin && (
            <button
              className="icon-button"
              aria-label={`${isPinned ? 'Unpin' : 'Pin'} project ${project.name}`}
              title={isPinned ? 'Unpin project' : 'Pin project'}
              onClick={() => onPin(project.id, !isPinned)}
            >
              <PinMark />
            </button>
          )}
          {onHideRecent && (
            <button
              className="icon-button"
              aria-label={`Remove project ${project.name} from recent list`}
              title="Remove shortcut"
              onClick={() => onHideRecent(project.id)}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="project-organizer">
      {!!pinned.length && (
        <section aria-label="Pinned projects">
          <h3 className="project-section-title">Pinned</h3>
          {pinned.map((project) => shortcut(project, true))}
        </section>
      )}
      {!!projects.length && (
        <section aria-label="Recent projects">
          <button
            className="project-section-toggle"
            aria-expanded={!collapsed}
            aria-controls={`recent-projects-${variant}`}
            onClick={() => {
              setLocalRecentsCollapsed(!collapsed)
              onRecentsCollapsedChange?.(!collapsed)
            }}
          >
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>Recent
          </button>
          <div id={`recent-projects-${variant}`} hidden={collapsed}>
            {recent.map((project) => shortcut(project, false))}
            {!recent.length && (
              <p className="project-list-empty">No recent projects</p>
            )}
          </div>
        </section>
      )}
      {!!projects.length && (
        <section aria-label="All projects">
          <h3 className="project-section-title">All projects</h3>
          {tree
            .filter(({ project }) => {
              if (query) return true
              let parent = project.parentId
              const seen = new Set<string>()
              while (parent && !seen.has(parent)) {
                if (closedParents.has(parent)) return false
                seen.add(parent)
                parent = projects.find((entry) => entry.id === parent)?.parentId
              }
              return true
            })
            .map(({ project, depth }) => {
              const hasChildren = projects.some(
                (entry) => entry.parentId === project.id,
              )
              return (
                <div
                  className="project-tree-row"
                  key={project.id}
                  style={{ '--project-depth': depth } as CSSProperties}
                >
                  {hasChildren ? (
                    <button
                      className="project-tree-toggle"
                      aria-label={`${!query && closedParents.has(project.id) ? 'Expand' : 'Collapse'} project ${project.name}`}
                      aria-expanded={!!query || !closedParents.has(project.id)}
                      onClick={() =>
                        setClosedParents((current) => {
                          const next = new Set(current)
                          if (next.has(project.id)) next.delete(project.id)
                          else next.add(project.id)
                          return next
                        })
                      }
                    >
                      <span aria-hidden="true">
                        {closedParents.has(project.id) && !query ? '▸' : '▾'}
                      </span>
                    </button>
                  ) : (
                    <span className="project-tree-spacer" />
                  )}
                  <button
                    className="project-open"
                    aria-label={`Open project ${project.name}`}
                    aria-pressed={selectedId === project.id}
                    title={project.name}
                    onClick={() => onOpen(project.id)}
                  >
                    <Icon name="folder" />
                    <span>{project.name}</span>
                    {count && <small>{count(project.id)}</small>}
                  </button>
                  <div className="project-row-actions">
                    {onNewChild && (
                      <button
                        className="icon-button"
                        aria-label={`Create project inside ${project.name}`}
                        title="New nested project"
                        onClick={() => onNewChild(project.id)}
                      >
                        <Icon name="plus" />
                      </button>
                    )}
                    {onRename && (
                      <button
                        className="icon-button"
                        aria-label={`Rename project ${project.name}`}
                        title="Rename or move project"
                        onClick={() => onRename(project)}
                      >
                        <Icon name="edit" />
                      </button>
                    )}
                    {project.recentHidden && onPin && (
                      <button
                        className="icon-button"
                        aria-label={`Pin project ${project.name}`}
                        title="Pin project"
                        onClick={() => onPin(project.id, true)}
                      >
                        <PinMark />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          {!matching.length && (
            <p className="file-list-empty">No projects found</p>
          )}
        </section>
      )}
    </div>
  )
}
