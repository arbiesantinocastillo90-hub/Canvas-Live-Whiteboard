import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HotkeyOptions, {
  WorkspaceCommandsProvider,
  WorkspaceLauncher,
  WorkspaceOverlays,
} from './WorkspaceCommands'
import {
  useRegisterCommands,
  useRegisterFiles,
  type WorkspaceCommand,
  type WorkspaceFileChoice,
} from './workspaceCommandsContext'
import { SHORTCUT_STORAGE_KEY } from './shortcuts'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function Registry({
  commands,
  files,
}: {
  commands: WorkspaceCommand[]
  files: WorkspaceFileChoice[]
}) {
  useRegisterCommands(commands)
  useRegisterFiles(files)
  return null
}

function Workspace({
  commands,
  files = [],
  localKeyDown = () => undefined,
  options = false,
  modal = false,
}: {
  commands: WorkspaceCommand[]
  files?: WorkspaceFileChoice[]
  localKeyDown?: () => void
  options?: boolean
  modal?: boolean
}) {
  return (
    <WorkspaceCommandsProvider>
      <Registry commands={commands} files={files} />
      <WorkspaceLauncher />
      <button>Workspace surface</button>
      <input aria-label="Workspace search" />
      <div data-canvas-root>
        <button onKeyDown={localKeyDown}>Canvas surface</button>
        <input aria-label="Shape text" />
      </div>
      {modal && (
        <section role="dialog" aria-modal="true" aria-label="Rename canvas">
          <input aria-label="Canvas name" />
        </section>
      )}
      {options && <HotkeyOptions />}
      <WorkspaceOverlays />
    </WorkspaceCommandsProvider>
  )
}

function command(
  id: WorkspaceCommand['id'],
  label: string,
  execute = vi.fn(),
  extra: Partial<WorkspaceCommand> = {},
): WorkspaceCommand {
  return { id, label, execute, category: 'Canvas', scope: 'canvas', ...extra }
}

function press(
  target: HTMLElement,
  key: string,
  code: string,
  extra: KeyboardEventInit = {},
) {
  return fireEvent.keyDown(target, { key, code, ...extra })
}

