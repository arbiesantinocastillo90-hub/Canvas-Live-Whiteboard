import {
  useRef,
  type PointerEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import type { EmbedElement } from './lcanvas'
import { validEmbedSource } from './lcanvas'
import type { ElementPatch } from './canvasOperations'
import './embed-object.css'

/** Static previews never load remote content or start a media player. */
export default function EmbedObject({
  element,
  onPatch,
  resolveMedia,
  interactive = true,
  onMove,
  onSelect,
}: {
  element: EmbedElement
  onPatch?: (patch: ElementPatch) => void
  resolveMedia?: (src: string) => string | undefined
  interactive?: boolean
  onMove?: (event: PointerEvent) => void
  onSelect?: () => void
}) {
  const playbackTime = useRef(0)
  const player = useRef<HTMLMediaElement | null>(null)
  const resolved = validEmbedSource(element.src)
    ? element.src.startsWith('media:')
      ? resolveMedia?.(element.src)
      : element.src
    : undefined
  const src =
    resolved &&
    ((/^https:/iu.test(resolved) && validEmbedSource(resolved)) ||
      (element.src.startsWith('media:') &&
        (/^blob:[^\s]+$/u.test(resolved) ||
          /^\/__canvas_live_library\/media\/[a-f\d]{64}$/u.test(resolved))))
      ? resolved
      : undefined
  const height = element.minimized
    ? Math.min(38, element.height)
    : element.height
  const active =
    interactive && !element.paused && !element.minimized && Boolean(src)
  const title =
    element.title || `${element.kind[0].toUpperCase()}${element.kind.slice(1)}`
  const change = (patch: ElementPatch) => {
    if (player.current) playbackTime.current = player.current.currentTime
    onPatch?.(patch)
  }
  const mediaProps = {
    controls: true,
    preload: 'metadata',
    onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => {
      event.currentTarget.currentTime = Math.min(
        playbackTime.current,
        event.currentTarget.duration || playbackTime.current,
      )
    },
    onTimeUpdate: (event: SyntheticEvent<HTMLMediaElement>) => {
      playbackTime.current = event.currentTarget.currentTime
    },
  }
  if (!interactive)
    return (
      <g pointerEvents="none" data-embed-placeholder={element.kind}>
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={height}
          rx="8"
          fill="#181C28"
          stroke={element.color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={element.x + 12}
          y={element.y + 28}
          fontSize="16"
          fill={element.color}
        >
          {title.slice(0, 80)}
        </text>
      </g>
    )
  return (
    <foreignObject
      x={element.x}
      y={element.y}
      width={element.width}
      height={height}
    >
      <div
        className="canvas-embed"
        style={{ borderColor: element.color }}
        onPointerDown={(event) => {
          event.stopPropagation()
          onSelect?.()
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div
          className="canvas-embed-bar"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button, a')) return
            event.stopPropagation()
            onSelect?.()
            onMove?.(event)
          }}
        >
          <button
            type="button"
            aria-label={element.paused ? `Resume ${title}` : `Pause ${title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => change({ paused: !element.paused })}
            disabled={!onPatch}
          >
            {element.paused ? '▶' : 'Ⅱ'}
          </button>
          <button
            type="button"
            aria-label={
              element.minimized ? `Expand ${title}` : `Minimize ${title}`
            }
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => change({ minimized: !element.minimized })}
            disabled={!onPatch}
          >
            {element.minimized ? '□' : '−'}
          </button>
          <span title={title}>{title}</span>
          {src && (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${title} separately`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              Open separately
            </a>
          )}
        </div>
        {!element.minimized && (
          <div className="canvas-embed-content">
            {!active ? (
              <div className="canvas-embed-placeholder">
                {element.paused
                  ? 'Paused — resume to load content'
                  : !src
                    ? 'Media is unavailable in this library.'
                    : 'Preview'}
              </div>
            ) : element.kind === 'image' || element.kind === 'gif' ? (
              <img src={src} alt={title} draggable={false} />
            ) : element.kind === 'video' ? (
              <video
                key={src}
                ref={player as RefObject<HTMLVideoElement>}
                src={src}
                {...mediaProps}
              />
            ) : element.kind === 'audio' ? (
              <audio
                key={src}
                ref={player as RefObject<HTMLAudioElement>}
                src={src}
                {...mediaProps}
              />
            ) : (
              <iframe
                key={src}
                src={src}
                title={title}
                sandbox="allow-scripts allow-forms allow-popups allow-presentation"
                referrerPolicy="no-referrer"
                loading="lazy"
                allow="fullscreen"
              />
            )}
          </div>
        )}
      </div>
    </foreignObject>
  )
}
