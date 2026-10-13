import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileWorkspace from './FileWorkspace'
import {
  createCanvasFileRecord,
  createCanvasFileStore,
  type CanvasFileStore,
} from './canvasFiles'
import { localFilesFor, type LocalCanvasHandle } from './canvasLocalFiles'
import { createCanvasDocument, parseLCANVAS, serializeLCANVAS } from './lcanvas'
import { DEFAULT_PREFERENCES, type Project } from './workspace'

const project: Project = {
  id: 'local-project',
  name: 'Local files',
  createdAt: 1,
  lastOpenedAt: 1,
}

function fakeFile(raw: string, name = 'Roadmap.lcanvas') {
  const file = new File([raw], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => raw })
  return file
}

function physicalFile(name = 'Roadmap.lcanvas') {
  let contents = serializeLCANVAS(createCanvasDocument('Roadmap'))
  const handle: LocalCanvasHandle = {
    kind: 'file',
    name,
    getFile: vi.fn(async () => fakeFile(contents, name)),
    queryPermission: vi.fn<NonNullable<LocalCanvasHandle['queryPermission']>>(
      async () => 'granted',
    ),
    requestPermission: vi.fn<
      NonNullable<LocalCanvasHandle['requestPermission']>
    >(async () => 'granted'),
    isSameEntry: vi.fn(async (other) => other === handle),
    createWritable: vi.fn(async () => {
      let staged = ''
      return {
        write: async (raw: string) => {
          staged = raw
        },
        close: async () => {
          contents = staged
        },
        abort: async () => undefined,
      }
    }),
  }
  return {
    handle,
    read: () => parseLCANVAS(contents),
    replace: (raw: string) => {
      contents = raw
    },
  }
}

async function mount(store: CanvasFileStore) {
  const view = render(
    <FileWorkspace
      project={project}
      preferences={DEFAULT_PREFERENCES}
      onRenameProject={vi.fn()}
      store={store}
    />,
  )
  await screen.findByRole('tab', { name: 'Roadmap' })
  fireEvent.click(screen.getByRole('button', { name: 'Open canvas tools' }))
  return view
}

async function prepare() {
  const store = createCanvasFileStore({ indexedDB: null })
  await store.save(
    createCanvasFileRecord(
      project.id,
      createCanvasDocument('Roadmap'),
      1,
      'roadmap',
    ),
  )
  return store
}

