import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYOUT } from './layout'
import { DEFAULT_PREFERENCES } from './workspace'
import WorkspacesPanel from './WorkspacesPanel'
import {
  createSavedWorkspace,
  serializeSavedWorkspace,
  type SavedWorkspace,
} from './workspaceSessions'
import { DEFAULT_WORKSPACE_VIEW } from './homeView'

function panel(onImport = vi.fn()) {
  const workspace = createSavedWorkspace(
    DEFAULT_PREFERENCES,
    DEFAULT_LAYOUT,
    null,
    'Planning',
    'original',
  )
  render(
    <WorkspacesPanel
      state={{ version: 1, activeId: workspace.id, items: [workspace] }}
      onImport={onImport}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onSelect={vi.fn()}
    />,
  )
  return workspace
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('workspace file controls', () => {
  it('browses workspace cards outside a top-right management disclosure while retaining unsent drafts', () => {
    const first = {
      ...createSavedWorkspace(
        DEFAULT_PREFERENCES,
        DEFAULT_LAYOUT,
        null,
        'Studio',
        'one',
      ),
      createdAt: 1,
      updatedAt: 8,
      lastOpenedAt: 10,
    }
    const second = {
      ...createSavedWorkspace(
        DEFAULT_PREFERENCES,
        DEFAULT_LAYOUT,
        null,
        'Archive',
        'two',
      ),
      createdAt: 2,
      updatedAt: 3,
      lastOpenedAt: 0,
    }
    const onSelect = vi.fn(),
      onCreate = vi.fn()
    render(
      <WorkspacesPanel
        variant="page"
        state={{ version: 1, activeId: first.id, items: [first, second] }}
        onSelect={onSelect}
        onCreate={onCreate}
        onRename={vi.fn()}
        onImport={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Workspaces' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Studio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'New workspace' })).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Create/Add Workspaces' }),
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'New workspace' }), {
      target: { value: 'Draft workspace' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Create/Add Workspaces' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Create/Add Workspaces' }),
    )
    expect(screen.getByRole('textbox', { name: 'New workspace' })).toHaveValue(
      'Draft workspace',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(onSelect).toHaveBeenCalledWith('two')
    expect(onCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Recent workspaces' }))
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(
      screen.queryByRole('combobox', { name: 'Order workspaces' }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All workspaces' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Order workspaces' }),
      { target: { value: 'created' } },
    )
    expect(
      [...document.querySelectorAll('.saved-workspace-list strong')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Archive', 'Studio'])
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Order workspaces' }),
      { target: { value: 'modified' } },
    )
    expect(
      [...document.querySelectorAll('.saved-workspace-list strong')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Studio', 'Archive'])
  })

  it('publishes workspace perspective changes without changing the workspace document', () => {
    const workspace = createSavedWorkspace(
      DEFAULT_PREFERENCES,
      DEFAULT_LAYOUT,
      null,
      'Studio',
      'one',
    )
    const onViewChange = vi.fn(),
      onSelect = vi.fn(),
      onCreate = vi.fn()
    render(
      <WorkspacesPanel
        variant="page"
        view={DEFAULT_WORKSPACE_VIEW}
        onViewChange={onViewChange}
        state={{ version: 1, activeId: workspace.id, items: [workspace] }}
        onSelect={onSelect}
        onCreate={onCreate}
        onRename={vi.fn()}
        onImport={vi.fn()}
      />,
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Order workspaces' }),
      { target: { value: 'name' } },
    )
    expect(onViewChange).toHaveBeenLastCalledWith({
      perspective: 'all',
      sort: 'name',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Recent workspaces' }))
    expect(onViewChange).toHaveBeenLastCalledWith({
      perspective: 'recent',
      sort: 'recent',
    })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('keeps a rejected create draft and closes the add panel with Escape or an outside click', () => {
    const workspace = createSavedWorkspace(
      DEFAULT_PREFERENCES,
      DEFAULT_LAYOUT,
      null,
      'Studio',
      'one',
    )
    render(
      <WorkspacesPanel
        variant="page"
        state={{ version: 1, activeId: workspace.id, items: [workspace] }}
        onSelect={vi.fn()}
        onCreate={() => {
          throw new Error('Choose another name')
        }}
        onRename={vi.fn()}
        onImport={vi.fn()}
      />,
    )
    const toggle = screen.getByRole('button', { name: 'Create/Add Workspaces' })
    fireEvent.click(toggle)
    fireEvent.change(screen.getByRole('textbox', { name: 'New workspace' }), {
      target: { value: 'Keep this draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose another name')
    expect(screen.getByRole('textbox', { name: 'New workspace' })).toHaveValue(
      'Keep this draft',
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    fireEvent.pointerDown(document.body)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('downloads .CLW using the existing validated workspace envelope', async () => {
    const create = vi.fn((_blob: Blob) => 'blob:workspace')
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const workspace = panel()
    fireEvent.click(screen.getByRole('button', { name: 'Export workspace' }))
    expect(click).toHaveBeenCalledOnce()
    const link = click.mock.instances[0] as HTMLAnchorElement
    expect(link.download).toBe('Planning.CLW')
    expect(link.href).toBe('blob:workspace')
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(serializeSavedWorkspace(workspace)).toContain('CanvasLiveWorkspace')
  })

  it.each(['Planning.CLW', 'Planning.lworkspace'])(
    'imports compatible workspace contents from %s as a separate workspace',
    async (filename) => {
      const imported = vi.fn<(workspace: SavedWorkspace) => void>()
      const workspace = panel(imported)
      const input = screen.getByLabelText(
        'Import workspace file',
      ) as HTMLInputElement
      expect(input.accept).toContain('.CLW')
      expect(input.accept).toContain('.lworkspace')
      const file = {
        name: filename,
        size: 100,
        text: async () => serializeSavedWorkspace(workspace),
      }
      fireEvent.change(input, { target: { files: [file] } })
      await waitFor(() => expect(imported).toHaveBeenCalledOnce())
      expect(imported.mock.calls[0][0].id).not.toBe(workspace.id)
      expect(imported.mock.calls[0][0].name).toBe('Planning')
      expect(input.value).toBe('')
    },
  )

  it('keeps existing workspace state when a canvas is mistaken for a workspace file', async () => {
    const imported = vi.fn()
    panel(imported)
    fireEvent.change(screen.getByLabelText('Import workspace file'), {
      target: {
        files: [
          { size: 60, text: async () => '{"format":"LCANVAS","version":2}' },
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('.CLW'),
    )
    expect(imported).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Planning' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
