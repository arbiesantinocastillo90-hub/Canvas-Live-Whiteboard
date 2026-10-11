import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createProject,
  DEFAULT_PREFERENCES,
  EMPTY_STATE,
  loadWorkspace,
  openProject,
  parseWorkspace,
  persistWorkspace,
  recentProjects,
  renameProject,
  STORAGE_KEY,
  type WorkspaceState,
} from './workspace'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('workspace metadata validation', () => {
  it('starts with independent default objects and no fictional projects', () => {
    const first = parseWorkspace(null)
    first.preferences.mode = 'dark'
    first.projects.push({
      id: 'mutated',
      name: 'Test',
      createdAt: 1,
      lastOpenedAt: 1,
    })
    expect(parseWorkspace(null)).toEqual(EMPTY_STATE)
    expect(DEFAULT_PREFERENCES.mode).toBe('system')
  })

  it('round-trips all preferences and project metadata without extra fields', () => {
    const state = createProject(EMPTY_STATE, '  Roadmap  ', 1000, 'roadmap')
    state.preferences = {
      ...DEFAULT_PREFERENCES,
      mode: 'dark',
      accent: '#1aB2c3',
      density: 'compact',
      grid: 'lines',
      reduceMotion: true,
      contrast: 75,
      backgroundColor: '#142536',
      surfaceColor: '#253647',
      textColor: '#e4e5e6',
      borderColor: '#546576',
      gridColor: '#657687',
      motionStyle: 'smooth',
      motionSpeed: 'slow',
    }
    const raw = JSON.stringify({ ...state, privateField: 'not retained' })
    expect(parseWorkspace(raw)).toEqual(state)
    expect(parseWorkspace(raw)).not.toHaveProperty('privateField')
  })

  it('adds new appearance defaults to old workspaces without losing their projects', () => {
    const state = createProject(EMPTY_STATE, 'Existing', 100, 'existing')
    const oldPreferences = {
      mode: 'dark',
      accent: '#123456',
      density: 'compact',
      grid: 'lines',
      reduceMotion: true,
    }
    const loaded = parseWorkspace(
      JSON.stringify({ ...state, preferences: oldPreferences }),
    )
    expect(loaded.projects).toEqual(state.projects)
    expect(loaded.lastProjectId).toBe('existing')
    expect(loaded.preferences).toEqual({
      ...DEFAULT_PREFERENCES,
      ...oldPreferences,
    })
  })

  it.each(['{broken', 'null', '[]', '{}', '{"version":2}'])(
    'recovers from corrupt or unsupported data: %s',
    (raw) => {
      expect(parseWorkspace(raw)).toEqual(EMPTY_STATE)
    },
  )

  it.each([
    { mode: 'sepia' },
    { mode: ['dark'] },
    { accent: 'url(https://example.com)' },
    { accent: '#fff' },
    { density: 'tiny' },
    { grid: 'triangle' },
    { reduceMotion: 'true' },
    { contrast: -1 },
    { contrast: 101 },
    { contrast: 50.5 },
    { contrast: '50' },
    { backgroundColor: '#fff' },
    { surfaceColor: 'red' },
    { textColor: 'url(https://example.com)' },
    { borderColor: false },
    { gridColor: [] },
    { motionStyle: 'bouncy' },
    { motionStyle: ['subtle'] },
    { motionSpeed: 'instant' },
    { motionSpeed: ['slow'] },
  ])('rejects unsupported preference values: %j', (overrides) => {
    const invalid = {
      ...EMPTY_STATE,
      preferences: { ...DEFAULT_PREFERENCES, ...overrides },
    }
    expect(parseWorkspace(JSON.stringify(invalid))).toEqual(EMPTY_STATE)
  })

  it.each([
    { id: '' },
    { id: ' id ' },
    { name: '  ' },
    { name: 'a'.repeat(81) },
    { createdAt: '2026-10-09' },
    { createdAt: -1 },
    { lastOpenedAt: 0 },
    { lastOpenedAt: 1.5 },
    { lastOpenedAt: 9_000_000_000_000_000 },
  ])('rejects invalid project metadata: %j', (overrides) => {
    const state = createProject(EMPTY_STATE, 'First', 100, 'first')
    state.projects[0] = {
      ...state.projects[0],
      ...overrides,
    } as WorkspaceState['projects'][number]
    expect(parseWorkspace(JSON.stringify(state))).toEqual(EMPTY_STATE)
  })

  it('rejects duplicate IDs, missing latest project references, and excess records', () => {
    const state = createProject(EMPTY_STATE, 'First', 100, 'first')
    expect(
      parseWorkspace(
        JSON.stringify({
          ...state,
          projects: [...state.projects, ...state.projects],
        }),
      ),
    ).toEqual(EMPTY_STATE)
    expect(
      parseWorkspace(JSON.stringify({ ...state, lastProjectId: 'missing' })),
    ).toEqual(EMPTY_STATE)
    const projects = Array.from({ length: 101 }, (_, index) => ({
      id: `project-${index}`,
      name: `Project ${index}`,
      createdAt: 1,
      lastOpenedAt: 1,
    }))
    expect(
      parseWorkspace(JSON.stringify({ ...EMPTY_STATE, projects })),
    ).toEqual(EMPTY_STATE)
  })
})

