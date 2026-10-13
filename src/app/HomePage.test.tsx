import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage'
import { createCanvasFileRecord, type CanvasFileStore } from './canvasFiles'
import { projectDrafts } from './canvasDrafts'
import { createCanvasDocument } from './lcanvas'
import type { Project } from './workspace'
import { localFilesFor } from './canvasLocalFiles'

const projects: Project[] = [
  { id: 'alpha', name: 'Alpha', createdAt: 1, lastOpenedAt: 2 },
  { id: 'beta', name: 'Beta', createdAt: 1, lastOpenedAt: 1 },
]
function setup() {
  const records = [
    createCanvasFileRecord(
      'alpha',
      createCanvasDocument('Roadmap'),
      2,
      'roadmap',
    ),
    createCanvasFileRecord('beta', createCanvasDocument('Ideas'), 1, 'ideas'),
  ]
  const store: CanvasFileStore = {
    list: vi.fn(async (id) => ({
      value: records.filter((record) => record.projectId === id),
      persistence: 'browser' as const,
    })),
    get: vi.fn(),
    markOpened: vi.fn(),
    save: vi.fn(),
  }
  const props = {
    projects,
    selectedProjectId: null,
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
describe('home project and file library', () => {
  it('shows the physical save baseline when the older browser copy could not be updated', async () => {
    const { props, records, store } = setup()
    await localFilesFor(store).set('alpha', records[0].id, {
      handle: {
        kind: 'file',
        name: 'physical.lcanvas',
        getFile: vi.fn(),
        createWritable: vi.fn(),
      },
      autoSave: false,
      savedDocument: { ...records[0].document, name: 'Physical roadmap' },
    })
    render(<HomePage {...props} />)
    await screen.findByRole('button', {
      name: 'Open canvas Physical roadmap in Alpha',
    })
    expect(
      screen.queryByRole('button', { name: 'Open canvas Roadmap in Alpha' }),
    ).toBeNull()
    expect(store.save).not.toHaveBeenCalled()
  })
  it('lists real files without opening, saving or changing their recency', async () => {
    const { props, store } = setup()
    render(<HomePage {...props} />)
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    expect(
      screen.getByRole('button', { name: 'Open canvas Ideas in Beta' }),
    ).toBeInTheDocument()
    expect(store.save).not.toHaveBeenCalled()
    expect(store.markOpened).not.toHaveBeenCalled()
    expect(document.querySelector('.canvas-editor')).toBeNull()
  })
  it('filters by selected project and canvas name, then explicitly opens the chosen file', async () => {
    const { props } = setup()
    const view = render(<HomePage {...props} />)
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ideas' },
    })
    expect(
      screen.queryByRole('button', { name: 'Open canvas Roadmap in Alpha' }),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open canvas Ideas in Beta' }),
    )
    expect(props.onOpenFile).toHaveBeenCalledWith('beta', 'ideas')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    view.rerender(<HomePage {...props} selectedProjectId="alpha" />)
    expect(
      screen.queryByRole('button', { name: 'Open canvas Ideas in Beta' }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Alpha' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New canvas' }))
    expect(props.onNewCanvas).toHaveBeenCalledWith('alpha')
  })
  it('shows cached unsaved names and orphan drafts without overwriting saved records', async () => {
    const { props, records, store } = setup()
    const draft = {
      ...records[0],
      document: { ...records[0].document, name: 'Working name' },
    }
    const orphan = createCanvasFileRecord(
      'alpha',
      createCanvasDocument('Unsaved import'),
      3,
      'orphan',
    )
    projectDrafts(store).set('alpha', [
      {
        record: draft,
        dirty: true,
        savedDocument: records[0].document,
        persistence: 'browser',
      },
      {
        record: orphan,
        dirty: true,
        savedDocument: orphan.document,
        persistence: 'session',
      },
    ])
    render(<HomePage {...props} />)
    const card = await screen.findByRole('button', {
      name: 'Open canvas Working name in Alpha',
    })
    expect(within(card).getByLabelText('Unsaved changes')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Open canvas Unsaved import in Alpha',
      }),
    ).toBeInTheDocument()
    expect(store.save).not.toHaveBeenCalled()
  })
  it('keeps available drafts when a project read fails and reports the failure', async () => {
    const { props, records, store } = setup()
    vi.mocked(store.list).mockRejectedValue(new Error('Read failed'))
    projectDrafts(store).set('alpha', [
      {
        record: records[0],
        dirty: true,
        savedDocument: records[0].document,
        persistence: 'browser',
      },
    ])
    render(<HomePage {...props} />)
    await screen.findByRole('button', { name: 'Open canvas Roadmap in Alpha' })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Some saved files could not be loaded',
    )
  })
  it('requests import into the chosen project and lets projects be browsed without entering the editor', async () => {
    const { props } = setup()
    render(<HomePage {...props} selectedProjectId="beta" />)
    await screen.findByRole('button', { name: 'Open canvas Ideas in Beta' })
    fireEvent.click(screen.getByRole('button', { name: 'Open project Alpha' }))
    expect(props.onSelectProject).toHaveBeenCalledWith('alpha')
    expect(props.onOpenFile).not.toHaveBeenCalled()
    const file = new File(['{}'], 'import.lcanvas')
    fireEvent.change(screen.getByLabelText('Import LCANVAS files'), {
      target: { files: [file] },
    })
    expect(props.onImport).toHaveBeenCalledWith('beta', [file])
  })
})
