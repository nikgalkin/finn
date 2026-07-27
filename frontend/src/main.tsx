import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { readVisualPreferences } from './lib/visualPreferences'
import './index.css'

document.documentElement.dataset.logoGradient = String(readVisualPreferences().logoGradient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
