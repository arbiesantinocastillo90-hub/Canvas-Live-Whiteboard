import { DEFAULT_LAYOUT, parseLayout, type WorkspaceLayout } from './layout'
import { parseWorkspace, type Preferences } from './workspace'
import {
  normalizeItemPresentation,
  type ItemPresentation,
} from './itemPresentation'

export type TabPresentation = {
  id: string
  pinned: boolean
  compact: boolean
  groupId: string | null
}
export type TabGroup = { id: string; name: string; collapsed: boolean }
export type FileShortcut = { id: string; pinned: boolean; hidden: boolean }
export type ProjectViewSession = {
  openIds: string[]
  recentIds: string[]
  activeId: string | null
  tabs: TabPresentation[]
  groups: TabGroup[]
  shortcuts: FileShortcut[]
  recentsCollapsed: boolean
  editorSession: { tool: string; activeLayerId: string | null } | null
}
export type SavedWorkspace = {
  projectIds?: string[]
  projectPresentations?: Record<string, ItemPresentation>
  filePresentations?: Record<string, ItemPresentation>
  createdAt?: number
  updatedAt?: number
  lastOpenedAt?: number
  id: string
  name: string
  projectId: string | null
  preferences: Preferences
  layout: WorkspaceLayout
  views: Record<string, ProjectViewSession>
}
export type WorkspaceSessions = {
  version: 1
  activeId: string
  items: SavedWorkspace[]
}
export const SESSIONS_STORAGE_KEY = 'canvas-live.sessions.v1'
export const WORKSPACE_FILE_EXTENSION = '.CLW'
export const WORKSPACE_FILE_ACCEPT = '.CLW,.clw,.lworkspace,application/json'
export function workspaceExportFilename(workspaceName: string): string {
  const safe = Array.from(name(workspaceName))
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        ? '-'
        : character,
    )
    .join('')
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/[. ]+$/u, '')
    .replace(/(?:\.(?:lworkspace|clw))+$/iu, '')
  const base = safe || 'Workspace'
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(base) ? `Workspace-${base}` : base}${WORKSPACE_FILE_EXTENSION}`
}
export const EMPTY_PROJECT_VIEW: ProjectViewSession = {
  openIds: [],
  recentIds: [],
  activeId: null,
  tabs: [],
  groups: [],
  shortcuts: [],
  recentsCollapsed: false,
  editorSession: null,
}
const MAX_ITEMS = 100
const MAX_REFERENCES = 1000
const MAX_BYTES = 2 * 1024 * 1024
const tools = [
  'select',
  'pan',
  'rectangle',
  'ellipse',
  'diamond',
  'text',
  'area',
  'connect',
]
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    !Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
  )
}
function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80)
    throw new Error('Enter a workspace name between 1 and 80 characters.')
  return value.trim()
}
export function normalizeProjectView(value: unknown): ProjectViewSession {
  if (!record(value)) return { ...EMPTY_PROJECT_VIEW }
  const openIds = Array.isArray(value.openIds)
    ? [...new Set(value.openIds.filter(validId))].slice(0, MAX_REFERENCES)
    : []
  const recentIds = Array.isArray(value.recentIds)
    ? [...new Set(value.recentIds.filter(validId))].slice(0, MAX_REFERENCES)
    : []
  const groups: TabGroup[] = []
  for (const item of Array.isArray(value.groups)
    ? value.groups.slice(0, MAX_REFERENCES)
    : []) {
    if (
      record(item) &&
      validId(item.id) &&
      typeof item.name === 'string' &&
      item.name.trim() &&
      item.name.trim().length <= 80 &&
      !groups.some((group) => group.id === item.id)
    )
      groups.push({
        id: item.id,
        name: item.name.trim(),
        collapsed: item.collapsed === true,
      })
  }
  const tabs: TabPresentation[] = []
  for (const item of Array.isArray(value.tabs)
    ? value.tabs.slice(0, MAX_REFERENCES)
    : []) {
    if (
      record(item) &&
      validId(item.id) &&
      openIds.includes(item.id) &&
      !tabs.some((tab) => tab.id === item.id)
    )
      tabs.push({
        id: item.id,
        pinned: item.pinned === true,
        compact: item.compact === true,
        groupId: groups.some((group) => group.id === item.groupId)
          ? (item.groupId as string)
          : null,
      })
  }
  const shortcuts: FileShortcut[] = []
  for (const item of Array.isArray(value.shortcuts)
    ? value.shortcuts.slice(0, MAX_REFERENCES)
    : []) {
    if (
      record(item) &&
      validId(item.id) &&
      !shortcuts.some((shortcut) => shortcut.id === item.id)
    )
      shortcuts.push({
        id: item.id,
        pinned: item.pinned === true,
        hidden: item.hidden === true,
      })
  }
  const editorSession =
    record(value.editorSession) &&
    typeof value.editorSession.tool === 'string' &&
    tools.includes(value.editorSession.tool)
      ? {
          tool: value.editorSession.tool,
          activeLayerId: validId(value.editorSession.activeLayerId)
            ? value.editorSession.activeLayerId
            : null,
        }
      : null
  return {
    openIds,
    recentIds,
    activeId:
      validId(value.activeId) && openIds.includes(value.activeId)
        ? value.activeId
        : (openIds[0] ?? null),
    tabs,
    groups,
    shortcuts,
    recentsCollapsed: value.recentsCollapsed === true,
    editorSession,
  }
}
function validDate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  )
}
function normalizeSavedWorkspace(value: unknown): SavedWorkspace | null {
  if (!record(value) || !validId(value.id)) return null
  if (
    value.projectIds !== undefined &&
    (!Array.isArray(value.projectIds) ||
      value.projectIds.length > 100 ||
      !value.projectIds.every(validId) ||
      new Set(value.projectIds).size !== value.projectIds.length)
  )
    return null
  try {
    const preferences = parseWorkspace(
      JSON.stringify({
        version: 1,
        preferences: value.preferences,
        projects: [],
        lastProjectId: null,
      }),
    ).preferences
    const views: Record<string, ProjectViewSession> = {}
    if (record(value.views))
      for (const [id, view] of Object.entries(value.views).slice(0, MAX_ITEMS))
        if (validId(id)) views[id] = normalizeProjectView(view)
    return {
      id: value.id,
      ...(Array.isArray(value.projectIds)
        ? {
            projectIds: [...new Set(value.projectIds.filter(validId))].slice(
              0,
              100,
            ),
          }
        : {}),
      ...(record(value.projectPresentations)
        ? {
            projectPresentations: Object.fromEntries(
              Object.entries(value.projectPresentations)
                .filter(([id]) => validId(id))
                .slice(0, 100)
                .map(([id, presentation]) => [
                  id,
                  normalizeItemPresentation(presentation, 'folder'),
                ]),
            ),
          }
        : {}),
      ...(record(value.filePresentations)
        ? {
            filePresentations: Object.fromEntries(
              Object.entries(value.filePresentations)
                .filter(([id]) => validId(id))
                .slice(0, 1000)
                .map(([id, presentation]) => [
                  id,
                  normalizeItemPresentation(presentation, 'canvas'),
                ]),
            ),
          }
        : {}),
      ...(validDate(value.createdAt) ? { createdAt: value.createdAt } : {}),
      ...(validDate(value.updatedAt) ? { updatedAt: value.updatedAt } : {}),
      ...(validDate(value.lastOpenedAt)
        ? { lastOpenedAt: value.lastOpenedAt }
        : {}),
      name: name(value.name),
      projectId: validId(value.projectId) ? value.projectId : null,
      preferences,
      layout: parseLayout(JSON.stringify(value.layout)),
      views,
    }
  } catch {
    return null
  }
}
export function createSavedWorkspace(
  preferences: Preferences,
  layout = DEFAULT_LAYOUT,
  projectId: string | null = null,
  workspaceName = 'Default',
  id: string = crypto.randomUUID(),
): SavedWorkspace {
  if (!validId(id)) throw new Error('Invalid workspace identifier.')
  const now = Date.now()
  return {
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    id,
    name: name(workspaceName),
    preferences: { ...preferences },
    layout: { ...layout },
    projectId,
    views: {},
  }
}
function parseSessions(raw: string | null): WorkspaceSessions | null {
  if (!raw || raw.length > MAX_BYTES) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !record(value) ||
      value.version !== 1 ||
      !Array.isArray(value.items) ||
      value.items.length > MAX_ITEMS
    )
      return null
    const items: SavedWorkspace[] = []
    for (const candidate of value.items) {
      const item = normalizeSavedWorkspace(candidate)
      if (item && !items.some((existing) => existing.id === item.id))
        items.push(item)
    }
    if (!items.length) return null
    return {
      version: 1,
      activeId: items.some((item) => item.id === value.activeId)
        ? (value.activeId as string)
        : items[0].id,
      items,
    }
  } catch {
    return null
  }
}
export function loadWorkspaceSessions(
  preferences: Preferences,
  layout: WorkspaceLayout,
  projectId: string | null,
): WorkspaceSessions {
  for (const key of [SESSIONS_STORAGE_KEY, `${SESSIONS_STORAGE_KEY}.backup`]) {
    try {
      const parsed = parseSessions(localStorage.getItem(key))
      if (parsed) return parsed
    } catch {
      /* A failed primary read must not prevent backup recovery. */
    }
  }
  const initial = createSavedWorkspace(preferences, layout, projectId)
  return { version: 1, activeId: initial.id, items: [initial] }
}
export function persistWorkspaceSessions(state: WorkspaceSessions): boolean {
  try {
    const serialized = JSON.stringify(state)
    const normalized = parseSessions(serialized)
    if (
      !normalized ||
      normalized.items.length !== state.items.length ||
      serialized.length > MAX_BYTES
    )
      return false
    const previous = localStorage.getItem(SESSIONS_STORAGE_KEY)
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(normalized))
    if (parseSessions(previous)) {
      try {
        localStorage.setItem(`${SESSIONS_STORAGE_KEY}.backup`, previous!)
      } catch {
        /* The primary commit remains valid if backup storage is full. */
      }
    }
    return true
  } catch {
    return false
  }
}
export function updateSavedWorkspace(
  state: WorkspaceSessions,
  id: string,
  patch: Partial<Omit<SavedWorkspace, 'id'>>,
): WorkspaceSessions {
  const items = state.items.map((item) => {
    if (item.id !== id) return item
    const next = normalizeSavedWorkspace({ ...item, ...patch })
    const previous = normalizeSavedWorkspace(item) ?? item
    if (!next || JSON.stringify(next) === JSON.stringify(previous)) return item
    const meaningful = Object.keys(patch).some(
      (key) =>
        key !== 'lastOpenedAt' &&
        key !== 'updatedAt' &&
        JSON.stringify(Reflect.get(previous, key)) !==
          JSON.stringify(Reflect.get(next, key)),
    )
    return meaningful ? { ...next, updatedAt: Date.now() } : next
  })
  return { ...state, items }
}
export function addSavedWorkspace(
  state: WorkspaceSessions,
  workspace: SavedWorkspace,
): WorkspaceSessions {
  if (state.items.length >= MAX_ITEMS)
    throw new Error('You have reached 100 saved workspaces.')
  const item = normalizeSavedWorkspace(workspace)
  if (!item || state.items.some((existing) => existing.id === item.id))
    throw new Error('Invalid or duplicate workspace.')
  return { ...state, activeId: item.id, items: [...state.items, item] }
}
export function serializeSavedWorkspace(workspace: SavedWorkspace): string {
  const normalized = normalizeSavedWorkspace(workspace)
  if (!normalized) throw new Error('This workspace cannot be exported.')
  const text = JSON.stringify(
    { format: 'CanvasLiveWorkspace', version: 1, workspace: normalized },
    null,
    2,
  )
  if (text.length > MAX_BYTES)
    throw new Error('The workspace exceeds the export size limit.')
  return text
}
export function parseSavedWorkspace(
  raw: string,
  id: string = crypto.randomUUID(),
): SavedWorkspace {
  if (raw.length > MAX_BYTES)
    throw new Error('The workspace exceeds the import size limit.')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Invalid workspace file.')
  }
  if (
    !record(value) ||
    value.format !== 'CanvasLiveWorkspace' ||
    value.version !== 1
  )
    throw new Error(
      'Choose a Canvas Live .CLW file (legacy .lworkspace is also supported).',
    )
  const workspace = normalizeSavedWorkspace(value.workspace)
  if (!workspace || !validId(id)) throw new Error('Invalid workspace file.')
  return { ...workspace, id }
}
export function orderedTabs(ids: string[], tabs: TabPresentation[]): string[] {
  return [...ids].sort(
    (a, b) =>
      Number(tabs.find((tab) => tab.id === b)?.pinned ?? false) -
      Number(tabs.find((tab) => tab.id === a)?.pinned ?? false),
  )
}
