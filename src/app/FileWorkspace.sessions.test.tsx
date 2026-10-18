import type { ComponentProps } from 'react'
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
  type CanvasFileRecord,
  type CanvasFileResult,
  type CanvasFileStore,
} from './canvasFiles'
import { projectDrafts } from './canvasDrafts'
import { createElement } from './canvasOperations'
import { DEFAULT_LAYOUT } from './layout'
import { createCanvasDocument, DEFAULT_LAYER_ID } from './lcanvas'
import { DEFAULT_PREFERENCES, type Project } from './workspace'
import {
  normalizeProjectView,
  type ProjectViewSession,
} from './workspaceSessions'

type Props = ComponentProps<typeof FileWorkspace>
const project: Project = {
  id: 'sessions-project',
  name: 'Session project',
  createdAt: 1,
  lastOpenedAt: 1,
}

function canvas(name: string, id: string, opened: number) {
  return createCanvasFileRecord(
    project.id,
    createCanvasDocument(name),
    opened,
    id,
  )
}

function props(store: CanvasFileStore, patch: Partial<Props> = {}): Props {
  return {
    project,
    preferences: DEFAULT_PREFERENCES,
    onRenameProject: vi.fn(),
    store,
    layout: { ...DEFAULT_LAYOUT, filesOpen: true, leftPinned: true },
    ...patch,
  }
}

function sessions(raw: Partial<ProjectViewSession>) {
  return normalizeProjectView(raw)
}

