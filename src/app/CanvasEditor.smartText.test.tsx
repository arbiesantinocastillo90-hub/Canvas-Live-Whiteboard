import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CanvasEditor, { type CanvasEditorController } from './CanvasEditor'
import { createCanvasDocument, type CanvasDocument } from './lcanvas'
import { createElement } from './canvasOperations'
import { DEFAULT_TEXT_OPTIONS, type TextLayoutOptions } from './canvasText'

function mount(
  type: 'rectangle' | 'diamond' | 'ellipse' | 'text' = 'rectangle',
  textOptions: TextLayoutOptions = DEFAULT_TEXT_OPTIONS,
) {
  const document = createElement(createCanvasDocument('Text plan'), {
    type,
    id: 'shape',
    x: 20,
    y: 30,
    width: 180,
    height: 100,
    text: 'Original',
    color: '#00ffee',
    ...(type === 'text' ? {} : { fill: '#000000' }),
  })
  const changed = vi.fn()
  let controller: CanvasEditorController | null = null
  const rendered = render(
    <CanvasEditor
      document={document}
      grid="dots"
      aiOpen={false}
      onToggleAI={() => {}}
      onDocumentChange={changed}
      textOptions={textOptions}
      onControllerReady={(ready) => {
        controller = ready
      }}
    />,
  )
  const object = rendered.container.querySelector('[data-element-id="shape"]')!
  return {
    ...rendered,
    document,
    changed,
    object,
    latest: (): CanvasDocument => changed.mock.lastCall?.[0] ?? document,
    controller: () => {
      if (!controller) throw new Error('No editor controller')
      return controller
    },
    edit: () => {
      fireEvent.doubleClick(object)
      return screen.getByRole('textbox', { name: 'Edit object text' })
    },
  }
}

function firstHeight(document: CanvasDocument) {
  const element = document.elements[0]
  return 'height' in element ? element.height : 0
}

describe('smart inline canvas text', () => {
  it.each(['rectangle', 'diamond', 'ellipse', 'text'] as const)(
    'previews %s growth without saving and cancels all preview geometry on Escape',
    (type) => {
      const test = mount(type)
      const input = test.edit()
      fireEvent.change(input, {
        target: {
          value: 'A longer sentence that wraps onto many lines.\n'.repeat(12),
        },
      })
      expect(test.changed).not.toHaveBeenCalled()
      expect(input).toHaveValue(
        'A longer sentence that wraps onto many lines.\n'.repeat(12),
      )
      expect(input).toHaveStyle({ color: '#00ffee' })
      const editBox = input.closest('.canvas-inline-edit') as HTMLElement
      expect(Number.parseFloat(editBox.style.height)).toBeGreaterThan(100)
      if (type !== 'text')
        expect(
          test.object.querySelector('[fill="#000000"]'),
        ).toBeInTheDocument()
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(test.changed).not.toHaveBeenCalled()
      expect(test.controller().getDocument()).toEqual(test.document)
      expect(
        screen.queryByRole('textbox', { name: 'Edit object text' }),
      ).toBeNull()
    },
  )

  it('applies text and geometry together and restores both with a single undo', () => {
    const test = mount('diamond')
    const input = test.edit()
    const text = 'Full text is retained.\n'.repeat(18)
    fireEvent.change(input, { target: { value: text } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(test.changed).toHaveBeenCalledOnce()
    expect(test.latest().elements[0]).toMatchObject({
      text,
      fill: '#000000',
      color: '#00ffee',
      fontSize: 20,
    })
    expect(firstHeight(test.latest())).toBeGreaterThan(100)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.latest()).toEqual(test.document)
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(test.latest().elements[0]).toMatchObject({ text })
  })

  it('keeps the chosen dimensions when growth is off and displays every text line', () => {
    const test = mount('rectangle', {
      ...DEFAULT_TEXT_OPTIONS,
      autoGrowShapes: false,
      minTextSize: 12,
    })
    const text = Array.from({ length: 30 }, (_, index) => `Line ${index}`).join(
      '\n',
    )
    const input = test.edit()
    fireEvent.change(input, { target: { value: text } })
    fireEvent.blur(input)
    expect(test.latest().elements[0]).toMatchObject({
      width: 180,
      height: 100,
      text,
    })
    const renderedText = test.object.querySelector('text')!
    expect(renderedText).toHaveAttribute('aria-label', text)
    expect(renderedText.querySelectorAll('tspan')).toHaveLength(30)
    expect(renderedText).toHaveAttribute('font-size', '12')
    expect(renderedText).toHaveAttribute('data-text-overflow', 'true')
  })

  it('uses the same smart growth for validated MCP edits and preserves manual resize requests', () => {
    const test = mount()
    const text = 'MCP full text\n'.repeat(14)
    act(() => {
      const result = test
        .controller()
        .execute({ kind: 'update', id: 'shape', patch: { text } })
      expect(result.affectedIds).toContain('shape')
      expect(
        'height' in result.document.elements[0] &&
          result.document.elements[0].height,
      ).toBeGreaterThan(100)
    })
    act(() => {
      test
        .controller()
        .execute({ kind: 'resize', id: 'shape', width: 100, height: 40 })
    })
    expect(test.controller().getDocument().elements[0]).toMatchObject({
      width: 100,
      height: 40,
      fontSize: 20,
      text,
    })
    expect(test.object.querySelector('text')).toHaveAttribute('font-size', '8')
  })

  it('duplicates a deliberately small object without growing its copied geometry', () => {
    const test = mount()
    act(() => {
      test
        .controller()
        .execute({ kind: 'resize', id: 'shape', width: 60, height: 30 })
    })
    const stage = screen.getByRole('region', { name: 'Text plan canvas view' })
    fireEvent.pointerDown(test.object, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(stage, { clientX: 0, clientY: 0 })
    fireEvent.keyDown(stage, { key: 'd', ctrlKey: true })
    expect(test.latest().elements).toHaveLength(2)
    expect(test.latest().elements[1]).toMatchObject({
      width: 60,
      height: 30,
      text: 'Original',
      fontSize: 20,
    })
  })

  it('flushes an unfinished inline draft with its geometry before Save reads the document', () => {
    const test = mount()
    const input = test.edit()
    const text = 'Saved text\n'.repeat(15)
    fireEvent.change(input, { target: { value: text } })
    act(() => {
      test.controller().flushDraft?.()
    })
    expect(test.controller().getDocument().elements[0]).toMatchObject({ text })
    expect(firstHeight(test.controller().getDocument())).toBeGreaterThan(100)
  })
})