describe('workspace command keyboard navigation', () => {
  it('shows switchers inside native fullscreen and restores their normal host on exit', () => {
    const fullscreenHost = document.createElement('div')
    document.body.append(fullscreenHost)
    let target: Element | null = fullscreenHost
    const descriptor = Object.getOwnPropertyDescriptor(
      document,
      'fullscreenElement',
    )
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => target,
    })
    try {
      render(<Workspace commands={[]} />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Open command palette' }),
      )
      expect(
        within(fullscreenHost).getByRole('dialog', { name: 'Command palette' }),
      ).toBeInTheDocument()
      target = null
      fireEvent(document, new Event('fullscreenchange'))
      expect(
        within(fullscreenHost).queryByRole('dialog'),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('dialog', { name: 'Command palette' }),
      ).toBeInTheDocument()
    } finally {
      if (descriptor)
        Object.defineProperty(document, 'fullscreenElement', descriptor)
      else Reflect.deleteProperty(document, 'fullscreenElement')
      fullscreenHost.remove()
    }
  })
  it('opens the command palette with Ctrl+P and executes the latest handler once after fuzzy search', () => {
    const oldHandler = vi.fn()
    const latestHandler = vi.fn()
    const rendered = render(
      <Workspace
        commands={[command('canvas.rectangle', 'Add rectangle', oldHandler)]}
      />,
    )
    const surface = screen.getByRole('button', { name: 'Canvas surface' })
    surface.focus()
    expect(press(surface, 'p', 'KeyP', { ctrlKey: true })).toBe(false)
    const search = screen.getByRole('combobox', { name: 'Search commands' })
    expect(search).toHaveFocus()
    fireEvent.change(search, { target: { value: 'ad rct' } })
    expect(
      screen.getByRole('option', { name: /Add rectangle/ }),
    ).toBeInTheDocument()
    rendered.rerender(
      <Workspace
        commands={[command('canvas.rectangle', 'Add rectangle', latestHandler)]}
      />,
    )
    press(search, 'Enter', 'Enter')
    expect(oldHandler).not.toHaveBeenCalled()
    expect(latestHandler).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('dialog', { name: 'Command palette' }),
    ).not.toBeInTheDocument()
  })

  it('navigates palette choices with arrows and leaves disabled actions unexecuted', () => {
    const disabled = vi.fn()
    const enabled = vi.fn()
    render(
      <Workspace
        commands={[
          command('canvas.rectangle', 'Add rectangle', disabled, {
            enabled: false,
          }),
          command('canvas.ellipse', 'Add ellipse', enabled),
        ]}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Open command palette' }),
    )
    const search = screen.getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(search, { target: { value: 'add' } })
    press(search, 'Enter', 'Enter')
    expect(disabled).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: 'Command palette' }),
    ).toBeInTheDocument()
    press(search, 'ArrowDown', 'ArrowDown')
    expect(screen.getByRole('option', { name: /Add ellipse/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    press(search, 'Enter', 'Enter')
    expect(enabled).toHaveBeenCalledTimes(1)
  })

  it('switches among supplied project files with Ctrl+O and calls only the selected file opener', () => {
    const first = vi.fn()
    const selected = vi.fn()
    const aiSideEffect = vi.fn()
    render(
      <Workspace
        commands={[
          command('file.toggleAI', 'Toggle Workspace AI', aiSideEffect),
        ]}
        files={[
          {
            id: 'one',
            name: 'Planning',
            projectName: 'Current project',
            open: first,
          },
          {
            id: 'two',
            name: 'Research notes',
            projectName: 'Current project',
            open: selected,
          },
        ]}
      />,
    )
    press(
      screen.getByRole('button', { name: 'Workspace surface' }),
      'o',
      'KeyO',
      { ctrlKey: true },
    )
    const search = screen.getByRole('combobox', { name: 'Find a canvas' })
    fireEvent.change(search, { target: { value: 'rsch' } })
    const dialog = screen.getByRole('dialog', { name: 'Quick file switcher' })
    expect(within(dialog).getAllByRole('option')).toHaveLength(1)
    expect(within(dialog).getByText('Current project')).toBeInTheDocument()
    press(search, 'Enter', 'Enter')
    expect(selected).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(aiSideEffect).not.toHaveBeenCalled()
  })

  it('closes with Escape or the backdrop, traps Tab, and restores the opening focus', () => {
    render(
      <Workspace commands={[command('canvas.rectangle', 'Add rectangle')]} />,
    )
    const surface = screen.getByRole('button', { name: 'Canvas surface' })
    surface.focus()
    press(surface, 'p', 'KeyP', { ctrlKey: true })
    const search = screen.getByRole('combobox', { name: 'Search commands' })
    const close = screen.getByRole('button', { name: 'Close switcher' })
    press(search, 'Tab', 'Tab')
    expect(close).toHaveFocus()
    press(close, 'Tab', 'Tab')
    expect(search).toHaveFocus()
    press(search, 'Tab', 'Tab', { shiftKey: true })
    expect(close).toHaveFocus()
    press(close, 'Escape', 'Escape')
    expect(surface).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    press(surface, 'o', 'KeyO', { ctrlKey: true })
    const dialog = screen.getByRole('dialog', { name: 'Quick file switcher' })
    fireEvent.pointerDown(dialog.parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(surface).toHaveFocus()
  })

  it('restricts canvas tools to the canvas and ignores text input, composition and repeated keys', () => {
    const rectangle = vi.fn()
    render(
      <Workspace
        commands={[command('canvas.rectangle', 'Add rectangle', rectangle)]}
      />,
    )
    const canvas = screen.getByRole('button', { name: 'Canvas surface' })
    press(
      screen.getByRole('button', { name: 'Workspace surface' }),
      'r',
      'KeyR',
    )
    press(screen.getByRole('textbox', { name: 'Shape text' }), 'r', 'KeyR')
    press(canvas, 'r', 'KeyR', { isComposing: true })
    press(canvas, 'r', 'KeyR', { repeat: true })
    expect(rectangle).not.toHaveBeenCalled()
    press(canvas, 'r', 'KeyR')
    expect(rectangle).toHaveBeenCalledTimes(1)
  })

  it('lets the focused Close button close the palette without running the selected command', () => {
    const rectangle = vi.fn()
    render(
      <Workspace
        commands={[command('canvas.rectangle', 'Add rectangle', rectangle)]}
      />,
    )
    const surface = screen.getByRole('button', { name: 'Canvas surface' })
    surface.focus()
    press(surface, 'p', 'KeyP', { ctrlKey: true })
    const search = screen.getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(search, { target: { value: 'add rectangle' } })
    press(search, 'Tab', 'Tab')
    const close = screen.getByRole('button', { name: 'Close switcher' })
    expect(close).toHaveFocus()
    expect(press(close, 'Enter', 'Enter')).toBe(true)
    expect(rectangle).not.toHaveBeenCalled()
    // jsdom does not generate the browser's native button click from Enter.
    fireEvent.click(close)
    expect(
      screen.queryByRole('dialog', { name: 'Command palette' }),
    ).not.toBeInTheDocument()
    expect(rectangle).not.toHaveBeenCalled()
    expect(surface).toHaveFocus()
  })

  it('does not run a palette command when Enter confirms composition or repeats', () => {
    const rectangle = vi.fn()
    render(
      <Workspace
        commands={[command('canvas.rectangle', 'Add rectangle', rectangle)]}
      />,
    )
    press(screen.getByRole('button', { name: 'Canvas surface' }), 'p', 'KeyP', {
      ctrlKey: true,
    })
    const search = screen.getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(search, { target: { value: 'add rectangle' } })
    press(search, 'Enter', 'Enter', { isComposing: true })
    press(search, 'Enter', 'Enter', { repeat: true })
    expect(rectangle).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: 'Command palette' }),
    ).toBeInTheDocument()
    press(search, 'Enter', 'Enter')
    expect(rectangle).toHaveBeenCalledTimes(1)
  })

  it('guards modal inputs and prevents canvas commands while a switcher is open', () => {
    const rectangle = vi.fn()
    render(
      <Workspace
        commands={[command('canvas.rectangle', 'Add rectangle', rectangle)]}
        modal
      />,
    )
    const modalInput = screen.getByRole('textbox', { name: 'Canvas name' })
    press(modalInput, 'p', 'KeyP', { ctrlKey: true })
    expect(
      screen.queryByRole('dialog', { name: 'Command palette' }),
    ).not.toBeInTheDocument()
    press(screen.getByRole('button', { name: 'Canvas surface' }), 'p', 'KeyP', {
      ctrlKey: true,
    })
    press(screen.getByRole('button', { name: 'Canvas surface' }), 'r', 'KeyR')
    expect(rectangle).not.toHaveBeenCalled()
  })

  it('handles Ctrl+Z during capture so local canvas handlers cannot duplicate Undo', () => {
    const undo = vi.fn()
    const local = vi.fn()
    render(
      <Workspace
        commands={[command('canvas.undo', 'Undo', undo)]}
        localKeyDown={local}
      />,
    )
    expect(
      press(
        screen.getByRole('button', { name: 'Canvas surface' }),
        'z',
        'KeyZ',
        { ctrlKey: true },
      ),
    ).toBe(false)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(local).not.toHaveBeenCalled()
  })

  it('supports explicitly permitted workspace commands while typing without taking canvas keys', () => {
    const save = vi.fn()
    render(
      <Workspace
        commands={[
          command('file.save', 'Save current canvas', save, {
            scope: 'workspace',
            allowWhileTyping: true,
          }),
        ]}
      />,
    )
    press(
      screen.getByRole('textbox', { name: 'Workspace search' }),
      's',
      'KeyS',
      { ctrlKey: true },
    )
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('leaves typing intact when global commands are customized to plain letter or Backspace keys', () => {
    localStorage.setItem(
      SHORTCUT_STORAGE_KEY,
      JSON.stringify({
        'app.palette': 'R',
        'canvas.rectangle': '',
        'file.save': 'Backspace',
      }),
    )
    const save = vi.fn()
    render(
      <Workspace
        commands={[
          command('file.save', 'Save current canvas', save, {
            scope: 'workspace',
            allowWhileTyping: true,
          }),
        ]}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Workspace search' })
    input.focus()
    expect(press(input, 'r', 'KeyR')).toBe(true)
    expect(press(input, 'Backspace', 'Backspace')).toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('dialog', { name: 'Command palette' }),
    ).not.toBeInTheDocument()
    press(
      screen.getByRole('button', { name: 'Workspace surface' }),
      'r',
      'KeyR',
    )
    expect(
      screen.getByRole('dialog', { name: 'Command palette' }),
    ).toBeInTheDocument()
  })

  it('keeps registrations optional when the editor is rendered without a workspace provider', () => {
    expect(() =>
      render(
        <Registry
          commands={[command('canvas.rectangle', 'Add rectangle')]}
          files={[]}
        />,
      ),
    ).not.toThrow()
  })
})

