import type { Project } from './workspace'
import type { SavedWorkspace, WorkspaceSessions } from './workspaceSessions'
/** Preserve legacy visibility once; all newly created workspaces use explicit empty membership. */
export function initializeWorkspaceContents(
  state: WorkspaceSessions,
  projects: Project[],
): WorkspaceSessions {
  return {
    ...state,
    items: state.items.map((item) =>
      item.projectIds === undefined
        ? { ...item, projectIds: projects.map((project) => project.id) }
        : item,
    ),
  }
}
export function workspaceProjects(
  item: SavedWorkspace,
  projects: Project[],
): Project[] {
  const ids = new Set(item.projectIds ?? projects.map((project) => project.id))
  return projects
    .filter((project) => ids.has(project.id))
    .map((project) =>
      item.projectPresentations &&
      Object.hasOwn(item.projectPresentations, project.id)
        ? { ...project, presentation: item.projectPresentations[project.id] }
        : project,
    )
}
