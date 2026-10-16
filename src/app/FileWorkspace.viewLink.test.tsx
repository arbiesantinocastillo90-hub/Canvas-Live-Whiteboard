import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import FileWorkspace, { type WorkspaceViewCapture } from './FileWorkspace'
import { createCanvasFileRecord, createCanvasFileStore } from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_LAYOUT, LAYOUT_STORAGE_KEY } from './layout'
import { DEFAULT_PREFERENCES } from './workspace'
import { normalizeProjectView } from './workspaceSessions'

async function mount(
  copy = vi.fn<(capture: WorkspaceViewCapture) => Promise<string>>(
    async () => 'http://127.0.0.1:4173/#view=test',
  ),
  patch: Partial<ComponentProps<typeof FileWorkspace>> = {},
) {
  localStorage.clear()
  localStorage.setItem(
    LAYOUT_STORAGE_KEY,
    JSON.stringify({
      ...DEFAULT_LAYOUT,
      rightPanel: 'tools',
      rightPinned: true,
    }),
  )
  vi.stubGlobal('ClipboardItem', undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  })
  const store = createCanvasFileStore({ indexedDB: null })
  await store.save(
    createCanvasFileRecord(
      'project',
      createCanvasDocument('Alpha'),
      100,
      'alpha',
    ),
  )
  await store.save(
    createCanvasFileRecord(
      'project',
      createCanvasDocument('Beta'),
      100,
      'beta',
    ),
  )
  const view = render(
    <FileWorkspace
      project={{
        id: 'project',
        name: 'Project',
        createdAt: 100,
        lastOpenedAt: 100,
      }}
      preferences={DEFAULT_PREFERENCES}
      store={store}
      onRenameProject={() => undefined}
      viewSession={normalizeProjectView({
        openIds: ['beta', 'alpha'],
        activeId: 'alpha',
      })}
      onCopyViewLink={copy}
      {...patch}
    />,
  )
  await screen.findByRole('tab', { name: 'Alpha' })
  await screen.findByRole('button', { name: 'Add rectangle' })
  return { ...view, copy }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('copying workspace view links', () => {
  it('applies a snapshot camera once and retains later navigation when switching away and back', async () => {
    const copy = vi.fn<(capture: WorkspaceViewCapture) => Promise<string>>(
      async () => 'http://127.0.0.1:4173/#view=test',
    )
    await mount(copy, {
      initialViewState: {
        viewport: { x: 40, y: 50, zoom: 1.2 },
        selectedIds: [],
        tool: 'pan',
        activeLayerId: 'layer-main',
        focusMode: false,
      },
    })
    fireEvent.wheel(screen.getByRole('region', { name: 'Alpha canvas view' }), {
      deltaY: -80,
      clientX: 300,
      clientY: 200,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy view link' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Close view link' }),
    )
    const camera = copy.mock.calls[0][0].activeView.viewport
    expect(camera.zoom).toBeGreaterThan(1.2)
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy view link' }))
    await screen.findByRole('dialog', { name: 'Snapshot link' })
    expect(copy.mock.calls[1][0].activeView.viewport).toEqual(camera)
  })
  it('captures all open tabs and flushes valid property drafts before generating a selectable fallback URL', async () => {
    const { copy, container } = await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Properties' }))
    fireEvent.change(screen.getByLabelText('Text inside shape'), {
      target: { value: 'Captured draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy view link' }))
    const dialog = await screen.findByRole('dialog', { name: 'Snapshot link' })
    expect(
      within(dialog).getByLabelText('Copy this URL into Obsidian'),
    ).toHaveValue('http://127.0.0.1:4173/#view=test')
    const captured = copy.mock.calls[0][0]
    expect(captured.view.openIds).toEqual(['beta', 'alpha'])
    expect(captured.files.map((file) => file.id)).toEqual(['beta', 'alpha'])
    expect(captured.files[1].document.elements[0]).toMatchObject({
      text: 'Captured draft',
    })
    expect(captured.activeView.selectedIds).toHaveLength(1)
    expect(captured.layout.rightPanel).toBe('properties')
    expect(container.querySelector('.canvas-view-status')).toBeNull()
    expect(screen.getAllByLabelText('Canvas zoom')).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Canvas controls help' }).title,
    ).toContain('Scroll to zoom')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports invalid pending edits instead of copying an older condition or raising an unhandled rejection', async () => {
    const { copy } = await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Properties' }))
    fireEvent.change(screen.getByLabelText('Width'), {
      target: { value: '-5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy view link' }))
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((alert) =>
            alert.textContent?.includes(
              'Correct the current object properties',
            ),
          ),
      ).toBe(true),
    )
    expect(copy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copy view link' })).toBeEnabled()
  })
})
