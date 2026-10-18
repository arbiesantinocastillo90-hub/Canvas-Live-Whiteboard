import { Buffer } from 'node:buffer'
import {
  CompressionStream,
  DecompressionStream,
  ReadableStream,
} from 'node:stream/web'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCanvasFileRecord } from './canvasFiles'
import { DEFAULT_LAYOUT } from './layout'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_PREFERENCES } from './workspace'
import { createSavedWorkspace, normalizeProjectView } from './workspaceSessions'
import {
  decodeViewLink,
  encodeViewLink,
  normalizeViewLinkSnapshot,
  VIEW_LINK_MAX_BYTES,
  VIEW_LINK_MAX_URL_LENGTH,
  type ViewLinkSnapshot,
} from './viewLinks'

function snapshot(): ViewLinkSnapshot {
  const document = createCanvasDocument('Planning ✨')
  document.viewport = { x: -148.25, y: 512.5, zoom: 1.45 }
  document.elements.push({
    id: 'shape',
    type: 'rectangle',
    x: 40,
    y: 50,
    width: 140,
    height: 90,
    color: '#123456',
    fill: '#654321',
    text: 'Hello 世界',
    fontSize: 16,
    layerId: 'layer-main',
    areaId: null,
  })
  const workspace = createSavedWorkspace(
    DEFAULT_PREFERENCES,
    DEFAULT_LAYOUT,
    'project',
    'Workspace',
    'workspace',
  )
  workspace.layout = {
    ...workspace.layout,
    rightPanel: 'tools',
    rightPinned: true,
  }
  workspace.views.project = normalizeProjectView({
    openIds: ['first', 'second'],
    activeId: 'second',
    tabs: [{ id: 'first', pinned: true, compact: true, groupId: 'group' }],
    groups: [{ id: 'group', name: 'Ideas', collapsed: false }],
    editorSession: { tool: 'connect', activeLayerId: 'layer-main' },
  })
  return {
    format: 'CanvasLiveView',
    version: 1,
    id: 'copied-view',
    createdAt: 100,
    project: { id: 'project', name: 'Project', createdAt: 1, lastOpenedAt: 10 },
    workspace,
    files: [
      createCanvasFileRecord(
        'project',
        createCanvasDocument('First'),
        1,
        'first',
      ),
      createCanvasFileRecord('project', document, 1, 'second'),
    ],
    activeView: {
      viewport: document.viewport,
      selectedIds: ['shape'],
      tool: 'connect',
      activeLayerId: 'layer-main',
      focusMode: true,
      connection: {
        arrowStyle: 'both',
        style: 'elbow',
        sourceSide: 'fixed',
        targetSide: 'left',
      },
    },
  }
}
function fragment(value: unknown, version = '1j'): string {
  return `#view=${version}.${Buffer.from(JSON.stringify(value)).toString('base64url')}`
}

