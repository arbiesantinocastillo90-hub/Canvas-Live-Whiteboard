export type LibrarySort = 'name' | 'created' | 'modified' | 'recent'
export type HomeLibraryView = {
  perspective: 'projects' | 'canvas'
  display: 'cards' | 'hierarchy'
  sort: LibrarySort
  openedProjectId: string | null
  canvasesSection: 'recent' | 'all'
  recentCanvasesCollapsed: boolean
  allCanvasesCollapsed: boolean
  hierarchyCollapsed: boolean
  closedProjectIds: string[]
}
export const DEFAULT_HOME_VIEW: HomeLibraryView = {
  perspective: 'projects',
  display: 'cards',
  sort: 'recent',
  openedProjectId: null,
  canvasesSection: 'all',
  recentCanvasesCollapsed: false,
  allCanvasesCollapsed: false,
  hierarchyCollapsed: true,
  closedProjectIds: [],
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !['__proto__', 'constructor', 'prototype'].includes(value) &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  )
}
function sort(value: unknown): LibrarySort {
  return value === 'name' || value === 'created' || value === 'modified'
    ? value
    : 'recent'
}
export function normalizeHomeView(value: unknown): HomeLibraryView {
  const source = record(value) ? value : {}
  return {
    perspective: source.perspective === 'canvas' ? 'canvas' : 'projects',
    display: source.display === 'hierarchy' ? 'hierarchy' : 'cards',
    sort: sort(source.sort),
    openedProjectId: id(source.openedProjectId) ? source.openedProjectId : null,
    canvasesSection: source.canvasesSection === 'recent' ? 'recent' : 'all',
    recentCanvasesCollapsed: source.recentCanvasesCollapsed === true,
    allCanvasesCollapsed: source.allCanvasesCollapsed === true,
    hierarchyCollapsed: source.hierarchyCollapsed !== false,
    closedProjectIds: Array.isArray(source.closedProjectIds)
      ? [...new Set(source.closedProjectIds.filter(id))].slice(0, 100)
      : [],
  }
}
export type WorkspaceLibraryView = {
  perspective: 'recent' | 'all'
  sort: LibrarySort
}
export const DEFAULT_WORKSPACE_VIEW: WorkspaceLibraryView = {
  perspective: 'all',
  sort: 'recent',
}
export function normalizeWorkspaceLibraryView(
  value: unknown,
): WorkspaceLibraryView {
  const source = record(value) ? value : {}
  return {
    perspective: source.perspective === 'recent' ? 'recent' : 'all',
    sort: sort(source.sort),
  }
}
