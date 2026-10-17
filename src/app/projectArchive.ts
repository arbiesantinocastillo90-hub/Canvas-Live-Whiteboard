import { createCanvasFileRecord, type CanvasFileRecord } from './canvasFiles'
import { validCanvasId } from './lcanvas'
import type { Project } from './workspace'

export const PROJECT_FILE_EXTENSION = '.CLP'
export const PROJECT_FILE_ACCEPT = '.CLP,.clp,application/json'
export const PROJECT_ARCHIVE_MAX_BYTES = 25 * 1024 * 1024
export const PROJECT_ARCHIVE_MAX_PROJECTS = 100
export const PROJECT_ARCHIVE_MAX_FILES = 500

/** Portable project contents. Browser handles and workspace/AI state are excluded. */
export type ProjectArchive = {
  rootProjectId: string
  projects: Project[]
  files: CanvasFileRecord[]
}

function fail(message: string): never {
  throw new Error(message)
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function id(value: unknown): value is string {
  return (
    validCanvasId(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
  )
}
function timestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  )
}
function projectName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 80 ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return fail('A project name must contain 1–80 plain text characters.')
  return value.trim()
}
function normalize(value: unknown, detachRoot = false): ProjectArchive {
  if (
    !record(value) ||
    !id(value.rootProjectId) ||
    !Array.isArray(value.projects) ||
    !value.projects.length ||
    value.projects.length > PROJECT_ARCHIVE_MAX_PROJECTS ||
    !Array.isArray(value.files) ||
    value.files.length > PROJECT_ARCHIVE_MAX_FILES
  )
    return fail(
      'A .CLP file must contain 1–100 projects and up to 500 canvas files.',
    )
  const rootProjectId = value.rootProjectId
  const projectIds = new Set<string>()
  const projects: Project[] = value.projects.map((candidate: unknown) => {
    if (
      !record(candidate) ||
      !id(candidate.id) ||
      projectIds.has(candidate.id) ||
      !timestamp(candidate.createdAt) ||
      !timestamp(candidate.lastOpenedAt) ||
      candidate.lastOpenedAt < candidate.createdAt ||
      (candidate.parentId !== null &&
        candidate.parentId !== undefined &&
        !id(candidate.parentId))
    )
      return fail('A project has an invalid identifier, parent, or date.')
    projectIds.add(candidate.id)
    return {
      id: candidate.id,
      name: projectName(candidate.name),
      createdAt: candidate.createdAt,
      lastOpenedAt: candidate.lastOpenedAt,
      // Exporting a subproject creates a detached portable root.
      parentId:
        candidate.id === rootProjectId && detachRoot
          ? null
          : ((candidate.parentId as string | null | undefined) ?? null),
      pinned: candidate.pinned === true,
      recentHidden: candidate.recentHidden === true,
    }
  })
  if (!projectIds.has(rootProjectId))
    return fail('The root project is missing.')
  const byId = new Map(projects.map((project) => [project.id, project]))
  if (byId.get(rootProjectId)!.parentId !== null)
    return fail('The exported root project cannot have a parent.')
  for (const project of projects) {
    const seen = new Set<string>()
    let current: Project | undefined = project
    while (current && current.id !== rootProjectId) {
      if (seen.has(current.id))
        return fail('The project hierarchy contains a cycle.')
      seen.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    if (!current) return fail('Every project must belong to the exported root.')
  }
  const fileIds = new Set<string>()
  const files: CanvasFileRecord[] = value.files.map((candidate: unknown) => {
    if (
      !record(candidate) ||
      !id(candidate.id) ||
      fileIds.has(candidate.id) ||
      !id(candidate.projectId) ||
      !projectIds.has(candidate.projectId) ||
      !timestamp(candidate.createdAt) ||
      !timestamp(candidate.updatedAt) ||
      !timestamp(candidate.lastOpenedAt) ||
      candidate.updatedAt < candidate.createdAt ||
      candidate.lastOpenedAt < candidate.createdAt
    )
      return fail('A canvas file has an invalid identifier, project, or date.')
    fileIds.add(candidate.id)
    const validated = createCanvasFileRecord(
      candidate.projectId,
      candidate.document as CanvasFileRecord['document'],
      candidate.createdAt,
      candidate.id,
    )
    return {
      ...validated,
      updatedAt: candidate.updatedAt,
      lastOpenedAt: candidate.lastOpenedAt,
    }
  })
  return { rootProjectId, projects, files }
}

/** Gather the chosen project and all descendants, detaching the exported root. */
export function collectProjectTree(
  projects: Project[],
  rootProjectId: string,
): Project[] {
  const root = projects.find((project) => project.id === rootProjectId)
  if (!root) return fail('Choose an existing project to export.')
  const included = new Set([rootProjectId])
  let changed = true
  while (changed) {
    changed = false
    for (const project of projects)
      if (
        project.parentId &&
        included.has(project.parentId) &&
        !included.has(project.id)
      ) {
        included.add(project.id)
        changed = true
      }
  }
  return projects
    .filter((project) => included.has(project.id))
    .map((project) => ({
      ...project,
      parentId:
        project.id === rootProjectId ? null : (project.parentId ?? null),
    }))
}

export function serializeProjectArchive(archive: ProjectArchive): string {
  const normalized = normalize(archive, true)
  const raw = JSON.stringify({
    format: 'CanvasLiveProject',
    version: 1,
    ...normalized,
  })
  if (new TextEncoder().encode(raw).byteLength > PROJECT_ARCHIVE_MAX_BYTES)
    return fail(
      'The .CLP file exceeds 25 MiB. Export smaller subprojects or individual .CLF files.',
    )
  return raw
}

/** Validate first, then allocate fresh IDs so importing never replaces an existing project/file. */
export function parseProjectArchive(
  raw: string,
  idFactory: () => string = () => crypto.randomUUID(),
): ProjectArchive {
  if (
    raw.length > PROJECT_ARCHIVE_MAX_BYTES ||
    new TextEncoder().encode(raw).byteLength > PROJECT_ARCHIVE_MAX_BYTES
  )
    return fail('The .CLP file exceeds 25 MiB.')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail('The .CLP file is not valid JSON.')
  }
  if (
    !record(parsed) ||
    parsed.format !== 'CanvasLiveProject' ||
    parsed.version !== 1
  )
    return fail('Choose a Canvas Live .CLP project file.')
  const archive = normalize(parsed)
  const used = new Set([
    ...archive.projects.map((project) => project.id),
    ...archive.files.map((file) => file.id),
  ])
  const freshId = () => {
    const next = idFactory()
    if (!id(next) || used.has(next))
      return fail('A fresh unique import identifier could not be created.')
    used.add(next)
    return next
  }
  const projectIds = new Map(
    archive.projects.map((project) => [project.id, freshId()]),
  )
  return {
    rootProjectId: projectIds.get(archive.rootProjectId)!,
    projects: archive.projects.map((project) => ({
      ...project,
      id: projectIds.get(project.id)!,
      parentId: project.parentId ? projectIds.get(project.parentId)! : null,
    })),
    files: archive.files.map((file) => ({
      ...file,
      id: freshId(),
      projectId: projectIds.get(file.projectId)!,
    })),
  }
}

export function projectExportFilename(name: string): string {
  const safe = projectName(name)
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/[. ]+$/u, '')
    .replace(/(?:\.clp)+$/iu, '')
  const base = safe || 'Project'
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(base) ? `Project-${base}` : base}${PROJECT_FILE_EXTENSION}`
}
