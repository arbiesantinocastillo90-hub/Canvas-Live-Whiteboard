import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage'
import { DEFAULT_HOME_VIEW } from './homeView'
import { createCanvasFileRecord, type CanvasFileStore } from './canvasFiles'
import { projectDrafts } from './canvasDrafts'
import { createCanvasDocument } from './lcanvas'
import type { Project } from './workspace'
import { localFilesFor } from './canvasLocalFiles'
import { NotificationBell, NotificationsProvider } from './SessionNotifications'

const projects: Project[] = [
  { id: 'alpha', name: 'Alpha', createdAt: 1, lastOpenedAt: 2 },
  { id: 'beta', name: 'Beta', createdAt: 1, lastOpenedAt: 1 },
]
function setup() {
  const records = [
    createCanvasFileRecord(
      'alpha',
      createCanvasDocument('Roadmap'),
      2,
      'roadmap',
    ),
    createCanvasFileRecord('beta', createCanvasDocument('Ideas'), 1, 'ideas'),
  ]
  const store: CanvasFileStore = {
    list: vi.fn(async (id) => ({
      value: records.filter((record) => record.projectId === id),
      persistence: 'browser' as const,
    })),
    get: vi.fn(),
    markOpened: vi.fn(),
    save: vi.fn(),
  }
  const props = {
    projects,
    view: { ...DEFAULT_HOME_VIEW, perspective: 'canvas' as const },
    selectedProjectId: null,
    store,
    onSelectProject: vi.fn(),
    onNewProject: vi.fn(),
    onRenameProject: vi.fn(),
    onOpenFile: vi.fn(),
    onNewCanvas: vi.fn(),
    onImport: vi.fn(),
  }
  return { props, records, store }
}
describe('home project and file library', () => {
  it('shows canvas rows in the project hierarchy only when enabled and remembers the workspace view', async () => {
    const { props, store } = setup()
    const onViewChange = vi.fn()
    const homeView = { ...DEFAULT_HOME_VIEW, display: 'hierarchy' as const }
    const view = render(
      <HomePage {...props} view={homeView} onViewChange={onViewChange} />,
    )
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Show canvas files',
    })
    expect(checkbox).not.toBeChecked()
    expect(screen.queryByRole('button', { name: /Open canvas/ })).toBeNull()
    const readCount = vi.mocked(store.list).mock.calls.length
    fireEvent.click(checkbox)
    expect(onViewChange).toHaveBeenLastCalledWith({
      ...homeView,
      hierarchyShowCanvases: true,
    })
    const enabledView = JSON.parse(
      JSON.stringify(onViewChange.mock.lastCall?.[0]),
    )
    view.rerender(
      <HomePage {...props} view={enabledView} onViewChange={onViewChange} />,
    )
    expect(
      screen.getByRole('checkbox', { name: 'Show canvas files' }),
    ).toBeChecked()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open canvas Roadmap in Alpha' }),
    )
    expect(props.onOpenFile).toHaveBeenCalledWith('alpha', 'roadmap')
    expect(store.list).toHaveBeenCalledTimes(readCount)
    expect(store.markOpened).not.toHaveBeenCalled()
    expect(store.save).not.toHaveBeenCalled()
    view.rerender(
      <HomePage {...props} view={homeView} onViewChange={onViewChange} />,
    )
    expect(screen.queryByRole('button', { name: /Open canvas/ })).toBeNull()
  })

  it('discards a late file response after switching workspace stores and rejects rows from other projects', async () => {
    const { props, records, store } = setup()
    let release!: () => void
    vi.mocked(store.list).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { value: [records[0]], persistence: 'browser' }
    })
    const onlyAlpha = [projects[0]]
    const hierarchyView = {
      ...DEFAULT_HOME_VIEW,
      display: 'hierarchy' as const,
      hierarchyShowCanvases: true,
    }
    const view = render(
      <HomePage {...props} projects={onlyAlpha} view={hierarchyView} />,
    )
    await waitFor(() => expect(store.list).toHaveBeenCalledOnce())
    const nextStore: CanvasFileStore = {
      ...store,
      list: vi.fn(async () => ({
        value: [records[1], records[0]],
        persistence: 'browser' as const,
      })),
    }
    view.rerender(
      <HomePage
        {...props}
        projects={[projects[1]]}
        store={nextStore}
        view={hierarchyView}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /Open canvas Roadmap/ }),
    ).toBeNull()
    await screen.findByRole('button', { name: 'Open canvas Ideas in Beta' })
    await act(async () => {
      release()
    })
    expect(
      screen.queryByRole('button', { name: /Open canvas Roadmap/ }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Open canvas Ideas in Beta' }),
    ).toBeInTheDocument()
  })

  it('bounds concurrent project reads when a large hierarchy is imported', async () => {
    const { props, store } = setup()
    const manyProjects = Array.from({ length: 11 }, (_, index) => ({
      ...projects[0],
      id: `project-${index}`,
      name: `Project ${index}`,
    }))
    let active = 0,
      peak = 0
    vi.mocked(store.list).mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active--
      return { value: [], persistence: 'browser' }
    })
    render(
      <HomePage
        {...props}
        projects={manyProjects}
        view={{ ...DEFAULT_HOME_VIEW, display: 'hierarchy' }}
      />,
    )
    await screen.findByRole('checkbox', { name: 'Show canvas files' })
    expect(store.list).toHaveBeenCalledTimes(11)
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('shows the current workspace above the library while keeping the selected project heading', async () => {
    const { props } = setup()
    render(
      <HomePage
        {...props}
        workspaceName="Writing desk"
        selectedProjectId="alpha"
        view={{ ...DEFAULT_HOME_VIEW, openedProjectId: 'alpha' }}
      />,
    )
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    expect(
      screen.getByRole('heading', { name: 'Current workspace' }),
    ).toHaveTextContent('Writing desk')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Alpha' }),
    ).toBeInTheDocument()
    expect(screen.getByTitle('Roadmap.CLF')).toHaveTextContent('.CLF')
  })

  it('forwards the independent All projects disclosure without hiding recent shortcuts or files', async () => {
    const { props } = setup()
    const onAllProjectsCollapsedChange = vi.fn()
    const view = render(
      <HomePage
        {...props}
        view={{ ...DEFAULT_HOME_VIEW, openedProjectId: 'alpha' }}
        allProjectsCollapsed={false}
        onAllProjectsCollapsedChange={onAllProjectsCollapsedChange}
      />,
    )
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    fireEvent.click(screen.getByRole('button', { name: 'All projects' }))
    expect(onAllProjectsCollapsedChange).toHaveBeenCalledWith(true)
    view.rerender(
      <HomePage
        {...props}
        view={{ ...DEFAULT_HOME_VIEW, openedProjectId: 'alpha' }}
        allProjectsCollapsed
        onAllProjectsCollapsedChange={onAllProjectsCollapsedChange}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Open project Alpha' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Select recent project Alpha' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open canvas Roadmap in Alpha' }),
    ).toBeInTheDocument()
  })
  it('includes descendant files when browsing a parent organizer while preserving each file project', async () => {
    const { props, store } = setup()
    const nestedProjects: Project[] = [
      { ...projects[0], name: 'Finance' },
      { ...projects[1], name: 'Savings', parentId: 'alpha' },
    ]
    render(
      <HomePage
        {...props}
        projects={nestedProjects}
        selectedProjectId="alpha"
        view={{ ...DEFAULT_HOME_VIEW, openedProjectId: 'alpha' }}
      />,
    )
    const childFile = await screen.findByRole('button', {
      name: 'Open canvas Ideas in Savings',
    })
    expect(
      screen.getByRole('button', { name: 'Open canvas Roadmap in Finance' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Finance' }),
    ).toBeInTheDocument()
    fireEvent.click(childFile)
    expect(props.onOpenFile).toHaveBeenCalledWith('beta', 'ideas')
    fireEvent.click(
      screen.getByRole('button', { name: 'Create project inside Finance' }),
    )
    expect(props.onNewProject).toHaveBeenCalledWith('alpha')
    fireEvent.click(screen.getByRole('button', { name: 'New canvas' }))
    fireEvent.change(screen.getByLabelText('Destination project'), {
      target: { value: 'alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(props.onNewCanvas).toHaveBeenCalledWith('alpha')
    expect(store.save).not.toHaveBeenCalled()
  })

  it('forwards project shortcut actions without opening or deleting the associated files', async () => {
    const { props, store } = setup()
    const onPinProject = vi.fn(),
      onHideRecentProject = vi.fn(),
      onProjectRecentsCollapsedChange = vi.fn()
    render(
      <HomePage
        {...props}
        view={{ ...DEFAULT_HOME_VIEW, openedProjectId: 'alpha' }}
        onPinProject={onPinProject}
        onHideRecentProject={onHideRecentProject}
        onProjectRecentsCollapsedChange={onProjectRecentsCollapsedChange}
      />,
    )
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    fireEvent.click(screen.getByRole('button', { name: 'Pin project Alpha' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove project Alpha from recent list',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Recent projects' }))
    expect(onPinProject).toHaveBeenCalledWith('alpha', true)
    expect(onHideRecentProject).toHaveBeenCalledWith('alpha')
    expect(onProjectRecentsCollapsedChange).toHaveBeenCalledWith(true)
    expect(props.onOpenFile).not.toHaveBeenCalled()
    expect(props.onSelectProject).not.toHaveBeenCalled()
    expect(store.save).not.toHaveBeenCalled()
  })
  it('shows the physical save baseline when the older browser copy could not be updated', async () => {
    const { props, records, store } = setup()
    await localFilesFor(store).set('alpha', records[0].id, {
      handle: {
        kind: 'file',
        name: 'physical.lcanvas',
        getFile: vi.fn(),
        createWritable: vi.fn(),
      },
      autoSave: false,
      savedDocument: { ...records[0].document, name: 'Physical roadmap' },
    })
    render(<HomePage {...props} />)
    await screen.findByRole('button', {
      name: 'Open canvas Physical roadmap in Alpha',
    })
    expect(
      screen.queryByRole('button', { name: 'Open canvas Roadmap in Alpha' }),
    ).toBeNull()
    expect(store.save).not.toHaveBeenCalled()
  })
  it('lists real files without opening, saving or changing their recency', async () => {
    const { props, store } = setup()
    render(<HomePage {...props} />)
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    expect(
      screen.getByRole('button', { name: 'Open canvas Ideas in Beta' }),
    ).toBeInTheDocument()
    expect(store.save).not.toHaveBeenCalled()
    expect(store.markOpened).not.toHaveBeenCalled()
    expect(document.querySelector('.canvas-editor')).toBeNull()
  })
  it('filters by selected project and canvas name, then explicitly opens the chosen file', async () => {
    const { props } = setup()
    const view = render(<HomePage {...props} />)
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ideas' },
    })
    expect(
      screen.queryByRole('button', { name: 'Open canvas Roadmap in Alpha' }),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open canvas Ideas in Beta' }),
    )
    expect(props.onOpenFile).toHaveBeenCalledWith('beta', 'ideas')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    view.rerender(
      <HomePage
        {...props}
        selectedProjectId="alpha"
        view={{ ...DEFAULT_HOME_VIEW, openedProjectId: 'alpha' }}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Open canvas Ideas in Beta' }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Alpha' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New canvas' }))
    fireEvent.change(screen.getByLabelText('Destination project'), {
      target: { value: 'alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(props.onNewCanvas).toHaveBeenCalledWith('alpha')
  })
  it('shows cached unsaved names and orphan drafts without overwriting saved records', async () => {
    const { props, records, store } = setup()
    const draft = {
      ...records[0],
      document: { ...records[0].document, name: 'Working name' },
    }
    const orphan = createCanvasFileRecord(
      'alpha',
      createCanvasDocument('Unsaved import'),
      3,
      'orphan',
    )
    projectDrafts(store).set('alpha', [
      {
        record: draft,
        dirty: true,
        savedDocument: records[0].document,
        persistence: 'browser',
      },
      {
        record: orphan,
        dirty: true,
        savedDocument: orphan.document,
        persistence: 'session',
      },
    ])
    render(<HomePage {...props} />)
    const card = await screen.findByRole('button', {
      name: 'Open canvas Working name in Alpha',
    })
    expect(within(card).getByLabelText('Unsaved changes')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Open canvas Unsaved import in Alpha',
      }),
    ).toBeInTheDocument()
    expect(store.save).not.toHaveBeenCalled()
  })
  it('keeps available drafts when a project read fails and reports the failure', async () => {
    const { props, records, store } = setup()
    vi.mocked(store.list).mockRejectedValue(new Error('Read failed'))
    projectDrafts(store).set('alpha', [
      {
        record: records[0],
        dirty: true,
        savedDocument: records[0].document,
        persistence: 'browser',
      },
    ])
    render(
      <NotificationsProvider>
        <HomePage {...props} />
        <NotificationBell scopeId="home" />
      </NotificationsProvider>,
    )
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Some saved files could not be loaded',
    )
  })
  it('requests import into the chosen project and lets projects be browsed without entering the editor', async () => {
    const { props } = setup()
    render(
      <HomePage
        {...props}
        selectedProjectId="beta"
        view={{ ...DEFAULT_HOME_VIEW, openedProjectId: 'beta' }}
      />,
    )
    await screen.findByRole('button', { name: 'Open canvas Ideas in Beta' })
    fireEvent.click(screen.getByRole('button', { name: 'Open project Alpha' }))
    expect(props.onSelectProject).toHaveBeenCalledWith('alpha')
    expect(props.onOpenFile).not.toHaveBeenCalled()
    const file = new File(['{}'], 'import.lcanvas')
    fireEvent.change(screen.getByLabelText('Import CLF files'), {
      target: { files: [file] },
    })
    expect(props.onImport).toHaveBeenCalledWith('beta', [file])
  })
})
