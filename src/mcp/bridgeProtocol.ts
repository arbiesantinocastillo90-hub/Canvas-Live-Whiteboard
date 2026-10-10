import type { CanvasCommand } from './canvasCommands'
import type { CanvasDocument } from '../app/lcanvas'

export type BridgeCommand = CanvasCommand | { kind: 'undo' } | { kind: 'redo' }
export type BridgeRequest = {
  requestId: string
  sessionId: string
  expectedRevision: number
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
export type BridgeResponse = {
  sessionId?: string
  revision?: number
  command?: BridgeRequest
  ackId?: string
  mcpClient: string | null
  mcpLastSeen: number | null
  lastOperation?: { summary: string; at: number } | null
}
