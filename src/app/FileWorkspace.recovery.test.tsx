import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileWorkspace from './FileWorkspace'
import { createCanvasFileRecord, type CanvasFileRecord } from './canvasFiles'
import { localFilesFor, type LocalCanvasHandle } from './canvasLocalFiles'
import { projectDrafts } from './canvasDrafts'
import { recoveryFor } from './canvasRecovery'
import { createCanvasDocument, parseLCANVAS, serializeLCANVAS } from './lcanvas'
import { DEFAULT_LAYOUT } from './layout'
import { DEFAULT_PREFERENCES } from './workspace'
import {
  createSessionNotifications,
  NotificationsContext,
} from './notificationSession'

const native = vi.hoisted(() => ({
  store: { list: vi.fn(), get: vi.fn(), save: vi.fn(), markOpened: vi.fn() },
}))
vi.mock('./localLibrary', () => ({
  localLibrary: { available: true },
  sharedCanvasFileStore: native.store,
}))

const project = {
  id: 'durable-save-project',
  name: 'Durable saves',
  createdAt: 1,
  lastOpenedAt: 1,
}
const revision = Symbol('test-native-revision')
type VersionedRecord = CanvasFileRecord & { [revision]?: number }
let saved: VersionedRecord
let generation: number
let physical: ReturnType<typeof physicalFile>
const stamped = (): VersionedRecord => ({
  ...structuredClone(saved),
  [revision]: generation,
})

function physicalFile() {
  let contents = serializeLCANVAS(createCanvasDocument('Alpha'))
  const handle: LocalCanvasHandle = {
    kind: 'file',
    name: 'Alpha.CLF',
    getFile: vi.fn(async () => {
      const file = new File([contents], 'Alpha.CLF')
      Object.defineProperty(file, 'text', { value: async () => contents })
      return file
    }),
    queryPermission: vi.fn<NonNullable<LocalCanvasHandle['queryPermission']>>(
      async () => 'granted',
    ),
    requestPermission: vi.fn<
      NonNullable<LocalCanvasHandle['requestPermission']>
    >(async () => 'granted'),
    createWritable: vi.fn(async () => {
      let staged = ''
      return {
        write: async (raw: string) => {
          staged = raw
        },
        close: async () => {
          contents = staged
        },
        abort: vi.fn(async () => undefined),
      }
    }),
  }
  return {
    handle,
    read: () => parseLCANVAS(contents),
    replace: (document = createCanvasDocument('External changes')) => {
      contents = serializeLCANVAS(document)
    },
  }
}

