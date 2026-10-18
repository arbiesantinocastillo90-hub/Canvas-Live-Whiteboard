import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkspaceAppearanceOptions from './WorkspaceAppearanceOptions'
import WorkspaceIdentity from './WorkspaceIdentity'
import { DEFAULT_WORKSPACE_APPEARANCE } from './workspaceAppearance'
import ItemAppearanceDialog from './ItemAppearanceDialog'
import { backgroundAssets, useWorkspaceBackground } from './workspaceBackground'

afterEach(() => vi.restoreAllMocks())

function Options() {
  const [value, setValue] = useState({ ...DEFAULT_WORKSPACE_APPEARANCE })
  return (
    <WorkspaceAppearanceOptions
      value={value}
      onChange={setValue}
      workspaceName="Research"
    />
  )
}
describe('workspace appearance controls', () => {
  it('customizes safe typography, icon outline/fill and identity descriptions', () => {
    render(<Options />)
    fireEvent.change(screen.getByLabelText('Tagline'), {
      target: { value: 'Find connections' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'A place for evidence.' },
    })
    expect(screen.getByText('Find connections')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Workspace icon'))
    fireEvent.click(
      screen.getByRole('button', { name: 'compass workspace icon' }),
    )
    expect(
      screen.getByRole('button', { name: 'compass workspace icon' }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Icon inner color'), {
      target: { value: '#334455' },
    })
    fireEvent.change(screen.getByRole('slider', { name: 'Icon thickness' }), {
      target: { value: '2.5' },
    })
    fireEvent.click(screen.getByText('Workspace name'))
    fireEvent.change(screen.getByLabelText('Title font'), {
      target: { value: 'Georgia' },
    })
    fireEvent.change(screen.getByRole('slider', { name: 'Title weight' }), {
      target: { value: '800' },
    })
    expect(
      screen.getByRole('heading', { name: 'Current workspace' }),
    ).toHaveStyle({ fontFamily: '"Georgia", serif', fontWeight: 800 })
    fireEvent.click(
      screen.getByRole('button', { name: 'Automatic icon inner color' }),
    )
    expect(
      screen.getByRole('button', { name: 'Automatic icon inner color' }),
    ).toBeDisabled()
  })
  it('toggles gradient and resets the current workspace appearance', () => {
    render(<Options />)
    expect(screen.getByLabelText('Gradient start')).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gradient overlay' }))
    expect(screen.getByLabelText('Gradient start')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Image fit'), {
      target: { value: 'tile' },
    })
    fireEvent.change(screen.getByRole('slider', { name: 'Gradient opacity' }), {
      target: { value: '20' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset workspace appearance' }),
    )
    expect(
      screen.getByRole('checkbox', { name: 'Gradient overlay' }),
    ).not.toBeChecked()
    expect(screen.getByLabelText('Image fit')).toHaveValue('cover')
  })
  it('keeps the old background reference when a local upload fails', async () => {
    const save = vi
      .spyOn(backgroundAssets, 'save')
      .mockRejectedValueOnce(new Error('Storage is full'))
    vi.spyOn(backgroundAssets, 'read').mockResolvedValue(null)
    const onChange = vi.fn()
    render(
      <WorkspaceAppearanceOptions
        value={{
          ...DEFAULT_WORKSPACE_APPEARANCE,
          backgroundAssetId: 'b'.repeat(64),
        }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Workspace background image'), {
      target: { files: [new File(['x'], 'test.gif', { type: 'image/gif' })] },
    })
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('Storage is full')
    expect(onChange).not.toHaveBeenCalled()
    save.mockRestore()
  })
  it('attaches a successfully saved local image, then removes only its reference', async () => {
    const id = 'a'.repeat(64)
    const url = 'data:image/gif;base64,R0lGODlh'
    vi.spyOn(backgroundAssets, 'save').mockResolvedValue(id)
    vi.spyOn(backgroundAssets, 'read').mockResolvedValue(url)
    render(<Options />)
    fireEvent.change(screen.getByLabelText('Workspace background image'), {
      target: {
        files: [new File(['x'], 'animated.gif', { type: 'image/gif' })],
      },
    })
    const remove = screen.getByRole('button', { name: 'Remove image' })
    await waitFor(() => expect(remove).toBeEnabled())
    await waitFor(() =>
      expect(
        document
          .querySelector('.workspace-appearance-preview')
          ?.getAttribute('style'),
      ).toContain(url),
    )
    fireEvent.click(remove)
    expect(remove).toBeDisabled()
    expect(
      document
        .querySelector('.workspace-appearance-preview')
        ?.getAttribute('style'),
    ).not.toContain(url)
  })
  it('does not paint the old workspace image while another reference is loading', async () => {
    let finish: (url: string) => void = () => undefined
    vi.spyOn(backgroundAssets, 'read')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce('data:image/gif;base64,bmV3')
    function Background({ id }: { id: string }) {
      const url = useWorkspaceBackground(id)
      return <output aria-label="Background URL">{url ?? 'none'}</output>
    }
    const { rerender } = render(<Background id={'a'.repeat(64)} />)
    rerender(<Background id={'b'.repeat(64)} />)
    await waitFor(() =>
      expect(screen.getByLabelText('Background URL')).toHaveTextContent(
        'data:image/gif;base64,bmV3',
      ),
    )
    await act(async () => {
      finish('data:image/gif;base64,b2xk')
      await Promise.resolve()
    })
    expect(screen.getByLabelText('Background URL')).toHaveTextContent(
      'data:image/gif;base64,bmV3',
    )
  })
  it('renders supplied identity text literally and preserves selected colors', () => {
    render(
      <WorkspaceIdentity
        name="<img onerror=alert(1)>"
        appearance={{
          ...DEFAULT_WORKSPACE_APPEARANCE,
          description: '<script>alert(1)</script>',
          iconColor: '#112233',
          iconFill: '#445566',
        }}
      />,
    )
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByRole('heading')).toHaveTextContent(
      '<img onerror=alert(1)>',
    )
    expect(document.querySelector('[data-presentation-icon]')).toHaveAttribute(
      'stroke',
      '#112233',
    )
    expect(document.querySelector('[data-presentation-icon]')).toHaveAttribute(
      'fill',
      '#445566',
    )
  })
})
describe('file and project appearance dialog', () => {
  it('saves a customized project and preserves an editable modal on failure', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('Save conflict'))
      .mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    render(
      <ItemAppearanceDialog
        kind="project"
        title="Ideas"
        onSave={onSave}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'star icon' }))
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Future experiments' },
    })
    fireEvent.change(screen.getByLabelText('Accent color'), {
      target: { value: '#abcdef' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save conflict')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        icon: 'star',
        color: '#ABCDEF',
        description: 'Future experiments',
      }),
    )
  })
  it('closes with Escape and restores focus to the launching button', () => {
    const close = vi.fn()
    const { unmount } = render(
      <ItemAppearanceDialog
        kind="file"
        title="Plan"
        onSave={vi.fn()}
        onClose={close}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Close appearance' }),
    ).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    unmount()
  })
})
