export type WorkspaceLayout = {
  sidebarOpen: boolean
  sidebarWidth: number
  filesOpen: boolean
  filesWidth: number
  rightPanel: 'none' | 'ai' | 'properties'
  rightWidth: number
}

export const LAYOUT_STORAGE_KEY = 'canvas-live.layout.v1'
export const PANEL_LIMITS = {
  sidebar: { min: 180, max: 360, default: 246 },
  files: { min: 160, max: 340, default: 200 },
  right: { min: 220, max: 420, default: 280 },
} as const
export const DEFAULT_LAYOUT: WorkspaceLayout = {
  sidebarOpen: true,
  sidebarWidth: PANEL_LIMITS.sidebar.default,
  filesOpen: true,
  filesWidth: PANEL_LIMITS.files.default,
  rightPanel: 'none',
  rightWidth: PANEL_LIMITS.right.default,
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
    if (!raw || raw.length > 3000) return { ...DEFAULT_LAYOUT }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return { ...DEFAULT_LAYOUT }
    const candidate = value as Record<string, unknown>
    return {
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
      rightPanel:
        candidate.rightPanel === 'ai' || candidate.rightPanel === 'properties'
          ? candidate.rightPanel
          : 'none',
      rightWidth:
        typeof candidate.rightWidth === 'number'
          ? boundedPanelWidth(candidate.rightWidth, 'right')
          : DEFAULT_LAYOUT.rightWidth,
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function loadLayout(): WorkspaceLayout {
  try {
    return parseLayout(localStorage.getItem(LAYOUT_STORAGE_KEY))
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
