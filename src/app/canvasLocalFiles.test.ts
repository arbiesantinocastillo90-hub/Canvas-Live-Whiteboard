import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  allowLocalWrite,
  chooseLocalCanvasFiles,
  chooseLocalCanvasSave,
  createLocalCanvasFiles,
  boundedAutosaveInterval,
  DEFAULT_AUTOSAVE_INTERVAL_MS,
  isMissingLocalCanvas,
  LocalCanvasMissingError,
  supportsLocalCanvasOpen,
  supportsLocalCanvasSave,
  writeLocalCanvas,
  type LocalCanvasHandle,
} from './canvasLocalFiles'
import { createCanvasDocument, parseLCANVAS, serializeLCANVAS } from './lcanvas'

function localHandle(name = 'Canvas.lcanvas') {
  let contents = serializeLCANVAS(createCanvasDocument('Original'))
  const handle: LocalCanvasHandle = {
    kind: 'file',
    name,
    getFile: vi.fn(
      async () =>
        ({ size: contents.length, text: async () => contents }) as File,
    ),
    queryPermission: vi.fn<NonNullable<LocalCanvasHandle['queryPermission']>>(
      async () => 'granted',
    ),
    requestPermission: vi.fn<
      NonNullable<LocalCanvasHandle['requestPermission']>
    >(async () => 'granted'),
    createWritable: vi.fn(async () => {
      let staged = ''
      return {
        write: vi.fn(async (raw: string) => {
          staged = raw
        }),
        close: vi.fn(async () => {
          contents = staged
        }),
        abort: vi.fn(async () => undefined),
      }
    }),
  }
  return { handle, read: () => parseLCANVAS(contents), raw: () => contents }
}

afterEach(() => vi.unstubAllGlobals())

