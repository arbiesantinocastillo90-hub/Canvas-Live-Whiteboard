import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { McpBridgeState } from './useMcpBridge'
import {
  backgroundAssets,
  imageMime,
  useWorkspaceBackground,
} from './workspaceBackground'
import {
  AI_MINI_ANIMATIONS,
  AI_MINI_MAX_IMAGE_BYTES,
  useAiMiniSettings,
  type AiMiniSettings,
} from './useAiMiniSettings'
import './canvas-ai-mini.css'
import { aiMiniClientBrand } from './aiMiniClientBrand'
import McpActivityLog from './McpActivityLog'
export function AiMiniMascot({
  settings,
  image,
  paused,
}: {
  settings: AiMiniSettings
  image: string | null
  paused: boolean
}) {
  if (settings.preset === 'custom' && image && !paused)
    return (
      <img
        className="ai-mini-custom-image"
        src={image}
        alt=""
        draggable={false}
      />
    )
  return (
    <svg className="ai-mini-mascot" viewBox="0 0 100 100" aria-hidden="true">
      {settings.preset === 'cat' ? (
        <>
          <path
            d="M20 37 19 12 39 25 Q50 21 61 25 L81 12 80 37 Q92 66 74 81 Q50 96 26 81 Q8 66 20 37Z"
            fill={settings.color}
            stroke="currentColor"
            strokeWidth="3"
          />
          <path d="m24 23 2 13 9-7m41-6-2 13-9-7" fill={settings.accent} />
          <path
            d="m15 61 15 2m-15 7 15-3m55-6-15 2m15 7-15-3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <ellipse cx="36" cy="51" rx="4" ry="7" fill="#10141c" />
          <ellipse cx="64" cy="51" rx="4" ry="7" fill="#10141c" />
          <path
            d="m44 63 6 4 6-4m-6 4v7m0 0q-7 5-11-1m11 1q7 5 11-1"
            fill="none"
            stroke={settings.accent}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : settings.preset === 'orb' ? (
        <>
          <circle
            cx="50"
            cy="50"
            r="36"
            fill={settings.color}
            stroke="currentColor"
            strokeWidth="3"
          />
          <ellipse
            cx="42"
            cy="29"
            rx="15"
            ry="7"
            fill="white"
            opacity="0.25"
            transform="rotate(-22 42 29)"
          />
          <ellipse cx="37" cy="48" rx="4" ry="6" fill="#10141c" />
          <ellipse cx="63" cy="48" rx="4" ry="6" fill="#10141c" />
          <path
            d="M40 65q10 10 20 0"
            fill="none"
            stroke={settings.accent}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="26" cy="60" r="5" fill={settings.accent} opacity="0.6" />
          <circle cx="74" cy="60" r="5" fill={settings.accent} opacity="0.6" />
        </>
      ) : (
        <>
          <path d="M50 24V13" stroke={settings.accent} strokeWidth="4" />
          <circle cx="50" cy="11" r="5" fill={settings.accent} />
          <rect
            x="16"
            y="26"
            width="68"
            height="53"
            rx="18"
            fill={settings.color}
            stroke="currentColor"
            strokeWidth="3"
          />
          <rect x="26" y="37" width="48" height="27" rx="9" fill="#10141c" />
          <path
            d="M10 43v17m80-17v17M34 83v7m32-7v7"
            stroke={settings.accent}
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="38" cy="49" r="5" fill={settings.accent} />
          <circle cx="62" cy="49" r="5" fill={settings.accent} />
          <path
            d="M43 70h14"
            stroke={settings.accent}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}
type Drag = {
  pointerId: number
  startX: number
  startY: number
  originalX: number
  originalY: number
  x: number
  y: number
  moved: boolean
  bounds: DOMRect
  target: HTMLButtonElement
}
export type CanvasAiMiniProps = {
  scopeId: string
  state: McpBridgeState
  onOpenAI: () => void
  onStopSharing: () => void
  reduceMotion: boolean
  settingsOpen?: boolean
  onSettingsOpenChange?: (open: boolean) => void
  onSettingsChange?: (scopeId: string, settings: AiMiniSettings) => void
}
export default function CanvasAiMini(props: CanvasAiMiniProps) {
  return <ScopedCanvasAiMini key={props.scopeId} {...props} />
}
function ScopedCanvasAiMini({
  scopeId,
  state,
  onOpenAI,
  reduceMotion,
  settingsOpen,
  onSettingsOpenChange,
  onSettingsChange,
}: CanvasAiMiniProps) {
  const preferences = useAiMiniSettings(scopeId)
  const settings = preferences.settings
  const image = useWorkspaceBackground(settings.imageAssetId)
  const [expanded, setExpanded] = useState(false)
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false)
  const [previewWorking, setPreviewWorking] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [motionPreference, setMotionPreference] = useState(false)
  const [activityAt, setActivityAt] = useState<number | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  )
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)
  const suppressDoubleClick = useRef(false)
  const mini = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const uploadScope = useRef(scopeId)
  const titleId = useId()
  const openSettings = settingsOpen ?? localSettingsOpen
  useEffect(() => {
    if (!preferences.loading) onSettingsChange?.(scopeId, settings)
  }, [preferences.loading, scopeId, settings, onSettingsChange])
  function configure(open: boolean) {
    setLocalSettingsOpen(open)
    onSettingsOpenChange?.(open)
  }
  useEffect(() => {
    uploadScope.current = scopeId
    return () => {
      uploadScope.current = ''
    }
  }, [scopeId])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const changed = () => setMotionPreference(media.matches)
    changed()
    media.addEventListener?.('change', changed)
    return () => media.removeEventListener?.('change', changed)
  }, [])
  useEffect(() => {
    const at = state.activity?.at
    const valid = !(
      !at ||
      !Number.isFinite(at) ||
      at > Date.now() + 1000 ||
      Date.now() - at > 5000
    )
    const start = setTimeout(() => setActivityAt(valid ? at! : null), 0)
    const timeout = setTimeout(
      () => setActivityAt(null),
      Math.max(1, (at ?? 0) + 5000 - Date.now()),
    )
    return () => {
      clearTimeout(start)
      clearTimeout(timeout)
    }
  }, [state.activity?.at])
  useEffect(() => {
    if (!openSettings) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('button,input,select')?.focus()
    return () => previous?.focus()
  }, [openSettings])
  const visible =
    !preferences.loading &&
    (state.status === 'sharing' || state.status === 'connecting')
  const working =
    state.status === 'sharing' &&
    activityAt === state.activity?.at &&
    activityAt !== null
  const motionDisabled = reduceMotion || motionPreference
  const animation = motionDisabled
    ? 'none'
    : working
      ? settings.workingAnimation
      : settings.idleAnimation
  const brand = aiMiniClientBrand(state.mcpClient)
  const status =
    state.status === 'connecting'
      ? 'Connecting to companion…'
      : !state.mcpClient
        ? 'Waiting for an AI client'
        : working
          ? state.activity?.kind === 'edit'
            ? state.activity.phase === 'complete'
              ? 'Updated the shared canvas'
              : 'Requested a canvas change'
            : 'Read the shared canvas'
          : 'Connected to the shared canvas'
  const size = settings.minimized ? 30 : settings.size
  const x = position?.x ?? settings.x
  const y = position?.y ?? settings.y
  const style = {
    '--ai-mini-color': settings.color,
    '--ai-mini-accent': settings.accent,
    '--ai-mini-size': `${size}px`,
    '--ai-mini-amplitude': `${settings.amplitude}px`,
    '--ai-mini-angle': `${settings.amplitude}deg`,
    '--ai-mini-duration': `${3 / settings.speed}s`,
    left: `clamp(${size / 2 + 8}px, ${x * 100}%, calc(100% - ${size / 2 + 8}px))`,
    top: `clamp(${size / 2 + 8}px, ${y * 100}%, calc(100% - ${size / 2 + 8}px))`,
  } as CSSProperties
  function down(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const bounds = mini.current?.parentElement?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return
    suppressClick.current = false
    event.currentTarget.focus()
    event.preventDefault()
    event.stopPropagation()
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originalX: settings.x,
      originalY: settings.y,
      x: settings.x,
      y: settings.y,
      moved: false,
      bounds,
      target: event.currentTarget,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    const dx = event.clientX - current.startX,
      dy = event.clientY - current.startY
    current.moved ||= Math.hypot(dx, dy) > 5
    if (!current.moved) return
    event.stopPropagation()
    const insetX = Math.min(0.5, (size / 2 + 8) / current.bounds.width)
    const insetY = Math.min(0.5, (size / 2 + 8) / current.bounds.height)
    current.x = Math.max(
      insetX,
      Math.min(1 - insetX, current.originalX + dx / current.bounds.width),
    )
    current.y = Math.max(
      insetY,
      Math.min(1 - insetY, current.originalY + dy / current.bounds.height),
    )
    setPosition({ x: current.x, y: current.y })
  }
  function finish(event?: PointerEvent<HTMLButtonElement>, cancel = false) {
    const current = drag.current
    if (!current || (event && event.pointerId !== current.pointerId)) return
    drag.current = null
    if (current.moved) {
      suppressClick.current = true
      suppressDoubleClick.current = true
      if (!cancel) preferences.update({ x: current.x, y: current.y })
    }
    setPosition(null)
    if (current.target.hasPointerCapture?.(current.pointerId))
      current.target.releasePointerCapture(current.pointerId)
  }
  useEffect(() => {
    function cancel() {
      const current = drag.current
      if (!current) return
      drag.current = null
      suppressClick.current = current.moved
      suppressDoubleClick.current = current.moved
      setPosition(null)
      if (current.target.hasPointerCapture?.(current.pointerId))
        current.target.releasePointerCapture(current.pointerId)
    }
    if (!visible) cancel()
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('blur', cancel)
      cancel()
    }
  }, [visible])
  function keys(event: KeyboardEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault()
      onOpenAI()
      return
    }
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      finish(undefined, true)
      setExpanded(false)
      return
    }
    if (
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 0.1 : 0.02
    preferences.update({
      x:
        settings.x +
        (event.key === 'ArrowRight'
          ? step
          : event.key === 'ArrowLeft'
            ? -step
            : 0),
      y:
        settings.y +
        (event.key === 'ArrowDown'
          ? step
          : event.key === 'ArrowUp'
            ? -step
            : 0),
    })
  }
  function dialogKeys(event: KeyboardEvent) {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      configure(false)
    }
    if (event.key !== 'Tab') return
    const controls = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled)',
    )
    if (!controls?.length) return
    const first = controls[0],
      last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return
    const scope = scopeId
    setImageError(null)
    if (
      !file.size ||
      file.size > AI_MINI_MAX_IMAGE_BYTES ||
      !['image/png', 'image/gif', 'image/webp'].includes(file.type)
    ) {
      setImageError('Choose a PNG, GIF, or WebP image up to 2 MiB.')
      return
    }
    setUploading(true)
    try {
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () =>
          reader.result instanceof ArrayBuffer
            ? resolve(reader.result)
            : reject(new Error('The mini image could not be read.'))
        reader.onerror = () =>
          reject(new Error('The mini image could not be read.'))
        reader.readAsArrayBuffer(file)
      })
      if (imageMime(new Uint8Array(bytes)) !== file.type)
        throw new Error('The mini image content does not match its file type.')
      const id = await backgroundAssets.save(file)
      if (uploadScope.current === scope)
        preferences.update({
          imageAssetId: id,
          imageMime: file.type as AiMiniSettings['imageMime'],
          preset: 'custom',
        })
    } catch (reason) {
      if (uploadScope.current === scope)
        setImageError(
          reason instanceof Error
            ? reason.message
            : 'The mini image could not be saved.',
        )
    } finally {
      if (uploadScope.current === scope) setUploading(false)
    }
  }
  return (
    <>
      {visible && (
        <div
          ref={mini}
          className="canvas-ai-mini"
          style={style}
          data-minimized={settings.minimized}
          data-reduced-motion={motionDisabled}
          data-bubble-below={y < 0.3}
          data-align={x < 0.5 ? 'left' : 'right'}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <button
            className="ai-mini-avatar"
            aria-label={
              settings.minimized
                ? `Restore ${settings.name}`
                : `${settings.name}: ${status}`
            }
            aria-expanded={settings.minimized ? undefined : expanded}
            title="Click for recent AI activity. Double-click or Alt+Enter for Workspace AI. Drag to move."
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={(event) => finish(event)}
            onPointerCancel={(event) => finish(event, true)}
            onLostPointerCapture={(event) => finish(event, true)}
            onKeyDown={keys}
            onClick={(event) => {
              event.stopPropagation()
              if (suppressClick.current) {
                suppressClick.current = false
                return
              }
              if (event.detail > 1) return
              suppressDoubleClick.current = false
              if (settings.minimized) preferences.update({ minimized: false })
              setExpanded((value) => !value)
            }}
            onDoubleClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (suppressClick.current || suppressDoubleClick.current) return
              setExpanded(true)
              if (settings.minimized) preferences.update({ minimized: false })
              onOpenAI()
            }}
          >
            <span className="ai-mini-motion" data-animation={animation}>
              <AiMiniMascot
                settings={settings}
                image={image}
                paused={motionDisabled}
              />
            </span>
            <span
              className="ai-mini-client-mark"
              data-client={brand.id}
              aria-label={`Reported AI client: ${brand.label}`}
              title={`Reported client: ${state.mcpClient ?? 'none yet'}`}
            >
              {brand.logo ? (
                <img
                  src={`/assets/ai-clients/${brand.logo}.svg`}
                  alt=""
                  draggable={false}
                />
              ) : (
                brand.mark
              )}
            </span>
          </button>
          {!settings.minimized &&
            (expanded || (settings.bubbles && working)) && (
              <div
                className="ai-mini-bubble"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <div className="ai-mini-bubble-heading">
                  <strong>{settings.name}</strong>
                  <button
                    aria-label="Minimize AI mini"
                    onClick={() => {
                      preferences.update({ minimized: true })
                      setExpanded(false)
                    }}
                  >
                    −
                  </button>
                </div>
                <p className="ai-mini-status" role="status">
                  {status}
                </p>
                <p className="ai-mini-reported-client">
                  {state.mcpClient
                    ? `Reported client: ${state.mcpClient.slice(0, 80)}`
                    : 'No AI client has connected yet.'}
                </p>
                {state.lastOperation && !state.activities?.length && (
                  <p className="ai-mini-operation">
                    {state.lastOperation.slice(0, 500)}
                  </p>
                )}
                {preferences.error && (
                  <p className="ai-mini-error" role="alert">
                    {preferences.error}
                  </p>
                )}
                <McpActivityLog entries={state.activities} compact />
                <p className="ai-mini-reported-client">
                  Double-click the mini for Workspace AI.
                </p>
              </div>
            )}
        </div>
      )}
      {openSettings && (
        <div
          className="modal-backdrop ai-mini-backdrop"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={dialogKeys}
        >
          <div
            ref={dialog}
            className="project-dialog ai-mini-settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="ai-mini-settings-heading">
              <h2 id={titleId}>Customize AI mini</h2>
              <button
                className="icon-button"
                aria-label="Close mini settings"
                onClick={() => configure(false)}
              >
                ×
              </button>
            </div>
            <p>
              Your mini follows this workspace. Its status reflects reported MCP
              activity.
            </p>
            <div
              className="ai-mini-settings-preview"
              style={
                {
                  ...style,
                  '--ai-mini-size': `${settings.size}px`,
                } as CSSProperties
              }
            >
              <span
                className="ai-mini-motion"
                data-animation={
                  motionDisabled
                    ? 'none'
                    : previewWorking
                      ? settings.workingAnimation
                      : settings.idleAnimation
                }
                role="img"
                aria-label={`${settings.name} appearance preview`}
              >
                <AiMiniMascot
                  settings={settings}
                  image={image}
                  paused={motionDisabled}
                />
              </span>
              <div>
                <strong>Preview only</strong>
                <p>
                  The floating mini appears when you connect or share a canvas.
                </p>
                <label>
                  Preview state
                  <select
                    value={previewWorking ? 'working' : 'idle'}
                    onChange={(event) =>
                      setPreviewWorking(event.target.value === 'working')
                    }
                  >
                    <option value="idle">Idle</option>
                    <option value="working">Working</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="ai-mini-settings-grid">
              <label>
                Name
                <input
                  value={settings.name}
                  maxLength={40}
                  onChange={(event) =>
                    preferences.update({ name: event.target.value })
                  }
                />
              </label>
              <label>
                Character
                <select
                  value={settings.preset}
                  onChange={(event) =>
                    preferences.update({
                      preset: event.target.value as AiMiniSettings['preset'],
                    })
                  }
                >
                  <option value="robot">Little robot</option>
                  <option value="cat">Curious cat</option>
                  <option value="orb">Happy orb</option>
                  <option value="custom" disabled={!settings.imageAssetId}>
                    My image
                  </option>
                </select>
              </label>
              <label>
                Body color
                <input
                  type="color"
                  value={settings.color}
                  onChange={(event) =>
                    preferences.update({ color: event.target.value })
                  }
                />
              </label>
              <label>
                Accent color
                <input
                  type="color"
                  value={settings.accent}
                  onChange={(event) =>
                    preferences.update({ accent: event.target.value })
                  }
                />
              </label>
              <label>
                Size <output>{settings.size} px</output>
                <input
                  type="range"
                  min="40"
                  max="120"
                  value={settings.size}
                  onChange={(event) =>
                    preferences.update({ size: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Animation speed <output>{settings.speed}×</output>
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.25"
                  value={settings.speed}
                  onChange={(event) =>
                    preferences.update({ speed: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Idle animation
                <select
                  value={settings.idleAnimation}
                  onChange={(event) =>
                    preferences.update({
                      idleAnimation: event.target
                        .value as AiMiniSettings['idleAnimation'],
                    })
                  }
                >
                  {AI_MINI_ANIMATIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Activity animation
                <select
                  value={settings.workingAnimation}
                  onChange={(event) =>
                    preferences.update({
                      workingAnimation: event.target
                        .value as AiMiniSettings['workingAnimation'],
                    })
                  }
                >
                  {AI_MINI_ANIMATIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Motion amount <output>{settings.amplitude} px</output>
                <input
                  type="range"
                  min="0"
                  max="24"
                  value={settings.amplitude}
                  onChange={(event) =>
                    preferences.update({
                      amplitude: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="ai-mini-checkbox">
                <input
                  type="checkbox"
                  checked={settings.bubbles}
                  onChange={(event) =>
                    preferences.update({ bubbles: event.target.checked })
                  }
                />
                Show activity bubbles
              </label>
            </div>
            <fieldset className="ai-mini-presence-settings">
              <legend>Canvas indicators</legend>
              <p>
                Mark the locations of observed AI reads, requested edits and
                completed changes.
              </p>
              <div className="ai-mini-settings-grid">
                <label className="ai-mini-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.showCanvasActivity}
                    onChange={(event) =>
                      preferences.update({
                        showCanvasActivity: event.target.checked,
                      })
                    }
                  />
                  Show activity on canvas
                </label>
                <label className="ai-mini-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.presenceLabels}
                    onChange={(event) =>
                      preferences.update({
                        presenceLabels: event.target.checked,
                      })
                    }
                  />
                  Show indicator labels
                </label>
                <label>
                  Read indicator color
                  <input
                    type="color"
                    value={settings.presenceReadColor}
                    onChange={(event) =>
                      preferences.update({
                        presenceReadColor: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Requested edit color
                  <input
                    type="color"
                    value={settings.presenceWorkingColor}
                    onChange={(event) =>
                      preferences.update({
                        presenceWorkingColor: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Completed edit color
                  <input
                    type="color"
                    value={settings.presenceCompleteColor}
                    onChange={(event) =>
                      preferences.update({
                        presenceCompleteColor: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Indicator animation
                  <select
                    aria-label="Indicator animation"
                    value={settings.presenceAnimation}
                    onChange={(event) =>
                      preferences.update({
                        presenceAnimation: event.target
                          .value as AiMiniSettings['presenceAnimation'],
                      })
                    }
                  >
                    <option value="pulse">Pulse</option>
                    <option value="ripple">Ripple</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label>
                  Indicator duration{' '}
                  <output>{settings.presenceDuration} seconds</output>
                  <input
                    type="range"
                    aria-label="Indicator duration"
                    min="2"
                    max="15"
                    step="1"
                    value={settings.presenceDuration}
                    onChange={(event) =>
                      preferences.update({
                        presenceDuration: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            </fieldset>
            <label className="ai-mini-image-input">
              Custom image (PNG, GIF, WebP · up to 2 MiB)
              <input
                type="file"
                accept="image/png,image/gif,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const selected = event.target.files?.[0]
                  event.target.value = ''
                  void upload(selected)
                }}
              />
            </label>
            {settings.imageAssetId && (
              <button
                className="button secondary"
                onClick={() =>
                  preferences.update({
                    imageAssetId: null,
                    imageMime: null,
                    preset: 'robot',
                  })
                }
              >
                Remove custom image
              </button>
            )}
            {motionDisabled && (
              <p className="quiet-note">
                Reduced motion is enabled. Custom images use a static robot
                while motion is paused.
              </p>
            )}
            {(preferences.error || imageError) && (
              <p className="ai-mini-error" role="alert">
                {imageError ?? preferences.error}
              </p>
            )}
            <p className="quiet-note">
              Move the mini by dragging it or using its arrow keys. Hold Shift
              for larger keyboard steps.
            </p>
            <div className="ai-mini-settings-actions">
              <button className="button secondary" onClick={preferences.reset}>
                Reset mini
              </button>
              <button
                className="button primary"
                onClick={() => configure(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
