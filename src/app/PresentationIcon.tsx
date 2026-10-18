import type { CSSProperties } from 'react'
import { presentationIcon, type PresentationIconName } from './itemPresentation'

export type PresentationIconProps = {
  name: PresentationIconName
  size?: number
  strokeWidth?: number
  color?: string | null
  fill?: string | null
  className?: string
}

export function PresentationIcon({
  name,
  size = 24,
  strokeWidth = 1.7,
  color,
  fill,
  className,
}: PresentationIconProps) {
  const icon = presentationIcon(name)
  const paths = {
    canvas: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 9v11" />
      </>
    ),
    folder: (
      <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V4h8v3M3 12a20 20 0 0 0 18 0M10 13v3h4v-3" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z" />
    ),
    heart: (
      <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 1 9 8 15 7-6 12-11 8-15Z" />
    ),
    book: (
      <>
        <path d="M12 5v15M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Z" />
      </>
    ),
    leaf: (
      <>
        <path d="M4 17C0 8 8 2 21 3c0 13-6 21-15 17" />
        <path d="M3 22 16 9" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18M5 6h14M5 18h14" />
      </>
    ),
    lightning: <path d="m13 2-9 12h7l-1 8 10-13h-8Z" />,
  }
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      data-presentation-icon={icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? 'none'}
      stroke={color ?? 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 } as CSSProperties}
    >
      {paths[icon]}
    </svg>
  )
}

export default PresentationIcon