describe('workspace storage', () => {
  it('persists and restores a real project using the versioned storage key', () => {
    const state = createProject(EMPTY_STATE, 'Planning', 1000, 'planning')
    expect(persistWorkspace(state)).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(loadWorkspace()).toEqual(state)
  })

  it('recovers when the browser refuses access to the storage property', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('Access denied')
    })
    expect(loadWorkspace()).toEqual(EMPTY_STATE)
    expect(persistWorkspace(EMPTY_STATE)).toBe(false)
  })

  it('reports failed reads or writes without crashing or claiming persistence', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('Access denied')
      },
      setItem() {
        throw new Error('Quota exceeded')
      },
    })
    expect(loadWorkspace()).toEqual(EMPTY_STATE)
    expect(persistWorkspace(EMPTY_STATE)).toBe(false)
  })

  it('works safely when storage is unavailable and refuses invalid writes', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadWorkspace()).toEqual(EMPTY_STATE)
    expect(persistWorkspace(EMPTY_STATE)).toBe(false)
    vi.unstubAllGlobals()
    const invalid = { ...EMPTY_STATE, version: 2 } as unknown as WorkspaceState
    expect(persistWorkspace(invalid)).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('project operations', () => {
  it('creates and reopens projects without changing the input state', () => {
    const first = createProject(EMPTY_STATE, '  First  ', 100, 'first')
    const second = createProject(first, 'Second', 200, 'second')
    const reopened = openProject(second, 'first', 300)
    expect(first.projects).toHaveLength(1)
    expect(second.lastProjectId).toBe('second')
    expect(reopened.lastProjectId).toBe('first')
    expect(recentProjects(reopened).map((project) => project.id)).toEqual([
      'first',
      'second',
    ])
    expect(reopened.projects[0]).toMatchObject({
      name: 'First',
      createdAt: 100,
      lastOpenedAt: 300,
    })
    expect(second.projects[0].lastOpenedAt).toBe(100)
  })

  it('prioritizes the latest opened project when timestamps tie or the clock moves back', () => {
    const first = createProject(EMPTY_STATE, 'First', 100, 'first')
    const second = createProject(first, 'Second', 100, 'second')
    expect(recentProjects(second)[0].id).toBe('second')
    const reopened = openProject(second, 'first', 50)
    expect(recentProjects(reopened)[0].id).toBe('first')
    expect(reopened.projects[0].lastOpenedAt).toBe(100)
    expect(recentProjects(reopened)).not.toBe(reopened.projects)
  })

  it('renames a project without changing its ID, recency, or latest selection', () => {
    const state = createProject(EMPTY_STATE, 'First', 100, 'first')
    const renamed = renameProject(state, 'first', '  Updated plan  ')
    expect(renamed.projects[0]).toEqual({
      ...state.projects[0],
      name: 'Updated plan',
    })
    expect(renamed.lastProjectId).toBe('first')
    expect(state.projects[0].name).toBe('First')
    expect(openProject(state, 'unknown')).toBe(state)
    expect(renameProject(state, 'unknown', 'Ignored')).toBe(state)
  })

  it.each(['', '  ', 'a'.repeat(81)])(
    'rejects invalid create and rename names: %s',
    (name) => {
      const state = createProject(EMPTY_STATE, 'First', 100, 'first')
      expect(() => createProject(state, name, 200, 'second')).toThrow(
        'between 1 and 80',
      )
      expect(() => renameProject(state, 'first', name)).toThrow(
        'between 1 and 80',
      )
    },
  )

  it('accepts the name boundary and rejects duplicate IDs or invalid timestamps', () => {
    const state = createProject(EMPTY_STATE, 'a'.repeat(80), 100, 'first')
    expect(state.projects[0].name).toHaveLength(80)
    expect(() => createProject(state, 'Duplicate', 200, 'first')).toThrow(
      'Please try again',
    )
    expect(() => createProject(state, 'Invalid', Number.NaN, 'second')).toThrow(
      'date is invalid',
    )
    expect(() => openProject(state, 'first', Number.POSITIVE_INFINITY)).toThrow(
      'date is invalid',
    )
  })

  it('allows 100 projects and gives a friendly error before exceeding the limit', () => {
    let state = parseWorkspace(null)
    for (let index = 0; index < 100; index += 1) {
      state = createProject(
        state,
        `Project ${index}`,
        index,
        `project-${index}`,
      )
    }
    expect(parseWorkspace(JSON.stringify(state))).toEqual(state)
    expect(() =>
      createProject(state, 'One too many', 101, 'project-101'),
    ).toThrow('limit of 100 projects')
  })
})
