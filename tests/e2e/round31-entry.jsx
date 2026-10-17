import { createRoot } from 'react-dom/client'
import { App } from '../../apps/desktop/src/renderer/app/App.tsx'
import '../../apps/desktop/src/renderer/app/style.css'
createRoot(document.getElementById('root')).render(<App />)
