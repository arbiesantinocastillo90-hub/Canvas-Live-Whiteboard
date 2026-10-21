import { useId, useState } from 'react'
import CanvasAiMini from './CanvasAiMini'
import type { McpBridgeState } from './useMcpBridge'

const PREVIEW_STATE: McpBridgeState = {
  status: 'idle',
  mcpClient: null,
  mcpLastSeen: null,
  lastOperation: null,
  error: null,
  activity: null,
}
const previewAction = () => undefined

type Props = {
  scopeId: string
  workspaceName: string
  reduceMotion: boolean
}

export default function CanvasAiOptions(props: Props) {
  return <ScopedCanvasAiOptions key={props.scopeId} {...props} />
}

function ScopedCanvasAiOptions({
  scopeId,
  workspaceName,
  reduceMotion,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const titleId = useId()
  return (
    <section className="canvas-ai-options" aria-labelledby={titleId}>
      <h2 id={titleId}>AI presence</h2>
      <div className="option-card">
        <p className="option-description">
          Customize the AI character, work indicator colors, and animations for{' '}
          <strong>{workspaceName}</strong>. Indicators show reported AI activity
          on a shared canvas.
        </p>
        <button
          type="button"
          className="button secondary"
          onClick={() => setSettingsOpen(true)}
        >
          Customize AI character and indicators
        </button>
        <p className="option-description">
          Preview and save these choices without connecting an AI client.
        </p>
      </div>
      <CanvasAiMini
        scopeId={scopeId}
        state={PREVIEW_STATE}
        onOpenAI={previewAction}
        onStopSharing={previewAction}
        reduceMotion={reduceMotion}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
      />
    </section>
  )
}
