import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage'
import { createCanvasDocument } from './lcanvas'
import { createCanvasFileRecord, type CanvasFileStore } from './canvasFiles'
import { DEFAULT_HOME_VIEW } from './homeView'
import { DEFAULT_WORKSPACE_APPEARANCE } from './workspaceAppearance'
import type { Project } from './workspace'

function setup() {
  const projects: Project[] = [
    { id: 'parent', name: 'Writing', createdAt: 1, lastOpenedAt: 8 },
    {
      id: 'child',
      name: 'Drafts',
      parentId: 'parent',
      createdAt: 2,
      lastOpenedAt: 3,
    },
    { id: 'other', name: 'Research', createdAt: 4, lastOpenedAt: 5 },
  ]
  const records = [
    createCanvasFileRecord(
      'parent',
      {
        ...createCanvasDocument('Outline'),
        elements: [
          {
            id: 'shape',
            type: 'rectangle',
            x: -80,
            y: 120,
            width: 200,
            height: 100,
            text: 'Plan',
            color: '#7C5CFC',
            fill: '#121212',
            fontSize: 20,
            layerId: 'layer-main',
            areaId: null,
          },
        ],
      },
      3,
      'outline',
    ),
    createCanvasFileRecord(
      'child',
      createCanvasDocument('Chapter'),
      2,
      'chapter',
    ),
    createCanvasFileRecord(
      'other',
      createCanvasDocument('Sources'),
      4,
      'sources',
    ),
  ]
  const store: CanvasFileStore = {
    list: vi.fn(async (id) => ({
      value: records.filter((item) => item.projectId === id),
      persistence: 'browser' as const,
    })),
    get: vi.fn(),
    save: vi.fn(),
    markOpened: vi.fn(),
  }
  const props = {
    workspaceName: 'Studio',
    projects,
    selectedProjectId: 'parent',
    store,
    onSelectProject: vi.fn(),
    onNewProject: vi.fn(),
    onRenameProject: vi.fn(),
    onOpenFile: vi.fn(),
    onNewCanvas: vi.fn(),
    onImport: vi.fn(),
  }
  return { props, records, store }
}

