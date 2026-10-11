export type Preferences = {
  mode: 'system' | 'light' | 'dark'
  accent: string
  density: 'comfortable' | 'compact'
  grid: 'dots' | 'lines' | 'none'
  reduceMotion: boolean
  contrast: number
  backgroundColor: string | null
  surfaceColor: string | null
  textColor: string | null
  borderColor: string | null
  gridColor: string | null
  motionStyle: 'subtle' | 'smooth'
  motionSpeed: 'slow' | 'normal' | 'fast'
}

export type Project = {
  id: string
  name: string
  createdAt: number
  lastOpenedAt: number
}

export type WorkspaceState = {
  version: 1
  preferences: Preferences
  projects: Project[]
  lastProjectId: string | null
}

export const STORAGE_KEY = 'canvas-live.workspace.v1'

export const DEFAULT_PREFERENCES: Preferences = {
  mode: 'system',
  accent: '#7C5CFC',
  density: 'comfortable',
  grid: 'dots',
  reduceMotion: false,
  contrast: 50,
  backgroundColor: null,
  surfaceColor: null,
  textColor: null,
  borderColor: null,
  gridColor: null,
  motionStyle: 'subtle',
  motionSpeed: 'normal',
}

export const EMPTY_STATE: WorkspaceState = {
  version: 1,
  preferences: { ...DEFAULT_PREFERENCES },
  projects: [],
  lastProjectId: null,
}

const MAX_PROJECTS = 100
const MAX_NAME_LENGTH = 80

function emptyState(): WorkspaceState {
  return {
    ...EMPTY_STATE,
    preferences: { ...DEFAULT_PREFERENCES },
    projects: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  )
}

function isId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  )
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null
}

function isOptionalColor(value: unknown): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value))
  )
}

function validateWorkspace(value: unknown): WorkspaceState | null {
  if (!isRecord(value) || value.version !== 1) return null
  const preferences = value.preferences
  if (
    !isRecord(preferences) ||
    typeof preferences.mode !== 'string' ||
    !['system', 'light', 'dark'].includes(preferences.mode) ||
    typeof preferences.accent !== 'string' ||
    !/^#[\da-f]{6}$/iu.test(preferences.accent) ||
    typeof preferences.density !== 'string' ||
    !['comfortable', 'compact'].includes(preferences.density) ||
    typeof preferences.grid !== 'string' ||
    !['dots', 'lines', 'none'].includes(preferences.grid) ||
    typeof preferences.reduceMotion !== 'boolean' ||
    (preferences.contrast !== undefined &&
      (typeof preferences.contrast !== 'number' ||
        !Number.isInteger(preferences.contrast) ||
        preferences.contrast < 0 ||
        preferences.contrast > 100)) ||
    !isOptionalColor(preferences.backgroundColor) ||
    !isOptionalColor(preferences.surfaceColor) ||
    !isOptionalColor(preferences.textColor) ||
    !isOptionalColor(preferences.borderColor) ||
    !isOptionalColor(preferences.gridColor) ||
    (preferences.motionStyle !== undefined &&
      (typeof preferences.motionStyle !== 'string' ||
        !['subtle', 'smooth'].includes(preferences.motionStyle))) ||
    (preferences.motionSpeed !== undefined &&
      (typeof preferences.motionSpeed !== 'string' ||
        !['slow', 'normal', 'fast'].includes(preferences.motionSpeed))) ||
    !Array.isArray(value.projects) ||
    value.projects.length > MAX_PROJECTS
  ) {
    return null
  }

  const projects: Project[] = []
  const ids = new Set<string>()
  for (const item of value.projects) {
    if (!isRecord(item)) return null
    const name = normalizedName(item.name)
    if (
      !isId(item.id) ||
      ids.has(item.id) ||
      name === null ||
      !isTimestamp(item.createdAt) ||
      !isTimestamp(item.lastOpenedAt) ||
      item.lastOpenedAt < item.createdAt
    ) {
      return null
    }
    ids.add(item.id)
    projects.push({
      id: item.id,
      name,
      createdAt: item.createdAt,
      lastOpenedAt: item.lastOpenedAt,
    })
  }

  if (
    value.lastProjectId !== null &&
    (!isId(value.lastProjectId) || !ids.has(value.lastProjectId))
  ) {
    return null
  }

  return {
    version: 1,
    preferences: {
      mode: preferences.mode as Preferences['mode'],
      accent: preferences.accent,
      density: preferences.density as Preferences['density'],
      grid: preferences.grid as Preferences['grid'],
      reduceMotion: preferences.reduceMotion,
      contrast:
        (preferences.contrast as number | undefined) ??
        DEFAULT_PREFERENCES.contrast,
      backgroundColor: preferences.backgroundColor ?? null,
      surfaceColor: preferences.surfaceColor ?? null,
      textColor: preferences.textColor ?? null,
      borderColor: preferences.borderColor ?? null,
      gridColor: preferences.gridColor ?? null,
      motionStyle:
        (preferences.motionStyle as Preferences['motionStyle'] | undefined) ??
        DEFAULT_PREFERENCES.motionStyle,
      motionSpeed:
        (preferences.motionSpeed as Preferences['motionSpeed'] | undefined) ??
        DEFAULT_PREFERENCES.motionSpeed,
    },
    projects,
    lastProjectId: value.lastProjectId as string | null,
  }
}

