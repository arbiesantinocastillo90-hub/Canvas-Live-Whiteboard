import type { CanvasFileRecord } from './canvasFiles'
import {
  CONNECTION_SIDES,
  validateCanvasDocument,
  validCanvasId,
  type CanvasViewport,
  type ConnectionSide,
} from './lcanvas'
import { parseWorkspace, type Project } from './workspace'
import {
  normalizeProjectView,
  parseSavedWorkspace,
  type SavedWorkspace,
} from './workspaceSessions'

export type ViewLinkConnection = {
  arrowStyle: 'end' | 'none' | 'both' | 'start'
  style: 'straight' | 'elbow' | 'curve' | 'step'
  sourceSide: ConnectionSide | 'fixed'
  targetSide: ConnectionSide | 'fixed'
}
export type ViewLinkSnapshot = {
  format: 'CanvasLiveView'
  version: 1
  id: string
  createdAt: number
  workspace: SavedWorkspace
  project: Project
  files: CanvasFileRecord[]
  activeView: {
    viewport: CanvasViewport
    selectedIds: string[]
    tool: string
    activeLayerId: string | null
    focusMode: boolean
    connection?: ViewLinkConnection
  }
}

export const VIEW_LINK_MAX_BYTES = 1024 * 1024
export const VIEW_LINK_MAX_URL_LENGTH = 128 * 1024
export const VIEW_LINK_MAX_FILES = 100
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
const tooLarge =
  'This view is too large for a portable link. Save or export the canvas files instead.'

export class ViewLinkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ViewLinkError'
  }
}
function fail(message = 'This Canvas Live view link is invalid.'): never {
  throw new ViewLinkError(message)
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function id(value: unknown): value is string {
  return (
    validCanvasId(value) &&
    !['__proto__', 'prototype', 'constructor'].includes(value)
  )
}
function timestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  )
}
function connection(value: unknown): ViewLinkConnection | undefined {
  if (value === undefined) return undefined
  if (
    !record(value) ||
    !['end', 'none', 'both', 'start'].includes(String(value.arrowStyle)) ||
    !['straight', 'elbow', 'curve', 'step'].includes(String(value.style)) ||
    ![...CONNECTION_SIDES, 'fixed'].includes(String(value.sourceSide)) ||
    ![...CONNECTION_SIDES, 'fixed'].includes(String(value.targetSide))
  )
    return fail('The saved connection tool settings are invalid.')
  return {
    arrowStyle: value.arrowStyle as ViewLinkConnection['arrowStyle'],
    style: value.style as ViewLinkConnection['style'],
    sourceSide: value.sourceSide as ViewLinkConnection['sourceSide'],
    targetSide: value.targetSide as ViewLinkConnection['targetSide'],
  }
}

/** Project only allowed data; never serialize file handles, pairing or MCP state. */
export function normalizeViewLinkSnapshot(value: unknown): ViewLinkSnapshot {
  if (
    !record(value) ||
    value.format !== 'CanvasLiveView' ||
    value.version !== 1 ||
    !id(value.id) ||
    !timestamp(value.createdAt) ||
    !record(value.project) ||
    !id(value.project.id) ||
    !record(value.workspace) ||
    !id(value.workspace.id) ||
    !Array.isArray(value.files) ||
    !value.files.length ||
    value.files.length > VIEW_LINK_MAX_FILES ||
    !record(value.activeView)
  )
    return fail()
  try {
    const metadata = parseWorkspace(
      JSON.stringify({
        version: 1,
        preferences: value.workspace.preferences,
        projects: [value.project],
        lastProjectId: value.project.id,
      }),
    )
    if (metadata.projects.length !== 1)
      return fail('The saved project is invalid.')
    const project = metadata.projects[0]
    const sourceWorkspace = value.workspace
    if (
      sourceWorkspace.projectId !== project.id ||
      !record(sourceWorkspace.views) ||
      !Object.hasOwn(sourceWorkspace.views, project.id)
    )
      return fail('The saved workspace does not contain its active project.')
    const sourceView = sourceWorkspace.views[project.id]
    if (!record(sourceView) || !Array.isArray(sourceView.openIds)) return fail()
    const view = normalizeProjectView(sourceView)
    if (
      !view.openIds.length ||
      view.openIds.length !== sourceView.openIds.length ||
      view.activeId !== sourceView.activeId ||
      view.openIds.length !== value.files.length
    )
      return fail('The saved tabs are incomplete or duplicated.')
    const workspace = parseSavedWorkspace(
      JSON.stringify({
        format: 'CanvasLiveWorkspace',
        version: 1,
        workspace: {
          ...sourceWorkspace,
          preferences: metadata.preferences,
          views: { [project.id]: view },
        },
      }),
      sourceWorkspace.id as string,
    )
    const fileIds = new Set<string>()
    const files: CanvasFileRecord[] = value.files.map((file) => {
      if (
        !record(file) ||
        !id(file.id) ||
        fileIds.has(file.id) ||
        !view.openIds.includes(file.id) ||
        file.projectId !== project.id ||
        !timestamp(file.createdAt) ||
        !timestamp(file.updatedAt) ||
        !timestamp(file.lastOpenedAt) ||
        file.updatedAt < file.createdAt ||
        file.lastOpenedAt < file.createdAt
      )
        return fail('A saved canvas record is invalid or duplicated.')
      fileIds.add(file.id)
      return {
        id: file.id,
        projectId: project.id,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        lastOpenedAt: file.lastOpenedAt,
        document: validateCanvasDocument(file.document),
      }
    })
    const active = files.find((file) => file.id === view.activeId)
    const activeView = value.activeView
    if (
      !active ||
      !Array.isArray(activeView.selectedIds) ||
      activeView.selectedIds.length > active.document.elements.length ||
      new Set(activeView.selectedIds).size !== activeView.selectedIds.length ||
      !activeView.selectedIds.every(
        (selected) =>
          id(selected) &&
          active.document.elements.some((element) => element.id === selected),
      ) ||
      typeof activeView.tool !== 'string' ||
      !tools.includes(activeView.tool) ||
      (activeView.activeLayerId !== null &&
        (!id(activeView.activeLayerId) ||
          !active.document.layers.some(
            (layer) => layer.id === activeView.activeLayerId,
          ))) ||
      typeof activeView.focusMode !== 'boolean'
    )
      return fail('The saved canvas selection or tool state is invalid.')
    const viewport = validateCanvasDocument({
      ...active.document,
      viewport: activeView.viewport,
    }).viewport
    const toolConnection = connection(activeView.connection)
    const normalized: ViewLinkSnapshot = {
      format: 'CanvasLiveView',
      version: 1,
      id: value.id,
      createdAt: value.createdAt,
      workspace,
      project,
      files,
      activeView: {
        viewport,
        selectedIds: [...activeView.selectedIds] as string[],
        tool: activeView.tool,
        activeLayerId: activeView.activeLayerId as string | null,
        focusMode: activeView.focusMode,
        ...(toolConnection ? { connection: toolConnection } : {}),
      },
    }
    if (
      new TextEncoder().encode(JSON.stringify(normalized)).byteLength >
      VIEW_LINK_MAX_BYTES
    )
      return fail(tooLarge)
    return normalized
  } catch (error) {
    if (error instanceof ViewLinkError) throw error
    return fail('This view link contains an invalid canvas or workspace.')
  }
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
  return btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/gu, '')
}
function fromBase64url(value: string): Uint8Array {
  if (!/^[\dA-Za-z_-]+$/u.test(value) || value.length % 4 === 1) return fail()
  try {
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/'))
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    )
    if (base64url(bytes) !== value) return fail()
    return bytes
  } catch {
    return fail()
  }
}
async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > limit) {
        await reader.cancel()
        return fail(tooLarge)
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}
function byteStream(bytes: Uint8Array): ReadableStream<BufferSource> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })
}

