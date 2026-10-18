import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYOUT } from './layout'
import { DEFAULT_PREFERENCES } from './workspace'
import { createSavedWorkspace, normalizeProjectView } from './workspaceSessions'
import {
  DEFAULT_LINK_OPTIONS,
  encodeExactLiveLink,
  encodeLatestLiveLink,
  LINK_OPTIONS_STORAGE_KEY,
  LIVE_LINK_MAX_URL_LENGTH,
  loadLinkOptions,
  normalizeLiveViewState,
  parseLiveLink,
  persistLinkOptions,
  type LiveViewState,
} from './liveViewLinks'

function view(): LiveViewState {
  const workspace = createSavedWorkspace(
    DEFAULT_PREFERENCES,
    { ...DEFAULT_LAYOUT, rightPanel: 'tools', rightPinned: true },
    'project',
    'Planning 世界',
    'workspace',
  )
  workspace.views.project = normalizeProjectView({
    openIds: ['a', 'b'],
    recentIds: ['b', 'a'],
    activeId: 'b',
    tabs: [{ id: 'a', pinned: true, compact: true, groupId: 'group' }],
    groups: [{ id: 'group', name: 'Ideas', collapsed: false }],
    shortcuts: [{ id: 'b', pinned: true, hidden: false }],
    editorSession: { tool: 'connect', activeLayerId: 'layer-main' },
  })
  return {
    format: 'CanvasLiveLink',
    version: 2,
    workspaceId: workspace.id,
    workspace,
    projectId: 'project',
    projectPresentation: {
      project: { pinned: true, recentHidden: false, lastOpenedAt: 100 },
    },
    cameras: {
      a: { x: -1, y: 20, zoom: 0.8 },
      b: { x: 320.25, y: -81.5, zoom: 1.45 },
    },
    activeView: {
      viewport: { x: 320.25, y: -81.5, zoom: 1.45 },
      selectedIds: ['shape'],
      tool: 'connect',
      activeLayerId: 'layer-main',
      connection: {
        arrowStyle: 'both',
        style: 'elbow',
        sourceSide: 'fixed',
        targetSide: 'right',
      },
    },
    section: 'work',
    updatedAt: 100,
  }
}
const encoded = (value: unknown) =>
  `#view=2e.${Buffer.from(JSON.stringify(value)).toString('base64url')}`

