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
