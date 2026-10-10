import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Icon from './Icon'
export default function ProjectDialog({
  kind,
  initialName,
  onClose,
  onSubmit,
}: {
  kind: 'create' | 'rename'
  initialName: string
  onClose: () => void
  onSubmit: (name: string) => string | null
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    input.current?.focus()
    input.current?.select()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
    if (event.key !== 'Tab') return
    const items = dialog.current?.querySelectorAll<HTMLElement>('button, input')
    if (!items?.length) return
    const first = items[0],
      last = items[items.length - 1]
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
        className="project-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={handleKeys}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close project dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        <span className="dialog-icon">
          <Icon name="folder" />
        </span>
        <p className="eyebrow">
          {kind === 'create' ? 'A new beginning' : 'Make it yours'}
        </p>
        <h2 id="dialog-title">
          {kind === 'create' ? 'Create a project' : 'Rename your project'}
        </h2>
        <p className="dialog-description">
          {kind === 'create'
            ? 'Give your next idea a name. You can change it anytime.'
            : 'Choose a name that feels right for this space.'}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setError(onSubmit(name))
          }}
        >
          <label className="input-label" htmlFor="project-name">
            Project name
          </label>
          <input
            className="project-name-input"
            ref={input}
            id="project-name"
            value={name}
            maxLength={80}
            placeholder="e.g. My next big idea"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'project-name-error' : undefined}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
          />
          {error && (
            <p id="project-name-error" role="alert" className="form-error">
              {error}
            </p>
          )}
          <p className="quiet-note">
            Project names stay in this browser. Canvas saving comes next.
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="button primary">
              {kind === 'create' ? 'Create project' : 'Save name'}
              <Icon name="arrow" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
