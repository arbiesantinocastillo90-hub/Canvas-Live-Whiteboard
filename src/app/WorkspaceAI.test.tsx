import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkspaceAI from './WorkspaceAI'

function bridge(status: 'idle' | 'sharing' | 'connecting' = 'idle') {
  return {
    status,
    mcpClient: 'Claude Desktop',
    mcpLastSeen: 123,
    lastOperation: null,
    error: null,
    share: vi.fn(async () => {}),
    disconnect: vi.fn(),
  }
}

describe('simplified provider-independent Workspace AI', () => {
  it('hides context before sharing and discovers the companion from the primary action', () => {
    const connection = bridge()
    render(
      <WorkspaceAI
        projectName="Private project"
        canvasName="Private canvas"
        bridge={connection}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText('Private project')).not.toBeInTheDocument()
    expect(screen.queryByText('Private canvas')).not.toBeInTheDocument()
    expect(screen.queryByText('Claude Desktop')).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('Browser pairing code').closest('details'),
    ).not.toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button', { name: 'Share this canvas' }))
    expect(connection.share).toHaveBeenCalledWith()
  })

  it('shows context and client-reported application only while the canvas is shared', () => {
    const connection = bridge('sharing')
    const test = render(
      <WorkspaceAI
        projectName="Private project"
        canvasName="Private canvas"
        bridge={connection}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Private project')).toBeVisible()
    expect(screen.getByText('Private canvas')).toBeVisible()
    expect(screen.getByText('Claude Desktop')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(connection.disconnect).toHaveBeenCalledOnce()
    test.rerender(
      <WorkspaceAI
        projectName="Private project"
        canvasName="Private canvas"
        bridge={bridge()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText('Private project')).not.toBeInTheDocument()
  })
})
