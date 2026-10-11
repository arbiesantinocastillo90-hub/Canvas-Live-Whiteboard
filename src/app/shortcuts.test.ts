import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SHORTCUT_STORAGE_KEY,
  loadShortcutOverrides,
  persistShortcutOverrides,
  shortcutActions,
  shortcutFor,
  shortcutFromEvent,
  shortcutProblem,
  validShortcut,
} from './shortcuts'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('workspace shortcut bindings', () => {
  it('accepts canonical bindings and rejects malformed modifier chains', () => {
    for (const binding of [
      '',
      'R',
      'Mod+Alt+Shift+R',
      'Shift+1',
      'Mod+=',
      'Alt+ArrowRight',
    ])
      expect(validShortcut(binding)).toBe(true)
    for (const binding of [
      'Ctrl+R',
      'Mod+Mod+R',
      'Shift+Mod+R',
      'Mod++',
      'r',
      'Mod+F5',
      null,
    ])
      expect(validShortcut(binding)).toBe(false)
  })

  it('normalizes physical letter, digit, plus and modifier keys consistently', () => {
    expect(
      shortcutFromEvent(
        new KeyboardEvent('keydown', { key: 'я', code: 'KeyR' }),
      ),
    ).toBe('R')
    expect(
      shortcutFromEvent(
        new KeyboardEvent('keydown', {
          key: '!',
          code: 'Digit1',
          shiftKey: true,
        }),
      ),
    ).toBe('Shift+1')
    expect(
      shortcutFromEvent(
        new KeyboardEvent('keydown', {
          key: '+',
          code: 'Equal',
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe('Mod+Shift+=')
    expect(
      shortcutFromEvent(
        new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true }),
      ),
    ).toBe('Mod+Z')
    expect(
      shortcutFromEvent(
        new KeyboardEvent('keydown', {
          key: 'Control',
          code: 'ControlLeft',
          ctrlKey: true,
        }),
      ),
    ).toBeNull()
    expect(
      shortcutFromEvent(
        new KeyboardEvent('keydown', { key: 'Process', code: 'KeyR' }),
      ),
    ).toBeNull()
  })

  it('protects ordinary navigation and browser shortcuts from assignment', () => {
    for (const binding of [
      'Enter',
      'Space',
      'ArrowRight',
      'Mod+R',
      'Mod+Shift+W',
      'Alt+ArrowLeft',
    ])
      expect(shortcutProblem(binding)).toBeTruthy()
    expect(shortcutProblem('Mod+Alt+R')).toBeNull()
  })

  it('persists custom and cleared bindings, with omitted bindings using defaults', () => {
    expect(
      persistShortcutOverrides({ 'canvas.select': 'Alt+V', 'canvas.pan': '' }),
    ).toBe(true)
    const loaded = loadShortcutOverrides()
    expect(loaded).toEqual({ 'canvas.select': 'Alt+V', 'canvas.pan': '' })
    expect(shortcutFor('canvas.select', loaded)).toBe('Alt+V')
    expect(shortcutFor('canvas.pan', loaded)).toBe('')
    expect(shortcutFor('canvas.rectangle', loaded)).toBe('R')
  })

  it('ignores unknown, invalid and duplicate stored overrides', () => {
    localStorage.setItem(
      SHORTCUT_STORAGE_KEY,
      JSON.stringify({
        'app.palette': 'Alt+Shift+Q',
        'app.switcher': 'Alt+Shift+Q',
        'app.options': 'Mod+R',
        'canvas.rectangle': 3,
        unknown: 'Alt+Shift+W',
      }),
    )
    expect(loadShortcutOverrides()).toEqual({ 'app.palette': 'Alt+Shift+Q' })
  })

  it('resolves conflicts introduced when a rejected override restores its default', () => {
    localStorage.setItem(
      SHORTCUT_STORAGE_KEY,
      JSON.stringify({
        'canvas.select': 'H',
        'canvas.pan': 'R',
      }),
    )
    const loaded = loadShortcutOverrides()
    const effective = shortcutActions
      .map(([id]) => shortcutFor(id, loaded))
      .filter(Boolean)
    expect(new Set(effective).size).toBe(effective.length)
    expect(shortcutFor('canvas.rectangle', loaded)).toBe('R')
  })

  it.each(['{', 'null', '[]', '"R"'])(
    'recovers from malformed stored bindings %s',
    (raw) => {
      localStorage.setItem(SHORTCUT_STORAGE_KEY, raw)
      expect(loadShortcutOverrides()).toEqual({})
    },
  )

  it('returns a usable default when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    expect(loadShortcutOverrides()).toEqual({})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    expect(persistShortcutOverrides({ 'canvas.select': 'Alt+V' })).toBe(false)
  })
})
