export const SHORTCUT_STORAGE_KEY = 'canvas-live.shortcuts.v1'

export const shortcutActions = [
  ['app.palette', 'Command palette', 'Workspace', 'Mod+P'],
  ['app.switcher', 'Quick file switcher', 'Workspace', 'Mod+O'],
  ['app.options', 'Open Options', 'Workspace', 'Mod+,'],
  ['app.projects', 'Open Projects', 'Workspace', 'Mod+Alt+P'],
  ['app.work', 'Return to Work', 'Workspace', 'Mod+Alt+W'],
  ['app.toggleSidebar', 'Toggle left panel', 'Panels', 'Mod+Alt+L'],
  ['app.resetLayout', 'Reset panel layout', 'Panels', ''],
  ['file.toggleFiles', 'Toggle files panel', 'Panels', 'Mod+Alt+F'],
  ['file.toggleAI', 'Toggle Workspace AI', 'Panels', 'Mod+Alt+A'],
  ['canvas.toggleProperties', 'Toggle Properties', 'Panels', 'Mod+Alt+I'],
  ['file.new', 'New canvas', 'Files', 'Mod+Alt+N'],
  ['file.import', 'Import LCANVAS', 'Files', 'Mod+Alt+O'],
  ['file.save', 'Save current canvas', 'Files', 'Mod+S'],
  ['file.export', 'Export current canvas', 'Files', 'Mod+Shift+E'],
  ['file.next', 'Next canvas tab', 'Files', 'Mod+Alt+ArrowRight'],
  ['file.previous', 'Previous canvas tab', 'Files', 'Mod+Alt+ArrowLeft'],
  ['file.close', 'Close current canvas tab', 'Files', 'Mod+Shift+X'],
  ['canvas.select', 'Select tool', 'Canvas', 'V'],
  ['canvas.pan', 'Pan tool', 'Canvas', 'H'],
  ['canvas.rectangle', 'Add rectangle', 'Canvas', 'R'],
  ['canvas.ellipse', 'Add ellipse', 'Canvas', 'E'],
  ['canvas.diamond', 'Add diamond', 'Canvas', 'D'],
  ['canvas.text', 'Add text', 'Canvas', 'T'],
  ['canvas.area', 'Add area', 'Canvas', 'A'],
  ['canvas.connection', 'Connection tool', 'Canvas', 'C'],
  ['canvas.undo', 'Undo', 'Canvas', 'Mod+Z'],
  ['canvas.redo', 'Redo', 'Canvas', 'Mod+Shift+Z'],
  ['canvas.delete', 'Delete selected object', 'Canvas', 'Delete'],
  ['canvas.duplicate', 'Duplicate selected object', 'Canvas', 'Mod+D'],
  ['canvas.zoomIn', 'Zoom in', 'View', 'Mod+='],
  ['canvas.zoomOut', 'Zoom out', 'View', 'Mod+-'],
  ['canvas.resetView', 'Reset canvas view', 'View', 'Mod+0'],
  ['canvas.fitView', 'Fit canvas content', 'View', 'Shift+1'],
  ['canvas.focus', 'Toggle full screen canvas', 'View', 'Mod+Shift+F'],
] as const

export type ShortcutActionId = (typeof shortcutActions)[number][0]
export type ShortcutOverrides = Partial<Record<ShortcutActionId, string>>
const actionIds = new Set<string>(shortcutActions.map(([id]) => id))
const namedKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Delete',
  'Backspace',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Enter',
  'Escape',
  'Space',
])

export function validShortcut(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 60) return false
  if (!value) return true
  const parts = value.split('+')
  const key = parts.pop()!
  if (
    !/^[A-Z0-9]$/.test(key) &&
    ![',', '.', ';', '/', '=', '[', ']', '\\', "'", '-'].includes(key) &&
    !namedKeys.has(key)
  )
    return false
  const modifiers = ['Mod', 'Alt', 'Shift']
  return parts.every(
    (part, index) =>
      modifiers.includes(part) &&
      (index === 0 ||
        modifiers.indexOf(parts[index - 1]) < modifiers.indexOf(part)),
  )
}

export function shortcutFor(
  id: ShortcutActionId,
  overrides: ShortcutOverrides,
) {
  return overrides[id] ?? shortcutActions.find(([action]) => action === id)![3]
}

export function shortcutFromEvent(
  event: Pick<
    KeyboardEvent,
    'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  >,
) {
  if (
    ['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Process'].includes(event.key)
  )
    return null
  let key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3)
  if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5)
  if (event.code === 'Equal') key = '='
  if (event.code === 'Minus') key = '-'
  if (event.key === ' ') key = 'Space'
  const value = [
    event.ctrlKey || event.metaKey ? 'Mod' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    key,
  ]
    .filter(Boolean)
    .join('+')
  return validShortcut(value) ? value : null
}

export function shortcutProblem(value: string) {
  if (!validShortcut(value) || !value)
    return 'Choose a letter, number, or navigation key.'
  if (
    [
      'Escape',
      'Enter',
      'Space',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
    ].includes(value)
  )
    return 'This key is needed for typing or navigation. Add a modifier.'
  if (
    /^Mod\+(?:Shift\+)?(?:R|W|T|N|L|Tab)$/.test(value) ||
    value === 'Alt+ArrowLeft' ||
    value === 'Alt+ArrowRight'
  )
    return 'This shortcut is used by the browser. Choose another.'
  return null
}

export function shortcutLabel(value: string) {
  return value
    .replace('Mod', 'Ctrl')
    .replace('ArrowRight', 'Right')
    .replace('ArrowLeft', 'Left')
    .replace('ArrowUp', 'Up')
    .replace('ArrowDown', 'Down')
    .replace('=', '+')
}

export function loadShortcutOverrides(): ShortcutOverrides {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(SHORTCUT_STORAGE_KEY) ?? '{}',
    )
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const result: ShortcutOverrides = {}
    const occupied = new Set<string>()
    for (const [id] of shortcutActions) {
      const value = (raw as Record<string, unknown>)[id]
      if (
        validShortcut(value) &&
        (!value || !shortcutProblem(value)) &&
        (!value || !occupied.has(value))
      ) {
        result[id] = value
        if (value) occupied.add(value)
      }
    }
    // A custom binding must not collide with an unchanged default.
    for (let pass = 0; pass < shortcutActions.length; pass++) {
      let changed = false
      for (const [id] of shortcutActions) {
        if (!result[id]) continue
        if (
          shortcutActions.some(
            ([other]) =>
              other !== id && shortcutFor(other, result) === result[id],
          )
        ) {
          delete result[id]
          changed = true
        }
      }
      if (!changed) break
    }
    return result
  } catch {
    return {}
  }
}

export function persistShortcutOverrides(value: ShortcutOverrides) {
  try {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function isShortcutAction(value: string): value is ShortcutActionId {
  return actionIds.has(value)
}
