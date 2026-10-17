import { describe, expect, it } from 'vitest'
import { createCanvasFileRecord } from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import {
  collectProjectTree,
  parseProjectArchive,
  projectExportFilename,
  PROJECT_ARCHIVE_MAX_BYTES,
  serializeProjectArchive,
  type ProjectArchive,
} from './projectArchive'

function archive(): ProjectArchive {
  return {
    rootProjectId: 'root',
    projects: [
      {
        id: 'root',
        name: 'Planning',
        createdAt: 1,
        lastOpenedAt: 2,
        parentId: null,
        pinned: true,
      },
      {
        id: 'child',
        name: 'Notes',
        createdAt: 3,
        lastOpenedAt: 4,
        parentId: 'root',
      },
    ],
    files: [
      createCanvasFileRecord(
        'root',
        createCanvasDocument('Unsaved latest view'),
        5,
        'file-a',
      ),
      createCanvasFileRecord(
        'child',
        {
          ...createCanvasDocument('Child canvas'),
          viewport: { x: 32, y: -50, zoom: 2 },
        },
        6,
        'file-b',
      ),
    ],
  }
}
function ids() {
  let count = 0
  return () => `import-${++count}`
}
function raw(value: unknown) {
  return JSON.stringify({
    format: 'CanvasLiveProject',
    version: 1,
    ...(value as object),
  })
}

