import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage'
import { createCanvasDocument } from './lcanvas'
import { createCanvasFileRecord, createCanvasFileStore } from './canvasFiles'
import {
  createLocalLibraryClient,
  createSharedCanvasFileStore,
  libraryKey,
  type LibraryIssue,
} from './localLibrary'
import { DEFAULT_HOME_VIEW } from './homeView'
import { projectDrafts } from './canvasDrafts'
import { createWorkspaceCanvasStore } from './canvasStoreScope'

async function setup() {
  const records = [
    createCanvasFileRecord(
      'alpha',
      createCanvasDocument('Roadmap'),
      2,
      'roadmap',
    ),
    createCanvasFileRecord('beta', createCanvasDocument('Ideas'), 1, 'ideas'),
  ]
  const projects = [
    { id: 'alpha', name: 'Alpha', createdAt: 1, lastOpenedAt: 2 },
    { id: 'beta', name: 'Beta', createdAt: 1, lastOpenedAt: 1 },
  ]
  let issues: LibraryIssue[] = []
  let offline = false
  const unreadable = new Set<string>()
  const fetcher = vi.fn<typeof fetch>(async (target) => {
    if (offline) throw new Error('USB disconnected')
    const path = String(target)
    let value: unknown
    if (path.endsWith('/catalog'))
      value = {
        version: 2,
        entries: {},
        files: records.map((record) => ({
          key: libraryKey('file', record.id),
          revision: 1,
          id: record.id,
          projectId: record.projectId,
          name: record.document.name,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          lastOpenedAt: record.lastOpenedAt,
        })),
        issues,
      }
    else {
      const key = decodeURIComponent(
        path.slice('/__canvas_live_library/'.length),
      )
      if (unreadable.has(key)) throw new Error('This saved file is unreadable')
      value = {
        revision: 1,
        value: records.find((record) => libraryKey('file', record.id) === key),
      }
    }
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      body: null,
      text: async () => JSON.stringify(value),
    } as unknown as Response
  })
  const client = createLocalLibraryClient({
    fetch: fetcher,
    enabled: () => true,
  })
  await client.initialize()
  const fallback = createCanvasFileStore({ indexedDB: null })
  const store = createSharedCanvasFileStore(fallback, client)
  const props = {
    projects,
    selectedProjectId: null,
    store,
    onSelectProject: vi.fn(),
    onNewProject: vi.fn(),
    onRenameProject: vi.fn(),
    onOpenFile: vi.fn(),
    onNewCanvas: vi.fn(),
    onImport: vi.fn(),
  }
  return {
    props,
    store,
    client,
    fetcher,
    records,
    unreadable,
    setIssues: (value: LibraryIssue[]) => {
      issues = value
    },
    disconnect: () => {
      offline = true
    },
  }
}

