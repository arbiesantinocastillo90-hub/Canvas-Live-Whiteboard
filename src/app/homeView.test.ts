import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOME_VIEW,
  DEFAULT_WORKSPACE_VIEW,
  normalizeHomeView,
  normalizeWorkspaceLibraryView,
} from './homeView'

describe('library view state', () => {
  it('shows only projects in legacy hierarchies and persists an explicit canvas toggle', () => {
    expect(
      normalizeHomeView({ display: 'hierarchy' }).hierarchyShowCanvases,
    ).toBe(false)
    expect(
      normalizeHomeView({ hierarchyShowCanvases: 'true' })
        .hierarchyShowCanvases,
    ).toBe(false)
    const next = normalizeHomeView({
      ...DEFAULT_HOME_VIEW,
      hierarchyShowCanvases: true,
    })
    expect(
      normalizeHomeView(JSON.parse(JSON.stringify(next))).hierarchyShowCanvases,
    ).toBe(true)
  })
  it('normalizes missing or unsupported perspectives, orders and identities', () => {
    expect(normalizeHomeView(null)).toEqual(DEFAULT_HOME_VIEW)
    expect(normalizeWorkspaceLibraryView(undefined)).toEqual(
      DEFAULT_WORKSPACE_VIEW,
    )
    expect(
      normalizeHomeView({
        perspective: 'canvas',
        sort: 'created',
        openedProjectId: '__proto__',
        closedProjectIds: ['good', 'good', 'constructor', '', 'other'],
      }),
    ).toMatchObject({
      perspective: 'canvas',
      sort: 'created',
      openedProjectId: null,
      closedProjectIds: ['good', 'other'],
    })
    expect(
      normalizeWorkspaceLibraryView({
        perspective: 'recent',
        sort: 'modified',
      }),
    ).toEqual({ perspective: 'recent', sort: 'modified' })
  })
})
