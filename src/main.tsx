import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No StrictMode: its double-mount would open two peer connections for the same room.
createRoot(document.getElementById('root')!).render(<App />)
