import { useEffect, useId, useRef, useState } from 'react'
import PresentationIcon from './PresentationIcon'
import WorkspaceIdentity from './WorkspaceIdentity'
import { PRESENTATION_ICONS } from './itemPresentation'
import { backgroundAssets, useWorkspaceBackground } from './workspaceBackground'
import {
  DEFAULT_WORKSPACE_APPEARANCE,
  normalizeWorkspaceAppearance,
  WORKSPACE_TITLE_FONTS,
  workspaceBackgroundStyle,
  type WorkspaceAppearance,
} from './workspaceAppearance'
import './workspace-personalization.css'

function ColorControl({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: string | null
  fallback: string
  onChange: (color: string | null) => void
}) {
  return (
    <div className="personalization-color">
      <label>
        <span>{label}</span>
        <input
          aria-label={label}
          type="color"
          value={value ?? fallback}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="button subtle"
        aria-label={`Automatic ${label.toLowerCase()}`}
        disabled={value === null}
        onClick={() => onChange(null)}
      >
        Auto
      </button>
    </div>
  )
}
export default function WorkspaceAppearanceOptions({
  value: raw,
  onChange,
  workspaceName = 'Workspace',
}: {
  value: WorkspaceAppearance
  onChange: (value: WorkspaceAppearance) => void
  workspaceName?: string
}) {
  const value = normalizeWorkspaceAppearance(raw)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const latestValue = useRef(value)
  const generation = useRef(0)
  const id = useId()
  const image = useWorkspaceBackground(value.backgroundAssetId)
  useEffect(() => {
    latestValue.current = value
  }, [value])
  useEffect(
    () => () => {
      generation.current += 1
    },
    [workspaceName],
  )
  function update<K extends keyof WorkspaceAppearance>(
    key: K,
    next: WorkspaceAppearance[K],
  ) {
    onChange(normalizeWorkspaceAppearance({ ...value, [key]: next }))
  }
  async function upload(file?: File) {
    if (!file) return
    const request = ++generation.current
    setUploading(true)
    setError(null)
    try {
      const assetId = await backgroundAssets.save(file)
      if (request === generation.current)
        onChange({ ...latestValue.current, backgroundAssetId: assetId })
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'The background image could not be saved.',
        )
    } finally {
      if (request === generation.current) setUploading(false)
    }
  }
  function range(
    label: string,
    key: keyof WorkspaceAppearance,
    min: number,
    max: number,
    step = 1,
  ) {
    return (
      <label className="personalization-range">
        <span>
          {label}
          <output>{String(value[key])}</output>
        </span>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[key] as number}
          onChange={(event) => update(key, Number(event.target.value))}
        />
      </label>
    )
  }
  return (
    <section
      className="workspace-appearance-options"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>Workspace appearance</h2>
      <div
        className="workspace-appearance-preview"
        style={workspaceBackgroundStyle(value, image)}
      >
        <div className="workspace-background-image" />
        <div className="workspace-background-gradient" />
        <WorkspaceIdentity name={workspaceName} appearance={value} />
      </div>
      <fieldset className="option-card">
        <legend className="option-title">Identity</legend>
        <label>
          Tagline
          <input
            type="text"
            maxLength={160}
            value={value.tagline}
            onChange={(event) => update('tagline', event.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            maxLength={1200}
            value={value.description}
            onChange={(event) => update('description', event.target.value)}
          />
        </label>
        <label>
          Alignment
          <select
            value={value.align}
            onChange={(event) =>
              update(
                'align',
                event.target.value === 'center' ? 'center' : 'left',
              )
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
          </select>
        </label>
        {range('Identity spacing', 'spacing', 4, 40)}
        <details>
          <summary>Workspace icon</summary>
          <div
            className="personalization-icon-grid"
            role="group"
            aria-label="Workspace icon"
          >
            {PRESENTATION_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                className="icon-button"
                title={icon}
                aria-label={`${icon} workspace icon`}
                aria-pressed={value.icon === icon}
                onClick={() => update('icon', icon)}
              >
                <PresentationIcon name={icon} />
              </button>
            ))}
          </div>
          {range('Icon size', 'iconSize', 16, 112)}
          {range('Icon thickness', 'iconStrokeWidth', 0.5, 5, 0.1)}
          <ColorControl
            label="Icon outline color"
            value={value.iconColor}
            fallback="#7C5CFC"
            onChange={(next) => update('iconColor', next)}
          />
          <ColorControl
            label="Icon inner color"
            value={value.iconFill}
            fallback="#20232D"
            onChange={(next) => update('iconFill', next)}
          />
        </details>
        <details>
          <summary>Workspace name</summary>
          <label>
            Title font
            <select
              aria-label="Title font"
              value={value.titleFont}
              onChange={(event) =>
                update(
                  'titleFont',
                  event.target.value as WorkspaceAppearance['titleFont'],
                )
              }
            >
              {WORKSPACE_TITLE_FONTS.map((font) => (
                <option value={font} key={font}>
                  {font === 'system' ? 'System default' : font}
                </option>
              ))}
            </select>
          </label>
          {range('Title size', 'titleSize', 14, 80)}
          {range('Title weight', 'titleWeight', 100, 900, 100)}
          {range('Title outline width', 'titleOutlineWidth', 0, 3, 0.1)}
          <ColorControl
            label="Title inner color"
            value={value.titleColor}
            fallback="#E9EBF1"
            onChange={(next) => update('titleColor', next)}
          />
          <ColorControl
            label="Title outline color"
            value={value.titleOutlineColor}
            fallback="#101827"
            onChange={(next) => update('titleOutlineColor', next)}
          />
        </details>
      </fieldset>
      <fieldset className="option-card">
        <legend className="option-title">Background</legend>
        <ColorControl
          label="Background color"
          value={value.backgroundColor}
          fallback="#171923"
          onChange={(next) => update('backgroundColor', next)}
        />
        <div className="personalization-upload">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Workspace background image"
            onChange={(event) => {
              void upload(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className="button"
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            {uploading ? 'Saving image…' : 'Choose image or GIF'}
          </button>
          <button
            type="button"
            className="button subtle"
            disabled={!value.backgroundAssetId || uploading}
            onClick={() => {
              generation.current += 1
              update('backgroundAssetId', null)
            }}
          >
            Remove image
          </button>
        </div>
        <p className="option-description">
          Local PNG, JPEG, WebP or GIF, up to 20 MB. Images stay on this device.
        </p>
        {error && (
          <p className="personalization-error" role="alert">
            {error}
          </p>
        )}
        {value.backgroundAssetId && !image && !uploading && (
          <p className="option-description" role="status">
            The background image is loading or is unavailable on this device.
          </p>
        )}
        <label>
          Image fit
          <select
            value={value.backgroundFit}
            onChange={(event) =>
              update(
                'backgroundFit',
                event.target.value as WorkspaceAppearance['backgroundFit'],
              )
            }
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="tile">Tile</option>
          </select>
        </label>
        <label>
          Image position
          <select
            value={value.backgroundPosition}
            onChange={(event) =>
              update(
                'backgroundPosition',
                event.target.value as WorkspaceAppearance['backgroundPosition'],
              )
            }
          >
            {['center', 'top', 'bottom', 'left', 'right'].map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </label>
        {range('Image opacity', 'backgroundOpacity', 0, 100)}
        <label className="personalization-checkbox">
          <input
            type="checkbox"
            checked={value.gradientEnabled}
            onChange={(event) =>
              update('gradientEnabled', event.target.checked)
            }
          />
          <span>Gradient overlay</span>
        </label>
        <div
          className="personalization-gradient"
          aria-disabled={!value.gradientEnabled}
        >
          <label>
            Gradient start
            <input
              aria-label="Gradient start"
              type="color"
              disabled={!value.gradientEnabled}
              value={value.gradientFrom}
              onChange={(event) => update('gradientFrom', event.target.value)}
            />
          </label>
          <label>
            Gradient end
            <input
              aria-label="Gradient end"
              type="color"
              disabled={!value.gradientEnabled}
              value={value.gradientTo}
              onChange={(event) => update('gradientTo', event.target.value)}
            />
          </label>
        </div>
        {range('Gradient angle', 'gradientAngle', 0, 360)}
        {range('Gradient opacity', 'gradientOpacity', 0, 100)}
      </fieldset>
      <button
        type="button"
        className="button subtle"
        onClick={() => {
          generation.current += 1
          setUploading(false)
          setError(null)
          onChange({ ...DEFAULT_WORKSPACE_APPEARANCE })
        }}
      >
        Reset workspace appearance
      </button>
    </section>
  )
}
