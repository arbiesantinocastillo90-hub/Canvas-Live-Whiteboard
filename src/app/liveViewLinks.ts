import type { EditorViewState } from './CanvasEditor'
import {
  CONNECTION_SIDES,
  COORDINATE_LIMIT,
  LCANVAS_MAX_ZOOM,
  LCANVAS_MIN_ZOOM,
  validCanvasId,
  type CanvasViewport,
} from './lcanvas'
import {
  normalizeProjectView,
  parseSavedWorkspace,
  serializeSavedWorkspace,
  type SavedWorkspace,
} from './workspaceSessions'

export type LiveViewState = {
  format: 'CanvasLiveLink'
  version: 2
  workspaceId: string
  workspace: SavedWorkspace
  projectId: string | null
  projectPresentation: Record<
    string,
    { pinned: boolean; recentHidden: boolean; lastOpenedAt: number }
  >
  cameras: Record<string, CanvasViewport>
  activeView: (EditorViewState & { focusMode?: boolean }) | null
  section: 'home' | 'work' | 'options' | 'workspaces'
  updatedAt: number
}
export type LinkOptions = {
  exactEnabled: boolean
  latestEnabled: boolean
  resumeLatest: boolean
  rememberCamera: boolean
  rememberPanels: boolean
}
export const DEFAULT_LINK_OPTIONS: LinkOptions = {
  exactEnabled: true,
  latestEnabled: true,
  resumeLatest: true,
  rememberCamera: true,
  rememberPanels: true,
}
export const LINK_OPTIONS_STORAGE_KEY = 'canvas-live.links.v1'
export const LIVE_LINK_MAX_URL_LENGTH = 128 * 1024
const MAX_PROJECTS = 100
const MAX_CAMERAS = 1000
const MAX_SELECTION = 5000
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

export class LiveViewLinkError extends Error {
  constructor(message = 'This Canvas Live link is invalid or incomplete.') {
    super(message)
    this.name = 'LiveViewLinkError'
  }
}
function fail(message?: string): never {
  throw new LiveViewLinkError(message)
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function id(value: unknown): value is string {
  return (
    validCanvasId(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
  )
}
function timestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  )
}
function viewport(value: unknown): CanvasViewport {
  if (
    !record(value) ||
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    Math.abs(value.x) > COORDINATE_LIMIT ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.y) ||
    Math.abs(value.y) > COORDINATE_LIMIT ||
    typeof value.zoom !== 'number' ||
    !Number.isFinite(value.zoom) ||
    value.zoom < LCANVAS_MIN_ZOOM ||
    value.zoom > LCANVAS_MAX_ZOOM
  )
    return fail('A saved camera is invalid.')
  return { x: value.x, y: value.y, zoom: value.zoom }
}
function activeEditorView(value: unknown): LiveViewState['activeView'] {
  if (value === null) return null
  if (
    !record(value) ||
    typeof value.tool !== 'string' ||
    (value.focusMode !== undefined && typeof value.focusMode !== 'boolean') ||
    !tools.includes(value.tool) ||
    (value.activeLayerId !== null && !id(value.activeLayerId)) ||
    !Array.isArray(value.selectedIds) ||
    value.selectedIds.length > MAX_SELECTION ||
    !value.selectedIds.every(id) ||
    new Set(value.selectedIds).size !== value.selectedIds.length
  )
    return fail('The saved selection or tool is invalid.')
  let connection: EditorViewState['connection']
  if (value.connection !== undefined) {
    const source = value.connection
    if (
      !record(source) ||
      !['end', 'none', 'both', 'start'].includes(String(source.arrowStyle)) ||
      !['straight', 'elbow', 'curve', 'step'].includes(String(source.style)) ||
      ![...CONNECTION_SIDES, 'fixed'].includes(String(source.sourceSide)) ||
      ![...CONNECTION_SIDES, 'fixed'].includes(String(source.targetSide))
    )
      return fail('The saved connection tool is invalid.')
    connection = {
      arrowStyle: source.arrowStyle as NonNullable<
        EditorViewState['connection']
      >['arrowStyle'],
      style: source.style as NonNullable<
        EditorViewState['connection']
      >['style'],
      sourceSide: source.sourceSide as NonNullable<
        EditorViewState['connection']
      >['sourceSide'],
      targetSide: source.targetSide as NonNullable<
        EditorViewState['connection']
      >['targetSide'],
    }
  }
  return {
    viewport: viewport(value.viewport),
    selectedIds: [...value.selectedIds] as string[],
    tool: value.tool,
    activeLayerId: value.activeLayerId as string | null,
    ...(connection ? { connection } : {}),
    ...(typeof value.focusMode === 'boolean'
      ? { focusMode: value.focusMode }
      : {}),
  }
}

