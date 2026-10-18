import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOME_VIEW,
  DEFAULT_WORKSPACE_VIEW,
  normalizeHomeView,
  normalizeWorkspaceLibraryView,
} from './homeView'

describe('library view state', () => {
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
