import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectExplorer from './ProjectExplorer'
import type { Project } from './workspace'

const projects: Project[] = [
  { id: 'finance', name: 'Finance', createdAt: 1, lastOpenedAt: 1 },
  {
    id: 'savings',
    name: 'Savings',
    createdAt: 2,
    lastOpenedAt: 3,
    parentId: 'finance',
  },
  {
    id: 'goals',
    name: 'Goals',
    createdAt: 3,
    lastOpenedAt: 4,
    parentId: 'savings',
  },
  { id: 'work', name: 'Work', createdAt: 1, lastOpenedAt: 5, pinned: true },
  {
    id: 'hidden',
    name: 'Archived shortcut',
    createdAt: 1,
    lastOpenedAt: 6,
    recentHidden: true,
  },
]

describe('project organizer', () => {
  it('collapses an organizer branch without hiding its pinned or recent shortcuts', () => {
    const onOpen = vi.fn()
    render(<ProjectExplorer projects={projects} onOpen={onOpen} />)
    const all = screen.getByRole('region', { name: 'All projects' })
    fireEvent.click(
      within(all).getByRole('button', { name: 'Collapse project Finance' }),
    )
    expect(
      within(all).queryByRole('button', { name: 'Open project Savings' }),
    ).toBeNull()
    expect(
      within(all).queryByRole('button', { name: 'Open project Goals' }),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Select recent project Savings' }),
    )
    expect(onOpen).toHaveBeenCalledWith('savings')
    fireEvent.click(
      within(all).getByRole('button', { name: 'Expand project Finance' }),
    )
    expect(
      within(all).getByRole('button', { name: 'Open project Goals' }),
    ).toBeInTheDocument()
  })

  it('keeps hidden shortcuts discoverable in the organizer and limits actions to their intended callbacks', () => {
    const onOpen = vi.fn(),
      onPin = vi.fn(),
      onHideRecent = vi.fn(),
      onNewChild = vi.fn(),
      onRename = vi.fn()
    render(
      <ProjectExplorer
        projects={projects}
        selectedId="savings"
        onOpen={onOpen}
        onPin={onPin}
        onHideRecent={onHideRecent}
        onNewChild={onNewChild}
        onRename={onRename}
      />,
    )
    const recent = screen.getByRole('region', { name: 'Recent projects' })
    const pinned = screen.getByRole('region', { name: 'Pinned projects' })
    expect(
      within(recent).queryByRole('button', { name: /Archived shortcut/ }),
    ).toBeNull()
    expect(
      within(pinned).getByRole('button', {
        name: 'Select pinned project Work',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open project Archived shortcut' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open project Savings' }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(
      within(recent).getByRole('button', { name: 'Pin project Savings' }),
    )
    fireEvent.click(
      within(pinned).getByRole('button', { name: 'Unpin project Work' }),
    )
    fireEvent.click(
      within(recent).getByRole('button', {
        name: 'Remove project Savings from recent list',
      }),
    )
    expect(onPin.mock.calls).toEqual([
      ['savings', true],
      ['work', false],
    ])
    expect(onHideRecent).toHaveBeenCalledWith('savings')
    fireEvent.click(
      screen.getByRole('button', { name: 'Create project inside Finance' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Rename project Savings' }),
    )
    expect(onNewChild).toHaveBeenCalledWith('finance')
    expect(onRename).toHaveBeenCalledWith(projects[1])
    expect(onOpen).not.toHaveBeenCalled()
    expect(projects[1]).not.toHaveProperty('pinned')
  })

  it('can persist recent-section visibility without removing the complete tree', () => {
    const onRecentsCollapsedChange = vi.fn()
    const props = { projects, onOpen: vi.fn(), onRecentsCollapsedChange }
    const view = render(<ProjectExplorer {...props} recentsCollapsed={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }))
    expect(onRecentsCollapsedChange).toHaveBeenCalledWith(true)
    view.rerender(<ProjectExplorer {...props} recentsCollapsed />)
    expect(screen.getByRole('button', { name: 'Recent' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(
      screen.queryByRole('button', { name: 'Select recent project Savings' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Open project Savings' }),
    ).toBeInTheDocument()
  })

  it('reveals matching descendants and ancestors through collapsed branches without unrelated projects', () => {
    const props = { projects, onOpen: vi.fn() }
    const view = render(<ProjectExplorer {...props} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse project Finance' }),
    )
    view.rerender(<ProjectExplorer {...props} search="Goals" />)
    const all = screen.getByRole('region', { name: 'All projects' })
    expect(
      within(all).getByRole('button', { name: 'Open project Finance' }),
    ).toBeInTheDocument()
    expect(
      within(all).getByRole('button', { name: 'Open project Savings' }),
    ).toBeInTheDocument()
    expect(
      within(all).getByRole('button', { name: 'Open project Goals' }),
    ).toBeInTheDocument()
    expect(
      within(all).queryByRole('button', { name: 'Open project Work' }),
    ).toBeNull()
    expect(
      within(all).getByRole('button', { name: 'Collapse project Finance' }),
    ).toHaveAttribute('aria-expanded', 'true')
    view.rerender(<ProjectExplorer {...props} />)
    expect(
      within(all).queryByRole('button', { name: 'Open project Goals' }),
    ).toBeNull()
  })
})
