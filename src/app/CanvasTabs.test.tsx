import { useState, type ComponentProps } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CanvasTabs from './CanvasTabs'
import type { TabGroup, TabPresentation } from './workspaceSessions'

type Props = ComponentProps<typeof CanvasTabs>
const files = [
  { id: 'a', name: 'Alpha', dirty: false },
  { id: 'b', name: 'Beta', dirty: true },
  { id: 'c', name: 'Gamma', dirty: false },
]

function props(patch: Partial<Props> = {}): Props {
  return {
    ids: ['a', 'b', 'c'],
    files,
    activeId: 'c',
    tabs: [],
    groups: [],
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onOrder: vi.fn(),
    onPresentation: vi.fn(),
    onNavigate: vi.fn(),
    ...patch,
  }
}

function context(name: string) {
  fireEvent.contextMenu(screen.getByRole('tab', { name }), {
    clientX: 60,
    clientY: 40,
  })
  return screen.getByRole('dialog', { name: 'Tab actions' })
}

function tabOrder() {
  return screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))
}

function positionedDrag(
  type: string,
  element: Element,
  clientX: number,
  dataTransfer: object,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
  })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  fireEvent(element, event)
}

function InteractiveTabs() {
  const [ids, setIds] = useState(['a', 'b', 'c'])
  const [activeId, setActiveId] = useState<string | null>('c')
  const [tabs, setTabs] = useState<TabPresentation[]>([])
  const [groups, setGroups] = useState<TabGroup[]>([])
  return (
    <CanvasTabs
      {...props()}
      ids={ids}
      activeId={activeId}
      tabs={tabs}
      groups={groups}
      onOpen={setActiveId}
      onClose={(id) =>
        setIds((current) => current.filter((item) => item !== id))
      }
      onOrder={setIds}
      onPresentation={(nextTabs, nextGroups) => {
        setTabs(nextTabs)
        setGroups(nextGroups)
      }}
    />
  )
}

