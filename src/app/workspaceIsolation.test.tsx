import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { canvasFileStore, createCanvasFileRecord } from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_LAYOUT, LAYOUT_STORAGE_KEY } from './layout'
import { DEFAULT_HOME_VIEW } from './homeView'
import {
  DEFAULT_PREFERENCES,
  EMPTY_STATE,
  STORAGE_KEY,
  createProject,
} from './workspace'
import {
  SESSIONS_STORAGE_KEY,
  createSavedWorkspace,
  parseSavedWorkspace,
  serializeSavedWorkspace,
  type SavedWorkspace,
  type WorkspaceSessions,
} from './workspaceSessions'
import {
  initializeWorkspaceContents,
  workspaceProjects,
} from './workspaceContents'
import { normalizeItemPresentation } from './itemPresentation'
import { serializeProjectArchive } from './projectArchive'

const layout = { ...DEFAULT_LAYOUT, homeView: { ...DEFAULT_HOME_VIEW } }
function sessions(): WorkspaceSessions {
  return JSON.parse(
    localStorage.getItem(SESSIONS_STORAGE_KEY)!,
  ) as WorkspaceSessions
}
async function seed() {
  const suffix = crypto.randomUUID()
  const id = `alpha-${suffix}`
  const state = createProject(EMPTY_STATE, 'Alpha project', 100, id)
  const a: SavedWorkspace = {
    ...createSavedWorkspace(
      DEFAULT_PREFERENCES,
      layout,
      id,
      'Workspace A',
      `a-${suffix}`,
    ),
    projectIds: [id],
  }
  const b: SavedWorkspace = {
    ...createSavedWorkspace(
      DEFAULT_PREFERENCES,
      layout,
      null,
      'Workspace B',
      `b-${suffix}`,
    ),
    projectIds: [],
    views: {},
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  localStorage.setItem(
    SESSIONS_STORAGE_KEY,
    JSON.stringify({ version: 1, activeId: a.id, items: [a, b] }),
  )
  const file = createCanvasFileRecord(
    id,
    createCanvasDocument('Alpha drawing'),
    100,
    `file-${suffix}`,
  )
  await canvasFileStore.save(file)
  return { a, b, state, file, id, suffix }
}
async function switchWorkspace(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }))
  fireEvent.click(await screen.findByTitle(name))
  await screen.findByRole('region', { name: 'Canvas Live home' })
}
function createProjectInHome(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'New project' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Project name'), {
    target: { value: name },
  })
  fireEvent.change(within(dialog).getByLabelText('Parent project'), {
    target: { value: '' },
  })
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Create project' }),
  )
}
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsText(blob)
  })
}
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('workspace contents and appearance boundaries', () => {
  it('creates a new workspace empty, retains existing library contents, and opens it at Home', async () => {
    const { a, id } = await seed()
    render(<App />)
    await screen.findByRole('button', { name: 'Browse project Alpha project' })
    fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Create/Add Workspaces' }),
    )
    fireEvent.change(screen.getByLabelText('New workspace'), {
      target: { value: 'Blank studio' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    await screen.findByRole('heading', { name: 'No projects yet' })
    expect(
      screen.getByRole('region', { name: 'Canvas Live home' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Browse project Alpha project' }),
    ).toBeNull()
    const created = sessions().items.find(
      (item) => item.id === sessions().activeId,
    )!
    expect(created.projectIds).toEqual([])
    expect(created.projectId).toBeNull()
    expect(created.views).toEqual({})
    expect(
      sessions().items.find((item) => item.id === a.id)?.projectIds,
    ).toEqual([id])
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).projects,
    ).toHaveLength(1)
  })
  it.each([false, true])(
    'imports workspace settings without borrowing global contents; explicit membership=%s',
    async (explicitMembership) => {
      const { a, id } = await seed()
      const imported: SavedWorkspace = {
        ...a,
        name: 'Imported workspace',
        projectIds: explicitMembership ? [id] : undefined,
      }
      if (!explicitMembership) delete imported.projectIds
      const raw = serializeSavedWorkspace(imported)
      render(<App />)
      await screen.findByRole('button', {
        name: 'Browse project Alpha project',
      })
      fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }))
      fireEvent.click(
        screen.getByRole('button', { name: 'Create/Add Workspaces' }),
      )
      fireEvent.change(screen.getByLabelText('Import workspace file'), {
        target: {
          files: [
            { name: 'Imported.CLW', size: raw.length, text: async () => raw },
          ],
        },
      })
      await screen.findByRole('region', { name: 'Canvas Live home' })
      await waitFor(() => {
        const current = sessions().items.find(
          (item) => item.id === sessions().activeId,
        )!
        expect(current.name).toBe('Imported workspace')
        expect(current.projectIds).toEqual(explicitMembership ? [id] : [])
      })
      if (explicitMembership)
        expect(
          await screen.findByRole('button', {
            name: 'Browse project Alpha project',
          }),
        ).toBeInTheDocument()
      else {
        expect(
          await screen.findByRole('heading', { name: 'No projects yet' }),
        ).toBeInTheDocument()
        expect(
          screen.queryByRole('button', {
            name: 'Browse project Alpha project',
          }),
        ).toBeNull()
      }
      expect(
        sessions().items.find((item) => item.id === a.id)?.projectIds,
      ).toEqual([id])
      expect(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).projects,
      ).toHaveLength(1)
    },
  )
  it('does not borrow inherited object properties as project decorations', () => {
    const item = {
      ...createSavedWorkspace(DEFAULT_PREFERENCES, layout, 'toString'),
      projectIds: ['toString'],
      projectPresentations: {},
    }
    const project = createProject(
      EMPTY_STATE,
      'External project',
      100,
      'toString',
    ).projects[0]
    expect(workspaceProjects(item, [project])).toEqual([project])
    expect(workspaceProjects(item, [project])[0].presentation).toBeUndefined()
  })
  it('keeps newly created and imported projects only in the active workspace across switches and reload', async () => {
    const { a, b, id } = await seed()
    const mounted = render(<App />)
    await screen.findByRole('button', { name: 'Browse project Alpha project' })
    await switchWorkspace('Workspace B')
    await screen.findByRole('heading', { name: 'No projects yet' })
    createProjectInHome('Beta project')
    await screen.findByRole('button', { name: 'Browse project Beta project' })
    const imported = createProject(
      EMPTY_STATE,
      'Imported project',
      100,
      'source-project',
    ).projects[0]
    const raw = serializeProjectArchive({
      rootProjectId: imported.id,
      projects: [imported],
      files: [
        createCanvasFileRecord(
          imported.id,
          createCanvasDocument('Imported drawing'),
          100,
          'source-file',
        ),
      ],
    })
    fireEvent.change(screen.getByLabelText('Import project file'), {
      target: {
        files: [
          { name: 'Imported.CLP', size: raw.length, text: async () => raw },
        ],
      },
    })
    await screen.findByRole('button', {
      name: 'Browse project Imported project',
    })
    expect(
      sessions().items.find((item) => item.id === a.id)?.projectIds,
    ).toEqual([id])
    const owned = sessions().items.find((item) => item.id === b.id)?.projectIds
    expect(owned).toHaveLength(2)
    expect(owned).not.toContain(id)
    await switchWorkspace('Workspace A')
    await screen.findByRole('button', { name: 'Browse project Alpha project' })
    expect(
      screen.queryByRole('button', { name: 'Browse project Beta project' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Browse project Imported project' }),
    ).toBeNull()
    await switchWorkspace('Workspace B')
    await screen.findByRole('button', { name: 'Browse project Beta project' })
    mounted.unmount()
    render(<App />)
    await screen.findByRole('button', {
      name: 'Browse project Imported project',
    })
    expect(
      screen.queryByRole('button', { name: 'Browse project Alpha project' }),
    ).toBeNull()
    expect(
      sessions().items.find((item) => item.id === b.id)?.projectIds,
    ).toEqual(owned)
  })
  it('finishes an in-flight project import in its originating workspace without replacing the workspace switched to meanwhile', async () => {
    const { a, b, id } = await seed()
    const preferences = { ...b.preferences, accent: '#11AA55' }
    localStorage.setItem(
      SESSIONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeId: a.id,
        items: [a, { ...b, preferences }],
      }),
    )
    const source = createProject(
      EMPTY_STATE,
      'Delayed imported project',
      100,
      'delayed-source',
    ).projects[0]
    const raw = serializeProjectArchive({
      rootProjectId: source.id,
      projects: [source],
      files: [
        createCanvasFileRecord(
          source.id,
          createCanvasDocument('Delayed drawing'),
          100,
          'delayed-file',
        ),
      ],
    })
    let releaseSave: () => void = () => undefined
    const pending = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const originalSave = canvasFileStore.save.bind(canvasFileStore)
    const save = vi
      .spyOn(canvasFileStore, 'save')
      .mockImplementationOnce(async (record) => {
        await pending
        return originalSave(record)
      })
    render(<App />)
    await screen.findByRole('button', { name: 'Browse project Alpha project' })
    fireEvent.change(screen.getByLabelText('Import project file'), {
      target: {
        files: [
          { name: 'Delayed.CLP', size: raw.length, text: async () => raw },
        ],
      },
    })
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    await switchWorkspace('Workspace B')
    createProjectInHome('Created while importing')
    await screen.findByRole('button', {
      name: 'Browse project Created while importing',
    })
    const beta = JSON.parse(localStorage.getItem(STORAGE_KEY)!).projects.find(
      (project: { name: string }) => project.name === 'Created while importing',
    )
    await act(async () => {
      releaseSave()
    })
    await waitFor(() =>
      expect(
        sessions().items.find((item) => item.id === a.id)?.projectIds,
      ).toHaveLength(2),
    )
    expect(sessions().activeId).toBe(b.id)
    const current = sessions().items.find((item) => item.id === b.id)!
    expect(current.projectIds).toEqual([beta.id])
    expect(current.projectId).toBe(beta.id)
    expect(current.preferences.accent).toBe('#11AA55')
    const catalog = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(catalog.projects).toHaveLength(3)
    expect(catalog.lastProjectId).toBe(beta.id)
    expect(catalog.preferences.accent).toBe('#11AA55')
    expect(
      screen.getByRole('button', {
        name: 'Browse project Created while importing',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'Browse project Delayed imported project',
      }),
    ).toBeNull()
    await switchWorkspace('Workspace A')
    expect(
      await screen.findByRole('button', {
        name: 'Browse project Delayed imported project',
      }),
    ).toBeInTheDocument()
    expect(
      sessions().items.find((item) => item.id === a.id)?.projectIds,
    ).toContain(id)
  })
  it('ignores a pending canvas appearance read after switching to another workspace', async () => {
    const { a, b } = await seed()
    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Browse project Alpha project',
      }),
    )
    await screen.findByRole('button', {
      name: 'Open canvas Alpha drawing in Alpha project',
    })
    let releaseRead: () => void = () => undefined
    const pending = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    const originalGet = canvasFileStore.get.bind(canvasFileStore)
    let completed = false
    const read = vi
      .spyOn(canvasFileStore, 'get')
      .mockImplementationOnce(async (projectId, fileId) => {
        await pending
        const result = await originalGet(projectId, fileId)
        completed = true
        return result
      })
    fireEvent.click(
      screen.getByRole('button', { name: 'Customize canvas Alpha drawing' }),
    )
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    await switchWorkspace('Workspace B')
    await screen.findByRole('heading', { name: 'No projects yet' })
    await act(async () => {
      releaseRead()
    })
    await waitFor(() => expect(completed).toBe(true))
    expect(
      screen.queryByRole('dialog', { name: 'Canvas appearance' }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'No projects yet' }),
    ).toBeInTheDocument()
    expect(sessions().activeId).toBe(b.id)
    expect(
      sessions().items.find((item) => item.id === b.id)?.filePresentations ??
        {},
    ).toEqual({})
    expect(
      sessions().items.find((item) => item.id === a.id)?.filePresentations ??
        {},
    ).toEqual({})
  })
  it('migrates legacy global visibility once and round-trips explicit membership and independent decorations through CLW', async () => {
    const { a, b, state, id, file } = await seed()
    const legacy = { ...a }
    delete legacy.projectIds
    const initialized = initializeWorkspaceContents(
      { version: 1, activeId: legacy.id, items: [legacy, b] },
      state.projects,
    )
    expect(initialized.items[0].projectIds).toEqual([id])
    expect(initialized.items[1].projectIds).toEqual([])
    const later = createProject(state, 'Later project', 200, 'later').projects
    expect(
      initializeWorkspaceContents(initialized, later).items[0].projectIds,
    ).toEqual([id])
    const red = normalizeItemPresentation(
      { color: '#FF0000', description: 'Only A' },
      'folder',
    )
    const green = normalizeItemPresentation({ color: '#00FF00' }, 'folder')
    const first = {
      ...a,
      projectPresentations: { [id]: red },
      filePresentations: {
        [file.id]: normalizeItemPresentation({ icon: 'star' }),
      },
    }
    const second = {
      ...b,
      projectIds: [id],
      projectPresentations: { [id]: green },
    }
    const restored = parseSavedWorkspace(
      serializeSavedWorkspace(first),
      'restored',
    )
    expect(restored.projectIds).toEqual([id])
    expect(restored.projectPresentations).toEqual(first.projectPresentations)
    expect(restored.filePresentations).toEqual(first.filePresentations)
    expect(workspaceProjects(first, state.projects)[0].presentation).toEqual(
      red,
    )
    expect(workspaceProjects(second, state.projects)[0].presentation).toEqual(
      green,
    )
    expect(state.projects[0].presentation).toBeUndefined()
  })
  it('exports effective project and canvas decorations from the active workspace without altering canonical styles', async () => {
    const { a, b, id, file } = await seed()
    const red = normalizeItemPresentation({ color: '#FF0000' }, 'folder')
    const star = normalizeItemPresentation({
      icon: 'star',
      description: 'Only this workspace',
    })
    localStorage.setItem(
      SESSIONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeId: a.id,
        items: [
          {
            ...a,
            projectPresentations: { [id]: red },
            filePresentations: { [file.id]: star },
          },
          b,
        ],
      }),
    )
    const exported: Blob[] = []
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        exported.push(blob)
        return 'blob:http://localhost/export'
      }),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Browse project Alpha project',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export project' }))
    await waitFor(() => expect(exported).toHaveLength(1))
    const archive = JSON.parse(await blobText(exported[0]))
    expect(archive.projects[0].presentation).toEqual(red)
    expect(archive.files[0].document.presentation).toEqual(star)
    expect(
      (await canvasFileStore.get(id, file.id)).value?.document.presentation,
    ).toBeUndefined()
    const metadata = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(metadata.projects[0].presentation).toBeUndefined()
  })
  it('resumes the latest modified file across owned projects while excluding a newer file in another workspace', async () => {
    const { a, b, state, id, suffix } = await seed()
    const betaId = `beta-${suffix}`,
      foreignId = `foreign-${suffix}`
    const all = createProject(
      createProject(state, 'Beta project', 100, betaId),
      'Foreign project',
      100,
      foreignId,
    )
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...all, lastProjectId: id }),
    )
    localStorage.setItem(
      SESSIONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeId: a.id,
        items: [
          { ...a, projectIds: [id, betaId] },
          { ...b, projectIds: [foreignId] },
        ],
      }),
    )
    await canvasFileStore.save({
      ...createCanvasFileRecord(
        betaId,
        createCanvasDocument('Latest owned drawing'),
        100,
        `latest-${suffix}`,
      ),
      updatedAt: 500,
    })
    await canvasFileStore.save({
      ...createCanvasFileRecord(
        foreignId,
        createCanvasDocument('Foreign latest drawing'),
        100,
        `outside-${suffix}`,
      ),
      updatedAt: 1000,
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Work' }))
    await screen.findByRole('region', {
      name: 'Latest owned drawing canvas view',
    })
    expect(
      screen.queryByRole('region', {
        name: 'Foreign latest drawing canvas view',
      }),
    ).toBeNull()
    expect(
      sessions().items.find((item) => item.id === a.id)?.projectIds,
    ).toEqual([id, betaId])
  })
})
