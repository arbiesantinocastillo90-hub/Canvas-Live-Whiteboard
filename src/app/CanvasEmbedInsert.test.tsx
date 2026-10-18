import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEmbedInsert from './CanvasEmbedInsert'
import { saveCanvasMedia } from './canvasMedia'

vi.mock('./canvasMedia', () => ({ saveCanvasMedia: vi.fn() }))
function pendingSave() {
  let resolve!: (source: string) => void
  const promise = new Promise<string>((done) => {
    resolve = done
  })
  vi.mocked(saveCanvasMedia).mockReturnValueOnce(promise)
  return resolve
}
function chooseFile(container: HTMLElement) {
  const file = new File(['GIF89a'], 'reference.gif', { type: 'image/gif' })
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [file] },
  })
  return file
}
describe('safe media insertion', () => {
  beforeEach(() => vi.mocked(saveCanvasMedia).mockReset())
  it('inserts a valid HTTPS source with the selected type and trimmed title', () => {
    const insert = vi.fn()
    render(<CanvasEmbedInsert onInsert={insert} />)
    fireEvent.change(screen.getByLabelText('Embed type'), {
      target: { value: 'video' },
    })
    fireEvent.change(screen.getByLabelText('Embed URL'), {
      target: { value: 'https://example.com/reference.mp4' },
    })
    fireEvent.change(screen.getByLabelText('Embed title'), {
      target: { value: '  Reference video  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add embed' }))
    expect(insert).toHaveBeenCalledExactlyOnceWith(
      'video',
      'https://example.com/reference.mp4',
      'Reference video',
    )
    expect(saveCanvasMedia).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('inserts a completed local import with its type and title', async () => {
    const resolve = pendingSave(),
      insert = vi.fn()
    const view = render(<CanvasEmbedInsert onInsert={insert} />)
    fireEvent.change(screen.getByLabelText('Embed title'), {
      target: { value: 'Animated reference' },
    })
    const file = chooseFile(view.container)
    expect(saveCanvasMedia).toHaveBeenCalledWith(file)
    expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled()
    await act(async () => resolve(`media:${'a'.repeat(64)}`))
    expect(insert).toHaveBeenCalledExactlyOnceWith(
      'gif',
      `media:${'a'.repeat(64)}`,
      'Animated reference',
    )
  })
  it('discards an import completed after its canvas or insertion panel was closed', async () => {
    const resolve = pendingSave(),
      originalInsert = vi.fn(),
      nextCanvasInsert = vi.fn()
    const view = render(<CanvasEmbedInsert onInsert={originalInsert} />)
    chooseFile(view.container)
    view.unmount()
    render(<CanvasEmbedInsert onInsert={nextCanvasInsert} />)
    await act(async () => resolve(`media:${'b'.repeat(64)}`))
    expect(originalInsert).not.toHaveBeenCalled()
    expect(nextCanvasInsert).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Choose local media or PDF' }),
    ).toBeEnabled()
  })
  it('keeps rejected local uploads out of the canvas and reports their error', async () => {
    vi.mocked(saveCanvasMedia).mockRejectedValueOnce(
      new Error('The media type does not match its contents.'),
    )
    const insert = vi.fn(),
      view = render(<CanvasEmbedInsert onInsert={insert} />)
    await act(async () => {
      chooseFile(view.container)
    })
    expect(insert).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The media type does not match its contents.',
    )
    expect(
      screen.getByRole('button', { name: 'Choose local media or PDF' }),
    ).toBeEnabled()
  })
})
