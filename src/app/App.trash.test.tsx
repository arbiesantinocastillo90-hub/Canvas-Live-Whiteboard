import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  canvasFileStore,
  createCanvasFileRecord,
  type CanvasFileStore,
} from './canvasFiles'
import * as scope from './canvasStoreScope'
import { projectDrafts } from './canvasDrafts'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_PREFERENCES, EMPTY_STATE, STORAGE_KEY } from './workspace'
import { DEFAULT_LAYOUT } from './layout'
import {
  createSavedWorkspace,
  EMPTY_PROJECT_VIEW,
  SESSIONS_STORAGE_KEY,
  type WorkspaceSessions,
} from './workspaceSessions'

function setup(shared = false) {
  const projects = [
    { id: 'root', name: 'Alpha', createdAt: 1, lastOpenedAt: 1 },
    {
      id: 'child',
      name: 'Nested',
      parentId: 'root',
      createdAt: 1,
      lastOpenedAt: 1,
    },
    {
      id: 'target',
      name: 'Destination project',
      createdAt: 1,
      lastOpenedAt: 1,
    },
  ]
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...EMPTY_STATE, projects }),
  )
  const unrelatedView = {
    ...EMPTY_PROJECT_VIEW,
    openIds: ['other-drawing'],
    activeId: 'other-drawing',
  }
  const sessions: WorkspaceSessions = {
    version: 1,
    activeId: 'source',
    items: [
      {
        ...createSavedWorkspace(
          DEFAULT_PREFERENCES,
          DEFAULT_LAYOUT,
          null,
          'Source',
        ),
        id: 'source',
        projectIds: ['root', 'child'],
        views: {
          root: {
            ...EMPTY_PROJECT_VIEW,
            openIds: ['drawing'],
            activeId: 'drawing',
          },
        },
      },
      {
        ...createSavedWorkspace(
          DEFAULT_PREFERENCES,
          DEFAULT_LAYOUT,
          null,
          'Destination',
        ),
        id: 'destination',
        projectIds: ['target', ...(shared ? ['root'] : [])],
        views: { target: unrelatedView },
      },
    ],
  }
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
  const original = createCanvasFileRecord(
    'root',
    createCanvasDocument('Drawing'),
    1,
    'drawing',
  )
  const records = new Map([[original.id, original]])
  vi.spyOn(canvasFileStore, 'list').mockImplementation(async (projectId) => ({
    value: [...records.values()].filter(
      (record) => record.projectId === projectId,
    ),
    persistence: 'browser',
  }))
  vi.spyOn(canvasFileStore, 'get').mockImplementation(
    async (projectId, id) => ({
      value: records.get(id)?.projectId === projectId ? records.get(id)! : null,
      persistence: 'browser',
    }),
  )
  vi.spyOn(canvasFileStore, 'save').mockImplementation(async (record) => {
    records.set(record.id, record)
    return { value: record, persistence: 'browser' }
  })
  let scoped!: CanvasFileStore
  const createScoped = scope.createWorkspaceCanvasStore
  vi.spyOn(scope, 'createWorkspaceCanvasStore').mockImplementation(
    (...args) => {
      const created = createScoped(...args)
      if (args[1] === 'source') scoped = created
      return created
    },
  )
  return { original, records, sessions, unrelatedView, scoped: () => scoped }
}
function savedSessions(): WorkspaceSessions {
  return JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY)!)
}
async function manageFile() {
  fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Manage canvas Drawing' }),
  )
  return within(screen.getByRole('dialog', { name: 'Manage Drawing' }))
}
function chooseDestination(projectId = 'target') {
  fireEvent.change(screen.getByLabelText('Destination workspace'), {
    target: { value: 'destination' },
  })
  fireEvent.change(screen.getByLabelText('Destination project'), {
    target: { value: projectId },
  })
}