/** A v2 view contains references and presentation only. Canvas contents remain local. */
export function normalizeLiveViewState(value: unknown): LiveViewState {
  if (
    !record(value) ||
    value.format !== 'CanvasLiveLink' ||
    value.version !== 2 ||
    !id(value.workspaceId) ||
    !record(value.workspace) ||
    value.workspace.id !== value.workspaceId ||
    (value.projectId !== null && !id(value.projectId)) ||
    value.workspace.projectId !== value.projectId ||
    !record(value.workspace.views) ||
    !record(value.projectPresentation) ||
    !record(value.cameras) ||
    !['home', 'work', 'options', 'workspaces'].includes(
      String(value.section),
    ) ||
    !timestamp(value.updatedAt)
  )
    return fail()
  const sourceViews = Object.entries(value.workspace.views)
  if (sourceViews.length > MAX_PROJECTS)
    return fail('This link contains too many project views.')
  for (const [projectId, source] of sourceViews) {
    if (
      !id(projectId) ||
      !record(source) ||
      !Array.isArray(source.openIds) ||
      source.openIds.length > MAX_CAMERAS ||
      !source.openIds.every(id) ||
      new Set(source.openIds).size !== source.openIds.length ||
      (source.recentIds !== undefined &&
        (!Array.isArray(source.recentIds) ||
          source.recentIds.length > MAX_CAMERAS ||
          !source.recentIds.every(id) ||
          new Set(source.recentIds).size !== source.recentIds.length)) ||
      (source.activeId !== null &&
        (!id(source.activeId) || !source.openIds.includes(source.activeId)))
    )
      return fail('The saved file references are invalid.')
    const normalized = normalizeProjectView(source)
    if (normalized.activeId !== source.activeId)
      return fail('The saved active file is invalid.')
  }
  let workspace: SavedWorkspace
  try {
    workspace = parseSavedWorkspace(
      serializeSavedWorkspace(value.workspace as SavedWorkspace),
      value.workspaceId,
    )
  } catch {
    return fail('The saved workspace is invalid.')
  }
  const projectPresentation: LiveViewState['projectPresentation'] = {}
  const presentations = Object.entries(value.projectPresentation)
  if (presentations.length > MAX_PROJECTS)
    return fail('This link contains too many projects.')
  for (const [projectId, source] of presentations) {
    if (
      !id(projectId) ||
      !record(source) ||
      typeof source.pinned !== 'boolean' ||
      typeof source.recentHidden !== 'boolean' ||
      !timestamp(source.lastOpenedAt)
    )
      return fail('The saved project presentation is invalid.')
    projectPresentation[projectId] = {
      pinned: source.pinned,
      recentHidden: source.recentHidden,
      lastOpenedAt: source.lastOpenedAt,
    }
  }
  const cameras: LiveViewState['cameras'] = {}
  const cameraEntries = Object.entries(value.cameras)
  if (cameraEntries.length > MAX_CAMERAS)
    return fail('This link contains too many saved cameras.')
  for (const [fileId, camera] of cameraEntries) {
    if (!id(fileId)) return fail('A saved file identifier is invalid.')
    cameras[fileId] = viewport(camera)
  }
  const activeView = activeEditorView(value.activeView)
  if (
    activeView &&
    (value.projectId === null || !workspace.views[value.projectId]?.activeId)
  )
    return fail('The saved editor has no active file.')
  const normalized: LiveViewState = {
    format: 'CanvasLiveLink',
    version: 2,
    workspaceId: value.workspaceId,
    workspace,
    projectId: value.projectId as string | null,
    projectPresentation,
    cameras,
    activeView,
    section: value.section as LiveViewState['section'],
    updatedAt: value.updatedAt,
  }
  if (
    new TextEncoder().encode(JSON.stringify(normalized)).length >
    LIVE_LINK_MAX_URL_LENGTH
  )
    return fail('This workspace view is too large for a link.')
  return normalized
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/gu, '')
}
function encode(value: string): string {
  return base64url(new TextEncoder().encode(value))
}
function decode(value: string): string {
  if (!/^[\dA-Za-z_-]+$/u.test(value) || value.length % 4 === 1) return fail()
  try {
    const bytes = Uint8Array.from(
      atob(value.replace(/-/gu, '+').replace(/_/gu, '/')),
      (character) => character.charCodeAt(0),
    )
    if (base64url(bytes) !== value) return fail()
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return fail('This Canvas Live link is damaged or incomplete.')
  }
}
function address(base: string, fragment: string): string {
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return fail('The Canvas Live address is invalid.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return fail('Canvas Live links need an HTTP or HTTPS address.')
  url.search = ''
  url.hash = `view=${fragment}`
  if (url.href.length > LIVE_LINK_MAX_URL_LENGTH)
    return fail('This workspace view is too large for a link.')
  return url.href
}
export function encodeExactLiveLink(view: LiveViewState, base: string): string {
  return address(
    base,
    `2e.${encode(JSON.stringify(normalizeLiveViewState(view)))}`,
  )
}
export function encodeLatestLiveLink(
  workspaceId: string,
  base: string,
): string {
  if (!id(workspaceId)) return fail('The workspace identifier is invalid.')
  return address(base, `2l.${encode(workspaceId)}`)
}
export function parseLiveLink(
  hashOrUrl: string,
):
  | { kind: 'exact'; view: LiveViewState }
  | { kind: 'latest'; workspaceId: string }
  | null {
  if (typeof hashOrUrl !== 'string') return fail()
  if (hashOrUrl.length > LIVE_LINK_MAX_URL_LENGTH)
    return fail('This Canvas Live link is too large.')
  const fragment = hashOrUrl.startsWith('#')
    ? hashOrUrl.slice(1)
    : hashOrUrl.includes('#')
      ? hashOrUrl.slice(hashOrUrl.indexOf('#') + 1)
      : ''
  // Legacy copy-time document snapshots remain the responsibility of viewLinks.ts.
  if (!fragment.startsWith('view=2')) return null
  const match = /^view=2([el])\.([\dA-Za-z_-]+)$/u.exec(fragment)
  if (!match)
    return fail('This Canvas Live link version is unsupported or incomplete.')
  const raw = decode(match[2])
  if (match[1] === 'l') {
    if (!id(raw)) return fail('The workspace identifier is invalid.')
    return { kind: 'latest', workspaceId: raw }
  }
  try {
    return { kind: 'exact', view: normalizeLiveViewState(JSON.parse(raw)) }
  } catch (error) {
    if (error instanceof LiveViewLinkError) throw error
    return fail()
  }
}

function normalizedOptions(value: unknown): LinkOptions {
  const next = { ...DEFAULT_LINK_OPTIONS }
  if (record(value))
    for (const key of Object.keys(next) as (keyof LinkOptions)[])
      if (typeof value[key] === 'boolean') next[key] = value[key]
  return next
}
export function loadLinkOptions(
  storage?: Pick<Storage, 'getItem'> | null,
): LinkOptions {
  try {
    const raw = (storage === undefined ? localStorage : storage)?.getItem(
      LINK_OPTIONS_STORAGE_KEY,
    )
    return raw
      ? normalizedOptions(JSON.parse(raw))
      : { ...DEFAULT_LINK_OPTIONS }
  } catch {
    return { ...DEFAULT_LINK_OPTIONS }
  }
}
export function persistLinkOptions(
  value: LinkOptions,
  storage?: Pick<Storage, 'setItem'> | null,
): boolean {
  try {
    const destination = storage === undefined ? localStorage : storage
    if (!destination) return false
    destination.setItem(
      LINK_OPTIONS_STORAGE_KEY,
      JSON.stringify(normalizedOptions(value)),
    )
    return true
  } catch {
    return false
  }
}
