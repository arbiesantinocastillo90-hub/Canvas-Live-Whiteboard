import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import Icon from './Icon'
import PresentationIcon from './PresentationIcon'
import {
  itemPresentationStyle,
  normalizeItemPresentation,
  PRESENTATION_ICONS,
  type ItemPresentation,
} from './itemPresentation'
import './workspace-personalization.css'

export default function ItemAppearanceDialog({
  kind,
  title,
  value,
  onSave,
  onClose,
}: {
  kind: 'file' | 'project'
  title: string
  value?: ItemPresentation
  onSave: (value: ItemPresentation) => void | Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() =>
    normalizeItemPresentation(value, kind === 'project' ? 'folder' : 'canvas'),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modal = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    return () => previous?.focus()
  }, [])
  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape' && !saving) {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    if (event.key !== 'Tab') return
    const controls = modal.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),textarea:not(:disabled)',
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
  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSave(
        normalizeItemPresentation(
          draft,
          kind === 'project' ? 'folder' : 'canvas',
        ),
      )
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The appearance could not be saved.',
      )
      setSaving(false)
    }
  }
  function color(
    label: string,
    key: 'color' | 'fill' | 'borderColor',
    fallback: string,
  ) {
    return (
      <div className="personalization-color">
        <label>
          <span>{label}</span>
          <input
            aria-label={label}
            type="color"
            value={draft[key] ?? fallback}
            onChange={(event) =>
              setDraft({ ...draft, [key]: event.target.value })
            }
          />
        </label>
        <button
          className="button subtle"
          type="button"
          aria-label={`Automatic ${label.toLowerCase()}`}
          disabled={draft[key] === null}
          onClick={() => setDraft({ ...draft, [key]: null })}
        >
          Auto
        </button>
      </div>
    )
  }
  return (
    <div className="modal-backdrop">
      <div
        ref={modal}
        className="project-dialog item-appearance-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={keys}
      >
        <button
          ref={closeButton}
          className="icon-button dialog-close"
          type="button"
          aria-label="Close appearance"
          disabled={saving}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        <h2 id={`${id}-title`}>
          {kind === 'project' ? 'Project' : 'Canvas'} appearance
        </h2>
        <div
          className="item-appearance-preview"
          style={itemPresentationStyle(draft)}
        >
          <PresentationIcon
            name={draft.icon}
            size={36}
            color="var(--item-color)"
          />
          <strong>{title}</strong>
          {draft.description && <p>{draft.description}</p>}
        </div>
        <div
          className="personalization-icon-grid"
          role="group"
          aria-label={`${kind === 'project' ? 'Project' : 'Canvas'} icon`}
        >
          {PRESENTATION_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              className="icon-button"
              title={icon}
              aria-label={`${icon} icon`}
              aria-pressed={draft.icon === icon}
              onClick={() => setDraft({ ...draft, icon })}
            >
              <PresentationIcon name={icon} />
            </button>
          ))}
        </div>
        {color('Accent color', 'color', '#7C5CFC')}
        {color('Card fill', 'fill', '#20232D')}
        {color('Card outline', 'borderColor', '#3D414F')}
        <label>
          Description
          <textarea
            rows={3}
            maxLength={600}
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </label>
        {error && (
          <p className="personalization-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button subtle"
            disabled={saving}
            onClick={() =>
              setDraft(
                normalizeItemPresentation(
                  null,
                  kind === 'project' ? 'folder' : 'canvas',
                ),
              )
            }
          >
            Reset
          </button>
          <button
            className="button primary"
            type="button"
            disabled={saving}
            onClick={() => {
              void save()
            }}
          >
            {saving ? 'Saving…' : 'Save appearance'}
          </button>
        </div>
      </div>
    </div>
  )
}
