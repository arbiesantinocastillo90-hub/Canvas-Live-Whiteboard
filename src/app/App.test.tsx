import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY, createProject, EMPTY_STATE } from './workspace'

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

describe('workspace navigation and appearance', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts with genuine empty projects, navigation and the supplied logo', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Your projects.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('AI not connected')).toBeInTheDocument()
    expect(
      screen
        .getByRole('link', { name: 'Canvas Live home' })
        .querySelector('img'),
    ).toHaveAttribute('src', '/canvas-live-logo.png')
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    expect(
      screen.getByRole('heading', {
        name: 'Your latest project will open here.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Open / }),
    ).not.toBeInTheDocument()
  })

  it('creates and renames projects, changes recency, and reopens the latest after remount', () => {
    const view = render(<App />)
    createNamedProject('Roadmap')
    createNamedProject('Garden')
    fireEvent.click(screen.getByRole('button', { name: 'Open Roadmap' }))
    expect(
      screen.getByRole('heading', { name: 'Roadmap', level: 1 }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    expect(
      screen.getByRole('heading', { name: 'Roadmap', level: 1 }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rename project' }))
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'New roadmap' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    view.unmount()
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'New roadmap', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Drawing and AI editing are the next steps/),
    ).toBeInTheDocument()
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
      screen.getByRole('button', { name: 'Open project Roadmap' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open project Garden' }),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'missing' },
    })
    expect(
      screen.getByRole('heading', { name: 'No projects found' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(
      screen.getByRole('button', { name: 'Open project Garden' }),
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
    expect(
      screen.getByRole('heading', { name: 'My project', level: 1 }),
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
      screen.getByRole('button', { name: 'Open My project' }),
    ).toBeInTheDocument()
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
    expect(
      screen.getByRole('heading', { name: 'Session project', level: 1 }),
    ).toBeInTheDocument()
  })
})
