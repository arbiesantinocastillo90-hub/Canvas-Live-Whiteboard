import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalLibraryClient } from './localLibrary'
import {
  aiMiniLibraryKey,
  aiMiniStorageKey,
  DEFAULT_AI_MINI_SETTINGS,
  normalizeAiMiniSettings,
  useAiMiniSettings,
} from './useAiMiniSettings'

beforeEach(() => localStorage.clear())

function client(saved: unknown = null) {
  const values = new Map<string, unknown>()
  const result = {
    available: true,
    read: vi.fn(async (key: string) => ({
      revision: 1,
      value: values.get(key) ?? saved,
    })),
    transform: vi.fn(
      async (key: string, update: (value: unknown) => unknown) => {
        const value = update(values.get(key) ?? saved)
        values.set(key, value)
        return { revision: 2, value }
      },
    ),
  }
  return { ...result, api: result as unknown as LocalLibraryClient, values }
}

describe('AI mini settings', () => {
  it('normalizes hostile input without executable CSS, remote image URLs or unbounded geometry', () => {
    expect(normalizeAiMiniSettings(null)).toEqual(DEFAULT_AI_MINI_SETTINGS)
    expect(normalizeAiMiniSettings({ version: 2, name: 'Future' })).toEqual(
      DEFAULT_AI_MINI_SETTINGS,
    )
    const normalized = normalizeAiMiniSettings({
      version: 1,
      name: ' <b>literal</b> ',
      color: 'url(https://bad.test)',
      accent: '#aabbcc',
      size: Infinity,
      speed: 99,
      amplitude: -10,
      x: -1,
      y: 8,
      preset: '<script>',
      idleAnimation: 'external()',
      workingAnimation: 'bounce',
      imageAssetId: 'https://bad.test/x.gif',
      imageMime: 'image/svg+xml',
    })
    expect(normalized).toMatchObject({
      name: '<b>literal</b>',
      color: DEFAULT_AI_MINI_SETTINGS.color,
      accent: '#aabbcc',
      size: 64,
      speed: 3,
      amplitude: 0,
      x: 0,
      y: 1,
      preset: 'robot',
      idleAnimation: 'float',
      workingAnimation: 'bounce',
      imageAssetId: null,
      imageMime: null,
    })
    expect(
      normalizeAiMiniSettings({
        version: 1,
        name: 'bad\nname',
        size: -1,
        speed: 0,
      }),
    ).toMatchObject({ name: 'Canvas buddy', size: 40, speed: 0.25 })
  })

  it('uses distinct safe storage keys for workspaces', () => {
    expect(aiMiniStorageKey('a')).not.toBe(aiMiniStorageKey('b'))
    expect(aiMiniLibraryKey('a')).toMatch(/^settings:[A-Za-z\d_-]+$/u)
    expect(aiMiniLibraryKey('a')).not.toBe(aiMiniLibraryKey('b'))
    expect(() => aiMiniStorageKey('../bad\n')).toThrow()
  })

  it('keeps existing version-one characters while adding bounded indicator defaults', () => {
    const legacy = normalizeAiMiniSettings({
      version: 1,
      name: 'Miku',
      preset: 'custom',
      imageAssetId: 'a'.repeat(64),
      imageMime: 'image/gif',
      x: 0.2,
    })
    expect(legacy).toMatchObject({
      name: 'Miku',
      preset: 'custom',
      imageAssetId: 'a'.repeat(64),
      imageMime: 'image/gif',
      x: 0.2,
      showCanvasActivity: true,
      presenceAnimation: 'pulse',
      presenceDuration: 5,
      presenceLabels: true,
    })
    expect(
      normalizeAiMiniSettings({
        ...legacy,
        showCanvasActivity: 'true',
        presenceReadColor: 'url(https://bad.test)',
        presenceWorkingColor: '#abcdef',
        presenceCompleteColor: '#123',
        presenceDuration: 900,
        presenceAnimation: 'external()',
        presenceLabels: false,
      }),
    ).toMatchObject({
      showCanvasActivity: true,
      presenceReadColor: DEFAULT_AI_MINI_SETTINGS.presenceReadColor,
      presenceWorkingColor: '#abcdef',
      presenceCompleteColor: DEFAULT_AI_MINI_SETTINGS.presenceCompleteColor,
      presenceDuration: 15,
      presenceAnimation: 'pulse',
      presenceLabels: false,
    })
    expect(
      normalizeAiMiniSettings({ ...legacy, presenceDuration: NaN })
        .presenceDuration,
    ).toBe(5)
    expect(
      normalizeAiMiniSettings({ ...legacy, presenceDuration: -1 })
        .presenceDuration,
    ).toBe(2)
  })

  it('saves and reloads browser-only settings', async () => {
    const fake = client()
    Object.defineProperty(fake.api, 'available', { value: false })
    const first = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    act(() =>
      first.result.current.update({ name: 'Orbit', preset: 'orb', x: 0.2 }),
    )
    first.unmount()
    const second = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    await waitFor(() =>
      expect(second.result.current.settings.name).toBe('Orbit'),
    )
    expect(second.result.current.settings).toMatchObject({
      preset: 'orb',
      x: 0.2,
    })
    expect(fake.transform).not.toHaveBeenCalled()
  })

  it('uses portable settings before the browser cache and merges independent changes', async () => {
    localStorage.setItem(
      aiMiniStorageKey('work-a'),
      JSON.stringify({ ...DEFAULT_AI_MINI_SETTINGS, name: 'Browser' }),
    )
    const fake = client({
      ...DEFAULT_AI_MINI_SETTINGS,
      name: 'Portable',
      color: '#112233',
    })
    const { result } = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    await waitFor(() => expect(result.current.settings.name).toBe('Portable'))
    fake.values.set(aiMiniLibraryKey('work-a'), {
      ...DEFAULT_AI_MINI_SETTINGS,
      name: 'Other window',
      color: '#445566',
    })
    act(() => result.current.update({ size: 88 }))
    await waitFor(() => expect(fake.transform).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(result.current.settings.name).toBe('Other window'),
    )
    expect(fake.values.get(aiMiniLibraryKey('work-a'))).toMatchObject({
      name: 'Other window',
      color: '#445566',
      size: 88,
    })
  })

  it('syncs Options and the hidden mini in the same page without extra portable writes or crossing workspaces', async () => {
    const fake = client()
    const options = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    const mini = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    const other = renderHook(() =>
      useAiMiniSettings('work-b', { client: fake.api }),
    )
    await waitFor(() =>
      expect(
        [options, mini, other].every((view) => !view.result.current.loading),
      ).toBe(true),
    )
    act(() =>
      options.result.current.update({
        name: 'Shared buddy',
        presenceReadColor: '#112233',
        presenceAnimation: 'ripple',
      }),
    )
    expect(mini.result.current.settings).toMatchObject({
      name: 'Shared buddy',
      presenceReadColor: '#112233',
      presenceAnimation: 'ripple',
    })
    expect(other.result.current.settings).toEqual(DEFAULT_AI_MINI_SETTINGS)
    await waitFor(() => expect(fake.transform).toHaveBeenCalledTimes(1))
    act(() => mini.result.current.update({ x: 0.3, presenceLabels: false }))
    await waitFor(() => expect(fake.transform).toHaveBeenCalledTimes(2))
    expect(options.result.current.settings).toMatchObject({
      name: 'Shared buddy',
      x: 0.3,
      presenceLabels: false,
    })
    expect(fake.values.get(aiMiniLibraryKey('work-a'))).toMatchObject({
      name: 'Shared buddy',
      x: 0.3,
      presenceReadColor: '#112233',
      presenceAnimation: 'ripple',
      presenceLabels: false,
    })
    expect(fake.values.has(aiMiniLibraryKey('work-b'))).toBe(false)
  })

  it('shares independent native merge results with other same-page minis', async () => {
    const fake = client({ ...DEFAULT_AI_MINI_SETTINGS, name: 'Portable' })
    const options = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    const mini = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    await waitFor(() =>
      expect(mini.result.current.settings.name).toBe('Portable'),
    )
    fake.values.set(aiMiniLibraryKey('work-a'), {
      ...DEFAULT_AI_MINI_SETTINGS,
      name: 'Changed in another window',
      presenceReadColor: '#aabbcc',
    })
    act(() => options.result.current.update({ presenceAnimation: 'ripple' }))
    await waitFor(() =>
      expect(mini.result.current.settings.name).toBe(
        'Changed in another window',
      ),
    )
    expect(options.result.current.settings).toEqual(
      mini.result.current.settings,
    )
    expect(mini.result.current.settings).toMatchObject({
      presenceReadColor: '#aabbcc',
      presenceAnimation: 'ripple',
    })
    expect(fake.transform).toHaveBeenCalledOnce()
  })

  it('ignores malformed local notifications and protects a peer edit from a late initial load', async () => {
    const fake = client()
    let resolve!: (value: { revision: number; value: unknown }) => void
    const options = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    await waitFor(() => expect(options.result.current.loading).toBe(false))
    fake.read.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const mini = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    act(() =>
      options.result.current.update({
        name: 'New appearance',
        presenceDuration: 9,
      }),
    )
    await act(async () =>
      resolve({
        revision: 1,
        value: { ...DEFAULT_AI_MINI_SETTINGS, name: 'Stale initial read' },
      }),
    )
    expect(mini.result.current.settings).toMatchObject({
      name: 'New appearance',
      presenceDuration: 9,
    })
    act(() => {
      for (const settings of [null, 'invalid', { version: 99, name: 'Future' }])
        window.dispatchEvent(
          new CustomEvent('canvas-live:ai-mini-settings', {
            detail: { scopeId: 'work-a', settings },
          }),
        )
    })
    expect(mini.result.current.settings.name).toBe('New appearance')
    expect(fake.transform).toHaveBeenCalledOnce()
  })

  it('retains edits and an actionable error when a portable write fails', async () => {
    const fake = client()
    fake.transform.mockRejectedValueOnce(new Error('USB disconnected'))
    const { result } = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.update({ name: 'Still here' }))
    await waitFor(() =>
      expect(result.current.error).toContain('USB disconnected'),
    )
    expect(result.current.settings.name).toBe('Still here')
    expect(
      JSON.parse(localStorage.getItem(aiMiniStorageKey('work-a'))!).name,
    ).toBe('Still here')
  })

  it('isolates workspace changes and ignores late loads from the previous workspace', async () => {
    const fake = client()
    let resolveA!: (value: { revision: number; value: unknown }) => void
    fake.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve
        }),
    )
    fake.values.set(aiMiniLibraryKey('work-b'), {
      ...DEFAULT_AI_MINI_SETTINGS,
      name: 'Bee',
    })
    const { result, rerender } = renderHook(
      ({ scope }) => useAiMiniSettings(scope, { client: fake.api }),
      { initialProps: { scope: 'work-a' } },
    )
    rerender({ scope: 'work-b' })
    await waitFor(() => expect(result.current.settings.name).toBe('Bee'))
    await act(async () =>
      resolveA({
        revision: 1,
        value: { ...DEFAULT_AI_MINI_SETTINGS, name: 'Late A' },
      }),
    )
    expect(result.current.settings.name).toBe('Bee')
    act(() => result.current.update({ color: '#abcdef' }))
    await waitFor(() =>
      expect(fake.values.get(aiMiniLibraryKey('work-b'))).toMatchObject({
        name: 'Bee',
        color: '#abcdef',
      }),
    )
    expect(fake.values.has(aiMiniLibraryKey('work-a'))).toBe(false)
  })

  it('recovers cached settings from unsupported native data without silently claiming success', async () => {
    localStorage.setItem(
      aiMiniStorageKey('work-a'),
      JSON.stringify({ ...DEFAULT_AI_MINI_SETTINGS, name: 'Recovered' }),
    )
    const fake = client({ version: 99, name: 'Unknown schema' })
    const { result } = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    await waitFor(() => expect(result.current.settings.name).toBe('Recovered'))
    expect(result.current.error).toContain('unsupported')
  })

  it('does not let a late load overwrite an edit and bounds corrupt cached JSON', async () => {
    const fake = client()
    let resolve!: (value: { revision: number; value: unknown }) => void
    fake.read.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { result } = renderHook(() =>
      useAiMiniSettings('work-a', { client: fake.api }),
    )
    act(() => result.current.update({ name: 'My edit' }))
    await act(async () =>
      resolve({
        revision: 1,
        value: { ...DEFAULT_AI_MINI_SETTINGS, name: 'Old' },
      }),
    )
    expect(result.current.settings.name).toBe('My edit')
    localStorage.setItem(aiMiniStorageKey('corrupt'), 'x'.repeat(4097))
    const corrupt = client()
    Object.defineProperty(corrupt.api, 'available', { value: false })
    const bad = renderHook(() =>
      useAiMiniSettings('corrupt', { client: corrupt.api }),
    )
    await waitFor(() => expect(bad.result.current.loading).toBe(false))
    expect(bad.result.current.settings).toEqual(DEFAULT_AI_MINI_SETTINGS)
    expect(bad.result.current.error).toContain('size limit')
  })
})
