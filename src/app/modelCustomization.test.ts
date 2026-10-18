import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CANVAS_CONTROLS } from './canvasControls'
import { DEFAULT_WORKSPACE_APPEARANCE } from './workspaceAppearance'
import { DEFAULT_ITEM_PRESENTATION } from './itemPresentation'
import { DEFAULT_HOME_VIEW, DEFAULT_WORKSPACE_VIEW } from './homeView'
import { DEFAULT_LAYOUT, parseLayout } from './layout'
import {
  DEFAULT_PREFERENCES,
  EMPTY_STATE,
  createProject,
  parseWorkspace,
} from './workspace'
import {
  createSavedWorkspace,
  parseSavedWorkspace,
  serializeSavedWorkspace,
  updateSavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'
import {
  createCanvasDocument,
  parseLCANVAS,
  serializeLCANVAS,
  validateCanvasDocument,
} from './lcanvas'
import { createCanvasFileRecord } from './canvasFiles'
import { parseProjectArchive, serializeProjectArchive } from './projectArchive'

afterEach(() => {
  vi.restoreAllMocks()
})

function customizedPreferences() {
  return {
    ...DEFAULT_PREFERENCES,
    canvasControls: {
      ...DEFAULT_CANVAS_CONTROLS,
      snapToGrid: true,
      gridSpacing: 32,
      rulers: true,
      rulerUnit: 'cm' as const,
      zoomUnit: 'ratio' as const,
      selectionFill: '#ffff00',
      selectionStroke: '#00ff00',
      selectionOpacity: 0.08,
      selectionStrokeWidth: 2,
      selectionDashed: true,
      selectionBehavior: 'intersect' as const,
    },
    homeAppearance: {
      ...DEFAULT_WORKSPACE_APPEARANCE,
      description: 'Planning and experiments',
      tagline: 'A workspace of my own',
      icon: 'compass' as const,
      iconSize: 42,
      iconStrokeWidth: 2.5,
      iconColor: '#00FFFF',
      iconFill: '#111111',
      titleFont: 'Georgia' as const,
      titleSize: 32,
      titleWeight: 700,
      titleColor: '#EEEEEE',
      titleOutlineColor: '#000000',
      titleOutlineWidth: 1,
      backgroundAssetId: 'ab'.repeat(32),
      backgroundFit: 'tile' as const,
      backgroundPosition: 'top' as const,
      backgroundOpacity: 30,
      gradientEnabled: true,
      gradientFrom: '#123456',
      gradientTo: '#654321',
      gradientAngle: 45,
      gradientOpacity: 65,
    },
  }
}

describe('customization model round trips', () => {
  it('persists independent canvas precision and home appearance in workspace metadata', () => {
    const preferences = customizedPreferences()
    const source = createProject(
      { ...EMPTY_STATE, preferences },
      'Plans',
      100,
      'project',
    )
    const result = parseWorkspace(JSON.stringify(source))
    expect(result.preferences).toEqual(preferences)
    expect(result.projects).toEqual(source.projects)
    expect(source.preferences.homeAppearance.description).toBe(
      'Planning and experiments',
    )
  })

  it('uses safe defaults when loading older workspace settings and rejects style injection', () => {
    const oldPreferences = { ...DEFAULT_PREFERENCES } as Record<string, unknown>
    delete oldPreferences.canvasControls
    delete oldPreferences.homeAppearance
    const old = parseWorkspace(
      JSON.stringify({ ...EMPTY_STATE, preferences: oldPreferences }),
    )
    expect(old.preferences.canvasControls).toEqual(DEFAULT_CANVAS_CONTROLS)
    expect(old.preferences.homeAppearance).toEqual(DEFAULT_WORKSPACE_APPEARANCE)
    const hostile = parseWorkspace(
      JSON.stringify({
        ...EMPTY_STATE,
        preferences: {
          ...oldPreferences,
          canvasControls: {
            gridSpacing: -100,
            selectionStroke: 'url(https://bad.test)',
          },
          homeAppearance: {
            titleFont: 'url(https://bad.test)',
            backgroundAssetId: 'https://bad.test/a.gif',
          },
        },
      }),
    )
    expect(hostile.preferences.canvasControls.gridSpacing).toBe(2)
    expect(hostile.preferences.canvasControls.selectionStroke).toBe('theme')
    expect(hostile.preferences.homeAppearance.titleFont).toBe('system')
    expect(hostile.preferences.homeAppearance.backgroundAssetId).toBeNull()
  })

  it('roundtrips Home and workspace library perspectives without changing old layout defaults', () => {
    const homeView = {
      ...DEFAULT_HOME_VIEW,
      perspective: 'canvas' as const,
      sort: 'modified' as const,
      display: 'hierarchy' as const,
      openedProjectId: 'project',
      closedProjectIds: ['a', 'b'],
      canvasesSection: 'recent' as const,
    }
    const workspaceView = {
      perspective: 'recent' as const,
      sort: 'created' as const,
    }
    const layout = parseLayout(
      JSON.stringify({ ...DEFAULT_LAYOUT, homeView, workspaceView }),
    )
    expect(layout.homeView).toEqual(homeView)
    expect(layout.workspaceView).toEqual(workspaceView)
    const legacy = { ...DEFAULT_LAYOUT } as Record<string, unknown>
    delete legacy.homeView
    delete legacy.workspaceView
    expect(parseLayout(JSON.stringify(legacy)).homeView).toEqual(
      DEFAULT_HOME_VIEW,
    )
    expect(parseLayout(JSON.stringify(legacy)).workspaceView).toEqual(
      DEFAULT_WORKSPACE_VIEW,
    )
    const bounded = parseLayout(
      JSON.stringify({
        homeView: {
          closedProjectIds: ['a', 'a', '__proto__', 99],
          openedProjectId: '__proto__',
          sort: 'bad',
        },
      }),
    )
    expect(bounded.homeView.closedProjectIds).toEqual(['a'])
    expect(bounded.homeView.openedProjectId).toBeNull()
    expect(bounded.homeView.sort).toBe('recent')
  })

  it('includes project appearance, modification time and customized canvases in portable CLP archives', () => {
    const presentation = {
      ...DEFAULT_ITEM_PRESENTATION,
      icon: 'star' as const,
      color: '#AA55FF',
      fill: '#111111',
      borderColor: '#FFFFFF',
      description: 'Shared board style',
    }
    const project = {
      id: 'project',
      name: 'Plans',
      createdAt: 100,
      lastOpenedAt: 110,
      updatedAt: 150,
      parentId: null,
      presentation,
    }
    const document = { ...createCanvasDocument('Styled board'), presentation }
    const source = {
      rootProjectId: 'project',
      projects: [project],
      files: [createCanvasFileRecord('project', document, 160, 'file')],
    }
    const before = structuredClone(source)
    let counter = 0
    const imported = parseProjectArchive(
      serializeProjectArchive(source),
      () => `new-${++counter}`,
    )
    expect(imported.projects[0].presentation).toEqual(presentation)
    expect(imported.projects[0].updatedAt).toBe(150)
    expect(imported.files[0].document.presentation).toEqual(presentation)
    expect(imported.files[0].projectId).toBe(imported.rootProjectId)
    expect(imported.rootProjectId).not.toBe('project')
    expect(source).toEqual(before)
  })

  it('preserves optional CLF presentation while retaining old v1 documents and strict fields', () => {
    const presentation = {
      ...DEFAULT_ITEM_PRESENTATION,
      icon: 'leaf' as const,
      color: '#12AB34',
      description: 'Recognizable cover',
    }
    const document = { ...createCanvasDocument('Sketch'), presentation }
    expect(parseLCANVAS(serializeLCANVAS(document))).toEqual(document)
    const legacy = {
      format: 'LCANVAS',
      version: 1,
      name: 'Before covers',
      viewport: { x: 30, y: -20, zoom: 0.8 },
      elements: [],
    }
    const migrated = validateCanvasDocument(legacy)
    expect(migrated).toMatchObject({
      version: 2,
      name: legacy.name,
      viewport: legacy.viewport,
      elements: [],
    })
    expect(migrated).not.toHaveProperty('presentation')
    expect(() =>
      validateCanvasDocument({
        ...document,
        presentation: { ...presentation, runScript: 'alert(1)' },
      }),
    ).toThrow()
    expect(() =>
      validateCanvasDocument({ ...document, unexpected: true }),
    ).toThrow()
  })

  it('exports workspace identity, library perspectives, precision and dates together in CLW', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)
    const source = createSavedWorkspace(
      customizedPreferences(),
      {
        ...DEFAULT_LAYOUT,
        homeView: {
          ...DEFAULT_HOME_VIEW,
          perspective: 'canvas',
          sort: 'modified',
        },
        workspaceView: { perspective: 'all', sort: 'created' },
      },
      'project',
      'Workspace One',
      'workspace',
    )
    const imported = parseSavedWorkspace(
      serializeSavedWorkspace(source),
      'imported',
    )
    expect(imported).toEqual({ ...source, id: 'imported' })
    expect(source.id).toBe('workspace')
    expect(imported.preferences.homeAppearance.backgroundAssetId).toBe(
      'ab'.repeat(32),
    )
    expect(imported.layout.homeView.sort).toBe('modified')
  })

  it('changes modification dates only for meaningful workspace edits', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100)
    const workspace = createSavedWorkspace(
      DEFAULT_PREFERENCES,
      DEFAULT_LAYOUT,
      null,
      'Plans',
      'workspace',
    )
    let state: WorkspaceSessions = {
      version: 1,
      activeId: workspace.id,
      items: [workspace],
    }
    clock.mockReturnValue(200)
    const unchangedPreferences = updateSavedWorkspace(state, 'workspace', {
      preferences: structuredClone(DEFAULT_PREFERENCES),
    })
    expect(unchangedPreferences.items[0].updatedAt).toBe(100)
    state = updateSavedWorkspace(state, 'workspace', { name: 'Plans' })
    expect(state.items[0].updatedAt).toBe(100)
    state = updateSavedWorkspace(state, 'workspace', {
      preferences: structuredClone(DEFAULT_PREFERENCES),
    })
    expect(state.items[0].updatedAt).toBe(100)
    state = updateSavedWorkspace(state, 'workspace', { lastOpenedAt: 200 })
    expect(state.items[0]).toMatchObject({
      createdAt: 100,
      updatedAt: 100,
      lastOpenedAt: 200,
    })
    clock.mockReturnValue(300)
    state = updateSavedWorkspace(state, 'workspace', {
      name: 'Renamed workspace',
    })
    expect(state.items[0]).toMatchObject({
      createdAt: 100,
      updatedAt: 300,
      lastOpenedAt: 200,
    })
    clock.mockReturnValue(400)
    state = updateSavedWorkspace(state, 'workspace', {
      preferences: customizedPreferences(),
    })
    expect(state.items[0].updatedAt).toBe(400)
    clock.mockReturnValue(500)
    state = updateSavedWorkspace(state, 'workspace', {
      preferences: customizedPreferences(),
    })
    expect(state.items[0].updatedAt).toBe(400)
  })
})