describe('native Home catalog and recovery', () => {
  it('filters workspace Trash out of native summary counts, hierarchy and recoverable drafts without reading its body', async () => {
    const native = await setup()
    let visible = false
    const scoped = createWorkspaceCanvasStore(
      native.store,
      'source',
      () => true,
      () => undefined,
      (id) => id !== 'roadmap' || visible,
    )
    projectDrafts(scoped).set('alpha', [
      {
        record: native.records[0],
        dirty: false,
        savedDocument: native.records[0].document,
        persistence: 'browser',
      },
    ])
    const view = render(<HomePage {...native.props} store={scoped} />)
    const alpha = await screen.findByRole('button', {
      name: 'Browse project Alpha',
    })
    await waitFor(() =>
      expect(within(alpha).getByText('0 canvases')).toBeInTheDocument(),
    )
    expect(
      native.fetcher.mock.calls.every(([path]) =>
        String(path).endsWith('/catalog'),
      ),
    ).toBe(true)
    view.rerender(
      <HomePage
        {...native.props}
        store={scoped}
        view={{
          ...DEFAULT_HOME_VIEW,
          display: 'hierarchy',
          hierarchyShowCanvases: true,
        }}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Open canvas Roadmap in Alpha' }),
    ).toBeNull()
    visible = true
    view.rerender(
      <HomePage
        {...native.props}
        store={scoped}
        view={{
          ...DEFAULT_HOME_VIEW,
          display: 'hierarchy',
          hierarchyShowCanvases: true,
        }}
      />,
    )
    expect(
      await screen.findByRole('button', {
        name: 'Open canvas Roadmap in Alpha',
      }),
    ).toBeInTheDocument()
  })
  it('shows canvas names in project hierarchies from the index alone', async () => {
    const native = await setup()
    render(
      <HomePage
        {...native.props}
        view={{
          ...DEFAULT_HOME_VIEW,
          display: 'hierarchy',
          hierarchyShowCanvases: true,
        }}
      />,
    )
    expect(
      await screen.findByRole('button', {
        name: 'Open canvas Roadmap in Alpha',
      }),
    ).toBeInTheDocument()
    expect(
      native.fetcher.mock.calls.every(([path]) =>
        String(path).endsWith('/catalog'),
      ),
    ).toBe(true)
  })

  it('downloads only the selected project when opening its contents', async () => {
    const native = await setup()
    render(
      <HomePage
        {...native.props}
        view={{ ...DEFAULT_HOME_VIEW, openedProjectId: 'alpha' }}
      />,
    )
    expect(
      await screen.findByRole('button', {
        name: 'Open canvas Roadmap in Alpha',
      }),
    ).toBeInTheDocument()
    expect(
      native.fetcher.mock.calls
        .filter(([path]) => !String(path).endsWith('/catalog'))
        .map(([path]) => decodeURIComponent(String(path))),
    ).toEqual([`/__canvas_live_library/${libraryKey('file', 'roadmap')}`])
    expect(
      screen.queryByRole('button', { name: 'Open canvas Ideas in Beta' }),
    ).toBeNull()
  })

  it('renders accurate project counts without downloading document bodies and loads real thumbnails when switching to Canvas', async () => {
    const native = await setup()
    render(<HomePage {...native.props} />)
    const alpha = await screen.findByRole('button', {
      name: 'Browse project Alpha',
    })
    expect(within(alpha).getByText('1 canvas')).toBeInTheDocument()
    expect(
      native.fetcher.mock.calls.every(([path]) =>
        String(path).endsWith('/catalog'),
      ),
    ).toBe(true)
    expect(document.querySelector('.canvas-thumbnail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    expect(
      await screen.findByRole('button', {
        name: 'Open canvas Roadmap in Alpha',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open canvas Ideas in Beta' }),
    ).toBeInTheDocument()
    expect(
      native.fetcher.mock.calls.filter(
        ([path]) => !String(path).endsWith('/catalog'),
      ),
    ).toHaveLength(2)
  })

  it('counts unsaved drafts once while keeping their recoverable names when opening project contents', async () => {
    const native = await setup()
    projectDrafts(native.store).set('alpha', [
      {
        record: {
          ...native.records[0],
          document: createCanvasDocument('Working roadmap'),
        },
        dirty: true,
        savedDocument: native.records[0].document,
        persistence: 'browser',
      },
    ])
    render(<HomePage {...native.props} />)
    const alpha = await screen.findByRole('button', {
      name: 'Browse project Alpha',
    })
    expect(within(alpha).getByText('1 canvas')).toBeInTheDocument()
    fireEvent.click(alpha)
    const working = await screen.findByRole('button', {
      name: 'Open canvas Working roadmap in Alpha',
    })
    expect(
      within(working).getByLabelText('Unsaved changes'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open canvas Roadmap in Alpha' }),
    ).toBeNull()
  })

  it('keeps healthy files and drafts visible with a retry action after a partial read failure', async () => {
    const native = await setup()
    native.unreadable.add(libraryKey('file', 'roadmap'))
    projectDrafts(native.store).set('alpha', [
      {
        record: {
          ...native.records[0],
          document: createCanvasDocument('Recoverable roadmap'),
        },
        dirty: true,
        savedDocument: native.records[0].document,
        persistence: 'browser',
      },
    ])
    render(
      <HomePage
        {...native.props}
        view={{ ...DEFAULT_HOME_VIEW, perspective: 'canvas' }}
      />,
    )
    expect(
      await screen.findByRole('button', {
        name: 'Open canvas Recoverable roadmap in Alpha',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open canvas Ideas in Beta' }),
    ).toBeInTheDocument()
    const retry = screen.getByRole('button', {
      name: 'Retry loading saved files',
    })
    expect(
      screen.getByText(/1 saved item could not be loaded/),
    ).toBeInTheDocument()
    native.unreadable.clear()
    fireEvent.click(retry)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Retry loading saved files' }),
      ).toBeNull(),
    )
    expect(
      screen.getByRole('button', {
        name: 'Open canvas Recoverable roadmap in Alpha',
      }),
    ).toBeInTheDocument()
  })

  it('shows a recovered-copy notice on project-only Home and clears it when the user retries successfully', async () => {
    const native = await setup()
    native.setIssues([
      {
        key: libraryKey('file', 'roadmap'),
        recovered: true,
        message: 'Recovered from the previous valid copy',
      },
    ])
    render(<HomePage {...native.props} />)
    await screen.findByRole('button', { name: 'Browse project Alpha' })
    expect(
      screen.getByText(/recovered from a previous valid copy/),
    ).toBeInTheDocument()
    native.setIssues([])
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry loading saved files' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Retry loading saved files' }),
      ).toBeNull(),
    )
  })

  it('retains the last native index with an explicit stale warning when the drive disconnects', async () => {
    const native = await setup()
    native.disconnect()
    render(<HomePage {...native.props} />)
    const alpha = await screen.findByRole('button', {
      name: 'Browse project Alpha',
    })
    expect(within(alpha).getByText('1 canvas')).toBeInTheDocument()
    expect(
      screen.getByText(/Showing the last loaded index/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Retry loading saved files' }),
    ).toBeInTheDocument()
  })
})
