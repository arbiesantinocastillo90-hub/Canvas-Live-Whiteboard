import {
  DEFAULT_CANVAS_CONTROLS,
  normalizeCanvasControls,
  type CanvasControlSettings,
} from './canvasControls'
import {
  DEFAULT_WORKSPACE_APPEARANCE,
  normalizeWorkspaceAppearance,
  type WorkspaceAppearance,
} from './workspaceAppearance'
import {
  normalizeItemPresentation,
  type ItemPresentation,
} from './itemPresentation'
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
  motionScale: number
  motionEasing: 'standard' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  motionEffect: 'flow' | 'fade' | 'pop'
  railButtonBackground: boolean
  autoGrowShapes: boolean
  fitTextToShape: boolean
  minTextSize: number
  canvasControls: CanvasControlSettings
  homeAppearance: WorkspaceAppearance
}

export type Project = {
  id: string
  name: string
  createdAt: number
  lastOpenedAt: number
  updatedAt?: number
  presentation?: ItemPresentation
  parentId?: string | null
  pinned?: boolean
  recentHidden?: boolean
}

export type WorkspaceState = {
  version: 1
  preferences: Preferences
  projects: Project[]
  lastProjectId: string | null
  projectRecentsCollapsed?: boolean
}

export const STORAGE_KEY = 'canvas-live.workspace.v1'
export const STORAGE_BACKUP_KEY = 'canvas-live.workspace.last-good.v1'

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
  motionScale: 100,
  motionEasing: 'standard',
  motionEffect: 'flow',
  railButtonBackground: true,
  autoGrowShapes: true,
  fitTextToShape: true,
  minTextSize: 8,
  canvasControls: { ...DEFAULT_CANVAS_CONTROLS },
  homeAppearance: { ...DEFAULT_WORKSPACE_APPEARANCE },
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

function optionalColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value)
    ? value
    : null
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
      ...(isTimestamp(item.updatedAt) && item.updatedAt >= item.createdAt
        ? { updatedAt: item.updatedAt }
        : {}),
      ...(isRecord(item.presentation)
        ? {
            presentation: normalizeItemPresentation(
              item.presentation,
              'folder',
            ),
          }
        : {}),
      ...(item.parentId === null || isId(item.parentId)
        ? { parentId: item.parentId }
        : {}),
      ...(typeof item.pinned === 'boolean' ? { pinned: item.pinned } : {}),
      ...(typeof item.recentHidden === 'boolean'
        ? { recentHidden: item.recentHidden }
        : {}),
    })
  }

  // A damaged optional organizer link must not discard valid project IDs or
  // their files. Flatten dangling links and every member of a parent cycle.
  const byId = new Map(projects.map((project) => [project.id, project]))
  for (const project of projects) {
    const path: string[] = []
    let current: Project | undefined = project
    while (current?.parentId) {
      const cycleAt = path.indexOf(current.id)
      if (cycleAt >= 0) {
        for (const id of path.slice(cycleAt)) byId.get(id)!.parentId = null
        break
      }
      path.push(current.id)
      if (!byId.has(current.parentId)) {
        current.parentId = null
        break
      }
      current = byId.get(current.parentId)
    }
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
        typeof preferences.contrast === 'number' &&
        Number.isInteger(preferences.contrast) &&
        preferences.contrast >= 0 &&
        preferences.contrast <= 100
          ? preferences.contrast
          : DEFAULT_PREFERENCES.contrast,
      backgroundColor: optionalColor(preferences.backgroundColor),
      surfaceColor: optionalColor(preferences.surfaceColor),
      textColor: optionalColor(preferences.textColor),
      borderColor: optionalColor(preferences.borderColor),
      gridColor: optionalColor(preferences.gridColor),
      motionStyle: preferences.motionStyle === 'smooth' ? 'smooth' : 'subtle',
      motionSpeed:
        preferences.motionSpeed === 'slow' || preferences.motionSpeed === 'fast'
          ? preferences.motionSpeed
          : 'normal',
      motionScale:
        typeof preferences.motionScale === 'number' &&
        Number.isInteger(preferences.motionScale) &&
        preferences.motionScale >= 25 &&
        preferences.motionScale <= 200
          ? preferences.motionScale
          : DEFAULT_PREFERENCES.motionScale,
      motionEasing:
        typeof preferences.motionEasing === 'string' &&
        ['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(
          preferences.motionEasing,
        )
          ? (preferences.motionEasing as Preferences['motionEasing'])
          : DEFAULT_PREFERENCES.motionEasing,
      motionEffect:
        preferences.motionEffect === 'fade' ||
        preferences.motionEffect === 'pop'
          ? preferences.motionEffect
          : DEFAULT_PREFERENCES.motionEffect,
      railButtonBackground:
        typeof preferences.railButtonBackground === 'boolean'
          ? preferences.railButtonBackground
          : DEFAULT_PREFERENCES.railButtonBackground,
      autoGrowShapes:
        typeof preferences.autoGrowShapes === 'boolean'
          ? preferences.autoGrowShapes
          : DEFAULT_PREFERENCES.autoGrowShapes,
      fitTextToShape:
        typeof preferences.fitTextToShape === 'boolean'
          ? preferences.fitTextToShape
          : DEFAULT_PREFERENCES.fitTextToShape,
      canvasControls: normalizeCanvasControls(preferences.canvasControls),
      homeAppearance: normalizeWorkspaceAppearance(preferences.homeAppearance),
      minTextSize:
        typeof preferences.minTextSize === 'number' &&
        Number.isFinite(preferences.minTextSize) &&
        preferences.minTextSize >= 8 &&
        preferences.minTextSize <= 32
          ? preferences.minTextSize
          : DEFAULT_PREFERENCES.minTextSize,
    },
    projects,
    lastProjectId:
      isId(value.lastProjectId) && ids.has(value.lastProjectId)
        ? value.lastProjectId
        : null,
    ...(typeof value.projectRecentsCollapsed === 'boolean'
      ? { projectRecentsCollapsed: value.projectRecentsCollapsed }
      : {}),
  }
}