describe('portable .CLP projects', () => {
  it('roundtrips every canvas and the nested tree using new project/file IDs, retaining documents and dates', () => {
    const source = archive()
    const before = structuredClone(source)
    const imported = parseProjectArchive(serializeProjectArchive(source), ids())
    expect(imported.rootProjectId).toBe('import-1')
    expect(
      imported.projects.map((project) => [project.id, project.parentId]),
    ).toEqual([
      ['import-1', null],
      ['import-2', 'import-1'],
    ])
    expect(imported.files.map((file) => [file.id, file.projectId])).toEqual([
      ['import-3', 'import-1'],
      ['import-4', 'import-2'],
    ])
    expect(imported.files.map((file) => file.document)).toEqual(
      source.files.map((file) => file.document),
    )
    expect(imported.files[1].createdAt).toBe(6)
    expect(source).toEqual(before)
    const next = parseProjectArchive(serializeProjectArchive(source))
    expect(next.rootProjectId).not.toBe(imported.rootProjectId)
    expect(next.files[0].id).not.toBe(imported.files[0].id)
  })

  it('exports only the chosen subtree and detaches its root without moving the original projects', () => {
    const projects = [
      ...archive().projects,
      { id: 'outside', name: 'Other', createdAt: 1, lastOpenedAt: 1 },
    ]
    expect(collectProjectTree(projects, 'child')).toEqual([
      { ...projects[1], parentId: null },
    ])
    expect(projects[1].parentId).toBe('root')
    const child = {
      rootProjectId: 'child',
      projects: [projects[1]],
      files: [archive().files[1]],
    }
    expect(
      parseProjectArchive(serializeProjectArchive(child), ids()).projects[0]
        .parentId,
    ).toBeNull()
    expect(() => collectProjectTree(projects, 'missing')).toThrow(
      'existing project',
    )
  })

  it('projects out private handles, credentials, and unrelated fields instead of exporting them', () => {
    const source = archive()
    const poisoned = source as unknown as Record<string, unknown>
    poisoned.apiKey = 'private-key'
    Object.assign(source.projects[0], { token: 'private-token' })
    Object.assign(source.files[0], {
      handle: { name: 'private-local-path' },
      autoSave: true,
    })
    const text = serializeProjectArchive(source)
    expect(text).not.toContain('private-')
    expect(text).not.toContain('autoSave')
    expect(parseProjectArchive(text, ids()).files).toHaveLength(2)
  })

  it.each([
    [
      'duplicate projects',
      (value: ProjectArchive) => value.projects.push(value.projects[0]),
    ],
    [
      'duplicate files',
      (value: ProjectArchive) => value.files.push(value.files[0]),
    ],
    [
      'missing root',
      (value: ProjectArchive) => {
        value.rootProjectId = 'missing'
      },
    ],
    [
      'unknown file project',
      (value: ProjectArchive) => {
        value.files[0].projectId = 'missing'
      },
    ],
    [
      'unknown parent',
      (value: ProjectArchive) => {
        value.projects[1].parentId = 'missing'
      },
    ],
    [
      'disconnected project',
      (value: ProjectArchive) => {
        value.projects[1].parentId = null
      },
    ],
    [
      'self cycle',
      (value: ProjectArchive) => {
        value.projects[1].parentId = 'child'
      },
    ],
    [
      'root cycle',
      (value: ProjectArchive) => {
        value.projects[0].parentId = 'child'
      },
    ],
    [
      'unsafe ID',
      (value: ProjectArchive) => {
        value.projects[1].id = '__proto__'
      },
    ],
    [
      'bad file date',
      (value: ProjectArchive) => {
        value.files[0].updatedAt = -1
      },
    ],
    [
      'invalid canvas',
      (value: ProjectArchive) => {
        value.files[0].document.viewport.zoom = 0
      },
    ],
    [
      'invalid name',
      (value: ProjectArchive) => {
        value.projects[0].name = 'bad\u0000name'
      },
    ],
  ])('rejects %s before generating any import IDs', (_label, mutate) => {
    const value = archive()
    mutate(value)
    let calls = 0
    expect(() =>
      parseProjectArchive(raw(value), () => {
        calls++
        return 'fresh'
      }),
    ).toThrow()
    expect(calls).toBe(0)
  })

  it('rejects count and UTF-8 byte limits without silently dropping projects or files', () => {
    const tooManyProjects = archive()
    tooManyProjects.projects = Array.from({ length: 101 }, (_, i) => ({
      id: `p-${i}`,
      name: 'Name',
      createdAt: 0,
      lastOpenedAt: 0,
    }))
    expect(() => serializeProjectArchive(tooManyProjects)).toThrow('1–100')
    const tooManyFiles = archive()
    tooManyFiles.files = Array.from({ length: 501 }, (_, i) =>
      createCanvasFileRecord(
        'root',
        createCanvasDocument('Canvas'),
        0,
        `f-${i}`,
      ),
    )
    expect(() => serializeProjectArchive(tooManyFiles)).toThrow('500')
    expect(() =>
      parseProjectArchive(' '.repeat(PROJECT_ARCHIVE_MAX_BYTES + 1)),
    ).toThrow('25 MiB')
    const utf8 = '🙂'.repeat(Math.floor(PROJECT_ARCHIVE_MAX_BYTES / 4) + 1)
    expect(utf8.length).toBeLessThan(PROJECT_ARCHIVE_MAX_BYTES)
    expect(() => parseProjectArchive(utf8)).toThrow('25 MiB')
  })

  it.each(['root', 'file-a', 'duplicate', '__proto__', ' bad '])(
    'refuses reused or invalid generated IDs: %s',
    (nextId) => {
      expect(() =>
        parseProjectArchive(serializeProjectArchive(archive()), () => nextId),
      ).toThrow('unique import identifier')
    },
  )

  it.each([
    'not-json',
    '[]',
    '{}',
    '{"format":"CanvasLiveProject","version":2}',
    '{"format":"CanvasLiveWorkspace","version":1}',
  ])('rejects unrelated formats: %s', (text) => {
    expect(() => parseProjectArchive(text)).toThrow()
  })

  it.each([
    ['Planning', 'Planning.CLP'],
    ['plan.clp', 'plan.CLP'],
    ['CON', 'Project-CON.CLP'],
    ['A/B: draft?', 'A-B- draft-.CLP'],
    ['...', 'Project.CLP'],
  ])('uses portable .CLP filenames: %s', (name, expected) => {
    expect(projectExportFilename(name)).toBe(expected)
  })
})