describe('canvas tab presentation and navigation', () => {
  it('opens normal clicks but Ctrl and Meta clicks only select tabs for batch actions', () => {
    const initial = props()
    render(<CanvasTabs {...initial} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }), {
      ctrlKey: true,
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }), {
      metaKey: true,
    })
    expect(initial.onOpen).not.toHaveBeenCalled()
    expect(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-selected', 'true')
    expect(
      screen.getByRole('tab', { name: 'Beta' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveTextContent('•')
    fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }))
    expect(initial.onOpen).toHaveBeenCalledWith('c')
    expect(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-selected', 'false')
  })

  it('pins and collapses selected tabs while keeping other tabs unchanged', () => {
    render(<InteractiveTabs />)
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }), {
      ctrlKey: true,
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }), {
      ctrlKey: true,
    })
    fireEvent.click(
      within(context('Beta')).getByRole('button', { name: 'Pin tabs' }),
    )
    expect(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-pinned', 'true')
    expect(
      screen.getByRole('tab', { name: 'Beta' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-compact', 'true')
    expect(
      screen.getByRole('tab', { name: 'Gamma' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-pinned', 'false')
    fireEvent.click(
      within(context('Beta')).getByRole('button', { name: 'Expand tabs' }),
    )
    expect(
      screen.getByRole('tab', { name: 'Beta' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-pinned', 'true')
    expect(
      screen.getByRole('tab', { name: 'Beta' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-compact', 'false')
    fireEvent.click(
      within(context('Beta')).getByRole('button', { name: 'Unpin tabs' }),
    )
    fireEvent.click(
      within(context('Beta')).getByRole('button', { name: 'Collapse tabs' }),
    )
    expect(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-pinned', 'false')
    expect(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-compact', 'true')
    fireEvent.click(
      within(context('Beta')).getByRole('button', { name: 'Expand tabs' }),
    )
    expect(
      screen.getByRole('tab', { name: 'Beta' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-compact', 'false')
  })

  it('creates one named group for selected tabs and expands it without losing the active file', () => {
    render(<InteractiveTabs />)
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }), {
      ctrlKey: true,
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }), {
      ctrlKey: true,
    })
    const menu = context('Alpha')
    fireEvent.change(
      within(menu).getByRole('textbox', { name: 'Tab group name' }),
      { target: { value: '  Planning  ' } },
    )
    fireEvent.submit(within(menu).getByRole('textbox').closest('form')!)
    expect(
      screen.getAllByRole('button', { name: 'Collapse tab group Planning' }),
    ).toHaveLength(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse tab group Planning' }),
    )
    expect(screen.queryByRole('tab', { name: 'Alpha' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Beta' })).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand tab group Planning' }),
    )
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('opens keyboard context menus, dismisses on Escape or outside pointer presses, and preserves normal navigation', () => {
    const initial = props()
    render(<CanvasTabs {...initial} />)
    const active = screen.getByRole('tab', { name: 'Gamma' })
    fireEvent.keyDown(active, { key: 'F10', shiftKey: true })
    expect(
      screen.getByRole('dialog', { name: 'Tab actions' }),
    ).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.keyDown(active, { key: 'ContextMenu' })
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.keyDown(active, { key: 'ArrowLeft' })
    expect(initial.onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ArrowLeft' }),
      'c',
    )
  })

  it('reorders with Alt arrows and clamps movement at tab boundaries', () => {
    render(<InteractiveTabs />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), {
      key: 'ArrowLeft',
      altKey: true,
    })
    expect(tabOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), {
      key: 'ArrowLeft',
      altKey: true,
    })
    expect(tabOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), {
      key: 'ArrowRight',
      altKey: true,
    })
    expect(tabOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('moves a selected tab batch in its original order during drag and ignores outside drags', () => {
    render(<InteractiveTabs />)
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }), {
      ctrlKey: true,
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }), {
      ctrlKey: true,
    })
    const transfer = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(
      screen.getByRole('tab', { name: 'Beta' }).closest('.canvas-tab')!,
      { dataTransfer: transfer },
    )
    fireEvent.drop(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab')!,
      { dataTransfer: transfer },
    )
    expect(transfer.setData).toHaveBeenCalledWith(
      'application/x-canvas-live-tab',
      'b',
    )
    expect(tabOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])
    fireEvent.drop(
      screen.getByRole('tab', { name: 'Beta' }).closest('.canvas-tab')!,
      { dataTransfer: transfer },
    )
    expect(tabOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])
  })

  it('shows the insertion side and release feedback when dragging right to the end and back left', () => {
    render(<InteractiveTabs />)
    const unit = (name: string) =>
      screen.getByRole('tab', { name }).closest('.tab-unit') as HTMLElement
    for (const [name, left] of [
      ['Alpha', 0],
      ['Beta', 100],
      ['Gamma', 200],
    ] as const) {
      vi.spyOn(unit(name), 'getBoundingClientRect').mockReturnValue({
        left,
        right: left + 100,
        width: 100,
      } as DOMRect)
    }
    const transfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab')!,
      { dataTransfer: transfer },
    )
    expect(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-dragging', 'true')
    positionedDrag('dragover', unit('Gamma'), 280, transfer)
    expect(unit('Gamma')).toHaveAttribute('data-drop-edge', 'after')
    positionedDrag('drop', unit('Gamma'), 280, transfer)
    expect(tabOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])
    expect(unit('Alpha')).toHaveAttribute('data-settling', 'true')
    expect(unit('Gamma')).not.toHaveAttribute('data-drop-edge')
    expect(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab'),
    ).toHaveAttribute('data-dragging', 'false')
    fireEvent.dragStart(
      screen.getByRole('tab', { name: 'Alpha' }).closest('.canvas-tab')!,
      { dataTransfer: transfer },
    )
    positionedDrag('dragover', unit('Beta'), 110, transfer)
    expect(unit('Beta')).toHaveAttribute('data-drop-edge', 'before')
    positionedDrag('drop', unit('Beta'), 110, transfer)
    expect(tabOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('cancels a self drag cleanly without changing order or activating another file', () => {
    const initial = props()
    render(<CanvasTabs {...initial} />)
    const tab = screen
      .getByRole('tab', { name: 'Beta' })
      .closest('.canvas-tab')!
    const transfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(tab, { dataTransfer: transfer })
    fireEvent.dragOver(tab, { dataTransfer: transfer })
    fireEvent.drop(tab, { dataTransfer: transfer })
    expect(initial.onOrder).not.toHaveBeenCalled()
    expect(initial.onOpen).not.toHaveBeenCalled()
    expect(tab).toHaveAttribute('data-dragging', 'false')
    expect(document.querySelector('[data-drop-edge]')).toBeNull()
  })

  it('close actions only emit file identifiers and retain the files collection', () => {
    const initial = props()
    render(<CanvasTabs {...initial} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }), {
      ctrlKey: true,
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }), {
      ctrlKey: true,
    })
    fireEvent.click(
      within(context('Beta')).getByRole('button', { name: 'Close tabs' }),
    )
    expect(vi.mocked(initial.onClose).mock.calls.map(([id]) => id)).toEqual([
      'a',
      'b',
    ])
    expect(files).toHaveLength(3)
    expect(initial.onOpen).not.toHaveBeenCalled()
  })
})
