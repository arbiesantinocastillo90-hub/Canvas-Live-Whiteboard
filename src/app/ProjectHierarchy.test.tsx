import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectHierarchy from './ProjectHierarchy'

const projects = [
  { id: 'parent', name: 'Writing', createdAt: 1, lastOpenedAt: 2 },
  {
    id: 'child',
    name: 'Drafts',
    parentId: 'parent',
    createdAt: 1,
    lastOpenedAt: 2,
  },
]
const files = [
  { id: 'outline', projectId: 'parent', name: 'Outline' },
  { id: 'chapter', projectId: 'child', name: 'Chapter', dirty: true },
  { id: 'foreign', projectId: 'outside', name: 'Private foreign file' },
]
function setup() {
  return {
    projects,
    files,
    closedIds: [],
    onClosedIdsChange: vi.fn(),
    onOpen: vi.fn(),
    onOpenFile: vi.fn(),
  }
}

describe('project hierarchy canvases', () => {
  it('keeps canvases hidden by default and opens only files under known projects when enabled', () => {
    const props = setup()
    const view = render(<ProjectHierarchy {...props} />)
    expect(screen.queryByRole('button', { name: /Open canvas/ })).toBeNull()
    view.rerender(<ProjectHierarchy {...props} showCanvases />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Open canvas Chapter in Drafts' }),
    )
    expect(props.onOpenFile).toHaveBeenCalledWith('child', 'chapter')
    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument()
    expect(screen.queryByText('Private foreign file')).toBeNull()
    expect(props.onOpen).not.toHaveBeenCalled()
  })

  it('collapses file rows with their project and searches canvas names through ancestors', () => {
    const props = setup()
    const view = render(
      <ProjectHierarchy {...props} showCanvases closedIds={['parent']} />,
    )
    expect(screen.queryByRole('button', { name: /Open canvas/ })).toBeNull()
    view.rerender(
      <ProjectHierarchy
        {...props}
        showCanvases
        closedIds={['parent']}
        search="chapter"
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Browse project Writing' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open canvas Chapter in Drafts' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open canvas Outline in Writing' }),
    ).toBeNull()
  })

  it('opens project actions from right click or keyboard and forwards each action to its own project', () => {
    const props = {
      ...setup(),
      onNewChild: vi.fn(),
      onRename: vi.fn(),
      onCustomize: vi.fn(),
    }
    render(<ProjectHierarchy {...props} />)
    const trigger = screen.getByRole('button', {
      name: 'Browse project Drafts',
    })
    const open = () => {
      fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 })
      return within(
        screen.getByRole('menu', { name: 'Actions for project Drafts' }),
      )
    }
    let menu = open()
    expect(
      menu.getByRole('menuitem', { name: 'Open file location' }),
    ).toBeDisabled()
    expect(
      menu.getByText('No local folder is linked to this project.'),
    ).toBeInTheDocument()
    fireEvent.click(menu.getByRole('menuitem', { name: 'Open project' }))
    expect(props.onOpen).toHaveBeenCalledWith('child')
    menu = open()
    fireEvent.click(menu.getByRole('menuitem', { name: 'New subproject' }))
    expect(props.onNewChild).toHaveBeenCalledWith('child')
    menu = open()
    fireEvent.click(menu.getByRole('menuitem', { name: 'Rename project' }))
    expect(props.onRename).toHaveBeenCalledWith(projects[1])
    fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Customize project' }))
    expect(props.onCustomize).toHaveBeenCalledWith(projects[1])
    fireEvent.keyDown(trigger, { key: 'ContextMenu' })
    expect(screen.getByRole('menuitem', { name: 'Open project' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(
      screen.getByRole('menuitem', { name: 'New subproject' }),
    ).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})
