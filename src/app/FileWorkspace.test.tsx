import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileWorkspace from './FileWorkspace'
import {
  createCanvasFileRecord,
  createCanvasFileStore,
  type CanvasFileRecord,
  type CanvasFileResult,
  type CanvasFileStore,
} from './canvasFiles'
import {
  createCanvasDocument,
  DEFAULT_LAYER_ID,
  serializeLCANVAS,
} from './lcanvas'
import { DEFAULT_PREFERENCES, type Project } from './workspace'

const project: Project = {
  id: 'project-a',
  name: 'Roadmap project',
  createdAt: 1,
  lastOpenedAt: 1,
}

function canvas(name: string, id = name, projectId = project.id, opened = 100) {
  return createCanvasFileRecord(
    projectId,
    createCanvasDocument(name),
    opened,
    id,
  )
}

function upload(name: string, raw: string) {
  const file = new File([raw], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: vi.fn(async () => raw) })
  return file
}

async function mount(store: CanvasFileStore, activeProject = project) {
  const view = render(
    <FileWorkspace
      key={activeProject.id}
      project={activeProject}
      preferences={DEFAULT_PREFERENCES}
      onRenameProject={vi.fn()}
      store={store}
    />,
  )
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: 'New canvas' })[0],
    ).toBeEnabled(),
  )
  return view
}

