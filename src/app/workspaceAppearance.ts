import type { CSSProperties } from 'react'
import {
  presentationColor,
  presentationIcon,
  type PresentationIconName,
} from './itemPresentation'

export const WORKSPACE_TITLE_FONTS = [
  'system',
  'Segoe UI',
  'Arial',
  'Verdana',
  'Georgia',
  'Times New Roman',
  'Consolas',
] as const
export type WorkspaceTitleFont = (typeof WORKSPACE_TITLE_FONTS)[number]
export type WorkspaceAppearance = {
  description: string
  tagline: string
  icon: PresentationIconName
  iconSize: number
  iconStrokeWidth: number
  iconColor: string | null
  iconFill: string | null
  titleFont: WorkspaceTitleFont
  titleSize: number
  titleWeight: number
  titleColor: string | null
  titleOutlineColor: string | null
  titleOutlineWidth: number
  align: 'left' | 'center'
  spacing: number
  backgroundColor: string | null
  backgroundAssetId: string | null
  backgroundFit: 'cover' | 'contain' | 'tile'
  backgroundPosition: 'center' | 'top' | 'bottom' | 'left' | 'right'
  backgroundOpacity: number
  gradientEnabled: boolean
  gradientFrom: string
  gradientTo: string
  gradientAngle: number
  gradientOpacity: number
}
export const DEFAULT_WORKSPACE_APPEARANCE: WorkspaceAppearance = {
  description: '',
  tagline: '',
  icon: 'briefcase',
  iconSize: 28,
  iconStrokeWidth: 1.7,
  iconColor: null,
  iconFill: null,
  titleFont: 'system',
  titleSize: 24,
  titleWeight: 600,
  titleColor: null,
  titleOutlineColor: null,
  titleOutlineWidth: 0,
  align: 'left',
  spacing: 12,
  backgroundColor: null,
  backgroundAssetId: null,
  backgroundFit: 'cover',
  backgroundPosition: 'center',
  backgroundOpacity: 45,
  gradientEnabled: false,
  gradientFrom: '#101827',
  gradientTo: '#244B66',
  gradientAngle: 135,
  gradientOpacity: 65,
}
export function appearanceNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}
export function normalizeWorkspaceAppearance(
  value: unknown,
): WorkspaceAppearance {
  const item =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const defaults = DEFAULT_WORKSPACE_APPEARANCE
  const text = (key: string, length: number) =>
    typeof item[key] === 'string'
      ? item[key].replace(/\r\n?/gu, '\n').slice(0, length)
      : ''
  const number = (key: keyof WorkspaceAppearance, min: number, max: number) =>
    appearanceNumber(item[key], defaults[key] as number, min, max)
  return {
    description: text('description', 1200),
    tagline: text('tagline', 160),
    icon: presentationIcon(item.icon, 'briefcase'),
    iconSize: number('iconSize', 16, 112),
    iconStrokeWidth: number('iconStrokeWidth', 0.5, 5),
    iconColor: presentationColor(item.iconColor),
    iconFill: presentationColor(item.iconFill),
    titleFont: WORKSPACE_TITLE_FONTS.includes(
      item.titleFont as WorkspaceTitleFont,
    )
      ? (item.titleFont as WorkspaceTitleFont)
      : defaults.titleFont,
    titleSize: number('titleSize', 14, 80),
    titleWeight: Math.round(number('titleWeight', 100, 900) / 100) * 100,
    titleColor: presentationColor(item.titleColor),
    titleOutlineColor: presentationColor(item.titleOutlineColor),
    titleOutlineWidth: number('titleOutlineWidth', 0, 3),
    align: item.align === 'center' ? 'center' : 'left',
    spacing: number('spacing', 4, 40),
    backgroundColor: presentationColor(item.backgroundColor),
    backgroundAssetId:
      typeof item.backgroundAssetId === 'string' &&
      /^[a-f\d]{64}$/u.test(item.backgroundAssetId)
        ? item.backgroundAssetId
        : null,
    backgroundFit:
      item.backgroundFit === 'contain' || item.backgroundFit === 'tile'
        ? item.backgroundFit
        : 'cover',
    backgroundPosition: ['top', 'bottom', 'left', 'right'].includes(
      item.backgroundPosition as string,
    )
      ? (item.backgroundPosition as WorkspaceAppearance['backgroundPosition'])
      : 'center',
    backgroundOpacity: number('backgroundOpacity', 0, 100),
    gradientEnabled: item.gradientEnabled === true,
    gradientFrom: presentationColor(item.gradientFrom) ?? defaults.gradientFrom,
    gradientTo: presentationColor(item.gradientTo) ?? defaults.gradientTo,
    gradientAngle: number('gradientAngle', 0, 360),
    gradientOpacity: number('gradientOpacity', 0, 100),
  }
}
export function workspaceTitleStyle(value: unknown): CSSProperties {
  const item = normalizeWorkspaceAppearance(value)
  const fontFamily =
    item.titleFont === 'system'
      ? 'system-ui, sans-serif'
      : item.titleFont === 'Consolas'
        ? 'Consolas, monospace'
        : item.titleFont === 'Georgia' || item.titleFont === 'Times New Roman'
          ? `"${item.titleFont}", serif`
          : `"${item.titleFont}", sans-serif`
  return {
    fontFamily,
    fontSize: item.titleSize,
    fontWeight: item.titleWeight,
    color: item.titleColor ?? 'var(--ink)',
    WebkitTextStroke:
      item.titleOutlineWidth && item.titleOutlineColor
        ? `${item.titleOutlineWidth}px ${item.titleOutlineColor}`
        : undefined,
    paintOrder: 'stroke fill',
  }
}
export function workspaceBackgroundStyle(
  value: unknown,
  imageURL?: string | null,
): CSSProperties {
  const item = normalizeWorkspaceAppearance(value)
  const image =
    typeof imageURL === 'string' &&
    (/^\/__canvas_live_library\/assets\/[a-f\d]{64}$/u.test(imageURL) ||
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z\d+/]+=*$/u.test(
        imageURL,
      ) ||
      /^blob:https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[a-z\d-]+$/iu.test(
        imageURL,
      ))
      ? `url("${imageURL}")`
      : 'none'
  return {
    '--home-background-color': item.backgroundColor ?? 'var(--bg)',
    '--home-background-image': image,
    '--home-background-size':
      item.backgroundFit === 'tile' ? 'auto' : item.backgroundFit,
    '--home-background-position': item.backgroundPosition,
    '--home-background-repeat':
      item.backgroundFit === 'tile' ? 'repeat' : 'no-repeat',
    '--home-background-opacity': item.backgroundOpacity / 100,
    '--home-gradient': item.gradientEnabled
      ? `linear-gradient(${item.gradientAngle}deg, ${item.gradientFrom}, ${item.gradientTo})`
      : 'none',
    '--home-gradient-opacity': item.gradientOpacity / 100,
  } as CSSProperties
}
