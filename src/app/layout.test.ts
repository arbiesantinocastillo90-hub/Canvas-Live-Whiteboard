import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  loadLayout,
  parseLayout,
  persistLayout,
} from './layout'

describe('independent workspace layout', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })
  it('remembers bounded widths and panel visibility in its own storage key', () => {
    localStorage.setItem('canvas-live.workspace.v1', 'existing projects')
    const layout = {
      ...DEFAULT_LAYOUT,
      sidebarOpen: false,
      filesOpen: false,
      sidebarWidth: 300,
      filesWidth: 250,
      rightWidth: 380,
      rightPanel: 'properties' as const,
    }
    expect(persistLayout(layout)).toBe(true)
    expect(loadLayout()).toEqual(layout)
    expect(localStorage.getItem('canvas-live.workspace.v1')).toBe(
      'existing projects',
    )
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).not.toBeNull()
  })
  it('recovers each invalid field while clamping oversized panels', () => {
    expect(
      parseLayout(
        JSON.stringify({
          sidebarOpen: 'false',
          sidebarWidth: 900,
          filesOpen: false,
          filesWidth: -90,
          rightPanel: 'unknown',
          rightWidth: 'wide',
        }),
      ),
    ).toEqual({
      ...DEFAULT_LAYOUT,
      sidebarWidth: 360,
      filesOpen: false,
      filesWidth: 160,
    })
    expect(parseLayout('{')).toEqual(DEFAULT_LAYOUT)
    expect(parseLayout('[]')).toEqual(DEFAULT_LAYOUT)
  })
  it('keeps a usable default when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Unavailable')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Unavailable')
    })
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT)
    expect(persistLayout(DEFAULT_LAYOUT)).toBe(false)
  })
})
