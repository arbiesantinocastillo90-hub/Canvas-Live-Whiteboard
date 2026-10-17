import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { canvasFileStore, createCanvasFileRecord } from './canvasFiles'
import { projectDrafts } from './canvasDrafts'
import { createCanvasDocument } from './lcanvas'
import { createElement } from './canvasOperations'
import { DEFAULT_LAYOUT, LAYOUT_STORAGE_KEY } from './layout'
import { DEFAULT_HOME_VIEW } from './homeView'
import {
  DEFAULT_PREFERENCES,
  EMPTY_STATE,
  STORAGE_KEY,
  createProject,
} from './workspace'
import {
  SESSIONS_STORAGE_KEY,
  createSavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'

async function seed() {
  const id = crypto.randomUUID()
  const projectId = `project-${id}`
  const fileId = `file-${id}`
  const metadata = createProject(
    EMPTY_STATE,
    'Precision project',
    100,
    projectId,
  )
  const layout = {
    ...DEFAULT_LAYOUT,
    homeView: { ...DEFAULT_HOME_VIEW, perspective: 'canvas' as const },
  }
  const first = createSavedWorkspace(
    DEFAULT_PREFERENCES,
    layout,
    projectId,
    'Workspace One',
    `workspace-${id}`,
  )
  const second = createSavedWorkspace(
    DEFAULT_PREFERENCES,
    DEFAULT_LAYOUT,
    projectId,
    'Workspace Two',
    `other-${id}`,
  )
  const sessions: WorkspaceSessions = {
    version: 1,
    activeId: first.id,
    items: [first, second],
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata))
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
  const board = createElement(createCanvasDocument('Precision canvas'), {
    type: 'rectangle',
    id: 'original',
    x: 10,
    y: 20,
    width: 140,
    height: 100,
  })
  await canvasFileStore.save(
    createCanvasFileRecord(projectId, board, 100, fileId),
  )
  return { projectId, fileId, first, second }
}

function savedSessions(): WorkspaceSessions {
  return JSON.parse(
    localStorage.getItem(SESSIONS_STORAGE_KEY)!,
  ) as WorkspaceSessions
}

async function openCanvas() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open canvas Precision canvas in Precision project',
    }),
  )
  await screen.findByLabelText('Precision canvas: 1 visible objects')
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('workspace customization integration', () => {
  it('keeps precision and home personalization separate for each saved workspace', async () => {
    const { first, second } = await seed()
    render(<App />)
    await screen.findByRole('button', { name: 'Canvas' })
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    fireEvent.click(screen.getByLabelText('Snap to grid'))
    fireEvent.change(screen.getByLabelText('Grid spacing in pixels'), {
      target: { value: 32 },
    })
    fireEvent.change(screen.getByLabelText('Zoom display'), {
      target: { value: 'ratio' },
    })
    const appearance = screen
      .getByRole('heading', { name: 'Workspace appearance' })
      .closest('section')!
    fireEvent.change(within(appearance).getByLabelText('Description'), {
      target: { value: 'My workspace description' },
    })
    fireEvent.click(
      within(appearance).getByRole('button', {
        name: 'compass workspace icon',
      }),
    )
    expect(
      savedSessions().items.find((item) => item.id === first.id)?.preferences,
    ).toMatchObject({
      canvasControls: { snapToGrid: true, gridSpacing: 32, zoomUnit: 'ratio' },
      homeAppearance: {
        description: 'My workspace description',
        icon: 'compass',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(
      await screen.findByText('My workspace description'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }))
    fireEvent.click(await screen.findByTitle('Workspace Two'))
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    expect(screen.getByLabelText('Snap to grid')).not.toBeChecked()
    expect(screen.getByLabelText('Grid spacing in pixels')).toHaveValue(24)
    expect(
      savedSessions().items.find((item) => item.id === second.id)?.preferences
        .homeAppearance.description,
    ).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }))
    fireEvent.click(await screen.findByTitle('Workspace One'))
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    expect(screen.getByLabelText('Snap to grid')).toBeChecked()
    expect(screen.getByLabelText('Grid spacing in pixels')).toHaveValue(32)
    expect(screen.getByLabelText('Zoom display')).toHaveValue('ratio')
  })

  it('applies saved precision options to the active canvas and the shared footer zoom display', async () => {
    await seed()
    render(<App />)
    await openCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    fireEvent.click(screen.getByLabelText('Snap to grid'))
    fireEvent.change(screen.getByLabelText('Grid spacing in pixels'), {
      target: { value: 32 },
    })
    fireEvent.click(screen.getByLabelText('Show rulers'))
    fireEvent.change(screen.getByLabelText('Ruler unit'), {
      target: { value: 'mm' },
    })
    fireEvent.change(screen.getByLabelText('Zoom display'), {
      target: { value: 'ratio' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    const stage = await screen.findByRole('region', {
      name: 'Precision canvas canvas view',
    })
    expect(stage).toHaveAttribute('data-snap-to-grid', 'true')
    expect(stage.style.getPropertyValue('--canvas-grid-size')).toBe('32px')
    expect(
      screen.getByRole('img', { name: 'Canvas rulers in millimeters' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('1:1')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('1.2:1')
  })

  it('saves canvas card appearance without saving or discarding a dirty drawing and retains undo', async () => {
    const { projectId, fileId } = await seed()
    const save = canvasFileStore.save.bind(canvasFileStore)
    vi.spyOn(canvasFileStore, 'save').mockImplementation(async (record) => {
      const result = await save(record)
      return { value: result.value, persistence: 'browser' }
    })
    render(<App />)
    await openCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add rectangle' }),
    )
    await screen.findByLabelText('Precision canvas: 2 visible objects')
    fireEvent.click(screen.getByRole('link', { name: 'Canvas Live home' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Customize canvas Precision canvas',
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Canvas appearance',
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'star icon' }))
    fireEvent.change(within(dialog).getByLabelText('Accent color'), {
      target: { value: '#ff0000' },
    })
    fireEvent.change(within(dialog).getByLabelText('Description'), {
      target: { value: 'A recognizable board' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save appearance' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Canvas appearance' }),
      ).not.toBeInTheDocument(),
    )
    const stored = (await canvasFileStore.get(projectId, fileId)).value!
    expect(stored.document.elements).toHaveLength(1)
    expect(stored.document.presentation).toMatchObject({
      icon: 'star',
      color: '#FF0000',
      description: 'A recognizable board',
    })
    await waitFor(() =>
      expect(
        projectDrafts(canvasFileStore)
          .get(projectId)
          ?.find((draft) => draft.record.id === fileId)?.record.document
          .elements,
      ).toHaveLength(2),
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open canvas Precision canvas in Precision project',
      }),
    )
    await screen.findByLabelText('Precision canvas: 2 visible objects')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByLabelText('Precision canvas: 1 visible objects')
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    await screen.findByLabelText('Precision canvas: 2 visible objects')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () =>
      expect(
        (await canvasFileStore.get(projectId, fileId)).value?.document.elements,
      ).toHaveLength(2),
    )
    expect(
      (await canvasFileStore.get(projectId, fileId)).value?.document
        .presentation?.description,
    ).toBe('A recognizable board')
  })
})