function lastView(
  callback: ReturnType<typeof vi.fn<(view: ProjectViewSession) => void>>,
) {
  return callback.mock.calls.at(-1)![0]
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('canvas file presentation sessions', () => {
  it('retains copied recent-file order when the underlying files are opened in another view', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Alpha', 'a', 100))
    await store.save(canvas('Beta', 'b', 200))
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    const first = render(
      <FileWorkspace
        {...props(store, {
          viewSession: sessions({
            openIds: ['a', 'b'],
            activeId: 'a',
            recentIds: ['a', 'b'],
          }),
          onViewSessionChange: callback,
        })}
      />,
    )
    await screen.findByRole('tab', { name: 'Alpha' })
    await waitFor(() =>
      expect(lastView(callback).recentIds).toEqual(['a', 'b']),
    )
    const copiedView = structuredClone(lastView(callback))
    first.unmount()
    await store.markOpened(project.id, 'b', 9000)
    render(<FileWorkspace {...props(store, { viewSession: copiedView })} />)
    await screen.findByRole('tab', { name: 'Alpha' })
    expect(
      within(screen.getByRole('region', { name: 'Recent files' }))
        .getAllByRole('button', { name: /^Open recent canvas / })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Open recent canvas Alpha', 'Open recent canvas Beta'])
  })

  it('seeds legacy recent files once and promotes opened files through presentation state without saving contents', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Alpha', 'a', 100))
    await store.save(canvas('Beta', 'b', 200))
    const save = vi.spyOn(store, 'save')
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    render(
      <FileWorkspace
        {...props(store, {
          viewSession: sessions({ openIds: ['b'], activeId: 'b' }),
          onViewSessionChange: callback,
        })}
      />,
    )
    await screen.findByRole('tab', { name: 'Beta' })
    await waitFor(() =>
      expect(lastView(callback).recentIds).toEqual(['b', 'a']),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Open recent canvas Alpha' }),
    )
    await waitFor(() =>
      expect(lastView(callback).recentIds).toEqual(['a', 'b']),
    )
    expect(save).not.toHaveBeenCalled()
    expect(JSON.stringify(lastView(callback))).not.toContain('elements')
  })
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('restores saved tab order and active file while filtering references to missing files', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Alpha', 'a', 100))
    await store.save(canvas('Beta', 'b', 200))
    await store.save(canvas('Newest closed', 'newest', 300))
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    render(
      <FileWorkspace
        {...props(store, {
          viewSession: sessions({
            openIds: ['a', 'missing', 'b'],
            activeId: 'b',
            tabs: [{ id: 'a', pinned: true, compact: false, groupId: null }],
          }),
          onViewSessionChange: callback,
        })}
      />,
    )
    expect(await screen.findByRole('tab', { name: 'Beta' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen
        .getAllByRole('tab')
        .filter((tab) => tab.closest('.canvas-tabs'))
        .map((tab) => tab.getAttribute('aria-label')),
    ).toEqual(['Alpha', 'Beta'])
    expect(
      screen.queryByRole('tab', { name: 'Newest closed' }),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(lastView(callback)).toMatchObject({
        openIds: ['a', 'b'],
        activeId: 'b',
      }),
    )
    expect(lastView(callback).tabs).toEqual([
      { id: 'a', pinned: true, compact: false, groupId: null },
    ])
  })

  it('preserves an explicitly empty tab session until a user requests a file', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Available', 'available', 100))
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    const initial = props(store, {
      viewSession: sessions({ openIds: [], activeId: null }),
      onViewSessionChange: callback,
    })
    const view = render(<FileWorkspace {...initial} />)
    await waitFor(() =>
      expect(lastView(callback)).toMatchObject({ openIds: [], activeId: null }),
    )
    expect(
      screen.queryByRole('tab', { name: 'Available' }),
    ).not.toBeInTheDocument()
    view.rerender(
      <FileWorkspace
        {...initial}
        openRequest={{ sequence: 1, fileId: 'available' }}
      />,
    )
    expect(
      await screen.findByRole('tab', { name: 'Available' }),
    ).toHaveAttribute('aria-selected', 'true')
    await waitFor(() =>
      expect(lastView(callback).openIds).toEqual(['available']),
    )
  })

  it('lets an explicit file request override the remembered active tab without discarding other tabs', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Remembered', 'remembered', 100))
    await store.save(canvas('Requested', 'requested', 200))
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    render(
      <FileWorkspace
        {...props(store, {
          viewSession: sessions({
            openIds: ['remembered'],
            activeId: 'remembered',
          }),
          openRequest: { sequence: 1, fileId: 'requested' },
          onViewSessionChange: callback,
        })}
      />,
    )
    expect(
      await screen.findByRole('tab', { name: 'Requested' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Remembered' })).toBeInTheDocument()
    await waitFor(() =>
      expect(lastView(callback)).toMatchObject({
        openIds: ['remembered', 'requested'],
        activeId: 'requested',
      }),
    )
  })

  it('closing a dirty tab changes only the tab session and reopening retains its unsaved document', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const saved = canvas('Dirty canvas', 'dirty', 100)
    await store.save(saved)
    const changed = createElement(saved.document, {
      id: 'draft-shape',
      type: 'rectangle',
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      text: 'Keep this draft',
    })
    projectDrafts(store).set(project.id, [
      {
        record: { ...saved, document: changed },
        savedDocument: saved.document,
        dirty: true,
        persistence: 'session',
      },
    ])
    const save = vi.spyOn(store, 'save')
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    render(
      <FileWorkspace
        {...props(store, {
          viewSession: sessions({ openIds: ['dirty'], activeId: 'dirty' }),
          onViewSessionChange: callback,
        })}
      />,
    )
    await screen.findByRole('tab', { name: 'Dirty canvas' })
    expect(
      document.querySelector('[data-element-id="draft-shape"]'),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Close canvas Dirty canvas' }),
    )
    await waitFor(() =>
      expect(lastView(callback)).toMatchObject({ openIds: [], activeId: null }),
    )
    expect(
      screen.getByRole('button', { name: 'Open canvas Dirty canvas' }),
    ).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    expect((await store.list(project.id)).value[0].document).toEqual(
      saved.document,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Open canvas Dirty canvas' }),
    )
    expect(
      await screen.findByRole('tab', { name: 'Dirty canvas' }),
    ).toHaveTextContent('•')
    expect(
      document.querySelector('[data-element-id="draft-shape"]'),
    ).toBeInTheDocument()
    expect(projectDrafts(store).get(project.id)?.[0].record.document).toEqual(
      changed,
    )
    expect(JSON.stringify(lastView(callback))).not.toContain('Keep this draft')
    expect(JSON.stringify(lastView(callback))).not.toContain('elements')
  })

  it('hides and pins file shortcuts without removing data or a currently open tab', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const original = canvas('Alpha', 'a', 100)
    await store.save(original)
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    render(
      <FileWorkspace
        {...props(store, {
          viewSession: sessions({ openIds: ['a'], activeId: 'a' }),
          onViewSessionChange: callback,
        })}
      />,
    )
    await screen.findByRole('tab', { name: 'Alpha' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Pin recent file Alpha' }),
    )
    expect(
      screen.getByRole('region', { name: 'Pinned files' }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove pinned file Alpha from list',
      }),
    )
    expect(
      screen.queryByRole('button', { name: 'Open recent canvas Alpha' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open pinned canvas Alpha' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open canvas Alpha' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument()
    await waitFor(() =>
      expect(lastView(callback).shortcuts).toEqual([
        { id: 'a', pinned: false, hidden: true },
      ]),
    )
    expect((await store.list(project.id)).value).toEqual([original])
    fireEvent.click(screen.getByRole('button', { name: 'Open canvas Alpha' }))
    await waitFor(() =>
      expect(lastView(callback).shortcuts[0].hidden).toBe(false),
    )
    expect(
      screen.getByRole('button', { name: 'Open recent canvas Alpha' }),
    ).toBeInTheDocument()
  })

  it('retains recent-list collapse and editor context across tab changes without saving document contents', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(canvas('Alpha', 'a', 100))
    await store.save(canvas('Beta', 'b', 200))
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    render(
      <FileWorkspace
        {...props(store, {
          viewSession: sessions({
            openIds: ['a', 'b'],
            activeId: 'a',
            recentsCollapsed: true,
            editorSession: { tool: 'pan', activeLayerId: DEFAULT_LAYER_ID },
          }),
          onViewSessionChange: callback,
        })}
      />,
    )
    await screen.findByRole('tab', { name: 'Alpha' })
    const recents = screen.getByRole('region', { name: 'Recent files' })
    expect(
      within(recents).getByRole('button', { name: /Recent/ }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByRole('region', { name: 'Alpha canvas view' }),
    ).toHaveAttribute('data-mode', 'pan')
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }))
    await waitFor(() =>
      expect(lastView(callback)).toMatchObject({
        activeId: 'b',
        recentsCollapsed: true,
        editorSession: { tool: 'pan', activeLayerId: DEFAULT_LAYER_ID },
      }),
    )
    fireEvent.click(within(recents).getByRole('button', { name: /Recent/ }))
    await waitFor(() => expect(lastView(callback).recentsCollapsed).toBe(false))
    expect(JSON.stringify(lastView(callback))).not.toContain('elements')
  })

  it('does not publish an empty session over saved tabs while file restoration is pending', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const loading = deferred<CanvasFileResult<CanvasFileRecord[]>>()
    vi.spyOn(store, 'list').mockReturnValue(loading.promise)
    const callback = vi.fn<(view: ProjectViewSession) => void>()
    render(
      <FileWorkspace
        {...props(store, {
          viewSession: sessions({ openIds: ['a'], activeId: 'a' }),
          onViewSessionChange: callback,
        })}
      />,
    )
    expect(callback).not.toHaveBeenCalled()
    await act(async () => {
      loading.resolve({
        value: [canvas('Alpha', 'a', 100)],
        persistence: 'session',
      })
    })
    expect(await screen.findByRole('tab', { name: 'Alpha' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await waitFor(() => expect(callback).toHaveBeenCalled())
    expect(
      callback.mock.calls.every(([view]) => view.openIds.includes('a')),
    ).toBe(true)
  })
})
