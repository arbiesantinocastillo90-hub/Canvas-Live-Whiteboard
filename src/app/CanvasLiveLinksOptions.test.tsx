import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CanvasLiveLinksOptions from './CanvasLiveLinksOptions'
import { DEFAULT_LINK_OPTIONS } from './liveViewLinks'

describe('Canvas Live Links settings', () => {
  it('exposes independent link, startup, camera and layout choices without changing unrelated options', () => {
    const onChange = vi.fn()
    render(
      <CanvasLiveLinksOptions
        value={DEFAULT_LINK_OPTIONS}
        onChange={onChange}
      />,
    )
    expect(
      screen.getByRole('region', { name: 'Canvas Live Links' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Copy exact view links' }),
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Copy latest view links' }),
    )
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Resume latest workspace on startup',
      }),
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Remember camera positions' }),
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Remember panel layout' }),
    )
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      { ...DEFAULT_LINK_OPTIONS, exactEnabled: false },
      { ...DEFAULT_LINK_OPTIONS, latestEnabled: false },
      { ...DEFAULT_LINK_OPTIONS, resumeLatest: false },
      { ...DEFAULT_LINK_OPTIONS, rememberCamera: false },
      { ...DEFAULT_LINK_OPTIONS, rememberPanels: false },
    ])
  })

  it('keeps controls usable and explains when browser persistence is unavailable', () => {
    const onChange = vi.fn()
    render(
      <CanvasLiveLinksOptions
        value={DEFAULT_LINK_OPTIONS}
        onChange={onChange}
        localStorageAvailable={false}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'apply to this session',
    )
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Resume latest workspace on startup',
      }),
    )
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_LINK_OPTIONS,
      resumeLatest: false,
    })
  })
})