function validatedWorkspaceText(raw: string | null): WorkspaceState | null {
  if (raw === null || raw.length > 500_000) return null
  try {
    return validateWorkspace(JSON.parse(raw))
  } catch {
    return null
  }
}

export function parseWorkspace(raw: string | null): WorkspaceState {
  return validatedWorkspaceText(raw) ?? emptyState()
}

export function loadWorkspace(): WorkspaceState {
  try {
    const storage = globalThis.localStorage
    if (!storage) return emptyState()
    for (const key of [STORAGE_KEY, STORAGE_BACKUP_KEY]) {
      try {
        const state = validatedWorkspaceText(storage.getItem(key))
        if (state) return state
      } catch {
        /* A failed primary read must not prevent backup recovery. */
      }
    }
    return emptyState()
  } catch {
    return emptyState()
  }
}

export function persistWorkspace(state: WorkspaceState): boolean {
  try {
    const validated = validateWorkspace(state)
    if (!validated || !globalThis.localStorage) return false
    const serialized = JSON.stringify(validated)
    globalThis.localStorage.setItem(STORAGE_KEY, serialized)
    // Keep an independent last-good metadata copy. The main write remains
    // usable if storage has enough room for only one copy.
    try {
      globalThis.localStorage.setItem(STORAGE_BACKUP_KEY, serialized)
    } catch {
      /* The primary write already succeeded. */
    }
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
  parentId?: string | null,
): WorkspaceState {
  const normalized = requireName(name)
  const createdAt = requireTimestamp(now)
  if (state.projects.length >= MAX_PROJECTS) {
    throw new Error('You have reached the limit of 100 projects.')
  }
  if (!isId(id) || state.projects.some((project) => project.id === id)) {
    throw new Error('This project could not be created. Please try again.')
  }
  if (
    parentId !== undefined &&
    parentId !== null &&
    !state.projects.some((project) => project.id === parentId)
  ) {
    throw new Error('Choose an existing parent project.')
  }
  const project: Project = {
    id,
    name: normalized,
    createdAt,
    lastOpenedAt: latestTimestamp(state, createdAt),
    ...(parentId !== undefined ? { parentId } : {}),
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
      project.id === id
        ? { ...project, lastOpenedAt, recentHidden: false }
        : project,
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
  return state.projects
    .filter((project) => !project.recentHidden || project.pinned)
    .sort(
      (left, right) =>
        Number(!!right.pinned) - Number(!!left.pinned) ||
        right.lastOpenedAt - left.lastOpenedAt ||
        Number(right.id === state.lastProjectId) -
          Number(left.id === state.lastProjectId),
    )
}

export function projectDescendants(
  projects: Project[],
  id: string,
): Set<string> {
  const descendants = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const project of projects) {
      if (
        project.parentId &&
        descendants.has(project.parentId) &&
        !descendants.has(project.id)
      ) {
        descendants.add(project.id)
        changed = true
      }
    }
  }
  return descendants
}

export function moveProject(
  state: WorkspaceState,
  id: string,
  parentId: string | null,
): WorkspaceState {
  if (!state.projects.some((project) => project.id === id)) return state
  if (
    parentId !== null &&
    !state.projects.some((project) => project.id === parentId)
  )
    throw new Error('Choose an existing parent project.')
  if (parentId !== null && projectDescendants(state.projects, id).has(parentId))
    throw new Error('A project cannot be nested inside itself or its children.')
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === id ? { ...project, parentId } : project,
    ),
  }
}

export function pinProject(
  state: WorkspaceState,
  id: string,
  pinned: boolean,
): WorkspaceState {
  if (!state.projects.some((project) => project.id === id)) return state
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === id
        ? { ...project, pinned, ...(pinned ? { recentHidden: false } : {}) }
        : project,
    ),
  }
}

export function hideRecentProject(
  state: WorkspaceState,
  id: string,
): WorkspaceState {
  if (!state.projects.some((project) => project.id === id)) return state
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === id
        ? { ...project, pinned: false, recentHidden: true }
        : project,
    ),
  }
}

export function projectTree(
  projects: Project[],
): { project: Project; depth: number }[] {
  const output: { project: Project; depth: number }[] = []
  const visited = new Set<string>()
  function visit(project: Project, depth: number) {
    if (visited.has(project.id)) return
    visited.add(project.id)
    output.push({ project, depth })
    for (const child of projects.filter(
      (entry) => entry.parentId === project.id,
    ))
      visit(child, depth + 1)
  }
  for (const project of projects.filter(
    (entry) =>
      !entry.parentId ||
      !projects.some((parent) => parent.id === entry.parentId),
  ))
    visit(project, 0)
  for (const project of projects) visit(project, 0)
  return output
}
