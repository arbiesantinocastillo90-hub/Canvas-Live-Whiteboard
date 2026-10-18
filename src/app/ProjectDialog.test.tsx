import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectDialog from './ProjectDialog'
import type { Project } from './workspace'

const parents: Project[] = [
  { id: 'finance', name: 'Finance', createdAt: 1, lastOpenedAt: 1 },
  {
    id: 'savings',
    name: 'Savings',
    createdAt: 1,
    lastOpenedAt: 1,
    parentId: 'finance',
  },
]

describe('project parent dialog', () => {
  it('submits the chosen organizer parent and can move it back to the top level', async () => {
    const onSubmit = vi.fn(() => null)
    render(
      <ProjectDialog
        kind="rename"
        initialName="Emergency fund"
        initialParentId="finance"
        projectParents={parents}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Parent project' })
    expect(select).toHaveValue('finance')
    fireEvent.change(select, { target: { value: 'savings' } })
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Rainy day' },
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Save name' })),
    )
    expect(onSubmit).toHaveBeenLastCalledWith('Rainy day', 'savings')
    fireEvent.change(select, { target: { value: '' } })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Save name' })),
    )
    expect(onSubmit).toHaveBeenLastCalledWith('Rainy day', null)
  })

  it('reports a rejected parent move and clears the stale error after choosing another parent', async () => {
    const onSubmit = vi.fn(
      () => 'A project cannot be nested inside itself or its children.',
    )
    render(
      <ProjectDialog
        kind="rename"
        initialName="Finance"
        projectParents={parents}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Save name' })),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be nested')
    fireEvent.change(screen.getByRole('combobox', { name: 'Parent project' }), {
      target: { value: 'savings' },
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Project name')).toHaveValue('Finance')
  })

  it('keeps the parent selector inside the keyboard focus trap', () => {
    const onClose = vi.fn()
    render(
      <ProjectDialog
        kind="create"
        initialName=""
        projectParents={parents}
        onClose={onClose}
        onSubmit={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    const close = within(dialog).getByRole('button', {
      name: 'Close project dialog',
    })
    const submit = within(dialog).getByRole('button', {
      name: 'Create project',
    })
    expect(screen.getByLabelText('Project name')).toHaveFocus()
    fireEvent.change(screen.getByLabelText('Parent project'), {
      target: { value: '' },
    })
    submit.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(submit).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('requires an explicit root destination even when the workspace is empty', async () => {
    const submit = vi.fn(() => null)
    const close = vi.fn()
    const view = render(
      <ProjectDialog
        kind="create"
        initialName="First project"
        projectParents={[]}
        onSubmit={submit}
        onClose={close}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Create project' }),
    ).toBeDisabled()
    fireEvent.submit(view.container.querySelector('form')!)
    expect(submit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Parent project'), {
      target: { value: '' },
    })
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Create project' })),
    )
    expect(submit).toHaveBeenCalledWith('First project', null)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('confirms the chosen parent before creating a nested project', async () => {
    const submit = vi.fn(() => null)
    render(
      <ProjectDialog
        kind="create"
        initialName="New child"
        initialParentId="finance"
        projectParents={parents}
        onSubmit={submit}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Create project' }),
    ).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Parent project'), {
      target: { value: 'savings' },
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Create project' })),
    )
    expect(submit).toHaveBeenCalledWith('New child', 'savings')
  })

  it('uses a confirmed Home canvas destination and never offers workspace root for files', async () => {
    const submit = vi.fn(() => null)
    render(
      <ProjectDialog
        kind="create"
        entity="file"
        initialName="Outline"
        initialParentId="finance"
        initialDestinationConfirmed
        projectParents={[parents[0]]}
        onSubmit={submit}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByRole('option', { name: 'Workspace root' })).toBeNull()
    expect(screen.getByLabelText('Destination project')).toHaveValue('finance')
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Create canvas' })),
    )
    expect(submit).toHaveBeenCalledWith('Outline', 'finance')
  })
})
