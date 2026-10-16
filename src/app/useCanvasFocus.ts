import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'

export default function useCanvasFocus(
  root: RefObject<HTMLElement | null>,
  onFocusChange?: (focused: boolean) => void,
  initialFocused = false,
) {
  // A copied view restores the in-app layout without a fullscreen permission
  // request or a fit operation that would replace its captured camera.
  const [focused, setFocused] = useState(initialFocused)
  const currentFocus = useRef(initialFocused)
  const onFocusChangeRef = useRef(onFocusChange)
  const usedNativeFullscreen = useRef(false)
  const previousFocus = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    currentFocus.current = focused
    onFocusChangeRef.current = onFocusChange
  })

  function fitCanvas() {
    requestAnimationFrame(() => {
      if (!currentFocus.current) return
      root.current
        ?.querySelector<HTMLButtonElement>('[aria-label="Reset view"]')
        ?.click()
    })
  }

  function restoreLayout() {
    currentFocus.current = false
    usedNativeFullscreen.current = false
    setFocused(false)
    onFocusChange?.(false)
    requestAnimationFrame(() => previousFocus.current?.focus())
  }

  async function exit() {
    restoreLayout()
    if (
      document.fullscreenElement === root.current &&
      document.exitFullscreen
    ) {
      try {
        await document.exitFullscreen()
      } catch {
        /* Focus mode still exits. */
      }
    }
  }

  async function enter() {
    previousFocus.current = document.activeElement as HTMLElement | null
    currentFocus.current = true
    setFocused(true)
    onFocusChange?.(true)
    // Focus mode is available even in embedded browsers without native fullscreen.
    if (root.current?.requestFullscreen) {
      try {
        await root.current.requestFullscreen()
        if (!currentFocus.current) {
          if (
            document.fullscreenElement === root.current &&
            document.exitFullscreen
          )
            await document.exitFullscreen().catch(() => undefined)
          return
        }
        usedNativeFullscreen.current =
          document.fullscreenElement === root.current
      } catch {
        /* The in-app focus layout is the fallback. */
      }
    }
    fitCanvas()
  }

  useEffect(() => {
    if (currentFocus.current) onFocusChangeRef.current?.(true)
    const element = root.current
    function fullscreenChanged() {
      if (document.fullscreenElement === element) {
        usedNativeFullscreen.current = true
      } else if (usedNativeFullscreen.current) {
        currentFocus.current = false
        usedNativeFullscreen.current = false
        setFocused(false)
        onFocusChangeRef.current?.(false)
        previousFocus.current?.focus()
      }
    }
    function escape(event: KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        !currentFocus.current ||
        event.defaultPrevented
      )
        return
      currentFocus.current = false
      setFocused(false)
      onFocusChangeRef.current?.(false)
      if (document.fullscreenElement === element && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => undefined)
      }
      usedNativeFullscreen.current = false
      previousFocus.current?.focus()
    }
    document.addEventListener('fullscreenchange', fullscreenChanged)
    window.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('fullscreenchange', fullscreenChanged)
      window.removeEventListener('keydown', escape)
      if (currentFocus.current) onFocusChangeRef.current?.(false)
      currentFocus.current = false
      if (document.fullscreenElement === element && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => undefined)
      }
    }
  }, [root])

  return { focused, enter, exit, toggle: () => (focused ? exit() : enter()) }
}