/** Contents are a copy-time snapshot, not a grant to the original local files. */
export async function encodeViewLink(
  snapshot: ViewLinkSnapshot,
  baseUrl: string,
): Promise<string> {
  const normalized = normalizeViewLinkSnapshot(snapshot)
  let bytes: Uint8Array = new TextEncoder().encode(JSON.stringify(normalized))
  let encoding = '1j'
  if (typeof CompressionStream !== 'undefined') {
    try {
      const compressed = await readBounded(
        byteStream(bytes).pipeThrough(new CompressionStream('gzip')),
        VIEW_LINK_MAX_BYTES + 1024,
      )
      if (compressed.length < bytes.length) {
        bytes = compressed
        encoding = '1g'
      }
    } catch {
      // Older embedded browsers can still use the bounded plain-JSON format.
    }
  }
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return fail('The Canvas Live address is invalid.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return fail('View links need a Canvas Live HTTP or HTTPS address.')
  url.search = ''
  url.hash = `view=${encoding}.${base64url(bytes)}`
  if (url.href.length > VIEW_LINK_MAX_URL_LENGTH) return fail(tooLarge)
  return url.href
}

/** Read only the fragment. Invalid snapshots are rejected before any import. */
export async function decodeViewLink(
  hashOrUrl: string,
): Promise<ViewLinkSnapshot | null> {
  if (
    typeof hashOrUrl !== 'string' ||
    hashOrUrl.length > VIEW_LINK_MAX_URL_LENGTH
  )
    return fail(tooLarge)
  const fragment = hashOrUrl.startsWith('#')
    ? hashOrUrl.slice(1)
    : hashOrUrl.includes('#')
      ? hashOrUrl.slice(hashOrUrl.indexOf('#') + 1)
      : ''
  if (!fragment.startsWith('view=')) return null
  const match = /^view=(1[gj])\.([\dA-Za-z_-]+)$/u.exec(fragment)
  if (!match)
    return fail(
      'This Canvas Live view-link version is not supported or the link is incomplete.',
    )
  try {
    let bytes = fromBase64url(match[2])
    if (match[1] === '1g') {
      if (typeof DecompressionStream === 'undefined')
        return fail(
          'This browser cannot open compressed view links. Open Canvas Live in a current browser.',
        )
      bytes = await readBounded(
        byteStream(bytes).pipeThrough(new DecompressionStream('gzip')),
        VIEW_LINK_MAX_BYTES,
      )
    }
    if (bytes.byteLength > VIEW_LINK_MAX_BYTES) return fail(tooLarge)
    const raw: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    )
    return normalizeViewLinkSnapshot(raw)
  } catch (error) {
    if (error instanceof ViewLinkError) throw error
    return fail('This Canvas Live view link is damaged or incomplete.')
  }
}