describe('portable copy-time view links', () => {
  beforeEach(() => {
    vi.stubGlobal('CompressionStream', CompressionStream)
    vi.stubGlobal('DecompressionStream', DecompressionStream)
    vi.stubGlobal('ReadableStream', ReadableStream)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips a complete compressed content/UI snapshot and every open tab', async () => {
    const source = snapshot()
    const url = await encodeViewLink(source, 'http://127.0.0.1:4173/#old')
    expect(url).toContain('#view=1g.')
    expect(await decodeViewLink(url)).toEqual(normalizeViewLinkSnapshot(source))
    source.files[1].document.elements[0].color = '#ffffff'
    const restored = await decodeViewLink(url)
    expect(restored?.files[1].document.elements[0].color).toBe('#123456')
    expect(restored?.activeView).toMatchObject({
      selectedIds: ['shape'],
      focusMode: true,
      viewport: { x: -148.25, y: 512.5, zoom: 1.45 },
    })
    expect(restored?.workspace.layout.rightPinned).toBe(true)
  })

  it('supports UTF-8 plain links in embedded browsers without compression', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    const url = await encodeViewLink(snapshot(), 'http://127.0.0.1:4173/')
    expect(url).toContain('#view=1j.')
    expect(
      (await decodeViewLink(new URL(url).hash))?.files[1].document.name,
    ).toBe('Planning ✨')
  })

  it('projects only permitted data and only the active project view', async () => {
    const source = snapshot()
    const poisoned = JSON.parse(JSON.stringify(source))
    poisoned.apiKey = 'do-not-copy'
    poisoned.workspace.token = 'do-not-copy'
    poisoned.workspace.views.other = { secret: 'do-not-copy' }
    poisoned.project.browserPairingCode = 'do-not-copy'
    poisoned.files[0].handle = { private: 'do-not-copy' }
    poisoned.activeView.mcp = { token: 'do-not-copy' }
    const normalized = normalizeViewLinkSnapshot(poisoned)
    expect(JSON.stringify(normalized)).not.toContain('do-not-copy')
    expect(Object.keys(normalized.workspace.views)).toEqual(['project'])
    expect(normalized.files).toHaveLength(2)
  })

  it('accepts older links with connection settings omitted', async () => {
    const source = snapshot()
    delete source.activeView.connection
    expect(
      (await decodeViewLink(fragment(source)))?.activeView.connection,
    ).toBeUndefined()
  })

  it.each([
    [
      'version',
      (value: ViewLinkSnapshot) => {
        value.version = 9 as 1
      },
    ],
    [
      'reserved identifiers',
      (value: ViewLinkSnapshot) => {
        value.id = '__proto__'
      },
    ],
    [
      'project references',
      (value: ViewLinkSnapshot) => {
        value.workspace.projectId = 'elsewhere'
      },
    ],
    [
      'missing tabs',
      (value: ViewLinkSnapshot) => {
        value.files.pop()
      },
    ],
    [
      'duplicate tabs',
      (value: ViewLinkSnapshot) => {
        value.workspace.views.project.openIds.push('first')
      },
    ],
    [
      'duplicate files',
      (value: ViewLinkSnapshot) => {
        value.files[1].id = 'first'
      },
    ],
    [
      'cross-project files',
      (value: ViewLinkSnapshot) => {
        value.files[0].projectId = 'elsewhere'
      },
    ],
    [
      'invalid dates',
      (value: ViewLinkSnapshot) => {
        value.files[0].updatedAt = 0
      },
    ],
    [
      'unknown selection',
      (value: ViewLinkSnapshot) => {
        value.activeView.selectedIds = ['missing']
      },
    ],
    [
      'duplicate selection',
      (value: ViewLinkSnapshot) => {
        value.activeView.selectedIds = ['shape', 'shape']
      },
    ],
    [
      'camera bounds',
      (value: ViewLinkSnapshot) => {
        value.activeView.viewport.zoom = 99
      },
    ],
    [
      'unsupported canvas fields',
      (value: ViewLinkSnapshot) => {
        Object.assign(value.files[0].document, { script: 'bad' })
      },
    ],
    [
      'invalid layer',
      (value: ViewLinkSnapshot) => {
        value.activeView.activeLayerId = 'missing'
      },
    ],
    [
      'invalid tools',
      (value: ViewLinkSnapshot) => {
        value.activeView.tool = 'run-command'
      },
    ],
    [
      'invalid connection settings',
      (value: ViewLinkSnapshot) => {
        value.activeView.connection!.targetSide = 'unsafe' as 'left'
      },
    ],
    [
      'invalid layout metadata',
      (value: ViewLinkSnapshot) => {
        value.project.lastOpenedAt = 0
      },
    ],
  ])('rejects %s without a partial restoration', async (_name, mutate) => {
    const source = snapshot()
    mutate(source)
    await expect(decodeViewLink(fragment(source))).rejects.toThrow()
  })

  it('returns null when the URL has no view snapshot', async () => {
    expect(await decodeViewLink('http://127.0.0.1:4173/')).toBeNull()
    expect(await decodeViewLink('#elsewhere')).toBeNull()
  })

  it.each([
    '#view=2j.abc',
    '#view=1j.a',
    '#view=1j.====',
    '#view=1j._w',
    '#view=1g.e30',
    '#view=1j.e30&other=1',
  ])('rejects a malformed or unsupported fragment: %s', async (hash) => {
    await expect(decodeViewLink(hash)).rejects.toThrow()
  })

  it('fails clearly if an embedded browser cannot decompress the snapshot', async () => {
    const url = await encodeViewLink(snapshot(), 'http://127.0.0.1:4173/')
    vi.stubGlobal('DecompressionStream', undefined)
    await expect(decodeViewLink(url)).rejects.toThrow('cannot open compressed')
  })

  it('bounds decompressed data before parsing a highly compressed payload', async () => {
    const compressed = gzipSync(Buffer.alloc(VIEW_LINK_MAX_BYTES + 1, 'a'))
    const hash = `#view=1g.${compressed.toString('base64url')}`
    expect(hash.length).toBeLessThan(2000)
    await expect(decodeViewLink(hash)).rejects.toThrow('too large')
  })

  it('bounds the final link rather than silently dropping tabs or text', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    const source = snapshot()
    for (let i = 0; i < 8; i++) {
      const element = {
        ...source.files[1].document.elements[0],
        id: `shape-${i}`,
        text: 'x'.repeat(20_000),
      }
      source.files[1].document.elements.push(element)
    }
    await expect(
      encodeViewLink(source, 'http://127.0.0.1:4173/'),
    ).rejects.toThrow('Save or export')
    await expect(
      decodeViewLink(`#view=${'a'.repeat(VIEW_LINK_MAX_URL_LENGTH)}`),
    ).rejects.toThrow('too large')
  })

  it.each([
    'javascript:alert(1)',
    'file:///D:/Canvas%20Live',
    'http://secret:password@localhost/',
  ])('rejects unsafe base URLs: %s', async (url) => {
    await expect(encodeViewLink(snapshot(), url)).rejects.toThrow()
  })
})
