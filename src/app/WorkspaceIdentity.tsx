import PresentationIcon from './PresentationIcon'
import {
  normalizeWorkspaceAppearance,
  workspaceTitleStyle,
  type WorkspaceAppearance,
} from './workspaceAppearance'
import './workspace-personalization.css'

export default function WorkspaceIdentity({
  name,
  appearance,
  className = '',
}: {
  name: string
  appearance: WorkspaceAppearance
  className?: string
}) {
  const value = normalizeWorkspaceAppearance(appearance)
  return (
    <div
      className={`workspace-identity ${className}`}
      data-alignment={value.align}
      style={{ gap: value.spacing }}
    >
      <PresentationIcon
        name={value.icon}
        size={value.iconSize}
        strokeWidth={value.iconStrokeWidth}
        color={value.iconColor ?? 'var(--accent)'}
        fill={value.iconFill}
      />
      <div className="workspace-identity-text">
        <h2 aria-label="Current workspace" style={workspaceTitleStyle(value)}>
          {name}
        </h2>
        {value.tagline && <p className="workspace-tagline">{value.tagline}</p>}
        {value.description && (
          <p className="workspace-description">{value.description}</p>
        )}
      </div>
    </div>
  )
}