describe('home perspectives', () => {
  it('starts with workspace project cards rather than opening the last active project', async () => {
    const { props, store } = setup()
    render(<HomePage {...props} view={DEFAULT_HOME_VIEW} />)
    expect(
      await screen.findByRole('button', { name: 'Browse project Writing' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Current workspace' }),
    ).toHaveTextContent('Studio')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Projects' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Writing' }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: /Recent files/ })).toBeNull()
    expect(store.save).not.toHaveBeenCalled()
    expect(props.onOpenFile).not.toHaveBeenCalled()
  })

  it('opens project contents explicitly, includes descendants, and returns to project cards', async () => {
    const { props } = setup()
    render(<HomePage {...props} selectedProjectId={null} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Browse project Writing' }),
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Writing' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open canvas Chapter in Drafts' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open canvas Sources in Research' }),
    ).toBeNull()
    expect(props.onSelectProject).toHaveBeenCalledWith('parent')
    expect(props.onOpenFile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }))
    expect(
      screen.getByRole('button', { name: 'Browse project Writing' }),
    ).toBeInTheDocument()
    expect(props.onSelectProject).toHaveBeenLastCalledWith(null)
  })

  it('changes headings and recent/all sections when browsing canvases', async () => {
    const { props } = setup()
    render(<HomePage {...props} selectedProjectId={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    const card = await screen.findByRole('button', {
      name: 'Open canvas Outline in Writing',
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Canvases' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Recent canvases' }),
    ).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Recent canvases' }))
    expect(
      screen.getByRole('button', { name: 'Recent canvases' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByRole('button', { name: 'All canvases' }),
    ).toBeInTheDocument()
    expect(within(card).getByText('Plan')).toBeInTheDocument()
    expect(
      card.querySelector(
        'svg.canvas-thumbnail [data-thumbnail-object="rectangle"]',
      ),
    ).not.toBeNull()
    expect(card.querySelector('svg.canvas-thumbnail')).toHaveAttribute(
      'viewBox',
      '-96 104 232 132',
    )
  })

  it('provides independent sidebar and main hierarchies with expandable descendants', async () => {
    const { props } = setup()
    render(<HomePage {...props} selectedProjectId={null} />)
    await screen.findByRole('button', { name: 'Browse project Writing' })
    const sidebar = screen.getByRole('region', {
      name: 'Project hierarchy section',
    })
    fireEvent.click(
      within(sidebar).getByRole('button', { name: 'Project hierarchy' }),
    )
    const sidebarTree = within(sidebar).getByRole('tree', {
      name: 'Project hierarchy',
    })
    fireEvent.click(
      within(sidebarTree).getByRole('button', {
        name: 'Collapse hierarchy project Writing',
      }),
    )
    expect(
      within(sidebarTree).queryByRole('button', {
        name: 'Browse project Drafts',
      }),
    ).toBeNull()
    fireEvent.click(
      within(sidebarTree).getByRole('button', {
        name: 'Expand hierarchy project Writing',
      }),
    )
    expect(
      within(sidebarTree).getByRole('button', {
        name: 'Browse project Drafts',
      }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Project hierarchy',
        pressed: false,
      }),
    )
    expect(
      screen.getAllByRole('tree', { name: 'Project hierarchy' }),
    ).toHaveLength(2)
    fireEvent.click(
      within(sidebar).getByRole('button', { name: 'Project hierarchy' }),
    )
    expect(
      screen.getAllByRole('tree', { name: 'Project hierarchy' }),
    ).toHaveLength(1)
  })

  it('orders projects by descendant file modification and canvases by creation or name', async () => {
    const { props, records } = setup()
    records[1].updatedAt = 99
    render(<HomePage {...props} selectedProjectId={null} />)
    await screen.findByRole('button', { name: 'Browse project Writing' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Order projects' }), {
      target: { value: 'modified' },
    })
    expect(
      [
        ...document.querySelectorAll('.home-project-grid .home-file strong'),
      ].map((item) => item.textContent),
    ).toEqual(['Writing', 'Drafts', 'Research'])
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Order canvases' }), {
      target: { value: 'created' },
    })
    expect(
      [...document.querySelectorAll('.home-file-grid .home-file strong')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Sources', 'Outline', 'Chapter'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Order canvases' }), {
      target: { value: 'name' },
    })
    expect(
      [...document.querySelectorAll('.home-file-grid .home-file strong')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Chapter', 'Outline', 'Sources'])
  })

  it('uses separate customization controls without opening cards and refreshes saved previews', async () => {
    const { props, records } = setup()
    const onCustomizeProject = vi.fn(),
      onCustomizeFile = vi.fn(),
      onCustomizeWorkspace = vi.fn()
    render(
      <HomePage
        {...props}
        selectedProjectId={null}
        onCustomizeProject={onCustomizeProject}
        onCustomizeFile={onCustomizeFile}
        onCustomizeWorkspace={onCustomizeWorkspace}
        workspaceAppearance={{
          ...DEFAULT_WORKSPACE_APPEARANCE,
          description: 'Stories and research',
          tagline: 'One idea at a time',
          backgroundColor: '#123456',
        }}
      />,
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Customize project Writing' }),
    )
    expect(onCustomizeProject).toHaveBeenCalledWith(props.projects[0])
    expect(props.onSelectProject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Customize workspace' }))
    expect(onCustomizeWorkspace).toHaveBeenCalledOnce()
    expect(screen.getByText('Stories and research')).toBeInTheDocument()
    expect(screen.getByText('One idea at a time')).toBeInTheDocument()
    expect(
      screen
        .getByRole('region', { name: 'Canvas Live home' })
        .style.getPropertyValue('--home-background-color'),
    ).toBe('#123456')
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Customize canvas Outline' }),
    )
    expect(onCustomizeFile).toHaveBeenCalledWith('parent', 'outline')
    expect(document.querySelector('button button')).toBeNull()
    records[0].document.name = 'Revised outline'
    act(() => {
      window.dispatchEvent(new Event('canvas-live-library-updated'))
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Open canvas Revised outline in Writing',
        }),
      ).toBeInTheDocument(),
    )
  })
})