describe('custom shortcut controls', () => {
  it('ignores composing and repeated keys while recording a shortcut', () => {
    render(<Workspace commands={[]} options />)
    const setter = screen.getByRole('button', {
      name: 'Set shortcut for Add rectangle',
    })
    fireEvent.click(setter)
    press(setter, 'r', 'KeyR', { altKey: true, isComposing: true })
    press(setter, 'r', 'KeyR', { altKey: true, repeat: true })
    expect(setter).toHaveTextContent('Press shortcut…')
    expect(localStorage.getItem(SHORTCUT_STORAGE_KEY)).toBeNull()
    press(setter, 'r', 'KeyR', { altKey: true })
    expect(setter).toHaveTextContent('Alt+R')
    expect(
      JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY)!),
    ).toMatchObject({ 'canvas.rectangle': 'Alt+R' })
  })

  it('records a binding without running an action, rejects collisions and browser reservations, and supports clear/reset', () => {
    const rectangle = vi.fn()
    render(
      <Workspace
        commands={[command('canvas.rectangle', 'Add rectangle', rectangle)]}
        options
      />,
    )
    const setter = screen.getByRole('button', {
      name: 'Set shortcut for Add rectangle',
    })
    fireEvent.click(setter)
    press(setter, 't', 'KeyT')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Already assigned to Add text',
    )
    expect(rectangle).not.toHaveBeenCalled()
    fireEvent.click(setter)
    press(setter, 'r', 'KeyR', { ctrlKey: true })
    expect(screen.getByRole('alert')).toHaveTextContent('browser')
    fireEvent.click(setter)
    press(setter, 'r', 'KeyR', { altKey: true })
    expect(setter).toHaveTextContent('Alt+R')
    expect(rectangle).not.toHaveBeenCalled()
    expect(
      JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY)!),
    ).toMatchObject({ 'canvas.rectangle': 'Alt+R' })
    const canvas = screen.getByRole('button', { name: 'Canvas surface' })
    press(canvas, 'r', 'KeyR')
    expect(rectangle).not.toHaveBeenCalled()
    press(canvas, 'r', 'KeyR', { altKey: true })
    expect(rectangle).toHaveBeenCalledTimes(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear shortcut for Add rectangle' }),
    )
    expect(setter).toHaveTextContent('Unassigned')
    press(canvas, 'r', 'KeyR', { altKey: true })
    expect(rectangle).toHaveBeenCalledTimes(1)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Restore shortcut for Add rectangle',
      }),
    )
    expect(setter).toHaveTextContent('R')
    press(canvas, 'r', 'KeyR')
    expect(rectangle).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Reset shortcuts' }))
    expect(localStorage.getItem(SHORTCUT_STORAGE_KEY)).toBe('{}')
  })

  it('keeps custom bindings usable for the session when saving to browser storage fails', () => {
    const rectangle = vi.fn()
    render(
      <Workspace
        commands={[command('canvas.rectangle', 'Add rectangle', rectangle)]}
        options
      />,
    )
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    const setter = screen.getByRole('button', {
      name: 'Set shortcut for Add rectangle',
    })
    fireEvent.click(setter)
    press(setter, 'r', 'KeyR', { altKey: true })
    expect(screen.getByRole('status')).toHaveTextContent(
      'kept for this session',
    )
    press(screen.getByRole('button', { name: 'Canvas surface' }), 'r', 'KeyR', {
      altKey: true,
    })
    expect(rectangle).toHaveBeenCalledTimes(1)
  })
})
