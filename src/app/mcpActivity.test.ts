import { describe, expect, it, vi } from 'vitest'
import {
  appendMcpActivity,
  observedActivityEntry,
  parseMcpActivity,
  settleMcpActivities,
  type McpActivityEntry,
} from './mcpActivity'

const entry: McpActivityEntry = {
  id: 'edit:session:request',
  kind: 'edit',
  phase: 'working',
  at: 100,
  summary: 'Requested a change.',
}

describe('observed MCP activity', () => {
  it('accepts legacy metadata and copies a bounded, deduplicated target list', () => {
    expect(parseMcpActivity({ kind: 'read', at: 100 })).toEqual({
      kind: 'read',
      at: 100,
    })
    const targetIds = ['one', 'two', 'one']
    const parsed = parseMcpActivity({
      kind: 'edit',
      phase: 'working',
      id: 'request',
      at: 100,
      targetIds,
    })
    targetIds.push('later')
    expect(parsed?.targetIds).toEqual(['one', 'two'])
  })

  it.each([
    null,
    [],
    { kind: 'delete', at: 100 },
    { kind: ['read'], at: 100 },
    { kind: 'edit', phase: ['complete'], at: 100 },
    { kind: 'read', at: NaN },
    { kind: 'read', at: Infinity },
    { kind: 'read', at: -1 },
    { kind: 'read', at: Number.MAX_SAFE_INTEGER },
    { kind: 'read', at: 100, id: '' },
    { kind: 'read', at: 100, id: 'x'.repeat(201) },
    { kind: 'read', at: 100, targetIds: [''] },
    { kind: 'read', at: 100, targetIds: ['x'.repeat(201)] },
    { kind: 'read', at: 100, targetIds: [1] },
    { kind: 'read', at: 100, targetIds: new Array(1) },
    { kind: 'read', at: 100, targetIds: new Array(101).fill('one') },
    { kind: 'read', phase: 'working', at: 100 },
  ])(
    'ignores malformed or unreasonable metadata without creating a marker: %j',
    (value) => {
      expect(parseMcpActivity(value)).toBeNull()
    },
  )

  it('does not coerce untrusted enum values or invoke their methods', () => {
    const toString = vi.fn(() => {
      throw new Error('Must not coerce page data')
    })
    expect(parseMcpActivity({ kind: { toString }, at: 100 })).toBeNull()
    expect(
      parseMcpActivity({ kind: 'edit', phase: { toString }, at: 100 }),
    ).toBeNull()
    expect(toString).not.toHaveBeenCalled()
  })

  it('replaces pending history with the actual local result and ignores duplicate metadata', () => {
    const completed = appendMcpActivity([entry], {
      ...entry,
      phase: 'complete',
      at: 200,
      summary: 'Moved two rectangles.',
    })
    expect(completed).toHaveLength(1)
    const repeated = appendMcpActivity(
      completed,
      { ...entry, phase: 'complete', at: 300, summary: 'Changed 2 objects.' },
      true,
    )
    expect(repeated).toBe(completed)
    expect(appendMcpActivity(repeated, entry, true)).toBe(completed)
    expect(completed[0]).toMatchObject({
      phase: 'complete',
      at: 200,
      summary: 'Moved two rectangles.',
    })
  })

  it('bounds history and text while preserving newest activity first', () => {
    let history: McpActivityEntry[] = []
    for (let index = 0; index < 25; index++) {
      history = appendMcpActivity(history, {
        ...entry,
        id: String(index),
        summary: 'x'.repeat(600),
      })
    }
    expect(history).toHaveLength(20)
    expect(history[0]).toMatchObject({ id: '24', summary: 'x'.repeat(500) })
    expect(history.at(-1)?.id).toBe('5')
  })

  it('marks disappeared pending work as unconfirmed while retaining the active request and confirmed results', () => {
    const completed = { ...entry, id: 'done', phase: 'complete' as const }
    const current = { ...entry, id: 'current' }
    const history = settleMcpActivities([current, completed, entry], 'current')!
    expect(history[0]).toBe(current)
    expect(history[1]).toBe(completed)
    expect(history[2]).toMatchObject({
      phase: 'unconfirmed',
      summary: expect.stringMatching(/confirm its outcome/),
    })
    expect(settleMcpActivities(history, 'current')).toBe(history)
    expect(appendMcpActivity(history, entry, true)).toBe(history)
    expect(
      appendMcpActivity([{ ...entry, phase: 'failed' }], entry, true)[0].phase,
    ).toBe('failed')
    const failed = [
      { ...entry, kind: 'error' as const, phase: 'failed' as const },
    ]
    expect(
      appendMcpActivity(failed, { ...entry, phase: 'complete' }, true),
    ).toBe(failed)
  })

  it('uses literal requested/read/completed summaries without claiming model thought or successful pending edits', () => {
    expect(
      observedActivityEntry({ kind: 'read', at: 100, targetIds: ['one'] })
        .summary,
    ).toBe('Read 1 object.')
    expect(observedActivityEntry({ kind: 'read', at: 100 }).summary).toBe(
      'Read the canvas overview.',
    )
    expect(
      observedActivityEntry({
        kind: 'edit',
        at: 100,
        targetIds: ['one', 'two'],
      }),
    ).toMatchObject({
      phase: 'working',
      summary: 'Requested changes to 2 objects.',
    })
    expect(
      observedActivityEntry({ kind: 'edit', phase: 'complete', at: 100 })
        .summary,
    ).toBe('Completed a canvas change.')
  })
})
