import type { CSSProperties } from 'react'

export const PRESENTATION_ICONS = [
  'canvas',
  'folder',
  'briefcase',
  'compass',
  'star',
  'heart',
  'book',
  'leaf',
  'globe',
  'lightning',
] as const
export type PresentationIconName = (typeof PRESENTATION_ICONS)[number]
export type ItemPresentation = {
  icon: PresentationIconName
  color: string | null
  fill: string | null
  borderColor: string | null
  description: string
}
export const DEFAULT_ITEM_PRESENTATION: ItemPresentation = {
  icon: 'canvas',
  color: null,
  fill: null,
  borderColor: null,
  description: '',
}
export function presentationColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value)
    ? value.toUpperCase()
    : null
}
export function presentationIcon(
  value: unknown,
  fallback: PresentationIconName = 'canvas',
): PresentationIconName {
  return PRESENTATION_ICONS.includes(value as PresentationIconName)
    ? (value as PresentationIconName)
    : fallback
}
export function normalizeItemPresentation(
  value: unknown,
  fallbackIcon: PresentationIconName = 'canvas',
): ItemPresentation {
  const item =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  return {
    icon: presentationIcon(item.icon, fallbackIcon),
    color: presentationColor(item.color),
    fill: presentationColor(item.fill),
    borderColor: presentationColor(item.borderColor),
    description:
      typeof item.description === 'string'
        ? item.description.replace(/\r\n?/gu, '\n').slice(0, 600)
        : '',
  }
}
export function itemPresentationStyle(value: unknown): CSSProperties {
  const item = normalizeItemPresentation(value)
  return {
    '--item-color': item.color ?? 'var(--accent)',
    '--item-fill': item.fill ?? 'var(--panel)',
    '--item-border': item.borderColor ?? 'var(--line)',
  } as CSSProperties
}
