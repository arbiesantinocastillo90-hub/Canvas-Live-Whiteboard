import type { ReactNode } from 'react'
type IconName =
  | 'canvas'
  | 'work'
  | 'folder'
  | 'options'
  | 'arrow'
  | 'plus'
  | 'search'
  | 'clock'
  | 'device'
  | 'edit'
  | 'close'
  | 'files'
  | 'import'
  | 'export'
  | 'save'
const paths: Record<IconName, ReactNode> = {
  canvas: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M4 10h16M10 10v10" />
    </>
  ),
  work: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="M9 6V4h6v2M3 11h18M10 11v3h4v-3" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" />,
  options: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="15" cy="17" r="3" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  device: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </>
  ),
  edit: <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  files: (
    <>
      <path d="M8 3h9l4 4v14H8Z M17 3v5h4 M4 7H3v14h2" />
      <path d="M11 12h7M11 16h5" />
    </>
  ),
  import: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
    </>
  ),
  export: (
    <>
      <path d="M12 16V3m-4 4 4-4 4 4M4 16v5h16v-5" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h13l4 4v14H4Z M8 3v6h8V3M8 21v-8h9v8" />
    </>
  ),
}
export default function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
