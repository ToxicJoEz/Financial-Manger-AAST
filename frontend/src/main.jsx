import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/_global.scss'
import App from './App.jsx'
import { guardNumberInputsFromWheel } from './utils/numberInputWheel'

guardNumberInputsFromWheel()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
