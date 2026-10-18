import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './app/styles.css'
import './app/workspace-adaptable.css'
import './app/workspace-reference.css'
import './app/view-chrome.css'
import './app/workspace-polish.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
