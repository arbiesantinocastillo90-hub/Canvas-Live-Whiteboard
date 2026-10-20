import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasAiMini, { type CanvasAiMiniProps } from './CanvasAiMini'
import { aiMiniStorageKey, DEFAULT_AI_MINI_SETTINGS } from './useAiMiniSettings'
import { backgroundAssets } from './workspaceBackground'
import { aiMiniClientBrand } from './aiMiniClientBrand'

const SHARING: CanvasAiMiniProps['state'] = {
  status: 'sharing',
  mcpClient: 'ChatGPT',
  mcpLastSeen: null,
  lastOperation: null,
  error: null,
}
const scope = 'mini-workspace'
const saved = () => JSON.parse(localStorage.getItem(aiMiniStorageKey(scope))!)
function mount(patch: Partial<CanvasAiMiniProps> = {}) {
  const props = {
    scopeId: scope,
    state: SHARING,
    onOpenAI: vi.fn(),
    onStopSharing: vi.fn(),
    reduceMotion: false,
    ...patch,
  }
  const view = render(
    <div data-testid="pane">
      <CanvasAiMini {...props} />
    </div>,
  )
  vi.spyOn(screen.getByTestId('pane'), 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1000, 800),
  )
  return {
    ...view,
    props,
    avatar: () =>
      screen.findByRole('button', {
        name: /Canvas buddy:|Restore Canvas buddy/u,
      }),
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(backgroundAssets, 'read').mockResolvedValue(
    'blob:http://localhost/test-mini',
  )
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options)
      this.pointerId = options.pointerId ?? 1
    }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AI mini identity and activity', () => {
  it('previews appearance and both animations before sharing without implying a live connection', async () => {
    const view = mount({
      state: { ...SHARING, status: 'idle', mcpClient: null },
      settingsOpen: true,
    })
    await screen.findByRole('img', { name: 'Canvas buddy appearance preview' })
    expect(screen.getByText('Preview only')).toBeInTheDocument()
    expect(document.querySelector('.canvas-ai-mini')).not.toBeInTheDocument()
    const preview = document.querySelector('.ai-mini-settings-preview')!
    expect(preview.querySelector('.ai-mini-motion')).toHaveAttribute(
      'data-animation',
      'float',
    )
    fireEvent.change(screen.getByLabelText('Preview state'), {
      target: { value: 'working' },
    })
    expect(preview.querySelector('.ai-mini-motion')).toHaveAttribute(
      'data-animation',
      'wiggle',
    )
    expect(view.props.onStopSharing).not.toHaveBeenCalled()
    view.rerender(
      <div data-testid="pane">
        <CanvasAiMini {...view.props} reduceMotion={true} />
      </div>,
    )
    expect(preview.querySelector('.ai-mini-motion')).toHaveAttribute(
      'data-animation',
      'none',
    )
  })
  it.each([
    ['OpenAI ChatGPT', 'openai', 'openai'],
    ['Codex Desktop', 'codex', 'openai'],
    ['Claude Desktop', 'claude', 'claude'],
    ['Anthropic client', 'anthropic', 'anthropic'],
    ['Gemini', 'gemini', null],
    ['Copilot', 'copilot', null],
    ['Some GPT-like tool', 'unknown', null],
  ])('uses only the reported %s identity', (name, id, logo) => {
    expect(aiMiniClientBrand(name)).toMatchObject({ id, logo })
  })
  it('waits for explicit sharing and keeps logos outside the animated mascot', async () => {
    const view = mount({ state: { ...SHARING, status: 'idle' } })
    expect(document.querySelector('.canvas-ai-mini')).not.toBeInTheDocument()
    view.rerender(
      <div data-testid="pane">
        <CanvasAiMini {...view.props} state={SHARING} />
      </div>,
    )
    await view.avatar()
    expect(document.querySelector('.ai-mini-client-mark img')).toHaveAttribute(
      'src',
      '/assets/ai-clients/openai.svg',
    )
    expect(
      document.querySelector('.ai-mini-motion img'),
    ).not.toBeInTheDocument()
  })
  it('expires observed activity rather than pretending that a connected client is always working', async () => {
    const now = Date.now()
    const view = mount({
      state: { ...SHARING, activity: { kind: 'edit', at: now } },
    })
    await screen.findByRole('status')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Editing the shared canvas',
    )
    expect(document.querySelector('.ai-mini-motion')).toHaveAttribute(
      'data-animation',
      'wiggle',
    )
    view.rerender(
      <div>
        <CanvasAiMini
          {...view.props}
          state={{ ...SHARING, activity: { kind: 'read', at: now - 6000 } }}
        />
      </div>,
    )
    await waitFor(() =>
      expect(document.querySelector('.ai-mini-bubble')).not.toBeInTheDocument(),
    )
    expect(document.querySelector('.ai-mini-motion')).toHaveAttribute(
      'data-animation',
      'float',
    )
    view.rerender(
      <div>
        <CanvasAiMini
          {...view.props}
          state={{ ...SHARING, activity: { kind: 'read', at: now + 60_000 } }}
        />
      </div>,
    )
    expect(document.querySelector('.ai-mini-bubble')).not.toBeInTheDocument()
  })
  it('renders bounded remote operation strings as literal text', async () => {
    const operation = '<img src=x onerror="alert(1)">'
    const view = mount({
      state: {
        ...SHARING,
        mcpClient: '<script>client</script>',
        lastOperation: operation + 'a'.repeat(800),
      },
    })
    fireEvent.click(await view.avatar())
    const paragraph = document.querySelector('.ai-mini-operation')!
    expect(paragraph.textContent).toHaveLength(500)
    expect(paragraph.textContent).toContain(operation)
    expect(paragraph.querySelector('img')).toBeNull()
    expect(document.querySelector('script')).toBeNull()
  })
  it('returns to connected idle when the recent activity timer expires', async () => {
    const view = mount()
    await view.avatar()
    vi.useFakeTimers()
    view.rerender(
      <div>
        <CanvasAiMini
          {...view.props}
          state={{ ...SHARING, activity: { kind: 'read', at: Date.now() } }}
        />
      </div>,
    )
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the shared canvas',
    )
    act(() => vi.advanceTimersByTime(5000))
    expect(document.querySelector('.ai-mini-bubble')).not.toBeInTheDocument()
    expect(document.querySelector('.ai-mini-motion')).toHaveAttribute(
      'data-animation',
      'float',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Canvas buddy: Connected to the shared canvas',
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Connected to the shared canvas',
    )
  })
})

