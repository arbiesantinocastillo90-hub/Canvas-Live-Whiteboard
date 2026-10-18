import { useLayoutEffect, useState, type RefObject } from 'react'

export type CanvasDeckGeometry = {
  host: HTMLElement
  x: number
  y: number
  railRight: number
}

/** Observe layout only, not the thousands of SVG attributes changed by editing. */
export function useCanvasDeck(
  stage: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [geometry, setGeometry] = useState<CanvasDeckGeometry | null>(null)
  useLayoutEffect(() => {
    if (!enabled) return
    const surface = stage.current
    const host = surface?.closest<HTMLElement>('.workspace-deck')
    if (!surface || !host) return
    const column = surface.closest<HTMLElement>('.canvas-column') ?? surface
    let frame: number | null = null
    const measure = () => {
      frame = null
      const deck = host.getBoundingClientRect()
      const canvas = surface.getBoundingClientRect()
      const columnBox = column.getBoundingClientRect()
      const next = {
        host,
        x: canvas.left - deck.left,
        y: canvas.top - deck.top,
        railRight: Math.max(0, deck.right - columnBox.right),
      }
      setGeometry((current) =>
        current?.host === host &&
        current.x === next.x &&
        current.y === next.y &&
        current.railRight === next.railRight
          ? current
          : next,
      )
    }
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure)
    }
    measure()
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedule)
    resize?.observe(host)
    resize?.observe(surface)
    resize?.observe(column)
    const mutations =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(schedule)
    const observeLayout = (element: Element | null) => {
      if (element) mutations?.observe(element, { attributes: true })
    }
    observeLayout(host)
    observeLayout(column)
    observeLayout(host.closest('.file-workspace'))
    observeLayout(host.closest('.app-shell'))
    for (const child of host.children)
      if (child.classList.contains('dock-panel')) observeLayout(child)
    window.addEventListener('resize', schedule)
    document.addEventListener('fullscreenchange', schedule)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      resize?.disconnect()
      mutations?.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('fullscreenchange', schedule)
    }
  }, [enabled, stage])
  return enabled ? geometry : null
}