describe('App recoverable workspace item actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    window.location.hash = ''
  })

  it('trashes and restores a complete project tree while preserving canonical files and other workspace views', async () => {
    const fixture = setup()
    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage project Alpha' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      screen.queryByRole('button', { name: 'Browse project Alpha' }),
    ).toBeNull()
    expect(savedSessions().items[0].projectIds).toEqual([])
    expect(savedSessions().items[1].views.target).toEqual(fixture.unrelatedView)
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).projects,
    ).toHaveLength(3)
    expect(fixture.records.get('drawing')).toBe(fixture.original)
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Alpha' }))
    expect(
      await screen.findByRole('button', { name: 'Browse project Alpha' }),
    ).toBeInTheDocument()
    expect(savedSessions().items[0].projectIds).toEqual(['root', 'child'])
    expect(
      screen.getByRole('dialog', { name: 'Workspace Trash' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Trash is empty.')).toBeInTheDocument()
  })

  it('trashes a canvas only in the source workspace and restores the same saved identity', async () => {
    const fixture = setup(true)
    render(<App />)
    const dialog = await manageFile()
    fireEvent.click(dialog.getByRole('button', { name: 'Move to Trash' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      screen.queryByRole('button', { name: 'Open canvas Drawing in Alpha' }),
    ).toBeNull()
    expect(fixture.records.size).toBe(1)
    expect(savedSessions().items[1].projectIds).toContain('root')
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Drawing' }))
    expect(
      await screen.findByRole('button', {
        name: 'Open canvas Drawing in Alpha',
      }),
    ).toBeInTheDocument()
    expect(fixture.records.get('drawing')).toBe(fixture.original)
  })

  it('moves complete project membership to the destination and keeps a recoverable source reference', async () => {
    const fixture = setup()
    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage project Alpha' }),
    )
    fireEvent.change(screen.getByLabelText('Destination workspace'), {
      target: { value: 'destination' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(savedSessions().items[0].projectIds).toEqual([])
    expect(savedSessions().items[1].projectIds).toEqual([
      'target',
      'root',
      'child',
    ])
    expect(savedSessions().items[1].views.target).toEqual(fixture.unrelatedView)
    expect(canvasFileStore.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Alpha' }))
    await waitFor(() =>
      expect(savedSessions().items[0].projectIds).toEqual(['root', 'child']),
    )
    expect(savedSessions().items[1].projectIds).toEqual([
      'target',
      'root',
      'child',
    ])
  })

  it('retains Trash after a reload and reports an unavailable saved canvas without discarding the reference', async () => {
    const fixture = setup()
    const view = render(<App />)
    const dialog = await manageFile()
    fireEvent.click(dialog.getByRole('button', { name: 'Move to Trash' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    view.unmount()
    render(<App />)
    await screen.findByRole('button', { name: 'Trash' })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    const restore = await screen.findByRole('button', {
      name: 'Restore Drawing',
    })
    fixture.records.delete('drawing')
    fireEvent.click(restore)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'saved canvas is unavailable',
    )
    expect(
      screen.getByRole('button', { name: 'Restore Drawing' }),
    ).toBeInTheDocument()
    expect(
      JSON.parse(localStorage.getItem('canvas-live.trash.v1:source')!).items,
    ).toHaveLength(1)
  })

  it('does not hide an original if the active workspace changes during the destination save', async () => {
    const fixture = setup()
    let finish!: () => void
    vi.mocked(canvasFileStore.save).mockImplementation(
      (record) =>
        new Promise((resolve) => {
          finish = () => {
            fixture.records.set(record.id, record)
            resolve({ value: record, persistence: 'browser' })
          }
        }),
    )
    render(<App />)
    await manageFile()
    chooseDestination()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(canvasFileStore.save).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }))
    fireEvent.click(screen.getByRole('button', { name: 'Destination' }))
    await act(async () => finish())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(savedSessions().activeId).toBe('destination')
    expect(fixture.records.size).toBe(2)
    expect(localStorage.getItem('canvas-live.trash.v1:source')).toBeNull()
  })

  it('cancels a pending move without saving or hiding anything', async () => {
    const fixture = setup()
    render(<App />)
    await manageFile()
    chooseDestination()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(canvasFileStore.save).not.toHaveBeenCalled()
    expect(fixture.records.size).toBe(1)
    expect(localStorage.getItem('canvas-live.trash.v1:source')).toBeNull()
  })

  it('persists a destination canvas before hiding its original and retains unrelated views', async () => {
    const fixture = setup()
    render(<App />)
    await manageFile()
    chooseDestination()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(fixture.records.size).toBe(2)
    const copy = [...fixture.records.values()].find(
      (record) => record.id !== 'drawing',
    )!
    expect(copy.projectId).toBe('target')
    expect(copy.document).toEqual(fixture.original.document)
    expect(fixture.records.get('drawing')).toBe(fixture.original)
    expect(
      JSON.parse(localStorage.getItem('canvas-live.trash.v1:source')!).items[0]
        .id,
    ).toBe('drawing')
    expect(savedSessions().items[1].views.target).toEqual(fixture.unrelatedView)
    expect(
      screen.queryByRole('button', { name: 'Open canvas Drawing in Alpha' }),
    ).toBeNull()
  })

  it('keeps the original visible and out of Trash when destination saving fails', async () => {
    const fixture = setup()
    vi.mocked(canvasFileStore.save).mockRejectedValue(new Error('Disk full'))
    render(<App />)
    await manageFile()
    chooseDestination()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full')
    expect(
      screen.getByRole('button', { name: 'Open canvas Drawing in Alpha' }),
    ).toBeInTheDocument()
    expect(fixture.records.size).toBe(1)
    expect(localStorage.getItem('canvas-live.trash.v1:source')).toBeNull()
  })

  it('keeps both copies and reports a failed source hide after a destination was saved', async () => {
    const fixture = setup()
    render(<App />)
    await manageFile()
    chooseDestination()
    const write = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === 'canvas-live.trash.v1:source')
        throw new Error('Quota exceeded')
      return write.call(this, key, value)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Both copies were retained',
    )
    expect(fixture.records.size).toBe(2)
    expect(
      screen.getByRole('button', { name: 'Open canvas Drawing in Alpha' }),
    ).toBeInTheDocument()
    expect(localStorage.getItem('canvas-live.trash.v1:source')).toBeNull()
  })

  it('reuses a canonical canvas shared with the destination workspace without duplicating it', async () => {
    const fixture = setup(true)
    render(<App />)
    await manageFile()
    chooseDestination('root')
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(canvasFileStore.save).not.toHaveBeenCalled()
    expect(fixture.records.size).toBe(1)
    expect(savedSessions().items[1].projectIds).toContain('root')
  })

  it('blocks removing unsaved drafts until they are saved', async () => {
    const fixture = setup()
    render(<App />)
    await manageFile()
    projectDrafts(fixture.scoped()).set('root', [
      {
        record: {
          ...fixture.original,
          document: createCanvasDocument('Unsaved changes'),
        },
        dirty: true,
        savedDocument: fixture.original.document,
        persistence: 'browser',
      },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Save the open edits',
    )
    expect(localStorage.getItem('canvas-live.trash.v1:source')).toBeNull()
    expect(fixture.records.get('drawing')).toBe(fixture.original)
  })

  it('retains source membership if saving workspace references fails', async () => {
    const fixture = setup()
    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage project Alpha' }),
    )
    const write = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === SESSIONS_STORAGE_KEY)
        throw new Error('Workspace storage unavailable')
      return write.call(this, key, value)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'original references were retained',
    )
    expect(
      screen.getByRole('button', { name: 'Browse project Alpha' }),
    ).toBeInTheDocument()
    expect(savedSessions().items[0].projectIds).toEqual(['root', 'child'])
    expect(fixture.records.get('drawing')).toBe(fixture.original)
  })
})
