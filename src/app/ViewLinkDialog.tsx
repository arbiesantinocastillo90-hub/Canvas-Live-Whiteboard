import { useEffect, useRef, type KeyboardEvent } from 'react'
import Icon from './Icon'

export default function ViewLinkDialog({
  url,
  onClose,
}: {
  url: string
  onClose: () => void
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    input.current?.focus()
    input.current?.select()
    return () => previous?.focus()
  }, [])
  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    if (event.key !== 'Tab') return
    const controls =
      dialog.current?.querySelectorAll<HTMLElement>('button,textarea')
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
  return (
    <div className="modal-backdrop">
      <div
        className="project-dialog view-link-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-link-title"
        onKeyDown={keys}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close view link"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        <h2 id="view-link-title">Workspace link</h2>
        <label htmlFor="snapshot-url">Copy this URL into Obsidian</label>
        <textarea id="snapshot-url" ref={input} readOnly value={url} rows={4} />
        <button className="button primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
