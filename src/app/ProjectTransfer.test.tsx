import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvasFileRecord } from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import ProjectTransfer, { type ProjectTransferProps } from './ProjectTransfer'
import {
  PROJECT_ARCHIVE_MAX_BYTES,
  serializeProjectArchive,
  type ProjectArchive,
} from './projectArchive'
import { NotificationBell, NotificationsProvider } from './SessionNotifications'

function archive(): ProjectArchive {
  return {
    rootProjectId: 'project',
    projects: [{ id: 'project', name: 'Plan', createdAt: 1, lastOpenedAt: 1 }],
    files: [
      createCanvasFileRecord(
        'project',
        createCanvasDocument('Latest draft'),
        1,
        'file',
      ),
    ],
  }
}
function panel(patch: Partial<ProjectTransferProps> = {}) {
  const props = {
    onExport: vi.fn(async () => archive()),
    onImport: vi.fn(async (_archive: ProjectArchive) => undefined),
    ...patch,
  }
  render(
    <NotificationsProvider>
      <div className="app-shell">
        <ProjectTransfer {...props} scopeId="project-files" />
        <NotificationBell scopeId="project-files" />
      </div>
    </NotificationsProvider>,
  )
  return props
}
function choose(file: object) {
  fireEvent.change(screen.getByLabelText('Import project file'), {
    target: { files: [file] },
  })
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('portable project import and export controls', () => {
  it('exports the current project snapshot as a .CLP download without saving over local files', async () => {
    const create = vi.fn((_blob: Blob) => 'blob:project')
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this)
    })
    const props = panel()
    fireEvent.click(screen.getByRole('button', { name: 'Export project' }))
    await waitFor(() => expect(props.onExport).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Project copy requested (.CLP)',
      ),
    )
    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('Plan.CLP')
    expect(clicked[0].isConnected).toBe(false)
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it('validates and remaps every project/file identifier before handing contents to import', async () => {
    const props = panel()
    const input = screen.getByLabelText(
      'Import project file',
    ) as HTMLInputElement
    expect(input.accept).toContain('.CLP')
    const source = archive()
    choose({
      name: 'Plan.CLP',
      size: 500,
      text: async () => serializeProjectArchive(source),
    })
    await waitFor(() => expect(props.onImport).toHaveBeenCalledOnce())
    const result = vi.mocked(props.onImport).mock.calls[0][0]
    expect(result.rootProjectId).not.toBe(source.rootProjectId)
    expect(result.files[0].id).not.toBe(source.files[0].id)
    expect(result.files[0].projectId).toBe(result.rootProjectId)
    expect(result.files[0].document).toEqual(source.files[0].document)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Project imported (.CLP)',
    )
    expect(input.value).toBe('')
  })

  it('rejects an oversized source before reading it or invoking the importer', async () => {
    const props = panel()
    const text = vi.fn(async () => serializeProjectArchive(archive()))
    choose({ name: 'Oversized.CLP', size: PROJECT_ARCHIVE_MAX_BYTES + 1, text })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('25 MiB'),
    )
    expect(text).not.toHaveBeenCalled()
    expect(props.onImport).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Import project' }),
    ).not.toBeDisabled()
  })

  it('does not publish malformed files and reports failed imports in session notifications', async () => {
    const failure = vi.fn(async (_archive: ProjectArchive) => {
      throw new Error('Local project storage is unavailable')
    })
    panel({ onImport: failure })
    choose({ size: 50, text: async () => '{"format":"LCANVAS","version":2}' })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Choose a Canvas Live .CLP',
      ),
    )
    expect(failure).not.toHaveBeenCalled()
    choose({ size: 500, text: async () => serializeProjectArchive(archive()) })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Local project storage is unavailable',
      ),
    )
    expect(failure).toHaveBeenCalledOnce()
    expect(screen.queryByText('Project imported (.CLP).')).toBeNull()
  })

  it('prevents repeated operations while a transfer is active, then allows another attempt', async () => {
    let release!: (archive: ProjectArchive) => void
    const onExport = vi.fn(
      () =>
        new Promise<ProjectArchive>((resolve) => {
          release = resolve
        }),
    )
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:project'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    panel({ onExport })
    const button = screen.getByRole('button', { name: 'Export project' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onExport).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('button', { name: 'Import project' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('group', { name: 'Project files' }),
    ).toHaveAttribute('aria-busy', 'true')
    release(archive())
    await waitFor(() => expect(button).not.toBeDisabled())
    expect(
      screen.getByRole('group', { name: 'Project files' }),
    ).toHaveAttribute('aria-busy', 'false')
  })

  it('allows import with no selected project while export is disabled', () => {
    panel({ exportDisabled: true })
    expect(
      screen.getByRole('button', { name: 'Export project' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Import project' }),
    ).not.toBeDisabled()
  })

  it('keeps both transfer actions disabled when the enclosing workspace cannot accept changes', () => {
    const props = panel({ disabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Export project' }))
    expect(props.onExport).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Import project' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Import project file')).toBeDisabled()
  })
})
