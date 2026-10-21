import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import McpActivityLog from './McpActivityLog'
import type { McpActivityEntry } from './mcpActivity'

function entries(count: number): McpActivityEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    kind: 'read',
    phase: 'complete',
    at: 1000 + index,
    summary: `Read object ${index}.`,
  }))
}

describe('recent AI activity log', () => {
  it('explains an empty history without claiming an AI is connected', () => {
    render(<McpActivityLog entries={undefined} />)
    expect(
      screen.getByText('AI reads and changes will appear here.'),
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('limits the mini to five recent entries and the panel to twenty', () => {
    const view = render(<McpActivityLog entries={entries(30)} compact />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Read object 0.')).toBeInTheDocument()
    expect(screen.queryByText('Read object 5.')).not.toBeInTheDocument()
    view.rerender(<McpActivityLog entries={entries(30)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
  })

  it('retains an activity with an invalid timestamp without throwing or inventing a time', () => {
    const history = entries(3)
    history[0].at = NaN
    history[1].at = Infinity
    const { container } = render(<McpActivityLog entries={history} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(container.querySelectorAll('time')).toHaveLength(1)
    expect(container.querySelector('time')).toHaveAttribute(
      'datetime',
      new Date(history[2].at).toISOString(),
    )
  })

  it('renders unconfirmed outcomes distinctly and treats activity text as content', () => {
    const { container } = render(
      <McpActivityLog
        entries={[
          {
            id: 'unknown',
            kind: 'edit',
            phase: 'unconfirmed',
            at: 100,
            summary: '<script>claim completion</script>',
          },
        ]}
      />,
    )
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-phase',
      'unconfirmed',
    )
    expect(
      screen.getByText('<script>claim completion</script>'),
    ).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
  })
})
