import { useState, useEffect } from 'preact/hooks'
import { Library } from './views/Library'
import { Downloader } from './views/Downloader'
import { Reader } from './views/Reader'
import { Settings } from './views/Settings'
import { requestPersistentStorage } from './services/db'
import { subscribe } from './services/downloadManager'
import './styles/tokens.css'
import './styles/app.css'

export function App() {
  const [view, setView] = useState('library')
  const [activeNovelId, setActiveNovelId] = useState(null)
  const [resumeUrl, setResumeUrl] = useState(null)
  const [dlState, setDlState] = useState({ current: null, queue: [] })

  useEffect(() => {
    requestPersistentStorage()
    return subscribe(setDlState)
  }, [])

  function openReader(novelId) {
    setActiveNovelId(novelId)
    setView('reader')
  }

  const isDownloading = !!dlState.current && !dlState.current.error
  const dlPct = isDownloading && dlState.current.total > 0
    ? Math.round((dlState.current.done / dlState.current.total) * 100)
    : 0

  if (view === 'reader' && activeNovelId) {
    return <Reader novelId={activeNovelId} onBack={() => setView('library')} />
  }

  return (
    <div id="shell" style="display: flex; flex-direction: column; height: 100%">
      <nav class="app-nav">
        <span class="app-nav__title" onClick={() => setView('library')}>RR Reader</span>
        <div class="app-nav__actions">
          {isDownloading && view !== 'download' && (
            <button
              class="btn btn--ghost"
              style="font-size: var(--font-size-xs); color: var(--color-accent); gap: var(--space-1)"
              onClick={() => setView('download')}
            >
              ↓ {dlPct}%
            </button>
          )}
          {view !== 'download' && (
            <button
              class="btn btn--primary"
              style="font-size: var(--font-size-sm)"
              onClick={() => setView('download')}
            >
              + Download
            </button>
          )}
          <button class="btn btn--ghost" onClick={() => setView('settings')} title="Settings">⚙</button>
        </div>
      </nav>

      <main class="app-content" style="display: flex; flex-direction: column">
        {view === 'library' && (
          <Library
            onRead={openReader}
            onDownload={() => setView('download')}
            onResume={(url) => { setResumeUrl(url); setView('download') }}
          />
        )}
        {view === 'download' && (
          <Downloader
            initialUrl={resumeUrl}
            onDone={() => { setResumeUrl(null); setView('library') }}
          />
        )}
        {view === 'settings' && (
          <Settings onBack={() => setView('library')} />
        )}
        <div style="flex: 1" />
        <div style="text-align: center; padding: var(--space-3) var(--space-4) calc(var(--safe-bottom) + var(--space-3)); font-size: 11px; color: var(--color-text-muted); opacity: 0.5; user-select: none">
          v{__APP_VERSION__}
        </div>
      </main>
    </div>
  )
}