describe('interactive AI mini', () => {
  it('opens actions, minimizes, restores, and invokes connection actions', async () => {
    const view = mount()
    fireEvent.click(await view.avatar())
    fireEvent.click(screen.getByRole('button', { name: 'AI panel' }))
    expect(view.props.onOpenAI).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(view.props.onStopSharing).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize AI mini' }))
    expect(saved().minimized).toBe(true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore Canvas buddy' }),
    )
    expect(saved().minimized).toBe(false)
    expect(
      screen.getByRole('button', { name: 'Customize mini' }),
    ).toBeInTheDocument()
  })
  it('commits one bounded drag and suppresses its synthetic click', async () => {
    const view = mount()
    const button = await view.avatar()
    fireEvent.pointerDown(button, {
      button: 0,
      clientX: 850,
      clientY: 608,
      pointerId: 1,
    })
    fireEvent.pointerMove(button, { clientX: 250, clientY: 208, pointerId: 1 })
    expect(localStorage.getItem(aiMiniStorageKey(scope))).toBeNull()
    fireEvent.pointerUp(button, { pointerId: 1 })
    expect(saved()).toMatchObject({ x: 0.25, y: 0.26 })
    fireEvent.click(button)
    expect(document.querySelector('.ai-mini-bubble')).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(
      screen.getByRole('button', { name: 'Customize mini' }),
    ).toBeInTheDocument()
  })
  it.each(['pointerCancel', 'lostPointerCapture', 'Escape', 'blur'])(
    'cancels a drag on %s without persisting movement',
    async (event) => {
      const view = mount()
      const button = await view.avatar()
      const release = vi.fn()
      Object.assign(button, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => true,
        releasePointerCapture: release,
      })
      fireEvent.pointerDown(button, {
        button: 0,
        clientX: 850,
        clientY: 608,
        pointerId: 1,
      })
      fireEvent.pointerMove(button, {
        clientX: 200,
        clientY: 100,
        pointerId: 1,
      })
      if (event === 'Escape') fireEvent.keyDown(button, { key: 'Escape' })
      else if (event === 'blur') fireEvent(window, new Event('blur'))
      else if (event === 'pointerCancel')
        fireEvent.pointerCancel(button, { pointerId: 1 })
      else fireEvent.lostPointerCapture(button, { pointerId: 1 })
      expect(localStorage.getItem(aiMiniStorageKey(scope))).toBeNull()
      expect(
        document.querySelector('.canvas-ai-mini')?.getAttribute('style'),
      ).toContain('85%')
      expect(release).toHaveBeenCalledWith(1)
    },
  )
  it('moves by keyboard without leaking shortcuts to the canvas', async () => {
    const bubbled = vi.fn()
    const view = mount()
    const button = await view.avatar()
    document.addEventListener('keydown', bubbled)
    fireEvent.keyDown(button, { key: 'ArrowLeft', shiftKey: true })
    expect(saved().x).toBeCloseTo(0.75)
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    document.removeEventListener('keydown', bubbled)
    expect(saved().y).toBeCloseTo(0.78)
    expect(bubbled).not.toHaveBeenCalled()
  })
  it('customizes through the dialog and restores focus when closing it', async () => {
    const view = mount()
    const button = await view.avatar()
    fireEvent.click(button)
    const customize = screen.getByRole('button', { name: 'Customize mini' })
    customize.focus()
    fireEvent.click(customize)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Luna' },
    })
    fireEvent.change(screen.getByLabelText('Character'), {
      target: { value: 'cat' },
    })
    fireEvent.change(screen.getByLabelText('Body color'), {
      target: { value: '#112233' },
    })
    expect(saved()).toMatchObject({
      name: 'Luna',
      preset: 'cat',
      color: '#112233',
    })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(customize).toHaveFocus()
  })
  it('rejects incorrect raster bytes and retains old settings when image saving fails', async () => {
    const save = vi
      .spyOn(backgroundAssets, 'save')
      .mockRejectedValueOnce(new Error('USB removed'))
    const view = mount({ settingsOpen: true })
    await view.avatar()
    const input = screen.getByLabelText(/Custom image/u)
    fireEvent.change(input, {
      target: {
        files: [new File(['not-image'], 'fake.gif', { type: 'image/gif' })],
      },
    })
    await screen.findByRole('alert')
    expect(save).not.toHaveBeenCalled()
    fireEvent.change(input, {
      target: {
        files: [
          new File(['GIF89a' + '\0'.repeat(20)], 'real.gif', {
            type: 'image/gif',
          }),
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('USB removed'),
    )
    expect(save).toHaveBeenCalledOnce()
    expect(localStorage.getItem(aiMiniStorageKey(scope))).toBeNull()
  })
  it.each(['image/gif', 'image/webp', 'image/png'])(
    'stops custom %s playback for app reduced motion',
    async (mime) => {
      localStorage.setItem(
        aiMiniStorageKey(scope),
        JSON.stringify({
          ...DEFAULT_AI_MINI_SETTINGS,
          preset: 'custom',
          imageAssetId: 'a'.repeat(64),
          imageMime: mime,
        }),
      )
      const view = mount()
      await waitFor(() =>
        expect(
          document.querySelector('.ai-mini-custom-image'),
        ).toBeInTheDocument(),
      )
      view.rerender(
        <div>
          <CanvasAiMini {...view.props} reduceMotion />
        </div>,
      )
      expect(
        document.querySelector('.ai-mini-custom-image'),
      ).not.toBeInTheDocument()
      expect(document.querySelector('.ai-mini-motion')).toHaveAttribute(
        'data-animation',
        'none',
      )
      expect(document.querySelector('.ai-mini-mascot')).toBeInTheDocument()
    },
  )
  it('obeys the operating system motion preference and switches workspace identity without leaking settings', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const view = mount()
    await view.avatar()
    expect(document.querySelector('.ai-mini-motion')).toHaveAttribute(
      'data-animation',
      'none',
    )
    localStorage.setItem(
      aiMiniStorageKey('other'),
      JSON.stringify({
        ...DEFAULT_AI_MINI_SETTINGS,
        name: 'Other buddy',
        preset: 'orb',
      }),
    )
    view.rerender(
      <div>
        <CanvasAiMini {...view.props} scopeId="other" />
      </div>,
    )
    await screen.findByRole('button', { name: /Other buddy:/u })
    expect(
      screen.queryByRole('button', { name: /Canvas buddy:/u }),
    ).not.toBeInTheDocument()
  })
})