async function create(name: string) {
  fireEvent.click(screen.getAllByRole('button', { name: 'New canvas' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Create a canvas file' })
  fireEvent.change(within(dialog).getByLabelText('Canvas name'), {
    target: { value: name },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create canvas' }))
  await screen.findByRole('tab', { name })
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('LCANVAS project workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates and renames a file in its project, while accurately reporting session storage', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await mount(store)
    expect(
      screen.getByRole('heading', {
        name: 'Open a canvas. Make room for ideas.',
      }),
    ).toBeInTheDocument()
    await create('First ideas')
    expect(screen.getByRole('tab', { name: 'First ideas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByText('Session only · Export a backup'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Browser storage is unavailable/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rename canvas' }))
    fireEvent.change(screen.getByLabelText('Canvas name'), {
      target: { value: 'Updated ideas' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await screen.findByRole('tab', { name: 'Updated ideas' })
    const records = (await store.list(project.id)).value
    expect(records).toHaveLength(1)
    expect(records[0].document.name).toBe('Updated ideas')
    expect((await store.list('other-project')).value).toEqual([])
  })

  it('imports supported files and retains existing files when other imports are malformed', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Existing canvas'))
    await mount(store)
    const imported = {
      ...createCanvasDocument('Imported diagram'),
      elements: [
        {
          id: 'rectangle',
          type: 'rectangle' as const,
          layerId: DEFAULT_LAYER_ID,
          areaId: null,
          text: '',
          fontSize: 18,
          x: 10,
          y: 10,
          width: 120,
          height: 80,
          color: '#334455',
          fill: '#FFFFFF',
        },
      ],
    }
    fireEvent.change(screen.getByLabelText('Import LCANVAS files'), {
      target: {
        files: [
          upload('diagram.LCANVAS', serializeLCANVAS(imported)),
          upload('broken.lcanvas', '{'),
          upload('future.lcanvas', JSON.stringify({ ...imported, version: 3 })),
        ],
      },
    })
    await screen.findByRole('tab', { name: 'Imported diagram' })
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent(
      'broken.lcanvas: The LCANVAS file is not valid JSON.',
    )
    expect(error).toHaveTextContent(
      'future.lcanvas: This LCANVAS version is not supported.',
    )
    expect(
      screen.getByRole('button', { name: 'Open canvas Existing canvas' }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Imported diagram: 1 visible objects'),
    ).toBeInTheDocument()
    const records = (await store.list(project.id)).value
    expect(records).toHaveLength(2)
    expect(
      records.find((record) => record.document.name === 'Imported diagram')
        ?.document,
    ).toEqual(imported)
  })

  it('rejects the wrong extension and oversized input before reading it', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Existing canvas'))
    await mount(store)
    const wrong = upload('image.png', 'not a canvas')
    const huge = upload('huge.lcanvas', '{}')
    Object.defineProperty(huge, 'size', { value: 10 * 1024 * 1024 + 1 })
    fireEvent.change(screen.getByLabelText('Import LCANVAS files'), {
      target: { files: [wrong, huge] },
    })
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('image.png: Choose an .lcanvas file.')
    expect(error).toHaveTextContent(
      'huge.lcanvas: LCANVAS files must be 10 MiB or smaller.',
    )
    expect(wrong.text).not.toHaveBeenCalled()
    expect(huge.text).not.toHaveBeenCalled()
    expect(
      screen.getByRole('tab', { name: 'Existing canvas' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect((await store.list(project.id)).value).toHaveLength(1)
  })

  it('organizes more than 100 files, searches them and closes/reopens tabs without deleting files', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    for (let index = 1; index <= 125; index++)
      await store.save(
        canvas(
          `Canvas ${index.toString().padStart(3, '0')}`,
          `canvas-${index}`,
          project.id,
          index,
        ),
      )
    await mount(store)
    expect(
      screen.getAllByRole('button', { name: /^Open canvas / }),
    ).toHaveLength(125)
    expect(screen.getByRole('tab', { name: 'Canvas 125' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search canvas files' }),
      { target: { value: 'Canvas 001' } },
    )
    expect(
      screen.getAllByRole('button', { name: /^Open canvas / }),
    ).toHaveLength(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'Open canvas Canvas 001' }),
    )
    expect(screen.getByRole('tab', { name: 'Canvas 001' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Close canvas Canvas 001' }),
    )
    expect(
      screen.queryByRole('tab', { name: 'Canvas 001' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Canvas 125' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Open canvas Canvas 001' }),
    )
    expect(screen.getByRole('tab', { name: 'Canvas 001' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close project files' }))
    expect(
      screen.queryByRole('complementary', { name: 'Project files' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open file panel' }),
    ).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Open file panel' }))
    expect(
      screen.getByRole('complementary', { name: 'Project files' }),
    ).toBeInTheDocument()
    expect((await store.list(project.id)).value).toHaveLength(125)
  })

  it('keeps the right rail visible and scopes AI context to the active project and file', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('First canvas', 'first', project.id, 100))
    await store.save(canvas('Second canvas', 'second', project.id, 200))
    await mount(store)
    fireEvent.click(
      screen.getByRole('button', { name: 'Open AI workspace panel' }),
    )
    const panel = screen.getByRole('complementary', { name: 'Workspace AI' })
    expect(within(panel).getByText(project.name)).toBeInTheDocument()
    expect(within(panel).getByText('Second canvas')).toBeInTheDocument()
    expect(within(panel).getByText('Canvas is not shared')).toBeInTheDocument()
    expect(
      within(panel).getByText(/Connect the local companion/),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open canvas First canvas' }),
    )
    expect(within(panel).getByText('First canvas')).toBeInTheDocument()
    expect(within(panel).queryByText('Second canvas')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Close AI workspace panel' }),
    )
    expect(
      screen.queryByRole('complementary', { name: 'Workspace AI' }),
    ).not.toBeInTheDocument()
    for (const name of ['Undo', 'Reset view', 'Redo', 'Zoom in', 'Zoom out'])
      expect(screen.getByRole('button', { name })).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open AI workspace panel' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Close canvas First canvas' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Close canvas Second canvas' }),
    )
    expect(
      within(
        screen.getByRole('complementary', { name: 'Workspace AI' }),
      ).getByText('No canvas open'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: /canvas view$/ }),
    ).not.toBeInTheDocument()
    expect((await store.list(project.id)).value).toHaveLength(2)
  })

  it('marks view navigation dirty, clears it when undone, and remembers an explicitly saved view on remount', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('First canvas', 'first'))
    const view = await mount(store)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(
      screen.getByText('Unsaved changes · Save to remember'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('120%')
    expect(
      (await store.get(project.id, 'first')).value?.document.viewport.zoom,
    ).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(
      screen.queryByText('Unsaved changes · Save to remember'),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('100%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        screen.queryByText('Unsaved changes · Save to remember'),
      ).not.toBeInTheDocument(),
    )
    const saved = (await store.get(project.id, 'first')).value
    expect(saved?.document.viewport.zoom).toBeCloseTo(1 / 1.2)
    view.unmount()
    await mount(store)
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('83%')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(
      screen.getByText('Session only · Export a backup'),
    ).toBeInTheDocument()
  })

  it('saves actual canvas edits and reopens the same objects, labels and layers', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('First canvas', 'first'))
    const view = await mount(store)
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    expect(
      screen.getByText('Unsaved changes · Save to remember'),
    ).toBeInTheDocument()
    expect(
      (await store.get(project.id, 'first')).value?.document.elements,
    ).toHaveLength(0)
    fireEvent.click(
      screen.getByRole('button', { name: 'Open object properties' }),
    )
    fireEvent.change(screen.getByLabelText('Text inside shape'), {
      target: { value: 'First milestone' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        screen.queryByText('Unsaved changes · Save to remember'),
      ).not.toBeInTheDocument(),
    )
    const saved = (await store.get(project.id, 'first')).value?.document
    expect(saved?.version).toBe(2)
    expect(saved?.elements[0]).toMatchObject({
      type: 'rectangle',
      text: 'First milestone',
      layerId: DEFAULT_LAYER_ID,
    })
    view.unmount()
    await mount(store)
    expect(
      screen.getByRole('button', { name: 'rectangle First milestone' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('retains unsaved content through navigation and warns before a reload until saved', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('First canvas', 'first'))
    const view = await mount(store)
    fireEvent.click(screen.getByRole('button', { name: 'Add diamond' }))
    const unload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, unload)
    expect(unload.defaultPrevented).toBe(true)
    view.unmount()
    await mount(store)
    expect(
      screen.getByLabelText('First canvas: 1 visible objects'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Unsaved changes · Save to remember'),
    ).toBeInTheDocument()
    expect(
      (await store.get(project.id, 'first')).value?.document.elements,
    ).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        screen.queryByText('Unsaved changes · Save to remember'),
      ).not.toBeInTheDocument(),
    )
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
  })

  it('ignores a previous project load that finishes after switching to another keyed workspace', async () => {
    const first = deferred<CanvasFileResult<CanvasFileRecord[]>>()
    const second = deferred<CanvasFileResult<CanvasFileRecord[]>>()
    const projectB = { ...project, id: 'project-b', name: 'Garden project' }
    const store: CanvasFileStore = {
      list: vi.fn((id) => (id === project.id ? first.promise : second.promise)),
      get: vi.fn<CanvasFileStore['get']>(async () => ({
        value: null,
        persistence: 'browser',
      })),
      markOpened: vi.fn<CanvasFileStore['markOpened']>(async () => ({
        value: null,
        persistence: 'browser',
      })),
      save: vi.fn<CanvasFileStore['save']>(async (record) => ({
        value: record,
        persistence: 'browser',
      })),
    }
    const view = render(
      <FileWorkspace
        key={project.id}
        project={project}
        preferences={DEFAULT_PREFERENCES}
        onRenameProject={vi.fn()}
        store={store}
      />,
    )
    view.rerender(
      <FileWorkspace
        key={projectB.id}
        project={projectB}
        preferences={DEFAULT_PREFERENCES}
        onRenameProject={vi.fn()}
        store={store}
      />,
    )
    await act(async () =>
      second.resolve({
        value: [canvas('Garden canvas', 'garden', projectB.id)],
        persistence: 'browser',
      }),
    )
    expect(screen.getByRole('tab', { name: 'Garden canvas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await act(async () =>
      first.resolve({
        value: [canvas('Roadmap canvas')],
        persistence: 'browser',
      }),
    )
    expect(
      screen.getByRole('heading', { name: projectB.name }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open canvas Roadmap canvas' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Garden canvas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Open AI workspace panel' }),
    )
    expect(
      within(
        screen.getByRole('complementary', { name: 'Workspace AI' }),
      ).getByText(projectB.name),
    ).toBeInTheDocument()
    expect(store.list).toHaveBeenCalledWith(project.id)
    expect(store.list).toHaveBeenCalledWith(projectB.id)
  })
})
