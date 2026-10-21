import type { McpActivityEntry } from './mcpActivity'
import './mcp-activity-log.css'

export default function McpActivityLog({
  entries,
  compact = false,
}: {
  entries: readonly McpActivityEntry[] | undefined
  compact?: boolean
}) {
  const visible = (entries ?? []).slice(0, compact ? 5 : 20)
  return (
    <section
      className="mcp-activity-log"
      aria-label="Recent AI activity"
      data-compact={compact}
    >
      <strong>Recent activity</strong>
      {visible.length ? (
        <ol>
          {visible.map((entry) => {
            const timestamp = new Date(entry.at)
            const validTime = Number.isFinite(timestamp.getTime())
            return (
              <li
                key={entry.id}
                data-kind={entry.kind}
                data-phase={entry.phase}
              >
                <span className="mcp-activity-dot" aria-hidden="true" />
                <span>{entry.summary}</span>
                {validTime && (
                  <time dateTime={timestamp.toISOString()}>
                    {timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <p>AI reads and changes will appear here.</p>
      )}
    </section>
  )
}
