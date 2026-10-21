import { useEffect, useState, type CSSProperties } from 'react'
import { AiMiniMascot } from './CanvasAiMini'
import { aiMiniClientBrand } from './aiMiniClientBrand'
import {
  visibleCanvasAiTargets,
  type CanvasAiPresenceEvent,
} from './canvasAiPresenceState'
import type { CanvasDocument, CanvasViewport, ElementBounds } from './lcanvas'
import type { AiMiniSettings } from './useAiMiniSettings'
import { useWorkspaceBackground } from './workspaceBackground'
import './canvas-ai-presence.css'

export type CanvasAiPresenceProps = {
  event: CanvasAiPresenceEvent | null
  document: CanvasDocument
  viewport: CanvasViewport
  width: number
  height: number
  settings: AiMiniSettings
  client: string | null
  reduceMotion: boolean
  onOpenAI: () => void
}

function screenBounds(bounds: ElementBounds, viewport: CanvasViewport) {
  return {
    x: bounds.x * viewport.zoom + viewport.x,
    y: bounds.y * viewport.zoom + viewport.y,
    width: bounds.width * viewport.zoom,
    height: bounds.height * viewport.zoom,
  }
}
function within(bounds: ElementBounds, width: number, height: number) {
  return (
    bounds.x + bounds.width >= 0 &&
    bounds.y + bounds.height >= 0 &&
    bounds.x <= width &&
    bounds.y <= height
  )
}
function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(Math.max(low, high), value))
}

export default function CanvasAiPresence({
  event,
  document,
  viewport,
  width,
  height,
  settings,
  client,
  reduceMotion,
  onOpenAI,
}: CanvasAiPresenceProps) {
  const [expired, setExpired] = useState<string | null>(null)
  const [systemReduceMotion, setSystemReduceMotion] = useState(false)
  const identity = event ? `${event.scope}:${event.id}:${event.at}` : ''
  const [observed, setObserved] = useState(() => ({
    identity,
    now: Date.now(),
  }))
  const at = event?.at ?? 0
  const duration = settings.presenceDuration * 1000
  const image = useWorkspaceBackground(settings.imageAssetId)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const changed = () => setSystemReduceMotion(media.matches)
    changed()
    media.addEventListener?.('change', changed)
    return () => media.removeEventListener?.('change', changed)
  }, [])
  useEffect(() => {
    const start = setTimeout(
      () => setObserved({ identity, now: Date.now() }),
      0,
    )
    const timer = setTimeout(
      () => setExpired(identity),
      Math.max(1, at + duration - Date.now()),
    )
    return () => {
      clearTimeout(start)
      clearTimeout(timer)
    }
  }, [identity, at, duration])
  if (
    !event ||
    observed.identity !== identity ||
    !settings.showCanvasActivity ||
    expired === identity ||
    !Number.isFinite(at) ||
    at > observed.now + 1000 ||
    at + duration <= observed.now ||
    width <= 0 ||
    height <= 0
  )
    return null
  const targets = visibleCanvasAiTargets(event, document).map((target) => ({
    ...target,
    screen: screenBounds(target.bounds, viewport),
  }))
  const target =
    targets.filter((item) => within(item.screen, width, height)).at(-1) ??
    targets.at(-1)
  if (!target) return null
  const motionPaused = reduceMotion || systemReduceMotion
  const offscreen = !within(target.screen, width, height)
  const brand = aiMiniClientBrand(client)
  const size = Math.min(64, Math.max(40, settings.size))
  const centerX = target.screen.x + target.screen.width / 2
  const centerY = target.screen.y + target.screen.height / 2
  const x = clamp(
    offscreen ? centerX : target.screen.x + target.screen.width + 8,
    8,
    width - Math.min(180, width) - 8,
  )
  const y = clamp(
    offscreen ? centerY : target.screen.y - size + 12,
    8,
    height - size - 38,
  )
  const direction = offscreen
    ? centerX < 0
      ? '←'
      : centerX > width
        ? '→'
        : centerY < 0
          ? '↑'
          : '↓'
    : ''
  const action =
    event.kind === 'read'
      ? event.phase === 'working'
        ? 'Reading'
        : 'Read'
      : event.phase === 'working'
        ? 'Edit queued'
        : target.removed
          ? 'Removed'
          : 'Edited'
  const label = `${action} ${offscreen ? 'offscreen' : 'here'}${direction ? ` ${direction}` : ''}`
  const animation = motionPaused
    ? 'none'
    : event.phase === 'working'
      ? settings.workingAnimation
      : settings.idleAnimation
  const presenceColor =
    event.kind === 'read'
      ? settings.presenceReadColor
      : event.phase === 'working'
        ? settings.presenceWorkingColor
        : settings.presenceCompleteColor
  return (
    <div
      className="canvas-ai-presence"
      data-phase={event.phase}
      data-kind={event.kind}
      data-animation={motionPaused ? 'none' : settings.presenceAnimation}
      data-reduce-motion={motionPaused}
      style={
        {
          '--presence-color': presenceColor,
          '--presence-accent': settings.accent,
          '--presence-speed': `${1.4 / settings.speed}s`,
          '--presence-amplitude': `${settings.amplitude}px`,
        } as CSSProperties
      }
    >
      <svg className="canvas-ai-presence-geometry" aria-hidden="true">
        {targets.map((item) => {
          const previous = item.previousBounds
            ? screenBounds(item.previousBounds, viewport)
            : null
          return (
            <g
              key={item.id}
              data-ai-target-id={item.id}
              data-removed={item.removed || undefined}
            >
              {previous && !motionPaused && (
                <line
                  className="canvas-ai-presence-trail"
                  x1={previous.x + previous.width / 2}
                  y1={previous.y + previous.height / 2}
                  x2={item.screen.x + item.screen.width / 2}
                  y2={item.screen.y + item.screen.height / 2}
                />
              )}
              <rect
                className="canvas-ai-presence-ring"
                x={item.screen.x - 5}
                y={item.screen.y - 5}
                width={Math.max(2, item.screen.width) + 10}
                height={Math.max(2, item.screen.height) + 10}
                rx="9"
              />
            </g>
          )
        })}
      </svg>
      <button
        type="button"
        className="canvas-ai-presence-avatar"
        style={
          { left: x, top: y, '--presence-size': `${size}px` } as CSSProperties
        }
        data-offscreen={offscreen}
        aria-label={`${settings.name}: ${label}. Double-click to open Workspace AI`}
        title="Double-click to open Workspace AI. Keyboard: Enter or Space."
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.detail === 0) onOpenAI()
        }}
        onDoubleClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onOpenAI()
        }}
        onKeyDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <span className="canvas-ai-presence-mascot" data-animation={animation}>
          <AiMiniMascot
            settings={settings}
            image={image}
            paused={motionPaused}
          />
        </span>
        <span className="canvas-ai-presence-label">
          <span className="canvas-ai-presence-client">
            {brand.logo && (
              <img src={`/assets/ai-clients/${brand.logo}.svg`} alt="" />
            )}
            <span>{client ? brand.label : 'AI'}</span>
          </span>
          {(settings.presenceLabels || offscreen) && (
            <span role="status">{label}</span>
          )}
        </span>
      </button>
    </div>
  )
}
