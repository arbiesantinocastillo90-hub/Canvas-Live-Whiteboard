import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LAYOUT,
  boundedChromeSize,
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
  it('persists independent chrome visibility and dimensions without changing old layout defaults', () => {
    expect(parseLayout(JSON.stringify({ filesWidth: 300 }))).toEqual({
      ...DEFAULT_LAYOUT,
      filesWidth: 300,
    })
    const layout = {
      ...DEFAULT_LAYOUT,
      autoHideTabs: true,
      autoHideStatus: true,
      ribbonWidth: 60,
      controlsWidth: 56,
      tabBarHeight: 54,
      statusBarHeight: 32,
    }
    expect(persistLayout(layout)).toBe(true)
    expect(loadLayout()).toEqual(layout)
  })
  it('normalizes imported chrome sizes and rejects truthy auto-hide strings', () => {
    expect(
      parseLayout(
        JSON.stringify({
          autoHideTabs: 'true',
          autoHideStatus: 1,
          ribbonWidth: 900,
          controlsWidth: -100,
          tabBarHeight: 55.7,
          statusBarHeight: 'tall',
        }),
      ),
    ).toEqual({
      ...DEFAULT_LAYOUT,
      ribbonWidth: 76,
      controlsWidth: 34,
      tabBarHeight: 56,
    })
    expect(boundedChromeSize(Number.NaN, 'ribbonWidth')).toBe(44)
    expect(boundedChromeSize(Number.POSITIVE_INFINITY, 'controlsWidth')).toBe(
      42,
    )
    expect(boundedChromeSize(-20, 'statusBarHeight')).toBe(22)
    expect(boundedChromeSize(999, 'tabBarHeight')).toBe(68)
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
  it('migrates old panel widths into an unobstructed workspace without rewriting old data', () => {
    const legacy = JSON.stringify({
      sidebarWidth: 280,
      filesWidth: 320,
      rightWidth: 350,
      filesOpen: true,
      rightPanel: 'ai',
    })
    localStorage.setItem('canvas-live.layout.v1', legacy)
    expect(loadLayout()).toEqual({
      ...DEFAULT_LAYOUT,
      sidebarWidth: 280,
      filesWidth: 320,
      rightWidth: 350,
    })
    expect(localStorage.getItem('canvas-live.layout.v1')).toBe(legacy)
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()
  })
  it('persists pins and active tabs while rejecting invalid pin and tab values', () => {
    const layout = {
      ...DEFAULT_LAYOUT,
      leftPanel: 'projects' as const,
      leftPinned: true,
      rightPinned: true,
      rightPanel: 'tools' as const,
    }
    persistLayout(layout)
    expect(loadLayout()).toEqual(layout)
    expect(
      parseLayout(
        JSON.stringify({
          leftPinned: 'true',
          rightPinned: 1,
          leftPanel: 'unknown',
        }),
      ),
    ).toEqual(DEFAULT_LAYOUT)
  })
  it('migrates old layouts safely and remembers arrangement, workspaces and auto-hide settings', () => {
    const legacy = JSON.stringify({ filesWidth: 310, leftPinned: true })
    expect(parseLayout(legacy)).toEqual({
      ...DEFAULT_LAYOUT,
      filesWidth: 310,
      leftPinned: true,
    })
    const customized = {
      ...DEFAULT_LAYOUT,
      panelsSwapped: true,
      autoHidePanels: false,
      autoHideDelay: 640,
      leftPanel: 'workspaces' as const,
    }
    expect(persistLayout(customized)).toBe(true)
    expect(loadLayout()).toEqual(customized)
    expect(
      parseLayout(
        JSON.stringify({
          panelsSwapped: 'true',
          autoHidePanels: 'false',
          autoHideDelay: 'slow',
        }),
      ),
    ).toEqual(DEFAULT_LAYOUT)
    expect(
      parseLayout(JSON.stringify({ autoHideDelay: 9000 })).autoHideDelay,
    ).toBe(2000)
    expect(
      parseLayout(JSON.stringify({ autoHideDelay: -30 })).autoHideDelay,
    ).toBe(0)
  })
})
