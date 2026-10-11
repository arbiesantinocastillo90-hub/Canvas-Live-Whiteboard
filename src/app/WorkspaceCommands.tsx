import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  loadShortcutOverrides,
  persistShortcutOverrides,
  shortcutActions,
  shortcutFor,
  shortcutFromEvent,
  shortcutLabel,
  shortcutProblem,
  type ShortcutActionId,
  type ShortcutOverrides,
} from './shortcuts'

import {
  Context,
  type CommandsContext,
  type Menu,
  type WorkspaceCommand,
  type WorkspaceFileChoice,
} from './workspaceCommandsContext'
export type {
  WorkspaceCommand,
  WorkspaceFileChoice,
} from './workspaceCommandsContext'
export function WorkspaceCommandsProvider({
  children,
}: {
  children: ReactNode
}) {
  const [registry, setRegistry] = useState(
    new Map<string, WorkspaceCommand[]>(),
  )
  const [fileRegistry, setFileRegistry] = useState(
    new Map<string, WorkspaceFileChoice[]>(),
  )
  const [overrides, setOverrides] = useState(loadShortcutOverrides)
  const [storageError, setStorageError] = useState(false)
  const [menu, setMenu] = useState<Menu>(null)
  const origin = useRef<HTMLElement | null>(null)
  const register = useCallback(
    (owner: string, commands: WorkspaceCommand[]) => {
      setRegistry((previous) => new Map(previous).set(owner, commands))
      return () => {
        setRegistry((previous) => {
          const next = new Map(previous)
          next.delete(owner)
          return next
        })
      }
    },
    [],
  )
  const registerFiles = useCallback(
    (owner: string, files: WorkspaceFileChoice[]) => {
      setFileRegistry((previous) => new Map(previous).set(owner, files))
      return () => {
        setFileRegistry((previous) => {
          const next = new Map(previous)
          next.delete(owner)
          return next
        })
      }
    },
    [],
  )
  const registered = useMemo(
    () => Array.from(registry.values()).flat(),
    [registry],
  )
  const files = useMemo(
    () => Array.from(fileRegistry.values()).flat(),
    [fileRegistry],
  )
  const open = useCallback((next: Menu) => {
    if (!origin.current)
      origin.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
    setMenu(next)
  }, [])
  const close = useCallback(() => {
    setMenu(null)
    const previous = origin.current
    origin.current = null
    previous?.focus()
  }, [])
  const commands = useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: 'app.palette',
        label: 'Command palette',
        category: 'Workspace',
        execute: () => open('commands'),
        allowWhileTyping: true,
      },
      {
        id: 'app.switcher',
        label: 'Quick file switcher',
        category: 'Workspace',
        execute: () => open('files'),
        allowWhileTyping: true,
      },
      ...registered,
    ],
    [registered, open],
  )
  const run = useCallback(
    (command: WorkspaceCommand) => {
      if (command.enabled === false) return
      close()
      command.execute()
    },
    [close],
  )
  function save(next: ShortcutOverrides) {
    setOverrides(next)
    setStorageError(!persistShortcutOverrides(next))
  }
  function assign(id: ShortcutActionId, binding: string | undefined) {
    if (binding) {
      const problem = shortcutProblem(binding)
      if (problem) return problem
      const conflict = shortcutActions.find(
        ([other]) => other !== id && shortcutFor(other, overrides) === binding,
      )
      if (conflict)
        return `Already assigned to ${conflict[1]}. Clear that shortcut first.`
    }
    const next = { ...overrides }
    if (binding === undefined) {
      delete next[id]
      const fallback = shortcutFor(id, next)
      const conflict = shortcutActions.find(
        ([other]) =>
          other !== id && fallback && shortcutFor(other, next) === fallback,
      )
      if (conflict)
        return `The default is assigned to ${conflict[1]}. Clear that shortcut first.`
    } else next[id] = binding
    save(next)
    return null
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        !(event.target instanceof Element)
      )
        return
      const target = event.target
      if (target.closest('[data-shortcut-recorder]')) return
      if (menu && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if (
        target.closest('[aria-modal="true"]') &&
        !target.closest('[data-workspace-overlay]')
      )
        return
      if (
        target.closest('.panel-resize-handle') &&
        ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
      )
        return
      const binding = shortcutFromEvent(event)
      if (!binding) return
      const action = shortcutActions.find(
        ([id]) => shortcutFor(id, overrides) === binding,
      )
      // Conventional redo and plus-key aliases apply only while their defaults remain assigned.
      const alias =
        binding === 'Mod+Y' &&
        shortcutFor('canvas.redo', overrides) === 'Mod+Shift+Z'
          ? 'canvas.redo'
          : binding === 'Mod+Shift+=' &&
              shortcutFor('canvas.zoomIn', overrides) === 'Mod+='
            ? 'canvas.zoomIn'
            : null
      const id = action?.[0] ?? alias
      if (!id) return
      const typing = !!target.closest(
        'input, textarea, select, [contenteditable="true"]',
      )
      // Custom single keys must remain ordinary text while an editor has focus.
      if (typing && !event.ctrlKey && !event.metaKey && !event.altKey) return
      if (id === 'app.palette' || id === 'app.switcher') {
        event.preventDefault()
        event.stopPropagation()
        open(id === 'app.palette' ? 'commands' : 'files')
        return
      }
      if (menu) return
      const command = commands.find((entry) => entry.id === id)
      if (
        !command ||
        command.enabled === false ||
        (typing && !command.allowWhileTyping)
      )
        return
      if (command.scope === 'canvas' && !target.closest('[data-canvas-root]'))
        return
      event.preventDefault()
      event.stopPropagation()
      command.execute()
    }
    document.addEventListener('keydown', keydown, true)
    return () => document.removeEventListener('keydown', keydown, true)
  }, [commands, overrides, menu, close, open])
  const value = {
    register,
    registerFiles,
    commands,
    files,
    overrides,
    assign,
    reset: () => save({}),
    storageError,
    menu,
    open,
    close,
    run,
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function WorkspaceLauncher() {
  const context = useContext(Context)
  if (!context) return null
  return (
    <div className="workspace-launcher">
      <button
        className="icon-button"
        aria-label="Open command palette"
        title={`Commands · ${shortcutLabel(shortcutFor('app.palette', context.overrides))}`}
        onClick={() => context.open('commands')}
      >
        <span aria-hidden="true">⌘</span>
      </button>
      <button
        className="icon-button"
        aria-label="Open quick file switcher"
        title={`Open file · ${shortcutLabel(shortcutFor('app.switcher', context.overrides))}`}
        onClick={() => context.open('files')}
      >
        <span aria-hidden="true">⌕</span>
      </button>
    </div>
  )
}

function matches(label: string, query: string) {
  const target = label.toLocaleLowerCase()
  const search = query.trim().toLocaleLowerCase()
  let index = 0
  for (const character of search) {
    index = target.indexOf(character, index)
    if (index < 0) return false
    index++
  }
  return true
}

export function WorkspaceOverlays() {
  const context = useContext(Context)
  const [fullscreenTarget, setFullscreenTarget] = useState(
    () => document.fullscreenElement,
  )
  useEffect(() => {
    const update = () => setFullscreenTarget(document.fullscreenElement)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  const menu = context?.menu ? (
    <CommandMenu key={context.menu} context={context} />
  ) : null
  return menu && fullscreenTarget ? createPortal(menu, fullscreenTarget) : menu
}

function CommandMenu({ context }: { context: CommandsContext }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)
  const id = useId()
  const commands = context.menu === 'commands'
  const choices = commands
    ? context.commands
        .filter((command) =>
          matches(`${command.category} ${command.label}`, query),
        )
        .map((command) => ({
          id: command.id,
          label: command.label,
          detail: command.category,
          disabled: command.enabled === false,
          shortcut: shortcutLabel(shortcutFor(command.id, context.overrides)),
          run: () => context.run(command),
        }))
    : context.files
        .filter((file) => matches(file.name, query))
        .map((file) => ({
          id: file.id,
          label: file.name,
          detail: file.projectName ?? 'Canvas',
          disabled: false,
          shortcut: '',
          run: () => {
            context.close()
            file.open()
          },
        }))
  const index = Math.min(selected, Math.max(0, choices.length - 1))
  useLayoutEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    document
      .getElementById(`${id}-${index}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [id, index])
  return (
    <div
      className="command-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) context.close()
      }}
    >
      <section
        className="command-menu"
        role="dialog"
        aria-modal="true"
        aria-label={commands ? 'Command palette' : 'Quick file switcher'}
        data-workspace-overlay
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.repeat) return
          if (event.key === 'Tab') {
            event.preventDefault()
            const controls = Array.from(
              event.currentTarget.querySelectorAll<
                HTMLInputElement | HTMLButtonElement
              >('input, button:not([disabled])'),
            )
            const current = controls.findIndex(
              (control) => control === document.activeElement,
            )
            controls[
              (current + (event.shiftKey ? controls.length - 1 : 1)) %
                controls.length
            ]?.focus()
          }
          if (event.target !== input.current) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setSelected((value) =>
              choices.length
                ? (value +
                    (event.key === 'ArrowDown' ? 1 : choices.length - 1)) %
                  choices.length
                : 0,
            )
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            const choice = choices[index]
            if (choice && !choice.disabled) choice.run()
          }
        }}
      >
        <div className="command-search">
          <input
            ref={input}
            role="combobox"
            aria-label={commands ? 'Search commands' : 'Find a canvas'}
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={
              choices.length ? `${id}-${index}` : undefined
            }
            autoComplete="off"
            placeholder={commands ? 'Search commands…' : 'Find a canvas…'}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
          />
          <button
            className="icon-button"
            aria-label="Close switcher"
            onClick={context.close}
          >
            ×
          </button>
        </div>
        <div
          className="command-list"
          role="listbox"
          id={`${id}-list`}
          aria-label={commands ? 'Commands' : 'Canvas files'}
        >
          {choices.map((choice, item) => (
            <div
              key={choice.id}
              id={`${id}-${item}`}
              role="option"
              aria-selected={item === index}
              aria-disabled={choice.disabled}
              className={`command-choice ${item === index ? 'is-selected' : ''}`}
              onPointerMove={() => setSelected(item)}
              onClick={() => {
                if (!choice.disabled) choice.run()
              }}
            >
              <span>
                {choice.label}
                <small>{choice.detail}</small>
              </span>
              {choice.shortcut && <kbd>{choice.shortcut}</kbd>}
            </div>
          ))}
          {!choices.length && (
            <p className="command-empty">
              {commands
                ? 'No matching commands.'
                : 'No matching canvases in this project.'}
            </p>
          )}
        </div>
        <div className="command-hint">
          ↑ ↓ to navigate · Enter to open · Esc to close
        </div>
      </section>
    </div>
  )
}

export default function HotkeyOptions() {
  const context = useContext(Context)
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<ShortcutActionId | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!context) return null
  function change(id: ShortcutActionId, value: string | undefined) {
    setError(context!.assign(id, value))
    setRecording(null)
  }
  return (
    <section
      className="settings-card shortcut-settings"
      aria-labelledby="shortcut-heading"
    >
      <div className="settings-heading">
        <div>
          <h2 id="shortcut-heading">Keyboard shortcuts</h2>
          <p>Find a command, then choose its shortcut.</p>
        </div>
        <button
          className="text-button"
          onClick={() => {
            context.reset()
            setError(null)
            setRecording(null)
          }}
        >
          Reset shortcuts
        </button>
      </div>
      <input
        aria-label="Find a shortcut"
        placeholder="Find a command…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && (
        <p role="alert" className="file-message error">
          {error}
        </p>
      )}
      {context.storageError && (
        <p role="status">
          Shortcuts are kept for this session. Browser storage is unavailable.
        </p>
      )}
      <div className="shortcut-list">
        {shortcutActions
          .filter(([, label, category]) =>
            matches(`${category} ${label}`, query),
          )
          .map(([id, label, category]) => (
            <div className="shortcut-row" key={id}>
              <span>
                {label}
                <small>{category}</small>
              </span>
              <button
                data-shortcut-recorder={recording === id ? '' : undefined}
                className={`shortcut-key ${recording === id ? 'is-recording' : ''}`}
                aria-label={`Set shortcut for ${label}`}
                onClick={() => {
                  setRecording(id)
                  setError(null)
                }}
                onBlur={() => {
                  if (recording === id) setRecording(null)
                }}
                onKeyDown={(event) => {
                  if (recording !== id) return
                  event.preventDefault()
                  event.stopPropagation()
                  if (event.nativeEvent.isComposing || event.repeat) return
                  if (event.key === 'Escape') {
                    setRecording(null)
                    return
                  }
                  const binding = shortcutFromEvent(event.nativeEvent)
                  if (binding) change(id, binding)
                }}
              >
                {recording === id
                  ? 'Press shortcut…'
                  : shortcutLabel(shortcutFor(id, context.overrides)) ||
                    'Unassigned'}
              </button>
              <button
                className="text-button"
                aria-label={`Clear shortcut for ${label}`}
                onClick={() => change(id, '')}
              >
                Clear
              </button>
              <button
                className="text-button"
                aria-label={`Restore shortcut for ${label}`}
                onClick={() => change(id, undefined)}
              >
                Reset
              </button>
            </div>
          ))}
      </div>
    </section>
  )
}