describe('reference-only exact and latest view links', () => {
  it('round-trips the copied view, every project reference, camera, panel, tab group, and selection', () => {
    const source = view()
    source.workspace.views.other = normalizeProjectView({
      openIds: ['c'],
      activeId: 'c',
    })
    const url = encodeExactLiveLink(
      source,
      'http://127.0.0.1:4173/?old=1#previous',
    )
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:4173\/#view=2e\./u)
    expect(parseLiveLink(url)).toEqual({ kind: 'exact', view: source })
    source.cameras.b.x = 999
    expect(parseLiveLink(url)).toMatchObject({
      view: { cameras: { b: { x: 320.25 } } },
    })
  })

  it('uses a short latest-workspace reference and supports Unicode identifiers without taking file contents', () => {
    const url = encodeLatestLiveLink(
      'workspace-世界',
      'http://127.0.0.1:4173/#old',
    )
    expect(url.length).toBeLessThan(100)
    expect(parseLiveLink(url)).toEqual({
      kind: 'latest',
      workspaceId: 'workspace-世界',
    })
    expect(parseLiveLink(new URL(url).hash)).toEqual({
      kind: 'latest',
      workspaceId: 'workspace-世界',
    })
    expect(
      encodeLatestLiveLink('workspace-世界', 'http://127.0.0.1:4173/'),
    ).toBe(url)
  })

  it('drops documents, native handles, pairing state, credentials, and all unsupported properties', () => {
    const source = JSON.parse(JSON.stringify(view()))
    source.files = [
      { document: { text: 'private-marker' }, handle: 'private-marker' },
    ]
    source.workspace.apiKey = 'private-marker'
    source.workspace.views.project.document = 'private-marker'
    source.projectPresentation.project.browserPairingCode = 'private-marker'
    source.cameras.b.token = 'private-marker'
    source.activeView.connection.mcp = 'private-marker'
    expect(JSON.stringify(normalizeLiveViewState(source))).not.toContain(
      'private-marker',
    )
    expect(normalizeLiveViewState(source)).not.toHaveProperty('files')
  })

  it('leaves legacy snapshots to their existing decoder and accepts a home view without an editor', () => {
    expect(parseLiveLink('#view=1g.legacy')).toBeNull()
    expect(parseLiveLink('#view=1j.legacy')).toBeNull()
    expect(parseLiveLink('http://127.0.0.1:4173/')).toBeNull()
    const source = view()
    source.projectId = null
    source.workspace.projectId = null
    source.activeView = null
    source.section = 'home'
    expect(parseLiveLink(encoded(source))).toEqual({
      kind: 'exact',
      view: source,
    })
  })

  it.each([
    [
      'workspace mismatch',
      (source: LiveViewState) => {
        source.workspaceId = 'other'
      },
    ],
    [
      'project mismatch',
      (source: LiveViewState) => {
        source.projectId = 'other'
      },
    ],
    [
      'reserved workspace ID',
      (source: LiveViewState) => {
        source.workspaceId = source.workspace.id = '__proto__'
      },
    ],
    [
      'camera bounds',
      (source: LiveViewState) => {
        source.cameras.b.x = 1_000_001
      },
    ],
    [
      'camera zoom',
      (source: LiveViewState) => {
        source.cameras.b.zoom = 0
      },
    ],
    [
      'duplicate tabs',
      (source: LiveViewState) => {
        source.workspace.views.project.openIds.push('a')
      },
    ],
    [
      'missing active tab',
      (source: LiveViewState) => {
        source.workspace.views.project.activeId = 'missing'
      },
    ],
    [
      'duplicate recent files',
      (source: LiveViewState) => {
        source.workspace.views.project.recentIds.push('b')
      },
    ],
    [
      'duplicate selection',
      (source: LiveViewState) => {
        source.activeView!.selectedIds.push('shape')
      },
    ],
    [
      'reserved selection',
      (source: LiveViewState) => {
        source.activeView!.selectedIds = ['constructor']
      },
    ],
    [
      'unknown tool',
      (source: LiveViewState) => {
        source.activeView!.tool = 'run-shell'
      },
    ],
    [
      'invalid connection',
      (source: LiveViewState) => {
        source.activeView!.connection!.sourceSide = 'bad' as 'left'
      },
    ],
    [
      'invalid timestamp',
      (source: LiveViewState) => {
        source.updatedAt = -1
      },
    ],
    [
      'unknown section',
      (source: LiveViewState) => {
        source.section = 'admin' as 'work'
      },
    ],
  ] as const)('rejects %s before opening a view', (_name, mutate) => {
    const source = view()
    mutate(source)
    expect(() => parseLiveLink(encoded(source))).toThrow()
  })

  it('rejects reserved map keys, non-finite numbers, malformed base64, unsafe addresses and oversized links', () => {
    const source = view()
    source.cameras = JSON.parse('{"__proto__":{"x":0,"y":0,"zoom":1}}')
    expect(() => normalizeLiveViewState(source)).toThrow()
    source.cameras = { a: { x: Number.POSITIVE_INFINITY, y: 0, zoom: 1 } }
    expect(() => normalizeLiveViewState(source)).toThrow()
    for (const malformed of [
      '#view=2e.eA=',
      '#view=2e.eA&extra=1',
      '#view=2e.A',
      '#view=2l._w',
      '#view=2x.eA',
    ])
      expect(() => parseLiveLink(malformed)).toThrow()
    expect(() => encodeExactLiveLink(view(), 'javascript:alert(1)')).toThrow()
    expect(() =>
      encodeLatestLiveLink('workspace', 'http://user:secret@127.0.0.1:4173/'),
    ).toThrow()
    expect(() =>
      parseLiveLink('#view=2e.' + 'A'.repeat(LIVE_LINK_MAX_URL_LENGTH)),
    ).toThrow()
  })
})

describe('local Canvas Live Links options', () => {
  it('defaults to enabled controls and resumes latest while tolerating older partial settings', () => {
    expect(loadLinkOptions(null)).toEqual(DEFAULT_LINK_OPTIONS)
    const getItem = vi.fn(() =>
      JSON.stringify({
        latestEnabled: false,
        rememberCamera: false,
        resumeLatest: 'invalid',
        token: 'private-marker',
      }),
    )
    expect(loadLinkOptions({ getItem })).toEqual({
      ...DEFAULT_LINK_OPTIONS,
      latestEnabled: false,
      rememberCamera: false,
    })
    expect(getItem).toHaveBeenCalledWith(LINK_OPTIONS_STORAGE_KEY)
  })

  it('writes only supported booleans and handles denied or malformed browser storage', () => {
    const setItem = vi.fn()
    expect(
      persistLinkOptions(
        {
          ...DEFAULT_LINK_OPTIONS,
          resumeLatest: false,
          token: 'private-marker',
        } as typeof DEFAULT_LINK_OPTIONS,
        { setItem },
      ),
    ).toBe(true)
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({
      ...DEFAULT_LINK_OPTIONS,
      resumeLatest: false,
    })
    expect(loadLinkOptions({ getItem: () => '{invalid' })).toEqual(
      DEFAULT_LINK_OPTIONS,
    )
    expect(
      loadLinkOptions({
        getItem: () => {
          throw new Error('Denied')
        },
      }),
    ).toEqual(DEFAULT_LINK_OPTIONS)
    expect(
      persistLinkOptions(DEFAULT_LINK_OPTIONS, {
        setItem: () => {
          throw new Error('Denied')
        },
      }),
    ).toBe(false)
    expect(persistLinkOptions(DEFAULT_LINK_OPTIONS, null)).toBe(false)
  })
})
