import { useState, useEffect, useRef } from 'preact/hooks'
import { registerSW } from 'virtual:pwa-register'
import { Library } from './views/Library'
import { AddNovelModal } from './views/Downloader'
import { Reader } from './views/Reader'
import { Settings } from './views/Settings'
import { requestPersistentStorage } from './services/db'
import './styles/tokens.css'
import './styles/app.css'

export function App() {
  const [view, setView] = useState('library')
  const [activeNovelId, setActiveNovelId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addInitialUrl, setAddInitialUrl] = useState('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const updateSWRef = useRef(null)

  useEffect(() => {
    requestPersistentStorage()

    const updateSW = registerSW({
      onNeedRefresh() {
        setUpdateAvailable(true)
      },
      onRegistered(reg) {
        // Check for updates every 60s while the app is visible
        setInterval(() => {
          if (!document.hidden) reg?.update()
        }, 60_000)
      },
    })
    updateSWRef.current = updateSW
  }, [])

  function applyUpdate() {
    updateSWRef.current?.(true)
  }

  function openReader(novelId) {
    setActiveNovelId(novelId)
    setView('reader')
  }

  function openAddModal(url = '') {
    setAddInitialUrl(url)
    setShowAddModal(true)
  }

  if (view === 'reader' && activeNovelId) {
    return <Reader novelId={activeNovelId} onBack={() => setView('library')} />
  }

  return (
    <div id="shell" style="display: flex; flex-direction: column; height: 100%">
      <nav class="app-nav">
        <span class="app-nav__title" onClick={() => setView('library')}>RR Reader</span>
        <div class="app-nav__actions">
          <button class="btn btn--primary" style="gap: var(--space-1)" onClick={() => openAddModal()}>
            <span class="material-symbols-outlined" style="font-size: 18px">add</span>
            Add
          </button>
          {updateAvailable && (
            <button
              class="btn btn--ghost update-btn"
              onClick={applyUpdate}
              title="Update available — tap to reload"
              style="padding: var(--space-2); position: relative"
            >
              <span class="material-symbols-outlined" style="color: var(--color-accent)">system_update</span>
            </button>
          )}
          <button class="btn btn--ghost" onClick={() => setView('settings')} title="Settings" style="padding: var(--space-2)">
            <span class="material-symbols-outlined">settings</span>
          </button>
        </div>
      </nav>

      <main class="app-content" style="display: flex; flex-direction: column">
        {view === 'library' && (
          <Library
            onRead={openReader}
            onDownload={() => openAddModal()}
            onResume={(url) => openAddModal(url)}
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

      {showAddModal && (
        <AddNovelModal
          initialUrl={addInitialUrl}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