beforeEach(async () => {
  localStorage.clear()
  generation = 1
  saved = createCanvasFileRecord(
    project.id,
    createCanvasDocument('Alpha'),
    10,
    'alpha',
  )
  projectDrafts(native.store).clear()
  await recoveryFor(native.store).replace(project.id, [])
  for (const method of ['list', 'get', 'markOpened'] as const)
    native.store[method].mockReset().mockImplementation(async () => ({
      value: method === 'list' ? [stamped()] : stamped(),
      persistence: 'browser',
    }))
  native.store.save
    .mockReset()
    .mockImplementation(async (record: VersionedRecord) => {
      if (record[revision] !== generation)
        throw new Error('Stale canvas revision')
      generation += 1
      saved = structuredClone(record)
      return { value: stamped(), persistence: 'browser' }
    })
  physical = physicalFile()
  await localFilesFor(native.store).set(project.id, 'alpha', {
    handle: physical.handle,
    autoSave: true,
    autoSaveIntervalMs: 500,
    savedDocument: physical.read(),
  })
  vi.stubGlobal(
    'showSaveFilePicker',
    vi.fn(async () => physical.handle),
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount() {
  const notifications = createSessionNotifications()
  const view = render(
    <NotificationsContext.Provider value={notifications}>
      <FileWorkspace
        project={project}
        preferences={DEFAULT_PREFERENCES}
        store={native.store}
        onRenameProject={() => undefined}
        layout={{ ...DEFAULT_LAYOUT, rightPanel: 'tools', rightPinned: true }}
      />
    </NotificationsContext.Provider>,
  )
  await screen.findByRole('tab', { name: 'Alpha' })
  await screen.findByRole('button', { name: 'Add rectangle' })
  return { ...view, notifications }
}
function edit() {
  fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
}
function save() {
  if (!screen.queryByRole('dialog', { name: 'Save options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save options' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }))
}
async function tick(milliseconds = 500) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

describe('owned recovery when an external canvas file cannot be written', () => {
  it.each(['NotAllowedError', 'SecurityError'])(
    'recovers %s once and keeps saving future edits to the owned library',
    async (name) => {
      vi.mocked(physical.handle.createWritable).mockRejectedValue(
        new DOMException('Blocked by embedded browser', name),
      )
      const { notifications } = await mount()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      edit()
      await tick()
      expect(saved.document.elements).toHaveLength(1)
      expect(physical.read().elements).toHaveLength(0)
      expect(
        (await localFilesFor(native.store).get(project.id, 'alpha'))
          ?.savedDocument.elements,
      ).toHaveLength(0)
      expect(screen.getByRole('alert')).toHaveTextContent(
        'saved in the Canvas Live local library',
      )
      expect(screen.getByRole('alert')).toHaveTextContent(
        'open Canvas Live directly',
      )
      expect(
        screen.getByText('Local library saved · external file pending'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Saved to file')).toBeNull()
      const count = notifications.get(project.id).items.length
      edit()
      await tick()
      await tick(5000)
      expect(saved.document.elements).toHaveLength(2)
      expect(native.store.save).toHaveBeenCalledTimes(2)
      expect(physical.handle.createWritable).toHaveBeenCalledTimes(1)
      expect(physical.handle.requestPermission).not.toHaveBeenCalled()
      expect(notifications.get(project.id).items).toHaveLength(count)
    },
  )

  it('retains the original destination and baseline until an explicit retry succeeds', async () => {
    vi.mocked(physical.handle.queryPermission!).mockResolvedValue('denied')
    vi.mocked(physical.handle.requestPermission!).mockResolvedValue('denied')
    await mount()
    edit()
    save()
    await screen.findByText('Local library saved · external file pending')
    expect(saved.document.elements).toHaveLength(1)
    expect(physical.handle.createWritable).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Save destination')).toHaveTextContent(
      'Alpha.CLF',
    )
    expect(
      screen.getByText(/Saved in the Canvas Live local library/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download copy' })).toBeEnabled()
    vi.mocked(physical.handle.queryPermission!).mockResolvedValue('granted')
    save()
    await screen.findByText('Saved to file')
    expect(physical.read().elements).toHaveLength(1)
    expect(
      (await localFilesFor(native.store).get(project.id, 'alpha'))
        ?.savedDocument.elements,
    ).toHaveLength(1)
    expect(
      screen.queryByText('Local library saved · external file pending'),
    ).toBeNull()
  })

  it('preserves externally changed contents while recovering the owned copy', async () => {
    await mount()
    physical.replace()
    edit()
    save()
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'changed outside Canvas Live',
    )
    expect(saved.document.elements).toHaveLength(1)
    expect(physical.read().name).toBe('External changes')
    expect(physical.handle.createWritable).not.toHaveBeenCalled()
    expect(
      (await localFilesFor(native.store).get(project.id, 'alpha'))
        ?.savedDocument.name,
    ).toBe('Alpha')
  })

  it('keeps the previous destination when writing a newly chosen file fails', async () => {
    const replacement = physicalFile()
    replacement.handle.name = 'Separate copy.CLF'
    vi.mocked(replacement.handle.createWritable).mockRejectedValue(
      new DOMException('Blocked', 'NotAllowedError'),
    )
    vi.stubGlobal('showSaveFilePicker', async () => replacement.handle)
    await mount()
    edit()
    fireEvent.click(screen.getByRole('button', { name: 'Save options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose location' }))
    await screen.findByRole('alert')
    expect(saved.document.elements).toHaveLength(1)
    expect(physical.read().elements).toHaveLength(0)
    expect(replacement.read().elements).toHaveLength(0)
    expect(screen.getByLabelText('Save destination')).toHaveTextContent(
      'Alpha.CLF',
    )
    const binding = await localFilesFor(native.store).get(project.id, 'alpha')
    expect(binding?.handle).toBe(physical.handle)
    expect(binding?.savedDocument.elements).toHaveLength(0)
    expect(screen.queryByText('Saved to file')).toBeNull()
  })

  it('keeps a dirty recoverable draft when both physical writing and native CAS fail', async () => {
    vi.mocked(physical.handle.createWritable).mockRejectedValue(
      new DOMException('Blocked', 'NotAllowedError'),
    )
    native.store.save.mockRejectedValue(new Error('Stale canvas revision'))
    await mount()
    edit()
    save()
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'local-library recovery save also failed',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'Your changes are saved',
    )
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(saved.document.elements).toHaveLength(0)
    expect(physical.read().elements).toHaveLength(0)
    expect(
      projectDrafts(native.store).get(project.id)?.[0].record.document.elements,
    ).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: /^rectangle/ }),
    ).toBeInTheDocument()
  })

  it('keeps the native dirty baseline after a physical commit followed by a failed CAS', async () => {
    native.store.save.mockRejectedValue(new Error('Stale canvas revision'))
    await mount()
    edit()
    save()
    await screen.findByRole('status')
    await waitFor(() => expect(physical.read().elements).toHaveLength(1))
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(
      screen.getByText(/Its local-library copy could not be updated/),
    ).toBeInTheDocument()
    expect(saved.document.elements).toHaveLength(0)
    const drafts = projectDrafts(native.store).get(project.id)
    expect(drafts?.[0].savedDocument.elements).toHaveLength(0)
    expect(drafts?.[0].record.document.elements).toHaveLength(1)
    expect(
      (await localFilesFor(native.store).get(project.id, 'alpha'))
        ?.savedDocument.elements,
    ).toHaveLength(1)
    expect(
      screen.queryByText('Local library saved · external file pending'),
    ).toBeNull()
  })
})
