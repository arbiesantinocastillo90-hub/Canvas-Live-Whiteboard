import { useState, type FormEvent } from 'react'
import Icon from './Icon'
import type useMcpBridge from './useMcpBridge'
import './workspace-ai.css'

export default function WorkspaceAI({
  projectName,
  canvasName,
  bridge,
  onClose,
}: {
  projectName: string
  canvasName: string | null
  bridge: ReturnType<typeof useMcpBridge>
  onClose: () => void
}) {
  const [pairingCode, setPairingCode] = useState('')
  const sharing = bridge.status === 'sharing'
  const connecting = bridge.status === 'connecting'

  function share(event: FormEvent) {
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
      <p className="eyebrow">Current context</p>
      <dl className="ai-context">
        <dt>Project</dt>
        <dd>{projectName}</dd>
        <dt>Canvas</dt>
        <dd>{canvasName ?? 'No canvas open'}</dd>
        <dt>Integration</dt>
        <dd>ChatGPT · custom MCP server</dd>
      </dl>
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
      {bridge.lastOperation && (
        <div className="ai-last-operation" role="status">
          <span>Latest MCP operation</span>
          <p>{bridge.lastOperation}</p>
        </div>
      )}
      {sharing || connecting ? (
        <button
          className="button secondary ai-share-button"
          onClick={bridge.disconnect}
        >
          {connecting ? 'Cancel connection' : 'Stop sharing'}
        </button>
      ) : (
        <form className="ai-pairing-form" onSubmit={share}>
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
            className="button primary ai-share-button"
            title="Allow the connected AI to read and edit this canvas"
            disabled={!canvasName || !pairingCode.trim()}
          >
            Share this canvas
          </button>
        </form>
      )}
      <details className="ai-setup ai-sharing-details">
        <summary>Sharing details</summary>
        <p>
          The connected AI can read and edit this canvas, including unsaved
          content. Cloud clients may send it to their AI provider. Save keeps AI
          edits; Undo reverses them. Switching files or leaving Work stops
          sharing.
        </p>
      </details>
      <details className="ai-setup">
        <summary>ChatGPT connection setup</summary>
        <ol>
          <li>
            Start the Canvas Live companion in its project folder:{' '}
            <code>npm run mcp</code>.
          </li>
          <li>
            Paste its browser pairing code above and select Share this canvas.
          </li>
          <li>
            In ChatGPT, open Plugins → + → Add custom MCP server. Choose
            Connection Tunnel and follow the companion setup guide to start a
            Secure MCP Tunnel with its separate MCP access code.
          </li>
        </ol>
        <p>
          The tunnel lets ChatGPT reach the local companion. A Server URL
          connection requires a reachable HTTPS endpoint instead.
        </p>
        <a
          href="https://developers.openai.com/api/docs/guides/custom-mcp-server"
          target="_blank"
          rel="noreferrer"
        >
          Open ChatGPT setup instructions
        </a>
      </details>
    </aside>
  )
}
