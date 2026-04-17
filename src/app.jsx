import { useState, useEffect } from 'preact/hooks'
import { Library } from './views/Library'
import { Downloader } from './views/Downloader'
import { Reader } from './views/Reader'
import { Settings } from './views/Settings'
import { requestPersistentStorage } from './services/db'
import './styles/tokens.css'
import './styles/app.css'

export function App() {
  const [view, setView] = useState('library') // library | download | reader | settings
  const [activeNovelId, setActiveNovelId] = useState(null)

  useEffect(() => {
    requestPersistentStorage()
  }, [])

  function openReader(novelId) {
    setActiveNovelId(novelId)
    setView('reader')
  }

  if (view === 'reader' && activeNovelId) {
    return <Reader novelId={activeNovelId} onBack={() => setView('library')} />
  }

  return (
    <div id="shell" style="display: flex; flex-direction: column; height: 100%">
      <nav class="app-nav">
        <span class="app-nav__title" onClick={() => setView('library')}>RR Reader</span>
        <div class="app-nav__actions">
          {view !== 'download' && (
            <button class="btn btn--primary" style="font-size: var(--font-size-sm)" onClick={() => setView('download')}>
              + Download
            </button>
          )}
          <button class="btn btn--ghost" onClick={() => setView('settings')} title="Settings">⚙</button>
        </div>
      </nav>

      <main class="app-content">
        {view === 'library' && (
          <Library onRead={openReader} onDownload={() => setView('download')} />
        )}
        {view === 'download' && (
          <Downloader onDone={() => setView('library')} />
        )}
        {view === 'settings' && (
          <Settings onBack={() => setView('library')} />
        )}
      </main>
    </div>
  )
}
