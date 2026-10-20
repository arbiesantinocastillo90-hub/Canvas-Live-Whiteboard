import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkspaceItemActions from './WorkspaceItemActions'
import { emptyWorkspaceTrash } from './workspaceTrash'
import { createSavedWorkspace } from './workspaceSessions'
import { DEFAULT_PREFERENCES } from './workspace'
import { DEFAULT_LAYOUT } from './layout'

function setup() {
  const workspaces = ['source', 'target'].map((id) => ({
    ...createSavedWorkspace(DEFAULT_PREFERENCES, DEFAULT_LAYOUT, null, id),
    id,
    projectIds: [id === 'source' ? 'drawing-project' : 'target-project'],
  }))
  return {
    item: {
      kind: 'file' as const,
      id: 'drawing',
      name: 'Drawing',
      projectId: 'drawing-project',
    },
    sourceWorkspaceId: 'source',
    workspaces,
    projects: [
      {
        id: 'drawing-project',
        name: 'Source project',
        createdAt: 1,
        lastOpenedAt: 1,
      },
      {
        id: 'target-project',
        name: 'Destination project',
        createdAt: 1,
        lastOpenedAt: 1,
      },
      { id: 'foreign', name: 'Foreign project', createdAt: 1, lastOpenedAt: 1 },
    ],
    trash: emptyWorkspaceTrash('source'),
    onClose: vi.fn(),
    onTrash: vi.fn(async () => {}),
    onMove: vi.fn(async () => {}),
    onRestore: vi.fn(async () => {}),
  }
}
function destination() {
  fireEvent.change(screen.getByLabelText('Destination workspace'), {
    target: { value: 'target' },
  })
  fireEvent.change(screen.getByLabelText('Destination project'), {
    target: { value: 'target-project' },
  })
}

describe('recoverable item management dialog', () => {
  it('requires an explicit owned destination and clears the project when switching workspaces', async () => {
    const props = setup()
    render(<WorkspaceItemActions {...props} />)
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Destination workspace'), {
      target: { value: 'target' },
    })
    expect(
      screen.getByRole('option', { name: 'Destination project' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Source project' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Foreign project' })).toBeNull()
    destination()
    expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Destination workspace'), {
      target: { value: 'source' },
    })
    expect(screen.getByLabelText('Destination project')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled()
    destination()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce())
    expect(props.onMove).toHaveBeenCalledExactlyOnceWith(
      props.item,
      'target',
      'target-project',
    )
  })

  it('disables a stale destination that disappears while the dialog is open', () => {
    const props = setup()
    const view = render(<WorkspaceItemActions {...props} />)
    destination()
    view.rerender(
      <WorkspaceItemActions
        {...props}
        workspaces={props.workspaces.slice(0, 1)}
      />,
    )
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled()
    expect(props.onMove).not.toHaveBeenCalled()
  })

  it('cancels without writing and restores focus to the original trigger', () => {
    const props = setup()
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const view = render(<WorkspaceItemActions {...props} />)
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(props.onTrash).not.toHaveBeenCalled()
    expect(props.onMove).not.toHaveBeenCalled()
    view.unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('keeps failed removals open and allows a deliberate retry', async () => {
    const props = setup()
    props.onTrash.mockRejectedValueOnce(
      new Error('USB disconnected; original retained'),
    )
    render(<WorkspaceItemActions {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'USB disconnected',
    )
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))
    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce())
    expect(props.onTrash).toHaveBeenCalledTimes(2)
  })

  it('prevents duplicate writes and dismissal while a write is pending', async () => {
    const props = setup()
    let finish!: () => void
    props.onMove.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<WorkspaceItemActions {...props} />)
    destination()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(screen.getByRole('dialog')).toHaveFocus()
    expect(props.onMove).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
    await act(async () => finish())
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('lists restorable references and keeps Trash open after restoring one', async () => {
    const props = setup()
    const entry = { ...props.item, removedAt: 1 }
    render(
      <WorkspaceItemActions
        {...props}
        item={null}
        trash={{ ...props.trash, items: [entry] }}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Workspace Trash' })
    expect(within(dialog).queryByRole('button', { name: /delete/i })).toBeNull()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Restore Drawing' }),
    )
    await vi.waitFor(() =>
      expect(props.onRestore).toHaveBeenCalledExactlyOnceWith(entry),
    )
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('moves a whole project without offering a canvas destination or the source workspace', async () => {
    const props = setup()
    const item = {
      ...props.item,
      kind: 'project' as const,
      id: 'drawing-project',
    }
    render(<WorkspaceItemActions {...props} item={item} />)
    expect(screen.queryByLabelText('Destination project')).toBeNull()
    expect(screen.queryByRole('option', { name: 'source' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Destination workspace'), {
      target: { value: 'target' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await vi.waitFor(() =>
      expect(props.onMove).toHaveBeenCalledExactlyOnceWith(
        item,
        'target',
        null,
      ),
    )
  })
})
