import { useCallback, useEffect, useRef, useState } from 'react'
import {
  libraryKey,
  localLibrary,
  type LocalLibraryClient,
} from './localLibrary'
import { validCanvasId } from './lcanvas'

export const AI_MINI_MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const AI_MINI_ANIMATIONS = [
  'float',
  'bounce',
  'wiggle',
  'spin',
  'none',
] as const
export type AiMiniAnimation = (typeof AI_MINI_ANIMATIONS)[number]
export type AiMiniSettings = {
  version: 1
  name: string
  preset: 'robot' | 'cat' | 'orb' | 'custom'
  color: string
  accent: string
  size: number
  bubbles: boolean
  idleAnimation: AiMiniAnimation
  workingAnimation: AiMiniAnimation
  speed: number
  amplitude: number
  imageAssetId: string | null
  imageMime: 'image/png' | 'image/gif' | 'image/webp' | null
  x: number
  y: number
  minimized: boolean
  showCanvasActivity: boolean
  presenceReadColor: string
  presenceWorkingColor: string
  presenceCompleteColor: string
  presenceAnimation: 'pulse' | 'ripple' | 'none'
  presenceDuration: number
  presenceLabels: boolean
}
export const DEFAULT_AI_MINI_SETTINGS: Readonly<AiMiniSettings> = {
  version: 1,
  name: 'Canvas buddy',
  preset: 'robot',
  color: '#7C5CFC',
  accent: '#8FF0D0',
  size: 64,
  bubbles: true,
  idleAnimation: 'float',
  workingAnimation: 'wiggle',
  speed: 1,
  amplitude: 7,
  imageAssetId: null,
  imageMime: null,
  x: 0.85,
  y: 0.76,
  minimized: false,
  showCanvasActivity: true,
  presenceReadColor: '#68B8FF',
  presenceWorkingColor: '#F6BE4F',
  presenceCompleteColor: '#8FF0D0',
  presenceAnimation: 'pulse',
  presenceDuration: 5,
  presenceLabels: true,
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function bounded(value: unknown, low: number, high: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(low, Math.min(high, value))
    : fallback
}
function animation(value: unknown, fallback: AiMiniAnimation): AiMiniAnimation {
  return AI_MINI_ANIMATIONS.includes(value as AiMiniAnimation)
    ? (value as AiMiniAnimation)
    : fallback
}
export function normalizeAiMiniSettings(value: unknown): AiMiniSettings {
  const item = record(value) && value.version === 1 ? value : {}
  const defaults = DEFAULT_AI_MINI_SETTINGS
  const color = (input: unknown, fallback: string) =>
    typeof input === 'string' && /^#[a-f\d]{6}$/iu.test(input)
      ? input
      : fallback
  return {
    version: 1,
    name:
      typeof item.name === 'string' &&
      item.name.trim() &&
      item.name.length <= 40 &&
      !Array.from(item.name).some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })
        ? item.name.trim()
        : defaults.name,
    preset: ['robot', 'cat', 'orb', 'custom'].includes(item.preset as string)
      ? (item.preset as AiMiniSettings['preset'])
      : defaults.preset,
    color: color(item.color, defaults.color),
    accent: color(item.accent, defaults.accent),
    size: Math.round(bounded(item.size, 40, 120, defaults.size)),
    bubbles:
      typeof item.bubbles === 'boolean' ? item.bubbles : defaults.bubbles,
    idleAnimation: animation(item.idleAnimation, defaults.idleAnimation),
    workingAnimation: animation(
      item.workingAnimation,
      defaults.workingAnimation,
    ),
    speed: bounded(item.speed, 0.25, 3, defaults.speed),
    amplitude: bounded(item.amplitude, 0, 24, defaults.amplitude),
    imageAssetId:
      typeof item.imageAssetId === 'string' &&
      /^[a-f\d]{64}$/u.test(item.imageAssetId)
        ? item.imageAssetId
        : null,
    imageMime: ['image/png', 'image/gif', 'image/webp'].includes(
      item.imageMime as string,
    )
      ? (item.imageMime as AiMiniSettings['imageMime'])
      : null,
    x: bounded(item.x, 0, 1, defaults.x),
    y: bounded(item.y, 0, 1, defaults.y),
    minimized:
      typeof item.minimized === 'boolean' ? item.minimized : defaults.minimized,
    showCanvasActivity:
      typeof item.showCanvasActivity === 'boolean'
        ? item.showCanvasActivity
        : defaults.showCanvasActivity,
    presenceReadColor: color(
      item.presenceReadColor,
      defaults.presenceReadColor,
    ),
    presenceWorkingColor: color(
      item.presenceWorkingColor,
      defaults.presenceWorkingColor,
    ),
    presenceCompleteColor: color(
      item.presenceCompleteColor,
      defaults.presenceCompleteColor,
    ),
    presenceAnimation: ['pulse', 'ripple', 'none'].includes(
      item.presenceAnimation as string,
    )
      ? (item.presenceAnimation as AiMiniSettings['presenceAnimation'])
      : defaults.presenceAnimation,
    presenceDuration: bounded(
      item.presenceDuration,
      2,
      15,
      defaults.presenceDuration,
    ),
    presenceLabels:
      typeof item.presenceLabels === 'boolean'
        ? item.presenceLabels
        : defaults.presenceLabels,
  }
}
export function aiMiniStorageKey(scopeId: string) {
  if (!validCanvasId(scopeId))
    throw new Error('The mini workspace identifier is invalid.')
  return `canvas-live.ai-mini.${encodeURIComponent(scopeId)}`
}
export function aiMiniLibraryKey(scopeId: string) {
  aiMiniStorageKey(scopeId)
  return libraryKey('settings', `ai-mini-${scopeId}`)
}
function browserSettings(scopeId: string, storage: Storage | undefined) {
  const raw = storage?.getItem(aiMiniStorageKey(scopeId))
  if (!raw) return normalizeAiMiniSettings(null)
  if (raw.length > 4096)
    throw new Error('The saved mini settings exceed their size limit.')
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.version !== 1)
    throw new Error('The saved mini settings are unsupported.')
  return normalizeAiMiniSettings(value)
}
type Snapshot = {
  scopeId: string
  settings: AiMiniSettings
  error: string | null
  loading: boolean
}
export function useAiMiniSettings(
  scopeId: string,
  options: { client?: LocalLibraryClient; storage?: Storage | null } = {},
) {
  const client = options.client ?? localLibrary
  let storage: Storage | undefined
  try {
    storage =
      options.storage === null
        ? undefined
        : (options.storage ?? globalThis.localStorage)
  } catch {
    /* Session settings still work. */
  }
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    scopeId,
    settings: normalizeAiMiniSettings(null),
    error: null,
    loading: true,
  }))
  const current =
    snapshot.scopeId === scopeId
      ? snapshot
      : {
          scopeId,
          settings: normalizeAiMiniSettings(null),
          error: null,
          loading: true,
        }
  const active = useRef(scopeId)
  const change = useRef(0)
  const latest = useRef(current.settings)
  const sender = useRef({})
  useEffect(() => {
    active.current = scopeId
    latest.current = current.settings
  })
  useEffect(() => {
    let cancelled = false
    async function load(refresh = true) {
      const startedAt = change.current
      let settings = normalizeAiMiniSettings(null)
      let error: string | null = null
      try {
        const saved = client.available
          ? (await client.read(aiMiniLibraryKey(scopeId), refresh)).value
          : null
        if (saved !== null && (!record(saved) || saved.version !== 1))
          throw new Error('The saved mini settings are unsupported.')
        settings =
          saved === null
            ? browserSettings(scopeId, storage)
            : normalizeAiMiniSettings(saved)
      } catch (reason) {
        error =
          reason instanceof Error
            ? reason.message
            : 'Mini settings could not be loaded.'
        try {
          settings = browserSettings(scopeId, storage)
        } catch {
          /* Keep validated defaults. */
        }
      }
      if (!cancelled && change.current === startedAt) {
        latest.current = settings
        setSnapshot({ scopeId, settings, error, loading: false })
      }
    }
    void load()
    const changed = (event: StorageEvent) => {
      if (event.key === aiMiniStorageKey(scopeId)) void load()
    }
    const localChanged = (event: Event) => {
      if (!(event instanceof CustomEvent) || !record(event.detail)) return
      if (
        event.detail.scopeId !== scopeId ||
        event.detail.sender === sender.current ||
        !record(event.detail.settings) ||
        event.detail.settings.version !== 1
      )
        return
      const settings = normalizeAiMiniSettings(event.detail.settings)
      change.current++
      latest.current = settings
      setSnapshot({ scopeId, settings, error: null, loading: false })
    }
    window.addEventListener('storage', changed)
    window.addEventListener('canvas-live:ai-mini-settings', localChanged)
    return () => {
      cancelled = true
      window.removeEventListener('storage', changed)
      window.removeEventListener('canvas-live:ai-mini-settings', localChanged)
    }
  }, [scopeId, client, storage])
  const update = useCallback(
    (patch: Partial<AiMiniSettings>) => {
      const settings = normalizeAiMiniSettings({
        ...latest.current,
        ...patch,
        version: 1,
      })
      change.current++
      const revision = change.current
      latest.current = settings
      setSnapshot({ scopeId, settings, error: null, loading: false })
      let cacheError: string | null = null
      try {
        storage?.setItem(aiMiniStorageKey(scopeId), JSON.stringify(settings))
      } catch {
        cacheError =
          'Mini settings are open here, but the browser cache could not be saved.'
      }
      window.dispatchEvent(
        new CustomEvent('canvas-live:ai-mini-settings', {
          detail: { scopeId, settings, sender: sender.current },
        }),
      )
      if (client.available) {
        void Promise.resolve()
          .then(() =>
            client.transform(aiMiniLibraryKey(scopeId), (saved) =>
              normalizeAiMiniSettings({
                ...(saved === null ? settings : normalizeAiMiniSettings(saved)),
                ...patch,
                version: 1,
              }),
            ),
          )
          .then((saved) => {
            if (active.current !== scopeId || change.current !== revision)
              return
            const merged = normalizeAiMiniSettings(saved.value)
            latest.current = merged
            setSnapshot({
              scopeId,
              settings: merged,
              error: null,
              loading: false,
            })
            try {
              storage?.setItem(
                aiMiniStorageKey(scopeId),
                JSON.stringify(merged),
              )
            } catch {
              /* The native library has the complete settings. */
            }
            window.dispatchEvent(
              new CustomEvent('canvas-live:ai-mini-settings', {
                detail: { scopeId, settings: merged, sender: sender.current },
              }),
            )
          })
          .catch((reason: unknown) => {
            if (active.current === scopeId && change.current === revision)
              setSnapshot((previous) =>
                previous.scopeId === scopeId
                  ? {
                      ...previous,
                      error: `Mini settings could not be saved to your portable library. ${reason instanceof Error ? reason.message : 'Try again.'}`,
                    }
                  : previous,
              )
          })
      } else if (cacheError)
        setSnapshot((previous) => ({ ...previous, error: cacheError }))
    },
    [scopeId, client, storage],
  )
  return {
    ...current,
    update,
    reset: () => update({ ...DEFAULT_AI_MINI_SETTINGS }),
  }
}
