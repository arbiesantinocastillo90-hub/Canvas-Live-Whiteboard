import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('workspace startup', () => {
  it('mounts a usable shell and truthfully reports its unavailable features', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Make space for your thinking.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('AI not connected')
    expect(
      screen.getByText('This preview is not an editable board yet.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Canvas Live home' }),
    ).toHaveAttribute('href', '/')
  })
})