describe('physical local LCANVAS files', () => {
  it('bounds autosave intervals and keeps older bindings compatible', async () => {
    expect(boundedAutosaveInterval(undefined)).toBe(
      DEFAULT_AUTOSAVE_INTERVAL_MS,
    )
    expect(boundedAutosaveInterval(Number.NaN)).toBe(
      DEFAULT_AUTOSAVE_INTERVAL_MS,
    )
    expect(boundedAutosaveInterval(100)).toBe(500)
    expect(boundedAutosaveInterval(4_000_000)).toBe(3_600_000)
    const local = createLocalCanvasFiles(null)
    const { handle } = localHandle()
    await local.set('project', 'file', {
      handle,
      autoSave: true,
      autoSaveIntervalMs: 5000,
      savedDocument: createCanvasDocument('Saved'),
    })
    expect((await local.get('project', 'file'))?.autoSaveIntervalMs).toBe(5000)
    await local.set('project', 'old', {
      handle,
      autoSave: true,
      savedDocument: createCanvasDocument('Saved'),
    })
    expect(
      boundedAutosaveInterval(
        (await local.get('project', 'old'))?.autoSaveIntervalMs,
      ),
    ).toBe(900)
  })

  it('detects a moved or deleted file before opening a writer and never recreates it silently', async () => {
    const { handle } = localHandle()
    vi.mocked(handle.getFile).mockRejectedValue(
      new DOMException('Gone', 'NotFoundError'),
    )
    const saving = writeLocalCanvas(
      handle,
      createCanvasDocument('Draft'),
      createCanvasDocument('Original'),
    )
    await expect(saving).rejects.toBeInstanceOf(LocalCanvasMissingError)
    expect(handle.createWritable).not.toHaveBeenCalled()
    expect(
      isMissingLocalCanvas(new DOMException('Gone', 'NotFoundError')),
    ).toBe(true)
    expect(isMissingLocalCanvas(new Error('Disk full'))).toBe(false)
  })

  it('also identifies a destination deleted between validation and writer creation', async () => {
    const { handle } = localHandle()
    vi.mocked(handle.createWritable).mockRejectedValue(
      new DOMException('Gone', 'NotFoundError'),
    )
    await expect(
      writeLocalCanvas(handle, createCanvasDocument('Draft')),
    ).rejects.toBeInstanceOf(LocalCanvasMissingError)
  })
  it('opens and saves through restricted native pickers and distinguishes cancellation', async () => {
    const { handle } = localHandle()
    const save = vi.fn(async () => handle)
    const open = vi.fn(async () => [handle])
    vi.stubGlobal('showSaveFilePicker', save)
    vi.stubGlobal('showOpenFilePicker', open)
    expect(supportsLocalCanvasSave()).toBe(true)
    expect(supportsLocalCanvasOpen()).toBe(true)
    expect(await chooseLocalCanvasSave('Roadmap')).toBe(handle)
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'Roadmap.CLF',
        types: [
          {
            description: 'Canvas Live file (.CLF)',
            accept: { 'application/json': ['.CLF', '.clf', '.lcanvas'] },
          },
        ],
        excludeAcceptAllOption: true,
      }),
    )
    expect((await chooseLocalCanvasFiles())?.[0].handle).toBe(handle)
    save.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    open.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    expect(await chooseLocalCanvasSave('Roadmap')).toBeNull()
    expect(await chooseLocalCanvasFiles()).toBeNull()
    expect(supportsLocalCanvasSave()).toBe(true)
  })

  it('rejects unrelated files and bounded bulk opens before reading documents', async () => {
    const { handle } = localHandle('Other.txt')
    vi.stubGlobal('showSaveFilePicker', async () => handle)
    await expect(chooseLocalCanvasSave('Canvas')).rejects.toThrow(
      'Choose a local .CLF',
    )
    vi.stubGlobal('showOpenFilePicker', async () =>
      Array.from({ length: 101 }, () => handle),
    )
    await expect(chooseLocalCanvasFiles()).rejects.toThrow('up to 100')
    expect(handle.getFile).not.toHaveBeenCalled()
  })

  it.each(['Canvas.CLF', 'Canvas.clf', 'Canvas.lcanvas', 'Canvas.LCANVAS'])(
    'keeps explicit Save bound to the existing physical filename: %s',
    async (name) => {
      const { handle, read } = localHandle(name)
      await writeLocalCanvas(handle, createCanvasDocument('Updated'))
      expect(handle.name).toBe(name)
      expect(read().name).toBe('Updated')
      vi.stubGlobal('showOpenFilePicker', async () => [handle])
      expect((await chooseLocalCanvasFiles())?.[0].handle).toBe(handle)
    },
  )

  it('never prompts for permission in background and prompts only for explicit Save', async () => {
    const { handle } = localHandle()
    vi.mocked(handle.queryPermission!).mockResolvedValue('prompt')
    expect(await allowLocalWrite(handle, false)).toBe(false)
    expect(handle.requestPermission).not.toHaveBeenCalled()
    expect(await allowLocalWrite(handle, true)).toBe(true)
    expect(handle.requestPermission).toHaveBeenCalledTimes(1)
    vi.mocked(handle.requestPermission!).mockResolvedValue('denied')
    expect(await allowLocalWrite(handle, true)).toBe(false)
    delete handle.queryPermission
    expect(await allowLocalWrite(handle, false)).toBe(false)
  })

  it('commits only after close and serializes pending writes to a handle', async () => {
    const { handle, read } = localHandle()
    const first = createCanvasDocument('First save')
    const second = createCanvasDocument('Second save')
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = vi.mocked(handle.createWritable).getMockImplementation()!
    vi.mocked(handle.createWritable).mockImplementationOnce(async () => {
      const writable = await original()
      return {
        ...writable,
        close: async () => {
          await blocked
          await writable.close()
        },
      }
    })
    const savingFirst = writeLocalCanvas(handle, first)
    await vi.waitFor(() =>
      expect(handle.createWritable).toHaveBeenCalledTimes(1),
    )
    const savingSecond = writeLocalCanvas(handle, second)
    expect(read().name).toBe('Original')
    expect(handle.createWritable).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([savingFirst, savingSecond])
    expect(read().name).toBe('Second save')
  })

  it('aborts a failed writer without changing the original and permits a later retry', async () => {
    const { handle, read } = localHandle()
    const abort = vi.fn(async () => undefined)
    vi.mocked(handle.createWritable).mockResolvedValueOnce({
      write: async () => undefined,
      close: async () => {
        throw new Error('Disk full')
      },
      abort,
    })
    await expect(
      writeLocalCanvas(handle, createCanvasDocument('Failed save')),
    ).rejects.toThrow('Disk full')
    expect(abort).toHaveBeenCalledOnce()
    expect(read().name).toBe('Original')
    await writeLocalCanvas(handle, createCanvasDocument('Retry'))
    expect(read().name).toBe('Retry')
  })

  it('protects an externally edited file before opening a writer', async () => {
    const { handle, read } = localHandle()
    await expect(
      writeLocalCanvas(
        handle,
        createCanvasDocument('My draft'),
        createCanvasDocument('Prior baseline'),
      ),
    ).rejects.toThrow('changed outside Canvas Live')
    expect(handle.createWritable).not.toHaveBeenCalled()
    expect(read().name).toBe('Original')
    await writeLocalCanvas(handle, createCanvasDocument('My draft'), read())
    expect(read().name).toBe('My draft')
  })

  it('retains scoped session bindings with a validated independent document snapshot', async () => {
    const local = createLocalCanvasFiles(null)
    const { handle } = localHandle()
    const document = createCanvasDocument('Saved')
    await local.set('project-one', 'canvas-one', {
      handle,
      autoSave: true,
      savedDocument: document,
    })
    document.name = 'Mutated outside the store'
    expect(
      (await local.get('project-one', 'canvas-one'))?.savedDocument.name,
    ).toBe('Saved')
    expect(await local.get('other-project', 'canvas-one')).toBeNull()
    await expect(local.get('', 'canvas-one')).rejects.toThrow('identifier')
    expect(
      serializeLCANVAS(
        (await local.get('project-one', 'canvas-one'))!.savedDocument,
      ),
    ).not.toContain('handle')
  })
})
