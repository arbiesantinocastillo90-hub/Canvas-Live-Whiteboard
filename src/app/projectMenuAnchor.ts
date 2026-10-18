import type { KeyboardEvent, MouseEvent } from 'react'

export type ProjectMenuAnchor = {
  projectId: string
  x: number
  y: number
  trigger: HTMLElement
}

export function projectMenuAnchor(
  event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  projectId: string,
): ProjectMenuAnchor | null {
  if (
    'key' in event &&
    event.key !== 'ContextMenu' &&
    !(event.shiftKey && event.key === 'F10')
  )
    return null
  event.preventDefault()
  event.stopPropagation()
  const trigger = event.currentTarget
  const bounds = trigger.getBoundingClientRect()
  return {
    projectId,
    trigger,
    x: 'clientX' in event && event.clientX ? event.clientX : bounds.left,
    y: 'clientY' in event && event.clientY ? event.clientY : bounds.bottom,
  }
}
