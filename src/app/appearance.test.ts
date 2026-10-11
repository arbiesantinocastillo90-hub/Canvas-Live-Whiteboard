import { describe, expect, it } from 'vitest'
import { resolveAppearanceVariables } from './appearance'
import { DEFAULT_PREFERENCES } from './workspace'

function luminance(hex: string) {
  const values = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('shared appearance palette', () => {
  it('preserves the familiar default light and dark palettes', () => {
    expect(
      resolveAppearanceVariables(DEFAULT_PREFERENCES, 'light'),
    ).toMatchObject({
      '--bg': '#f6f5f8',
      '--panel': '#ffffff',
      '--rail': '#fcfbfe',
      '--well': '#f4f3f7',
      '--ink': '#282632',
      '--muted': '#6f6b7c',
      '--line': '#e6e3eb',
      '--grid': '#d8d4e1',
    })
    expect(
      resolveAppearanceVariables(DEFAULT_PREFERENCES, 'dark'),
    ).toMatchObject({
      '--bg': '#18191f',
      '--panel': '#22232b',
      '--rail': '#1e1f26',
      '--well': '#2a2b35',
      '--ink': '#eeeef5',
      '--muted': '#aaa8b9',
      '--line': '#383845',
      '--grid': '#41404e',
    })
  })

  it.each(['light', 'dark'] as const)(
    'keeps automatic text readable across the contrast range in %s mode',
    (mode) => {
      for (const value of [0, 25, 50, 75, 100]) {
        const colors = resolveAppearanceVariables(
          { ...DEFAULT_PREFERENCES, contrast: value },
          mode,
        )
        for (const text of ['--ink', '--muted', '--accent-text']) {
          for (const background of ['--bg', '--panel', '--rail', '--well']) {
            expect(
              contrast(colors[text], colors[background]),
            ).toBeGreaterThanOrEqual(4.5)
          }
        }
      }
    },
  )

  it('changes interface contrast while honoring explicit border and grid colors', () => {
    const soft = resolveAppearanceVariables(
      { ...DEFAULT_PREFERENCES, contrast: 0 },
      'light',
    )
    const strong = resolveAppearanceVariables(
      { ...DEFAULT_PREFERENCES, contrast: 100 },
      'light',
    )
    expect(contrast(strong['--line'], strong['--panel'])).toBeGreaterThan(
      contrast(soft['--line'], soft['--panel']),
    )
    const custom = resolveAppearanceVariables(
      {
        ...DEFAULT_PREFERENCES,
        contrast: 100,
        borderColor: '#718293',
        gridColor: '#435465',
      },
      'light',
    )
    expect(custom['--line']).toBe('#718293')
    expect(custom['--grid']).toBe('#435465')
  })

  it('applies custom colors exactly and restores automatic colors when cleared', () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      backgroundColor: '#101820',
      surfaceColor: '#152230',
      textColor: '#d0e0f0',
      borderColor: '#345678',
      gridColor: '#234567',
    }
    expect(resolveAppearanceVariables(preferences, 'light')).toMatchObject({
      '--bg': '#101820',
      '--panel': '#152230',
      '--ink': '#d0e0f0',
      '--line': '#345678',
      '--grid': '#234567',
    })
    expect(
      resolveAppearanceVariables(
        { ...preferences, borderColor: null },
        'light',
      )['--line'],
    ).not.toBe('#345678')
  })

  it('chooses readable automatic text for custom light and dark panels', () => {
    for (const color of ['#ffffff', '#101010', '#658493']) {
      const colors = resolveAppearanceVariables(
        { ...DEFAULT_PREFERENCES, surfaceColor: color },
        'dark',
      )
      expect(
        contrast(colors['--ink'], colors['--panel']),
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrast(colors['--muted'], colors['--panel']),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('interface motion preferences', () => {
  it('adjusts speed independently of the motion style', () => {
    const slow = resolveAppearanceVariables(
      { ...DEFAULT_PREFERENCES, motionSpeed: 'slow' },
      'light',
    )
    const fast = resolveAppearanceVariables(
      { ...DEFAULT_PREFERENCES, motionSpeed: 'fast', motionStyle: 'smooth' },
      'light',
    )
    expect(parseInt(slow['--motion-duration'])).toBeGreaterThan(
      parseInt(fast['--motion-duration']),
    )
    expect(parseInt(fast['--motion-distance'])).toBeGreaterThan(
      parseInt(slow['--motion-distance']),
    )
  })

  it('removes motion when reduced motion is selected without discarding its settings', () => {
    const colors = resolveAppearanceVariables(
      {
        ...DEFAULT_PREFERENCES,
        reduceMotion: true,
        motionStyle: 'smooth',
        motionSpeed: 'slow',
      },
      'light',
    )
    expect(colors).toMatchObject({
      '--motion-duration': '0ms',
      '--motion-fast': '0ms',
      '--motion-distance': '0px',
      '--motion-lift': '0px',
    })
  })
})
