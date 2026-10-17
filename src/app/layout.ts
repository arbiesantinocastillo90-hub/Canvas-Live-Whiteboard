import {
  DEFAULT_HOME_VIEW,
  DEFAULT_WORKSPACE_VIEW,
  normalizeHomeView,
  normalizeWorkspaceLibraryView,
  type HomeLibraryView,
  type WorkspaceLibraryView,
} from './homeView'
export type WorkspaceLayout = {
  sidebarOpen: boolean
  sidebarWidth: number
  filesOpen: boolean
  filesWidth: number
  leftPanel: 'files' | 'projects' | 'workspaces'
  leftPinned: boolean
  rightPanel: 'none' | 'ai' | 'properties' | 'tools'
  rightPinned: boolean
  rightWidth: number
  panelsSwapped: boolean
  autoHidePanels: boolean
  autoHideDelay: number
  autoHideTabs: boolean
  autoHideStatus: boolean
  ribbonWidth: number
  controlsWidth: number
  tabBarHeight: number
  statusBarHeight: number
  allProjectsCollapsed: boolean
  homeView: HomeLibraryView
  workspaceView: WorkspaceLibraryView
}

export const LAYOUT_STORAGE_KEY = 'canvas-live.layout.v2'
export const PANEL_LIMITS = {
  sidebar: { min: 180, max: 360, default: 246 },
  files: { min: 160, max: 420, default: 260 },
  right: { min: 220, max: 420, default: 300 },
} as const
export const CHROME_LIMITS = {
  ribbonWidth: { min: 36, max: 76, default: 44 },
  controlsWidth: { min: 34, max: 70, default: 42 },
  tabBarHeight: { min: 32, max: 68, default: 40 },
  statusBarHeight: { min: 22, max: 48, default: 22 },
} as const
export const DEFAULT_LAYOUT: WorkspaceLayout = {
  sidebarOpen: true,
  sidebarWidth: PANEL_LIMITS.sidebar.default,
  filesOpen: false,
  filesWidth: PANEL_LIMITS.files.default,
  leftPanel: 'files',
  leftPinned: false,
  rightPanel: 'none',
  rightPinned: false,
  rightWidth: PANEL_LIMITS.right.default,
  panelsSwapped: false,
  autoHidePanels: true,
  autoHideDelay: 280,
  autoHideTabs: false,
  autoHideStatus: false,
  ribbonWidth: CHROME_LIMITS.ribbonWidth.default,
  controlsWidth: CHROME_LIMITS.controlsWidth.default,
  tabBarHeight: CHROME_LIMITS.tabBarHeight.default,
  statusBarHeight: CHROME_LIMITS.statusBarHeight.default,
  allProjectsCollapsed: false,
  homeView: { ...DEFAULT_HOME_VIEW },
  workspaceView: { ...DEFAULT_WORKSPACE_VIEW },
}

export function boundedChromeSize(
  value: number,
  dimension: keyof typeof CHROME_LIMITS,
) {
  const limits = CHROME_LIMITS[dimension]
  return Number.isFinite(value)
    ? Math.round(Math.max(limits.min, Math.min(limits.max, value)))
    : limits.default
}

export function boundedAutoHideDelay(value: number) {
  return Number.isFinite(value)
    ? Math.round(Math.max(0, Math.min(2000, value)))
    : DEFAULT_LAYOUT.autoHideDelay
}

export function boundedPanelWidth(
  value: number,
  panel: keyof typeof PANEL_LIMITS,
) {
  const limits = PANEL_LIMITS[panel]
  return Number.isFinite(value)
    ? Math.round(Math.max(limits.min, Math.min(limits.max, value)))
    : limits.default
}

export function parseLayout(raw: string | null): WorkspaceLayout {
  try {
    if (!raw || raw.length > 32000) return { ...DEFAULT_LAYOUT }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return { ...DEFAULT_LAYOUT }
    const candidate = value as Record<string, unknown>
    return {
      allProjectsCollapsed: candidate.allProjectsCollapsed === true,
      homeView: normalizeHomeView(candidate.homeView),
      workspaceView: normalizeWorkspaceLibraryView(candidate.workspaceView),
      sidebarOpen:
        typeof candidate.sidebarOpen === 'boolean'
          ? candidate.sidebarOpen
          : DEFAULT_LAYOUT.sidebarOpen,
      sidebarWidth:
        typeof candidate.sidebarWidth === 'number'
          ? boundedPanelWidth(candidate.sidebarWidth, 'sidebar')
          : DEFAULT_LAYOUT.sidebarWidth,
      filesOpen:
        typeof candidate.filesOpen === 'boolean'
          ? candidate.filesOpen
          : DEFAULT_LAYOUT.filesOpen,
      filesWidth:
        typeof candidate.filesWidth === 'number'
          ? boundedPanelWidth(candidate.filesWidth, 'files')
          : DEFAULT_LAYOUT.filesWidth,
      leftPanel:
        candidate.leftPanel === 'projects' ||
        candidate.leftPanel === 'workspaces'
          ? candidate.leftPanel
          : 'files',
      leftPinned: candidate.leftPinned === true,
      rightPanel:
        candidate.rightPanel === 'ai' ||
        candidate.rightPanel === 'properties' ||
        candidate.rightPanel === 'tools'
          ? candidate.rightPanel
          : 'none',
      rightPinned: candidate.rightPinned === true,
      rightWidth:
        typeof candidate.rightWidth === 'number'
          ? boundedPanelWidth(candidate.rightWidth, 'right')
          : DEFAULT_LAYOUT.rightWidth,
      panelsSwapped: candidate.panelsSwapped === true,
      autoHidePanels:
        typeof candidate.autoHidePanels === 'boolean'
          ? candidate.autoHidePanels
          : DEFAULT_LAYOUT.autoHidePanels,
      autoHideDelay:
        typeof candidate.autoHideDelay === 'number'
          ? boundedAutoHideDelay(candidate.autoHideDelay)
          : DEFAULT_LAYOUT.autoHideDelay,
      autoHideTabs: candidate.autoHideTabs === true,
      autoHideStatus: candidate.autoHideStatus === true,
      ribbonWidth:
        typeof candidate.ribbonWidth === 'number'
          ? boundedChromeSize(candidate.ribbonWidth, 'ribbonWidth')
          : DEFAULT_LAYOUT.ribbonWidth,
      controlsWidth:
        typeof candidate.controlsWidth === 'number'
          ? boundedChromeSize(candidate.controlsWidth, 'controlsWidth')
          : DEFAULT_LAYOUT.controlsWidth,
      tabBarHeight:
        typeof candidate.tabBarHeight === 'number'
          ? boundedChromeSize(candidate.tabBarHeight, 'tabBarHeight')
          : DEFAULT_LAYOUT.tabBarHeight,
      statusBarHeight:
        typeof candidate.statusBarHeight === 'number'
          ? boundedChromeSize(candidate.statusBarHeight, 'statusBarHeight')
          : DEFAULT_LAYOUT.statusBarHeight,
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function loadLayout(): WorkspaceLayout {
  try {
    const current = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (current !== null) return parseLayout(current)
    const old = localStorage.getItem('canvas-live.layout.v1')
    if (!old) return { ...DEFAULT_LAYOUT }
    // Retain old widths, but begin the revised workspace with unobstructed canvas.
    return { ...parseLayout(old), filesOpen: false, rightPanel: 'none' }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function persistLayout(layout: WorkspaceLayout): boolean {
  try {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify(parseLayout(JSON.stringify(layout))),
    )
    return true
  } catch {
    return false
  }
}
