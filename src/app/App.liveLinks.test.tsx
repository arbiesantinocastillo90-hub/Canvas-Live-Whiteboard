import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { canvasFileStore, createCanvasFileRecord } from './canvasFiles'
import { projectDrafts } from './canvasDrafts'
import { createElement } from './canvasOperations'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_LAYOUT } from './layout'
import {
  DEFAULT_LINK_OPTIONS,
  LINK_OPTIONS_STORAGE_KEY,
  parseLiveLink,
} from './liveViewLinks'
import {
  latestViewStorageKey,
  LATEST_WORKSPACE_STORAGE_KEY,
  readLatestLiveView,
} from './liveViewState'
import { localLibrary } from './localLibrary'
import * as librarySync from './librarySync'
import {
  DEFAULT_PREFERENCES,
  loadWorkspace,
  persistWorkspace,
  type WorkspaceState,
} from './workspace'
import {
  createSavedWorkspace,
  loadWorkspaceSessions,
  normalizeProjectView,
  persistWorkspaceSessions,
} from './workspaceSessions'

let sequence = 0
async function fixture() {
  const suffix = ++sequence
  const projectId = `live-project-${suffix}`
  const workspaceId = `live-workspace-${suffix}`
  const alphaId = `live-alpha-${suffix}`
  const betaId = `live-beta-${suffix}`
  const metadata: WorkspaceState = {
    version: 1,
    preferences: { ...DEFAULT_PREFERENCES },
    projects: [
      { id: projectId, name: 'Live project', createdAt: 10, lastOpenedAt: 20 },
    ],
    lastProjectId: projectId,
  }
  const savedWorkspace = createSavedWorkspace(
    DEFAULT_PREFERENCES,
    DEFAULT_LAYOUT,
    projectId,
    'Live workspace',
    workspaceId,
  )
  savedWorkspace.views[projectId] = normalizeProjectView({
    openIds: [alphaId, betaId],
    activeId: alphaId,
    tabs: [{ id: alphaId, pinned: true, compact: false }],
  })
  let document = createCanvasDocument('Alpha')
  document = createElement(document, {
    id: 'rectangle',
    type: 'rectangle',
    x: 10,
    y: 20,
    width: 240,
    height: 140,
    text: 'Original text',
  })
  document.viewport = { x: 55, y: -30, zoom: 1.4 }
  const alpha = createCanvasFileRecord(projectId, document, 100, alphaId)
  const beta = createCanvasFileRecord(
    projectId,
    createCanvasDocument('Beta'),
    100,
    betaId,
  )
  await canvasFileStore.save(alpha)
  await canvasFileStore.save(beta)
  expect(persistWorkspace(metadata)).toBe(true)
  expect(
    persistWorkspaceSessions({
      version: 1,
      activeId: workspaceId,
      items: [savedWorkspace],
    }),
  ).toBe(true)
  return { projectId, workspaceId, alphaId, betaId, alpha, beta }
}
async function openWork() {
  fireEvent.click(screen.getByRole('button', { name: 'Work' }))
  await screen.findByRole('region', { name: 'Alpha canvas view' })
}
async function copyLink(kind: 'exact' | 'latest') {
  fireEvent.click(screen.getByRole('button', { name: 'Copy view link' }))
  const menu = await screen.findByRole('menu', { name: 'Copy workspace link' })
  fireEvent.click(
    within(menu).getByRole('menuitem', { name: `Copy ${kind} view` }),
  )
  const input = await screen.findByLabelText('Copy this URL into Obsidian')
  return (input as HTMLTextAreaElement).value
}
beforeEach(() => {
  localStorage.clear()
  projectDrafts(canvasFileStore).clear()
  window.history.replaceState({}, '', '/')
  vi.spyOn(localLibrary, 'available', 'get').mockReturnValue(false)
  vi.stubGlobal('ClipboardItem', undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  })
})
afterEach(() => {
  projectDrafts(canvasFileStore).clear()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('live view links in the application', () => {
  it('shows independent link controls in Options and remembers each choice', async () => {
    const view = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    const section = screen.getByRole('region', { name: 'Canvas Live Links' })
    const exact = within(section).getByRole('checkbox', {
      name: 'Copy exact view links',
    })
    fireEvent.click(exact)
    fireEvent.click(
      within(section).getByRole('checkbox', {
        name: 'Remember camera positions',
      }),
    )
    expect(exact).not.toBeChecked()
    expect(
      within(section).getByRole('checkbox', { name: 'Copy latest view links' }),
    ).toBeChecked()
    expect(
      within(section).getByRole('checkbox', {
        name: 'Resume latest workspace on startup',
      }),
    ).toBeChecked()
    expect(JSON.parse(localStorage.getItem(LINK_OPTIONS_STORAGE_KEY)!)).toEqual(
      { ...DEFAULT_LINK_OPTIONS, exactEnabled: false, rememberCamera: false },
    )
    view.unmount()
    render(<App />)
    await screen.findByRole('region', { name: 'Canvas Live Links' })
    expect(
      screen.getByRole('checkbox', { name: 'Copy exact view links' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Remember camera positions' }),
    ).not.toBeChecked()
  })

  it('opens a small menu with exact and latest choices before copying anything', async () => {
    await fixture()
    render(<App />)
    await openWork()
    fireEvent.click(screen.getByRole('button', { name: 'Copy view link' }))
    const menu = await screen.findByRole('menu', {
      name: 'Copy workspace link',
    })
    expect(
      within(menu).getByRole('menuitem', { name: 'Copy exact view' }),
    ).toBeInTheDocument()
    expect(
      within(menu).getByRole('menuitem', { name: 'Copy latest view' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Copy this URL into Obsidian')).toBeNull()
    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() =>
      expect(
        screen.queryByRole('menu', { name: 'Copy workspace link' }),
      ).toBeNull(),
    )
  })

  it('automatically resumes the most recent open tabs and camera without copying a link', async () => {
    const { workspaceId, projectId, alphaId, betaId } = await fixture()
    const first = render(<App />)
    await openWork()
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    await waitFor(() => {
      const latest = JSON.parse(
        localStorage.getItem(latestViewStorageKey(workspaceId)) ?? 'null',
      )
      expect(latest?.workspace.views[projectId].activeId).toBe(betaId)
      expect(latest?.activeView.viewport.zoom).toBeGreaterThan(1)
    })
    const latest = await readLatestLiveView(workspaceId)
    expect(latest?.workspace.views[projectId].openIds).toEqual([
      alphaId,
      betaId,
    ])
    expect(localStorage.getItem(LATEST_WORKSPACE_STORAGE_KEY)).toBe(workspaceId)
    first.unmount()
    projectDrafts(canvasFileStore).clear()
    const second = render(<App />)
    await screen.findByRole('region', { name: 'Beta canvas view' })
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      second.container.querySelector('.lcanvas-drawing > g'),
    ).toHaveAttribute(
      'transform',
      `translate(${latest!.activeView!.viewport.x} ${latest!.activeView!.viewport.y}) scale(${latest!.activeView!.viewport.zoom})`,
    )
    expect(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-pinned', 'true')
  })

  it('restores an exact copied view with the latest saved content and the same file identities', async () => {
    const { workspaceId, projectId, alphaId, betaId, alpha } = await fixture()
    const first = render(<App />)
    await openWork()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    const url = await copyLink('exact')
    const route = parseLiveLink(url)
    expect(route?.kind).toBe('exact')
    if (route?.kind !== 'exact') throw new Error('Expected exact link')
    expect(route.view.workspaceId).toBe(workspaceId)
    expect(route.view.workspace.views[projectId].openIds).toEqual([
      alphaId,
      betaId,
    ])
    const capturedCamera = route.view.activeView!.viewport
    first.unmount()
    projectDrafts(canvasFileStore).clear()
    const updated = structuredClone(alpha)
    updated.updatedAt = 200
    updated.document.name = 'Current Alpha'
    const rectangle = updated.document.elements[0]
    if (rectangle.type === 'rectangle')
      rectangle.text = 'Saved after this link was copied'
    updated.document.viewport = { x: 999, y: 888, zoom: 0.5 }
    await canvasFileStore.save(updated)
    window.history.replaceState({}, '', new URL(url).hash)
    const second = render(<App />)
    await screen.findByRole('region', { name: 'Current Alpha canvas view' })
    expect(
      screen.getByText('Saved after this link was copied'),
    ).toBeInTheDocument()
    expect(
      second.container.querySelector('.lcanvas-drawing > g'),
    ).toHaveAttribute(
      'transform',
      `translate(${capturedCamera.x} ${capturedCamera.y}) scale(${capturedCamera.zoom})`,
    )
    expect(
      (await canvasFileStore.list(projectId)).value
        .map((file) => file.id)
        .sort(),
    ).toEqual([alphaId, betaId].sort())
    expect(
      (await canvasFileStore.get(projectId, alphaId)).value?.document.name,
    ).toBe('Current Alpha')
  })

  it('latest links follow later view changes while retaining the workspace identity in the URL', async () => {
    const { workspaceId, betaId, projectId } = await fixture()
    const first = render(<App />)
    await openWork()
    const url = await copyLink('latest')
    expect(parseLiveLink(url)).toEqual({ kind: 'latest', workspaceId })
    fireEvent.click(screen.getByRole('button', { name: 'Close view link' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }))
    await waitFor(() => {
      const latest = JSON.parse(
        localStorage.getItem(latestViewStorageKey(workspaceId)) ?? 'null',
      )
      expect(latest?.workspace.views[projectId].activeId).toBe(betaId)
    })
    first.unmount()
    projectDrafts(canvasFileStore).clear()
    window.history.replaceState({}, '', new URL(url).hash)
    render(<App />)
    await screen.findByRole('region', { name: 'Beta canvas view' })
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('retains a newly moved camera when an exact-linked project is left and reopened', async () => {
    const { projectId } = await fixture()
    const otherId = `other-project-${sequence}`
    const metadata = loadWorkspace()
    metadata.projects.push({
      id: otherId,
      name: 'Other project',
      createdAt: 10,
      lastOpenedAt: 20,
    })
    expect(persistWorkspace(metadata)).toBe(true)
    await canvasFileStore.save(
      createCanvasFileRecord(
        otherId,
        createCanvasDocument('Gamma'),
        100,
        `gamma-${sequence}`,
      ),
    )
    const first = render(<App />)
    await openWork()
    const url = await copyLink('exact')
    first.unmount()
    projectDrafts(canvasFileStore).clear()
    window.history.replaceState({}, '', new URL(url).hash)
    const second = render(<App />)
    await screen.findByRole('region', { name: 'Alpha canvas view' })
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    const camera = second.container
      .querySelector('.lcanvas-drawing > g')!
      .getAttribute('transform')
    fireEvent.click(screen.getByRole('link', { name: 'Canvas Live home' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Open project Other project' }),
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open canvas Gamma in Other project',
      }),
    )
    await screen.findByRole('region', { name: 'Gamma canvas view' })
    fireEvent.click(screen.getByRole('link', { name: 'Canvas Live home' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Open project Live project' }),
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open canvas Alpha in Live project',
      }),
    )
    await screen.findByRole('region', { name: 'Alpha canvas view' })
    expect(
      second.container.querySelector('.lcanvas-drawing > g'),
    ).toHaveAttribute('transform', camera!)
    expect(loadWorkspace().lastProjectId).toBe(projectId)
  })

  it('uses the active copied preferences as the rename baseline instead of reverting newer canonical settings', async () => {
    await fixture()
    const first = render(<App />)
    await openWork()
    const url = await copyLink('exact')
    first.unmount()
    projectDrafts(canvasFileStore).clear()
    const canonical = loadWorkspace()
    canonical.preferences.contrast = 90
    expect(persistWorkspace(canonical)).toBe(true)
    const sessions = loadWorkspaceSessions(
      canonical.preferences,
      DEFAULT_LAYOUT,
      canonical.lastProjectId,
    )
    sessions.items[0].preferences.contrast = 90
    expect(persistWorkspaceSessions(sessions)).toBe(true)
    const sync = vi
      .spyOn(librarySync, 'syncWorkspaceChanges')
      .mockResolvedValue(undefined)
    window.history.replaceState({}, '', new URL(url).hash)
    render(<App />)
    await screen.findByRole('region', { name: 'Alpha canvas view' })
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename project' }))
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Renamed live project' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(sync).toHaveBeenCalled())
    const [before, after] = sync.mock.calls.at(-1)!
    expect(before.preferences.contrast).toBe(50)
    expect(after.preferences).toEqual(before.preferences)
    expect(before.projects[0].name).toBe('Live project')
    expect(after.projects[0].name).toBe('Renamed live project')
    expect(
      librarySync.mergeWorkspaceChanges(canonical, before, after).preferences
        .contrast,
    ).toBe(90)
  })

  it('exports a project from Home with its last valid unsaved file edits and no new error notification', async () => {
    const { alphaId, projectId } = await fixture()
    const view = render(<App />)
    await openWork()
    fireEvent.doubleClick(
      view.container.querySelector('[data-element-id="rectangle"]')!,
    )
    const editor = await screen.findByLabelText('Edit object text')
    fireEvent.change(editor, {
      target: { value: 'Last valid unsaved project draft' },
    })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await screen.findByRole('button', {
      name: 'rectangle Last valid unsaved project draft',
    })
    fireEvent.click(screen.getByRole('link', { name: 'Canvas Live home' }))
    await screen.findByRole('button', {
      name: 'Open canvas Alpha in Live project',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    let history = await screen.findByRole('dialog', {
      name: 'Session notifications',
    })
    const errorsBeforeExport = history.querySelectorAll(
      'li[data-kind="error"]',
    ).length
    fireEvent.click(
      within(history).getByRole('button', { name: 'Close notifications' }),
    )
    const create = vi.fn((_blob: Blob) => 'blob:home-project')
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
    const downloaded: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded.push(this)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Export project' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(downloaded).toHaveLength(1)
    expect(downloaded[0].download).toBe('Live project.CLP')
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(create.mock.calls[0][0])
    })
    const archive = JSON.parse(raw) as {
      format: string
      files: { id: string; document: { elements: { text?: string }[] } }[]
    }
    expect(archive.format).toBe('CanvasLiveProject')
    expect(
      archive.files.find((file) => file.id === alphaId)?.document.elements[0]
        .text,
    ).toBe('Last valid unsaved project draft')
    expect(
      (await canvasFileStore.get(projectId, alphaId)).value?.document
        .elements[0],
    ).toMatchObject({ text: 'Original text' })
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    history = await screen.findByRole('dialog', {
      name: 'Session notifications',
    })
    expect(history.querySelectorAll('li[data-kind="error"]')).toHaveLength(
      errorsBeforeExport,
    )
    expect(history).toHaveTextContent('Project copy requested (.CLP).')
    expect(history).not.toHaveTextContent('Open this canvas before editing it.')
  })
})
