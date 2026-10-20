import { useContext, type ComponentProps } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileWorkspace from './FileWorkspace'
import {
  createCanvasFileRecord,
  createCanvasFileStore,
  type CanvasFileRecord,
  type CanvasFileResult,
  type CanvasFileStore,
} from './canvasFiles'
import { projectDrafts, type CanvasDraft } from './canvasDrafts'
import { createElement } from './canvasOperations'
import { createCanvasDocument, serializeLCANVAS } from './lcanvas'
import { WorkspaceCommandsProvider } from './WorkspaceCommands'
import { Context } from './workspaceCommandsContext'
import { DEFAULT_PREFERENCES, type Project } from './workspace'

const project: Project = {
  id: 'home-project',
  name: 'Home project',
  createdAt: 1,
  lastOpenedAt: 1,
}
type Props = ComponentProps<typeof FileWorkspace>

function canvas(name: string, id: string, opened: number) {
  return createCanvasFileRecord(
    project.id,
    createCanvasDocument(name),
    opened,
    id,
  )
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function upload(name: string) {
  const raw = serializeLCANVAS(createCanvasDocument(name))
  const file = new File([raw], `${name}.lcanvas`, { type: 'application/json' })
  const read = vi.fn(async () => raw)
  Object.defineProperty(file, 'text', { value: read })
  return { file, read }
}

function Probe() {
  const context = useContext(Context)
  return (
    <output data-testid="home-registered-commands">
      {JSON.stringify(
        context?.commands.map((command) => ({
          id: command.id,
          enabled: command.enabled !== false,
        })) ?? [],
      )}
    </output>
  )
}

function tree(props: Props) {
  return (
    <WorkspaceCommandsProvider>
      <FileWorkspace {...props} />
      <Probe />
    </WorkspaceCommandsProvider>
  )
}

function props(store: CanvasFileStore, patch: Partial<Props> = {}): Props {
  return {
    project,
    preferences: DEFAULT_PREFERENCES,
    onRenameProject: vi.fn(),
    store,
    ...patch,
  }
}

function registered(): { id: string; enabled: boolean }[] {
  return JSON.parse(
    screen.getByTestId('home-registered-commands').textContent ?? '[]',
  ) as { id: string; enabled: boolean }[]
}

function orphan(): CanvasDraft {
  const saved = createCanvasDocument('Recovered draft')
  const changed = createElement(saved, {
    id: 'orphan-rectangle',
    type: 'rectangle',
    x: 200,
    y: 150,
    width: 100,
    height: 80,
    text: 'Unsaved note',
  })
  return {
    record: createCanvasFileRecord(project.id, changed, 100, 'orphan-file'),
    savedDocument: saved,
    dirty: true,
    persistence: 'session',
  }
}

function openPanel(name: 'AI' | 'Properties') {
  const launcher = screen.queryByRole('button', { name: 'Open right panel' })
  if (launcher) fireEvent.click(launcher)
  else
    fireEvent.click(
      screen.getByRole('button', { name: 'Open AI workspace panel' }),
    )
  fireEvent.click(screen.getByRole('tab', { name }))
}

describe('Home to canvas workspace requests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens the explicitly chosen older file instead of the newest saved file, once per request', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Older chosen canvas', 'older', 100))
    await store.save(canvas('Newest canvas', 'newest', 200))
    const markOpened = vi.spyOn(store, 'markOpened')
    const initial = props(store, {
      openRequest: { sequence: 1, fileId: 'older' },
    })
    const view = render(tree(initial))
    expect(
      await screen.findByRole('tab', { name: 'Older chosen canvas' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.queryByRole('tab', { name: 'Newest canvas' }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(markOpened).toHaveBeenCalledTimes(1))
    view.rerender(
      tree({ ...initial, openRequest: { sequence: 1, fileId: 'older' } }),
    )
    await act(async () => {})
    expect(markOpened).toHaveBeenCalledTimes(1)
    view.rerender(
      tree({ ...initial, openRequest: { sequence: 2, fileId: 'newest' } }),
    )
    expect(
      await screen.findByRole('tab', { name: 'Newest canvas' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(markOpened).toHaveBeenCalledTimes(2)
  })

  it('does not replace a missing explicitly requested file with another saved canvas', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Newest canvas', 'newest', 200))
    render(
      tree(props(store, { openRequest: { sequence: 1, fileId: 'missing' } })),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This canvas could not be found',
    )
    expect(
      screen.queryByRole('tab', { name: 'Newest canvas' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('No canvas open').length).toBeGreaterThan(0)
  })

  it('uses the latest file request if the Home selection changes while files load', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const loading = deferred<CanvasFileResult<CanvasFileRecord[]>>()
    vi.spyOn(store, 'list').mockReturnValue(loading.promise)
    const initial = props(store, {
      openRequest: { sequence: 1, fileId: 'older' },
    })
    const view = render(tree(initial))
    view.rerender(
      tree({ ...initial, openRequest: { sequence: 2, fileId: 'newest' } }),
    )
    await act(async () => {
      loading.resolve({
        value: [
          canvas('Older canvas', 'older', 100),
          canvas('Newest canvas', 'newest', 200),
        ],
        persistence: 'session',
      })
    })
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Newest canvas' }),
      ).toHaveAttribute('aria-selected', 'true'),
    )
  })

  it('defers a queued import when Home is active, then imports exactly once after returning', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const loading = deferred<CanvasFileResult<CanvasFileRecord[]>>()
    vi.spyOn(store, 'list').mockReturnValue(loading.promise)
    const save = vi.spyOn(store, 'save')
    const { file, read } = upload('Home imported canvas')
    const initial = props(store, {
      openRequest: { sequence: 3, imports: [file] },
    })
    const view = render(tree(initial))
    view.rerender(tree({ ...initial, workspaceActive: false }))
    await act(async () => {
      loading.resolve({ value: [], persistence: 'session' })
    })
    expect(read).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(registered().some((command) => command.id === 'file.import')).toBe(
      false,
    )
    view.rerender(tree({ ...initial, workspaceActive: true }))
    expect(
      await screen.findByRole('tab', { name: 'Home imported canvas' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(read).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
    view.rerender(tree({ ...initial, workspaceActive: false }))
    view.rerender(
      tree({
        ...initial,
        workspaceActive: true,
        openRequest: { sequence: 3, imports: [file] },
      }),
    )
    await act(async () => {})
    expect(read).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('accepts the parent project already chosen at Home and never reopens a handled create dialog', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const initial = props(store, {
      workspaceActive: false,
      openRequest: {
        sequence: 4,
        action: 'create',
        destinationConfirmed: true,
      },
    })
    const view = render(tree(initial))
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'New canvas' })[0],
      ).toBeEnabled(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.rerender(tree({ ...initial, workspaceActive: true }))
    await screen.findByRole('dialog', { name: 'Create a canvas file' })
    expect(screen.getByLabelText('Destination project')).toHaveValue(project.id)
    expect(screen.getByRole('button', { name: 'Create canvas' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    view.rerender(tree({ ...initial, workspaceActive: false }))
    view.rerender(tree({ ...initial, workspaceActive: true }))
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await store.list(project.id)).value).toEqual([])
  })

  it('retains explicit MCP sharing while disabling hidden manual commands on Home', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Shared canvas', 'shared', 100))
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.endsWith('/bridge/connect')
              ? {
                  sessionId: 'home-share-session',
                  revision: 0,
                  contentRevision: 0,
                }
              : { mcpClient: null, mcpLastSeen: null, ok: true },
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const initial = props(store)
    const view = render(tree(initial))
    await screen.findByRole('tab', { name: 'Shared canvas' })
    openPanel('AI')
    fireEvent.click(screen.getByText('Use a pairing code instead'))
    fireEvent.change(screen.getByLabelText('Browser pairing code'), {
      target: { value: 'home-test-pairing-code-only' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pair and share' }))
    await screen.findByText('This canvas is shared')
    expect(
      registered().find((command) => command.id === 'canvas.rectangle')
        ?.enabled,
    ).toBe(true)
    view.rerender(tree({ ...initial, workspaceActive: false }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          url.endsWith('/bridge/disconnect'),
        ),
      ).toBe(false),
    )
    expect(registered().some((command) => command.id === 'file.save')).toBe(
      false,
    )
    expect(
      registered()
        .filter((command) => command.id.startsWith('canvas.'))
        .every((command) => !command.enabled),
    ).toBe(true)
    expect(screen.getByRole('tab', { name: 'Shared canvas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('MCP sharing')).toBeInTheDocument()
    view.rerender(tree(initial))
    expect(
      registered().find((command) => command.id === 'canvas.rectangle')
        ?.enabled,
    ).toBe(true)
    expect(screen.getByText('MCP sharing')).toBeInTheDocument()
  })

  it('restores an orphan dirty draft when the saved file list is empty', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const draft = orphan()
    projectDrafts(store).set(project.id, [draft])
    const save = vi.spyOn(store, 'save')
    const view = render(
      tree(
        props(store, { openRequest: { sequence: 1, fileId: draft.record.id } }),
      ),
    )
    await screen.findByRole('tab', { name: /Recovered draft/u })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(
      document.querySelector('[data-element-id="orphan-rectangle"]'),
    ).toBeInTheDocument()
    expect(projectDrafts(store).get(project.id)?.[0]).toEqual(draft)
    expect(save).not.toHaveBeenCalled()
    view.unmount()
    expect(projectDrafts(store).get(project.id)?.[0].record.document).toEqual(
      draft.record.document,
    )
  })

  it('preserves and reopens cached dirty drafts even when reading saved files rejects', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const draft = orphan()
    projectDrafts(store).set(project.id, [draft])
    vi.spyOn(store, 'list').mockRejectedValue(
      new Error('Saved storage could not be read'),
    )
    render(
      tree(
        props(store, { openRequest: { sequence: 1, fileId: draft.record.id } }),
      ),
    )
    await screen.findByRole('tab', { name: /Recovered draft/u })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saved storage could not be read',
    )
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(
      document.querySelector('[data-element-id="orphan-rectangle"]'),
    ).toBeInTheDocument()
    expect(projectDrafts(store).get(project.id)?.[0].record.document).toEqual(
      draft.record.document,
    )
  })
})
