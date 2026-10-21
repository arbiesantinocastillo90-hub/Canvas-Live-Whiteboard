import { useState, type FormEvent } from 'react'
import Icon from './Icon'
import type useMcpBridge from './useMcpBridge'
import './workspace-ai.css'
import McpActivityLog from './McpActivityLog'

export default function WorkspaceAI({
  projectName,
  canvasName,
  bridge,
  onClose,
  onConfigureMini,
}: {
  projectName: string
  canvasName: string | null
  bridge: ReturnType<typeof useMcpBridge>
  onClose: () => void
  onConfigureMini?: () => void
}) {
  const [pairingCode, setPairingCode] = useState('')
  const sharing = bridge.status === 'sharing'
  const connecting = bridge.status === 'connecting'
  function manualShare(event: FormEvent) {
    event.preventDefault()
    void bridge.share(pairingCode)
    setPairingCode('')
  }
  return (
    <aside
      className="workspace-ai-panel"
      id="workspace-ai-panel"
      aria-labelledby="workspace-ai-title"
    >
      <div className="file-panel-heading">
        <h2 id="workspace-ai-title">Workspace AI</h2>
        <button
          className="icon-button"
          aria-label="Close AI panel"
          title="Close AI panel"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="ai-context-mark">
        <Icon name="work" />
      </div>
      {sharing ? (
        <>
          <p className="eyebrow">Shared context</p>
          <dl className="ai-context">
            <dt>Project</dt>
            <dd>{projectName}</dd>
            <dt>Canvas</dt>
            <dd>{canvasName}</dd>
            <dt>Connected client (reported)</dt>
            <dd>{bridge.mcpClient ?? 'Waiting for an AI client'}</dd>
          </dl>
        </>
      ) : (
        <p className="ai-introduction">
          Collaborate with your preferred AI on this canvas. Start{' '}
          <strong>Canvas Live MCP</strong> from your USB, then share below.
        </p>
      )}
      <div className="ai-status-card" data-sharing={sharing} aria-live="polite">
        <span className="status-dot" />
        <strong>
          {connecting
            ? 'Connecting to companion…'
            : sharing
              ? 'This canvas is shared'
              : 'Canvas is not shared'}
        </strong>
      </div>
      {bridge.error && (
        <p className="ai-connection-error" role="alert">
          {bridge.error}
        </p>
      )}
      {sharing && bridge.lastOperation && (
        <div className="ai-last-operation" role="status">
          <span>Latest MCP operation</span>
          <p>{bridge.lastOperation}</p>
        </div>
      )}
      {!!bridge.activities?.length && (
        <McpActivityLog entries={bridge.activities} />
      )}
      {sharing && (
        <p className="ai-introduction">
          Click your mini for recent activity. Double-click it to open this
          panel.
        </p>
      )}
      {sharing || connecting ? (
        <button
          className="button secondary ai-share-button"
          onClick={bridge.disconnect}
        >
          {connecting ? 'Cancel connection' : 'Stop sharing'}
        </button>
      ) : (
        <>
          <button
            className="button primary ai-share-button"
            title="Allow the connected AI to read and edit this canvas"
            disabled={!canvasName}
            onClick={() => {
              void bridge.share()
            }}
          >
            Share this canvas
          </button>
          {!canvasName && (
            <p className="ai-introduction">Open a canvas to share it.</p>
          )}
          <details className="ai-setup">
            <summary>Use a pairing code instead</summary>
            <form className="ai-pairing-form" onSubmit={manualShare}>
              <label htmlFor="mcp-pairing-code">Browser pairing code</label>
              <input
                id="mcp-pairing-code"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value)}
                placeholder="Paste the companion code"
                maxLength={256}
                disabled={!canvasName}
                required
              />
              <button
                className="button secondary ai-share-button"
                disabled={!canvasName || !pairingCode.trim()}
              >
                Pair and share
              </button>
              <p className="quiet-note">
                Use the browser pairing code here. The MCP access token is for
                your AI client. In the portable app, Share this canvas connects
                automatically without pasting a code.
              </p>
            </form>
          </details>
        </>
      )}
      {onConfigureMini && (
        <button className="button secondary" onClick={onConfigureMini}>
          Customize AI mini
        </button>
      )}
      <details className="ai-setup ai-sharing-details">
        <summary>Sharing details</summary>
        <p>
          The connected AI can read and edit this canvas, including unsaved
          content. Cloud clients may send it to their AI provider. Save keeps AI
          edits; Undo reverses them. Sharing continues on Home and Options. Stop
          sharing, close this view, or switch files to end its grant.
        </p>
        <p>
          For several canvases, open each in a separate Canvas Live view and
          share it there. The AI can list the shared canvases and select one by
          its session ID. Unshared canvases remain private.
        </p>
        <a href="/" target="_blank" rel="noopener noreferrer">
          Open another Canvas Live view
        </a>
      </details>
      <details className="ai-setup">
        <summary>Connect your AI</summary>
        <ol>
          <li>
            Open <strong>Canvas Live MCP.exe</strong> on your USB. Its status
            window provides the connection address and setup steps.
          </li>
          <li>
            Add the companion in your MCP-compatible AI client, such as ChatGPT,
            Claude, or Codex. Each client needs its own connection setup.
          </li>
          <li>
            Choose <strong>Share this canvas</strong> here. Only the canvas you
            share becomes available to the AI.
          </li>
        </ol>
        <p>
          A cloud AI client needs a secure tunnel or a reachable HTTPS endpoint.
          The portable companion runs locally; it does not create a cloud
          connection automatically.
        </p>
        <p>The client reports its name; this does not identify the model.</p>
        <a
          href="https://developers.openai.com/plugins/deploy/connect-chatgpt"
          target="_blank"
          rel="noreferrer"
        >
          ChatGPT connection guide
        </a>
      </details>
    </aside>
  )
}
