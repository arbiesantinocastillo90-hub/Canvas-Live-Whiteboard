import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Icon from './Icon'
export default function ProjectDialog({
  kind,
  initialName,
  onClose,
  onSubmit,
  entity = 'project',
}: {
  kind: 'create' | 'rename'
  initialName: string
  onClose: () => void
  onSubmit: (name: string) => string | null | Promise<string | null>
  entity?: 'project' | 'file'
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
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
    if (event.key === 'Escape' && !pending) {
      event.preventDefault()
      onClose()
    }
    if (event.key !== 'Tab') return
    const items = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled)',
    )
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
          aria-label={`Close ${entity} dialog`}
          onClick={onClose}
          disabled={pending}
        >
          <Icon name="close" />
        </button>
        <span className="dialog-icon">
          <Icon name={entity === 'file' ? 'canvas' : 'folder'} />
        </span>
        <p className="eyebrow">
          {kind === 'create' ? 'A new beginning' : 'Make it yours'}
        </p>
        <h2 id="dialog-title">
          {entity === 'file'
            ? kind === 'create'
              ? 'Create a canvas file'
              : 'Rename your canvas'
            : kind === 'create'
              ? 'Create a project'
              : 'Rename your project'}
        </h2>
        <p className="dialog-description">
          {kind === 'create'
            ? 'Give your next idea a name. You can change it anytime.'
            : 'Choose a name that feels right for this space.'}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (pending) return
            setPending(true)
            try {
              const result = onSubmit(name)
              setError(result instanceof Promise ? await result : result)
            } catch {
              setError('The name could not be saved. Please try again.')
            } finally {
              setPending(false)
            }
          }}
        >
          <label className="input-label" htmlFor="project-name">
            {entity === 'file' ? 'Canvas name' : 'Project name'}
          </label>
          <input
            className="project-name-input"
            ref={input}
            id="project-name"
            value={name}
            disabled={pending}
            maxLength={entity === 'file' ? 120 : 80}
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
            {entity === 'file'
              ? 'Saved in this browser. Export an LCANVAS copy to keep a portable backup.'
              : 'Project names stay in this browser. Each project organizes its canvas files.'}
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={pending}>
              {pending
                ? 'Saving…'
                : kind === 'create'
                  ? entity === 'file'
                    ? 'Create canvas'
                    : 'Create project'
                  : 'Save name'}
              <Icon name="arrow" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