export function parseWorkspace(raw: string | null): WorkspaceState {
  if (raw === null || raw.length > 500_000) return emptyState()
  try {
    return validateWorkspace(JSON.parse(raw)) ?? emptyState()
  } catch {
    return emptyState()
  }
}

export function loadWorkspace(): WorkspaceState {
  try {
    return parseWorkspace(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null)
  } catch {
    return emptyState()
  }
}

export function persistWorkspace(state: WorkspaceState): boolean {
  try {
    const validated = validateWorkspace(state)
    if (!validated || !globalThis.localStorage) return false
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
    return true
  } catch {
    return false
  }
}

function requireName(name: string): string {
  const normalized = normalizedName(name)
  if (normalized === null) {
    throw new Error('Enter a project name between 1 and 80 characters.')
  }
  return normalized
}

function requireTimestamp(now: number): number {
  if (!isTimestamp(now)) throw new Error('The project date is invalid.')
  return now
}

function newProjectId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

function latestTimestamp(state: WorkspaceState, now: number): number {
  return Math.max(now, ...state.projects.map((project) => project.lastOpenedAt))
}

export function createProject(
  state: WorkspaceState,
  name: string,
  now = Date.now(),
  id = newProjectId(),
): WorkspaceState {
  const normalized = requireName(name)
  const createdAt = requireTimestamp(now)
  if (state.projects.length >= MAX_PROJECTS) {
    throw new Error('You have reached the limit of 100 projects.')
  }
  if (!isId(id) || state.projects.some((project) => project.id === id)) {
    throw new Error('This project could not be created. Please try again.')
  }
  const project: Project = {
    id,
    name: normalized,
    createdAt,
    lastOpenedAt: latestTimestamp(state, createdAt),
  }
  return { ...state, projects: [...state.projects, project], lastProjectId: id }
}

export function openProject(
  state: WorkspaceState,
  id: string,
  now = Date.now(),
): WorkspaceState {
  if (!state.projects.some((project) => project.id === id)) return state
  const lastOpenedAt = latestTimestamp(state, requireTimestamp(now))
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === id ? { ...project, lastOpenedAt } : project,
    ),
    lastProjectId: id,
  }
}

export function renameProject(
  state: WorkspaceState,
  id: string,
  name: string,
): WorkspaceState {
  if (!state.projects.some((project) => project.id === id)) return state
  const normalized = requireName(name)
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === id ? { ...project, name: normalized } : project,
    ),
  }
}

export function recentProjects(state: WorkspaceState): Project[] {
  return [...state.projects].sort(
    (left, right) =>
      right.lastOpenedAt - left.lastOpenedAt ||
      Number(right.id === state.lastProjectId) -
        Number(left.id === state.lastProjectId),
  )
}
