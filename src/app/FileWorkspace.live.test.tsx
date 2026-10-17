import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileWorkspace from './FileWorkspace'
import { createCanvasFileRecord, type CanvasFileRecord } from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_LAYOUT } from './layout'
import { DEFAULT_PREFERENCES } from './workspace'

const native = vi.hoisted(() => ({
  enabled: true,
  store: { list: vi.fn(), get: vi.fn(), save: vi.fn(), markOpened: vi.fn() },
}))
vi.mock('./localLibrary', () => ({
  localLibrary: {
    get available() {
      return native.enabled
    },
  },
  sharedCanvasFileStore: native.store,
}))

const revision = Symbol('test-native-revision')
type VersionedRecord = CanvasFileRecord & { [revision]?: number }
let saved: VersionedRecord
let generation: number
const stamped = (): VersionedRecord => ({
  ...structuredClone(saved),
  [revision]: generation,
})

async function mount() {
  const onLiveViewChange = vi.fn()
  render(
    <FileWorkspace
      project={{
        id: 'project',
        name: 'Project',
        createdAt: 1,
        lastOpenedAt: 1,
      }}
      preferences={DEFAULT_PREFERENCES}
      store={native.store}
      onRenameProject={() => undefined}
      layout={{ ...DEFAULT_LAYOUT, rightPanel: 'tools', rightPinned: true }}
      initialCameras={{ alpha: { x: 41, y: 52, zoom: 1.3 } }}
      onLiveViewChange={onLiveViewChange}
    />,
  )
  await screen.findByRole('tab', { name: 'Alpha' })
  await screen.findByRole('button', { name: 'Add rectangle' })
  await waitFor(() => expect(onLiveViewChange).toHaveBeenCalled())
  return { onLiveViewChange }
}

beforeEach(() => {
  localStorage.clear()
  native.enabled = true
  generation = 1
  saved = createCanvasFileRecord(
    'project',
    createCanvasDocument('Alpha'),
    10,
    'alpha',
  )
  native.store.list.mockReset().mockImplementation(async () => ({
    value: [stamped()],
    persistence: 'browser',
  }))
  native.store.get.mockReset().mockImplementation(async () => ({
    value: stamped(),
    persistence: 'browser',
  }))
  native.store.markOpened.mockReset().mockImplementation(async () => ({
    value: stamped(),
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
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('live local-library canvas updates', () => {
  it('saves consecutive edits using each acknowledged revision', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(native.store.save).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(native.store.save).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(saved.document.elements).toHaveLength(2))
    expect(
      native.store.save.mock.calls.map(([record]) => record[revision]),
    ).toEqual([1, 2])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not mark camera movement as unsaved document content', async () => {
    const { onLiveViewChange } = await mount()
    fireEvent.wheel(screen.getByRole('region', { name: 'Alpha canvas view' }), {
      deltaY: -80,
      clientX: 300,
      clientY: 200,
    })
    await waitFor(() =>
      expect(
        onLiveViewChange.mock.lastCall?.[0].activeView?.viewport.zoom,
      ).toBeGreaterThan(1.3),
    )
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(native.store.save).not.toHaveBeenCalled()
  })

  it('accepts externally saved content while keeping this view camera', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { onLiveViewChange } = await mount()
    const camera = onLiveViewChange.mock.lastCall?.[0].activeView?.viewport
    saved = {
      ...saved,
      updatedAt: 20,
      document: {
        ...saved.document,
        name: 'Remote Alpha',
        viewport: { x: 0, y: 0, zoom: 0.5 },
      },
    }
    generation += 1
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(
      screen.getByRole('tab', { name: 'Remote Alpha' }),
    ).toBeInTheDocument()
    expect(onLiveViewChange.mock.lastCall?.[0].activeView?.viewport).toEqual(
      camera,
    )
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('keeps dirty local objects and blocks overwriting another view', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    saved = {
      ...saved,
      updatedAt: 20,
      document: { ...saved.document, name: 'Remote Alpha' },
    }
    generation += 1
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^rectangle/ }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'changed in another view',
    )
    expect(native.store.save).not.toHaveBeenCalled()
  })
})
