import type { CanvasCommand } from './canvasCommands'
import type { CanvasDocument } from '../app/lcanvas'

export type BridgeCommand = CanvasCommand | { kind: 'undo' } | { kind: 'redo' }
export type BridgeRequest = {
  requestId: string
  sessionId: string
  expectedRevision: number
  expectedContentRevision?: number
  expiresAt: number
  command: BridgeCommand
}
export type BridgeAcknowledgment = {
  requestId: string
  ok: boolean
  revision: number
  document?: CanvasDocument
  affectedIds?: string[]
  summary?: string
  error?: string
}
/** Observed MCP work only; targets are object IDs, never supplied coordinates. */
export type BridgeActivity = {
  kind: 'read' | 'edit'
  at: number
  id?: string
  targetIds?: string[]
  phase?: 'working' | 'complete'
}
export type BridgeResponse = {
  sessionId?: string
  revision?: number
  contentRevision?: number
  command?: BridgeRequest
  ackId?: string
  mcpClient: string | null
  mcpLastSeen: number | null
  lastOperation?: { summary: string; at: number } | null
  activity?: BridgeActivity | null
}
