import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
} from 'react'
import type { ShortcutActionId, ShortcutOverrides } from './shortcuts'
export type WorkspaceCommand = {
  id: ShortcutActionId
  label: string
  category: string
  execute: () => void
  enabled?: boolean
  scope?: 'canvas' | 'workspace'
  allowWhileTyping?: boolean
}
export type WorkspaceFileChoice = {
  id: string
  name: string
  projectName?: string
  open: () => void
}
export type Menu = 'commands' | 'files' | null
export type CommandsContext = {
  register: (owner: string, commands: WorkspaceCommand[]) => () => void
  registerFiles: (owner: string, files: WorkspaceFileChoice[]) => () => void
  commands: WorkspaceCommand[]
  files: WorkspaceFileChoice[]
  overrides: ShortcutOverrides
  assign: (id: ShortcutActionId, binding: string | undefined) => string | null
  reset: () => void
  storageError: boolean
  menu: Menu
  open: (menu: Menu) => void
  close: () => void
  run: (command: WorkspaceCommand) => void
}
export const Context = createContext<CommandsContext | null>(null)

export function useCommandsEnabled() {
  return useContext(Context) !== null
}

export function useRegisterCommands(commands: WorkspaceCommand[]) {
  const context = useContext(Context)
  const owner = useId()
  const latest = useRef(commands)
  useLayoutEffect(() => {
    latest.current = commands
  })
  const signature = JSON.stringify(
    commands.map(
      ({ id, label, category, enabled, scope, allowWhileTyping }) => ({
        id,
        label,
        category,
        enabled,
        scope,
        allowWhileTyping,
      }),
    ),
  )
  const register = context?.register
  useLayoutEffect(() => {
    if (!register) return
    const current = latest.current.map((command) => ({
      ...command,
      execute: () =>
        latest.current.find((entry) => entry.id === command.id)?.execute(),
    }))
    return register(owner, current)
  }, [register, owner, signature])
}

export function useRegisterFiles(files: WorkspaceFileChoice[]) {
  const context = useContext(Context)
  const owner = useId()
  const latest = useRef(files)
  useLayoutEffect(() => {
    latest.current = files
  })
  const signature = JSON.stringify(
    files.map(({ id, name, projectName }) => ({ id, name, projectName })),
  )
  const register = context?.registerFiles
  useLayoutEffect(() => {
    if (!register) return
    return register(
      owner,
      latest.current.map((file) => ({
        ...file,
        open: () =>
          latest.current.find((entry) => entry.id === file.id)?.open(),
      })),
    )
  }, [register, owner, signature])
}
