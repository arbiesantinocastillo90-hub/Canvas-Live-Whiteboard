import type { Preferences } from './workspace'

export type AppearanceMode = 'light' | 'dark'

const palettes = {
  light: {
    background: '#f6f5f8',
    surface: '#ffffff',
    rail: '#fcfbfe',
    well: '#f4f3f7',
    text: '#282632',
    muted: '#6f6b7c',
    border: '#e6e3eb',
    grid: '#d8d4e1',
  },
  dark: {
    background: '#18191f',
    surface: '#22232b',
    rail: '#1e1f26',
    well: '#2a2b35',
    text: '#eeeef5',
    muted: '#aaa8b9',
    border: '#383845',
    grid: '#41404e',
  },
}

function channels(color: string) {
  return [1, 3, 5].map((offset) =>
    parseInt(color.slice(offset, offset + 2), 16),
  )
}

function mix(color: string, target: string, amount: number) {
  if (amount === 0) return color
  const targetChannels = channels(target)
  return `#${channels(color)
    .map((value, index) =>
      Math.round(value + (targetChannels[index] - value) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function luminance(color: string) {
  const rgb = channels(color).map((value) => {
    const channel = value / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

function contrastRatio(color: string, background: string) {
  const first = luminance(color)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function readableInk(background: string) {
  return contrastRatio('#111111', background) >
    contrastRatio('#ffffff', background)
    ? '#111111'
    : '#ffffff'
}

function readableMuted(color: string, backgrounds: string[], ink: string) {
  const readable = (candidate: string) =>
    backgrounds.every(
      (background) => contrastRatio(candidate, background) >= 4.5,
    )
  if (readable(color)) return color
  for (let amount = 0.05; amount <= 1; amount += 0.05) {
    const candidate = mix(color, ink, amount)
    if (readable(candidate)) return candidate
  }
  return readableInk(backgrounds[0])
}

/** Resolve the shared interface palette without changing canvas object colors. */
export function resolveAppearanceVariables(
  preferences: Preferences,
  mode: AppearanceMode,
): Record<string, string> {
  const palette = palettes[mode]
  const background = preferences.backgroundColor ?? palette.background
  const surface = preferences.surfaceColor ?? palette.surface
  const customSurface = preferences.surfaceColor !== null
  const ink =
    preferences.textColor ??
    (customSurface ? readableInk(surface) : palette.text)
  const contrast = (preferences.contrast - 50) / 50
  const stronger = Math.max(contrast, 0)
  const softer = Math.max(-contrast, 0)
  const baseRail =
    preferences.backgroundColor !== null || customSurface
      ? mix(background, surface, 0.3)
      : palette.rail
  const baseWell = customSurface ? mix(surface, ink, 0.045) : palette.well
  const baseMuted = customSurface ? mix(ink, surface, 0.38) : palette.muted
  const baseBorder = customSurface ? mix(surface, ink, 0.12) : palette.border
  const baseGrid = customSurface ? mix(surface, ink, 0.2) : palette.grid
  const muted = mix(
    baseMuted,
    stronger ? ink : surface,
    stronger * 0.25 + softer * 0.08,
  )
  const baseDuration = { slow: 280, normal: 180, fast: 110 }[
    preferences.motionSpeed
  ]
  const duration = Math.round((baseDuration * 100) / preferences.motionScale)
  const smooth = preferences.motionStyle === 'smooth'
  const flow = preferences.motionEffect === 'flow'
  const pop = preferences.motionEffect === 'pop'
  const easing = {
    standard: smooth
      ? 'cubic-bezier(0.22, 1, 0.36, 1)'
      : 'cubic-bezier(0.2, 0, 0.2, 1)',
    linear: 'linear',
    'ease-in': 'ease-in',
    'ease-out': 'ease-out',
    'ease-in-out': 'ease-in-out',
  }[preferences.motionEasing]
  const rail = mix(baseRail, ink, stronger * 0.025)
  const well = mix(baseWell, ink, stronger * 0.04)
  const textBackgrounds =
    preferences.backgroundColor === null && !customSurface
      ? [surface, background, rail, well]
      : [surface]

  return {
    '--bg': background,
    '--panel': surface,
    '--rail': rail,
    '--well': well,
    '--ink': ink,
    '--muted':
      preferences.textColor === null
        ? readableMuted(muted, textBackgrounds, ink)
        : muted,
    '--line':
      preferences.borderColor ??
      mix(
        baseBorder,
        stronger ? ink : surface,
        stronger * 0.22 + softer * 0.35,
      ),
    '--grid':
      preferences.gridColor ??
      mix(baseGrid, stronger ? ink : surface, stronger * 0.15 + softer * 0.2),
    '--accent': preferences.accent,
    '--accent-ink': readableInk(preferences.accent),
    '--accent-text':
      preferences.textColor === null
        ? readableMuted(
            mix(ink, preferences.accent, 0.25),
            textBackgrounds,
            ink,
          )
        : mix(ink, preferences.accent, 0.25),
    '--tint': mix(surface, preferences.accent, 0.1),
    '--motion-duration': preferences.reduceMotion ? '0ms' : `${duration}ms`,
    '--motion-fast': preferences.reduceMotion
      ? '0ms'
      : `${Math.round(duration * 0.65)}ms`,
    '--motion-distance':
      preferences.reduceMotion || !flow ? '0px' : smooth ? '8px' : '3px',
    '--motion-lift':
      preferences.reduceMotion || !flow ? '0px' : smooth ? '-2px' : '-1px',
    '--motion-easing': easing,
    '--motion-enter-scale': !preferences.reduceMotion && pop ? '0.96' : '1',
    '--motion-hover-scale': !preferences.reduceMotion && pop ? '1.04' : '1',
    '--rail-button-bg': preferences.railButtonBackground
      ? 'var(--panel)'
      : 'transparent',
    '--rail-button-line': preferences.railButtonBackground
      ? 'var(--line)'
      : 'transparent',
  }
}