function addRectangle() {
  fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
}
function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('smart physical file saving in the workspace', () => {
  it('chooses a real file once, reuses the handle, and saves a separate copy with Save as', async () => {
    const store = await prepare()
    const first = physicalFile()
    const copy = physicalFile('Copy.lcanvas')
    const picker = vi.fn(async () => first.handle)
    vi.stubGlobal('showSaveFilePicker', picker)
    await mount(store)
    addRectangle()
    save()
    await screen.findByText('Saved to file')
    expect(first.read().elements).toHaveLength(1)
    expect(picker).toHaveBeenCalledOnce()
    fireEvent.click(
      screen.getByRole('button', { name: 'Auto-save local file' }),
    )
    expect(
      screen.getByRole('button', { name: 'Auto-save local file' }),
    ).toHaveAttribute('aria-pressed', 'false')
    addRectangle()
    save()
    await waitFor(() => expect(first.read().elements).toHaveLength(2))
    expect(picker).toHaveBeenCalledOnce()
    picker.mockResolvedValueOnce(copy.handle)
    fireEvent.click(screen.getByRole('button', { name: 'Save as' }))
    await waitFor(() => expect(copy.read().elements).toHaveLength(2))
    expect(
      (await localFilesFor(store).get(project.id, 'roadmap'))?.handle,
    ).toBe(copy.handle)
    addRectangle()
    save()
    await waitFor(() => expect(copy.read().elements).toHaveLength(3))
    expect(first.read().elements).toHaveLength(2)
    expect(picker).toHaveBeenCalledTimes(2)
  })

  it('leaves a dirty document and its recovery protection intact when the picker is cancelled', async () => {
    const store = await prepare()
    vi.stubGlobal('showSaveFilePicker', async () => {
      throw new DOMException('Cancelled', 'AbortError')
    })
    await mount(store)
    addRectangle()
    save()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    )
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      (await store.get(project.id, 'roadmap')).value?.document.elements,
    ).toHaveLength(0)
    const unload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  it('preserves the last file and unsaved changes if committing the new file fails', async () => {
    const store = await prepare()
    const file = physicalFile()
    const abort = vi.fn(async () => undefined)
    vi.mocked(file.handle.createWritable).mockResolvedValueOnce({
      write: async () => undefined,
      close: async () => {
        throw new Error('Not enough disk space')
      },
      abort,
    })
    vi.stubGlobal('showSaveFilePicker', async () => file.handle)
    await mount(store)
    addRectangle()
    save()
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('Not enough disk space')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(file.read().elements).toHaveLength(0)
    expect(abort).toHaveBeenCalledOnce()
    expect(await localFilesFor(store).get(project.id, 'roadmap')).toBeNull()
  })

  it('does not mark edits made during an outstanding file commit as saved', async () => {
    const store = await prepare()
    const file = physicalFile()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const original = vi
      .mocked(file.handle.createWritable)
      .getMockImplementation()!
    vi.mocked(file.handle.createWritable).mockImplementationOnce(async () => {
      const writable = await original()
      return {
        ...writable,
        close: async () => {
          await pending
          await writable.close()
        },
      }
    })
    vi.stubGlobal('showSaveFilePicker', async () => file.handle)
    await mount(store)
    addRectangle()
    save()
    await screen.findByText('Saving to file…')
    addRectangle()
    await act(async () => {
      finish()
      await pending
    })
    await screen.findByText('Unsaved changes')
    expect(file.read().elements).toHaveLength(1)
    expect(
      (await store.get(project.id, 'roadmap')).value?.document.elements,
    ).toHaveLength(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'Auto-save local file' }),
    )
    save()
    await screen.findByText('Saved to file')
    expect(file.read().elements).toHaveLength(2)
  })

  it('auto-saves a bound file without showing a picker or permission prompt', async () => {
    const store = await prepare()
    const file = physicalFile()
    await localFilesFor(store).set(project.id, 'roadmap', {
      handle: file.handle,
      autoSave: true,
      savedDocument: file.read(),
    })
    const picker = vi.fn(async () => file.handle)
    vi.stubGlobal('showSaveFilePicker', picker)
    await mount(store)
    addRectangle()
    await waitFor(() => expect(file.read().elements).toHaveLength(1), {
      timeout: 2000,
    })
    await screen.findByText('Saved to file')
    expect(picker).not.toHaveBeenCalled()
    expect(file.handle.requestPermission).not.toHaveBeenCalled()
  })

  it('waits for explicit Save after a permission loss and never prompts during auto-save', async () => {
    const store = await prepare()
    const file = physicalFile()
    vi.mocked(file.handle.queryPermission!).mockResolvedValue('prompt')
    await localFilesFor(store).set(project.id, 'roadmap', {
      handle: file.handle,
      autoSave: true,
      savedDocument: file.read(),
    })
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(async () => file.handle),
    )
    await mount(store)
    addRectangle()
    await waitFor(
      () => expect(file.handle.queryPermission).toHaveBeenCalled(),
      { timeout: 2000 },
    )
    expect(file.handle.requestPermission).not.toHaveBeenCalled()
    expect(file.handle.createWritable).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    save()
    await screen.findByText('Saved to file')
    expect(file.handle.requestPermission).toHaveBeenCalledOnce()
    expect(file.read().elements).toHaveLength(1)
  })

  it('refuses to overwrite external changes and keeps the editable canvas draft', async () => {
    const store = await prepare()
    const file = physicalFile()
    await localFilesFor(store).set(project.id, 'roadmap', {
      handle: file.handle,
      autoSave: false,
      savedDocument: file.read(),
    })
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(async () => file.handle),
    )
    await mount(store)
    file.replace(serializeLCANVAS(createCanvasDocument('External edit')))
    addRectangle()
    save()
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'changed outside Canvas Live',
    )
    expect(file.read().name).toBe('External edit')
    expect(file.handle.createWritable).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('opens a native local file once and keeps its unsaved draft when it is chosen again', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const file = physicalFile()
    vi.stubGlobal('showOpenFilePicker', async () => [file.handle])
    const view = render(
      <FileWorkspace
        project={project}
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
    fireEvent.click(screen.getByRole('button', { name: 'Open file panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await screen.findByRole('tab', { name: 'Roadmap' })
    expect(screen.getByText('Saved to file')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Auto-save local file' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open canvas tools' }))
    addRectangle()
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await screen.findByText(
      'This local file is already open. Your unsaved edits have been kept.',
    )
    expect((await store.list(project.id)).value).toHaveLength(1)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(file.read().elements).toHaveLength(0)
    view.unmount()
  })

  it('keeps local rename edits pending until the physical file is committed', async () => {
    const store = await prepare()
    const file = physicalFile()
    await localFilesFor(store).set(project.id, 'roadmap', {
      handle: file.handle,
      autoSave: false,
      savedDocument: file.read(),
    })
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(async () => file.handle),
    )
    await mount(store)
    fireEvent.click(screen.getByRole('button', { name: 'Rename canvas' }))
    const dialog = screen.getByRole('dialog', { name: 'Rename your canvas' })
    fireEvent.change(within(dialog).getByLabelText('Canvas name'), {
      target: { value: 'Renamed roadmap' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save name' }))
    await screen.findByText('Unsaved changes')
    expect(file.read().name).toBe('Roadmap')
    expect((await store.get(project.id, 'roadmap')).value?.document.name).toBe(
      'Roadmap',
    )
    save()
    await screen.findByText('Saved to file')
    expect(file.read().name).toBe('Renamed roadmap')
    expect(file.handle.name).toBe('Roadmap.lcanvas')
  })

  it('exports a portable copy without claiming the live dirty document was saved', async () => {
    const store = await prepare()
    const makeUrl = vi.fn(() => 'blob:unit-test-canvas')
    const revokeUrl = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: makeUrl,
      revokeObjectURL: revokeUrl,
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    await mount(store)
    addRectangle()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(makeUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(
      'Roadmap.lcanvas',
    )
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByText(/^Download copy requested\./)).toHaveAttribute(
      'role',
      'status',
    )
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(revokeUrl).toHaveBeenCalledWith('blob:unit-test-canvas')
  })

  it('flushes the currently typed inline text and exports the fresh controller document', async () => {
    const store = await prepare()
    const makeUrl = vi.fn((_blob: Blob) => 'blob:fresh-inline-canvas')
    vi.stubGlobal('URL', { createObjectURL: makeUrl, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    await mount(store)
    addRectangle()
    fireEvent.doubleClick(screen.getByRole('button', { name: /^rectangle / }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Edit object text' }),
      { target: { value: 'Typed immediately before Export' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(makeUrl).toHaveBeenCalledOnce()
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(makeUrl.mock.calls[0][0])
    })
    expect(parseLCANVAS(raw).elements[0]).toMatchObject({
      type: 'rectangle',
      text: 'Typed immediately before Export',
    })
    expect(
      screen.queryByRole('textbox', { name: 'Edit object text' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(
      (await store.get(project.id, 'roadmap')).value?.document.elements,
    ).toHaveLength(0)
  })

  it('retains an invalid inline draft and does not export stale content in its place', async () => {
    const store = await prepare()
    const makeUrl = vi.fn((_blob: Blob) => 'blob:invalid-inline-canvas')
    vi.stubGlobal('URL', { createObjectURL: makeUrl, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    await mount(store)
    fireEvent.click(screen.getByRole('button', { name: 'Add area' }))
    fireEvent.doubleClick(screen.getByRole('button', { name: /^area / }))
    const field = screen.getByRole('textbox', { name: 'Edit area name' })
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(makeUrl).not.toHaveBeenCalled()
    expect(field).toHaveValue('')
    expect(
      screen
        .getAllByRole('alert')
        .some((alert) => alert.textContent?.includes('Correct or cancel')),
    ).toBe(true)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(
      (await store.get(project.id, 'roadmap')).value?.document.elements,
    ).toHaveLength(0)
  })

  it('keeps a successful disk commit even when updating its browser copy fails', async () => {
    const store = await prepare()
    const file = physicalFile()
    vi.stubGlobal('showSaveFilePicker', async () => file.handle)
    const view = await mount(store)
    addRectangle()
    vi.spyOn(store, 'save').mockRejectedValueOnce(
      new Error('Browser quota reached'),
    )
    save()
    await screen.findByText('Saved to file')
    expect(file.read().elements).toHaveLength(1)
    expect(screen.getByText(/^The local file is saved\./)).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    view.unmount()
    await mount(store)
    expect(
      screen.getByLabelText('Roadmap: 1 visible objects'),
    ).toBeInTheDocument()
    expect(screen.getByText('Saved to file')).toBeInTheDocument()
    expect(file.read().elements).toHaveLength(1)
    expect(file.handle.createWritable).toHaveBeenCalledOnce()
  })
})
