import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY, createProject, EMPTY_STATE } from './workspace'
import { DEFAULT_LAYOUT, LAYOUT_STORAGE_KEY } from './layout'
import { SHORTCUT_STORAGE_KEY } from './shortcuts'

function createNamedProject(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Create a new project' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Project name'), {
    target: { value: name },
  })
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Create project' }),
  )
}

async function createEditableCanvas() {
  createNamedProject('Editing project')
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: 'New canvas' })[0],
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getAllByRole('button', { name: 'New canvas' })[0])
  fireEvent.change(screen.getByLabelText('Canvas name'), {
    target: { value: 'Editing canvas' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create canvas' }))
  await screen.findByRole('button', { name: 'Open canvas tools' })
  fireEvent.click(screen.getByRole('button', { name: 'Open canvas tools' }))
  await screen.findByRole('button', { name: 'Add rectangle' })
}

describe('workspace navigation and appearance', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('protects unsaved canvas edits while Options is open and restores them on return', async () => {
    render(<App />)
    await createEditableCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'Add ellipse' }))
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    const unload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, unload)
    expect(unload.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    await screen.findByLabelText('Editing canvas: 1 visible objects')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument(),
    )
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
  })

  it('focuses the current file while keeping editing and save controls available, then restores navigation', async () => {
    const view = render(<App />)
    await createEditableCanvas()
    const fullScreen = screen.getByRole('button', {
      name: 'Full screen canvas',
    })
    fullScreen.focus()
    fireEvent.click(fullScreen)
    expect(view.container.firstChild).toHaveAttribute('data-focused', 'true')
    expect(view.container.querySelector('.sidebar')).toHaveAttribute('inert')
    expect(
      screen.queryByRole('complementary', { name: 'Project files' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Exit full screen' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open canvas tools' }))
    expect(
      screen.getByRole('button', { name: 'Add rectangle' }),
    ).toBeInTheDocument()
    const focusHeader = view.container.querySelector(
      '.workspace-tab-bar',
    ) as HTMLElement
    expect(
      within(focusHeader).getByRole('button', { name: 'Save' }),
    ).toBeEnabled()
    expect(
      within(focusHeader).getByRole('button', { name: 'Export' }),
    ).toBeEnabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(view.container.firstChild).toHaveAttribute('data-focused', 'false')
    expect(view.container.querySelector('.sidebar')).not.toHaveAttribute(
      'inert',
    )
    expect(fullScreen).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    expect(
      screen.getByRole('complementary', { name: 'Project files' }),
    ).toBeInTheDocument()
  })

  it('starts with genuine empty projects, navigation and the supplied logo', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Projects' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Options' })).toHaveAttribute(
      'title',
      'Options',
    )
    expect(screen.queryByText('AI controls in Work')).toBeNull()
    expect(
      screen
        .getByRole('link', { name: 'Canvas Live home' })
        .querySelector('img'),
    ).toHaveAttribute('src', '/canvas-live-logo.png')
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    expect(
      screen.getByRole('heading', {
        name: 'No project open',
      }),
    ).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('complementary', { name: 'Workspace sidebar' }),
      ).queryByRole('button', { name: 'Open project' }),
    ).not.toBeInTheDocument()
  })

  it('creates and renames projects, changes recency, and reopens the latest after remount', () => {
    const view = render(<App />)
    createNamedProject('Roadmap')
    createNamedProject('Garden')
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Roadmap' }))
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    expect(
      screen.getByRole('heading', { name: 'Roadmap', level: 2 }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    expect(
      screen.getByRole('heading', { name: 'Roadmap', level: 2 }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rename project' }))
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'New roadmap' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    view.unmount()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    expect(
      screen.getByRole('heading', { name: 'New roadmap', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('persists dock pins and widths without changing saved canvas content', async () => {
    const view = render(<App />)
    await createEditableCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.queryByText('Unsaved changes')).toBeNull(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    fireEvent.keyDown(
      screen.getByRole('separator', { name: 'Resize left panel' }),
      { key: 'End' },
    )
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Files' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Open AI workspace panel' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pin right panel' }))
    fireEvent.keyDown(
      screen.getByRole('separator', { name: 'Resize right panel' }),
      { key: 'ArrowLeft' },
    )
    expect(
      screen.getByLabelText('Editing canvas: 1 visible objects'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)!)).toMatchObject(
      {
        filesOpen: true,
        filesWidth: 420,
        leftPinned: true,
        rightPanel: 'ai',
        rightWidth: 310,
        rightPinned: true,
      },
    )
    view.unmount()
    render(<App />)
    await screen.findByLabelText('Editing canvas: 1 visible objects')
    expect(
      screen.getByRole('button', { name: 'Unpin left panel' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Unpin right panel' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('separator', { name: 'Resize right panel' }),
    ).toHaveAttribute('aria-valuenow', '310')
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset workspace layout' }),
    )
    expect(JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)!)).toEqual(
      DEFAULT_LAYOUT,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    await screen.findByLabelText('Editing canvas: 1 visible objects')
  })

  it('temporarily hides right panels in fullscreen and restores the chosen panel on exit', async () => {
    render(<App />)
    await createEditableCanvas()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open object properties' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Full screen canvas' }))
    expect(
      screen.queryByRole('complementary', {
        name: 'Canvas properties and layers',
      }),
    ).not.toBeInTheDocument()
    expect(
      JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)!).rightPanel,
    ).toBe('properties')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(
      screen.getByRole('complementary', {
        name: 'Canvas properties and layers',
      }),
    ).toBeInTheDocument()
  })

  it('honors remapped drawing shortcuts and cleared Undo and Delete bindings in the actual editor', async () => {
    localStorage.setItem(
      SHORTCUT_STORAGE_KEY,
      JSON.stringify({
        'canvas.rectangle': 'X',
        'canvas.undo': '',
        'canvas.delete': '',
      }),
    )
    render(<App />)
    await createEditableCanvas()
    const stage = screen.getByRole('region', {
      name: 'Editing canvas canvas view',
    })
    stage.focus()
    fireEvent.keyDown(stage, { key: 'r', code: 'KeyR' })
    expect(
      screen.getByLabelText('Editing canvas: 0 visible objects'),
    ).toBeInTheDocument()
    fireEvent.keyDown(stage, { key: 'x', code: 'KeyX' })
    expect(
      screen.getByLabelText('Editing canvas: 1 visible objects'),
    ).toBeInTheDocument()
    fireEvent.keyDown(stage, { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(
      screen.getByLabelText('Editing canvas: 1 visible objects'),
    ).toBeInTheDocument()
    fireEvent.keyDown(stage, { key: 'Delete' })
    fireEvent.keyDown(stage, { key: 'Backspace' })
    expect(
      screen.getByLabelText('Editing canvas: 1 visible objects'),
    ).toBeInTheDocument()
  })

  it('allows workspace navigation shortcuts from appearance controls', async () => {
    render(<App />)
    await createEditableCanvas()
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    const motion = screen.getByRole('checkbox', { name: 'Reduce motion' })
    motion.focus()
    fireEvent.keyDown(motion, {
      key: 'w',
      code: 'KeyW',
      ctrlKey: true,
      altKey: true,
    })
    await screen.findByRole('region', { name: 'Editing canvas canvas view' })
  })

  it('filters projects and clears an empty search', () => {
    render(<App />)
    createNamedProject('Roadmap')
    createNamedProject('Garden')
    fireEvent.click(screen.getByRole('button', { name: /^Projects/ }))
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search projects' }),
      { target: { value: 'road' } },
    )
    expect(
      screen.getByRole('button', { name: 'Open Roadmap' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open Garden' }),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'missing' },
    })
    expect(screen.getByText('No projects found')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    expect(
      screen.getByRole('button', { name: 'Open Garden' }),
    ).toBeInTheDocument()
  })

  it('applies all appearance controls and persists them without changing projects', () => {
    const view = render(<App />)
    createNamedProject('My project')
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    fireEvent.change(screen.getByLabelText('Custom accent color'), {
      target: { value: '#ffcc00' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Lines' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduce motion' }))
    expect(view.container.firstChild).toHaveAttribute('data-theme', 'dark')
    expect(view.container.firstChild).toHaveAttribute('data-density', 'compact')
    expect(view.container.firstChild).toHaveAttribute('data-motion', 'reduced')
    expect(view.container.firstChild).toHaveStyle('--accent: #ffcc00')
    view.unmount()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    expect(
      screen.getByRole('heading', { name: 'My project', level: 2 }),
    ).toBeInTheDocument()
    expect(document.querySelector('.viewer-empty')).toHaveAttribute(
      'data-grid',
      'lines',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }))
    expect(screen.getByRole('radio', { name: 'Follow system' })).toBeChecked()
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).projects[0].name,
    ).toBe('My project')
  })

  it('follows live system appearance changes until an explicit mode is chosen', () => {
    let listener: (() => void) | undefined
    const query = {
      matches: false,
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        listener = cb
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    )
    const view = render(<App />)
    expect(view.container.firstChild).toHaveAttribute('data-theme', 'light')
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    act(() => {
      query.matches = true
      listener?.()
    })
    expect(view.container.firstChild).toHaveAttribute('data-theme', 'dark')
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    act(() => {
      query.matches = false
      listener?.()
      query.matches = true
      listener?.()
    })
    expect(view.container.firstChild).toHaveAttribute('data-theme', 'light')
    vi.unstubAllGlobals()
  })

  it('rejects empty names and lets Escape close the dialog without creating a project', () => {
    render(<App />)
    screen.getByRole('button', { name: 'Create a new project' }).focus()
    fireEvent.click(
      screen.getByRole('button', { name: 'Create a new project' }),
    )
    expect(screen.getByLabelText('Project name')).toHaveFocus()
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Create project',
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a project name')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create a new project' }),
    ).toHaveFocus()
  })

  it('retains usable project state in the session if browser storage fails', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(createProject(EMPTY_STATE, 'Remembered', 1, 'one')),
    )
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    render(<App />)
    createNamedProject('Session project')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your browser couldn’t remember these changes',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    expect(
      screen.getByRole('heading', { name: 'Session project', level: 2 }),
    ).toBeInTheDocument()
  })
})
