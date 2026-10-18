import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage'
import { DEFAULT_HOME_VIEW } from './homeView'
import { createCanvasFileStore } from './canvasFiles'

function setup() {
  return {
    projects: [
      { id: 'alpha', name: 'Alpha', createdAt: 1, lastOpenedAt: 1 },
      { id: 'beta', name: 'Beta', createdAt: 1, lastOpenedAt: 2 },
    ],
    selectedProjectId: 'alpha',
    view: { ...DEFAULT_HOME_VIEW, perspective: 'canvas' as const },
    onNewProject: vi.fn(),
    onRenameProject: vi.fn(),
    onCustomizeProject: vi.fn(),
    onSelectProject: vi.fn(),
    onNewCanvas: vi.fn(),
    onOpenFile: vi.fn(),
    onImport: vi.fn(),
    store: createCanvasFileStore({ indexedDB: null }),
  }
}

describe('explicit creation destinations in Home', () => {
  it('does not infer the canvas destination from the active project or the most recent project', async () => {
    const props = setup()
    render(<HomePage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'New canvas' }))
    const dialog = within(
      screen.getByRole('dialog', { name: 'Choose a canvas destination' }),
    )
    expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(props.onNewCanvas).not.toHaveBeenCalled()
    fireEvent.change(dialog.getByLabelText('Destination project'), {
      target: { value: 'beta' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Continue' }))
    expect(props.onNewCanvas).toHaveBeenCalledExactlyOnceWith('beta')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((await props.store.list('alpha')).value).toHaveLength(0)
    expect((await props.store.list('beta')).value).toHaveLength(0)
  })

  it('cancels without creating a project or a canvas', () => {
    const props = setup()
    render(<HomePage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'New canvas' }))
    fireEvent.change(screen.getByLabelText('Destination project'), {
      target: { value: 'alpha' },
    })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onNewCanvas).not.toHaveBeenCalled()
    expect(props.onNewProject).not.toHaveBeenCalled()
  })

  it('requires a project first in an empty workspace and closes pending destinations on a workspace switch', async () => {
    const props = setup()
    const view = render(<HomePage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'New canvas' }))
    view.rerender(
      <HomePage
        {...props}
        projects={[]}
        store={createCanvasFileStore({ indexedDB: null })}
        notificationScopeId="another-workspace"
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    await screen.findByText(
      'Create a project in this workspace before adding a new canvas.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'New canvas' }))
    expect(props.onNewProject).toHaveBeenCalledExactlyOnceWith()
    expect(props.onNewCanvas).not.toHaveBeenCalled()
    expect(screen.queryByRole('option', { name: 'Alpha' })).toBeNull()
  })

  it('shows the same project actions on cards and removes their target on a workspace switch', async () => {
    const props = setup()
    const view = render(<HomePage {...props} view={DEFAULT_HOME_VIEW} />)
    const trigger = await screen.findByRole('button', {
      name: 'Browse project Alpha',
    })
    fireEvent.contextMenu(trigger, { clientX: 200, clientY: 200 })
    expect(screen.getAllByRole('menuitem')).toHaveLength(5)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Customize project' }))
    expect(props.onCustomizeProject).toHaveBeenCalledWith(props.projects[0])
    fireEvent.keyDown(trigger, { key: 'ContextMenu' })
    view.rerender(
      <HomePage
        {...props}
        projects={[props.projects[1]]}
        view={DEFAULT_HOME_VIEW}
        store={createCanvasFileStore({ indexedDB: null })}
        notificationScopeId="another-workspace"
      />,
    )
    expect(screen.queryByRole('menu')).toBeNull()
    expect(props.onNewProject).not.toHaveBeenCalled()
    expect(props.onRenameProject).not.toHaveBeenCalled()
  })
})
