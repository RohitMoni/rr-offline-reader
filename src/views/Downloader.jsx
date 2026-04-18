import { useState } from 'preact/hooks'
import { enqueue } from '../services/downloadManager'

export function AddNovelModal({ initialUrl, onClose }) {
  const [url, setUrl] = useState(initialUrl || '')

  function handleAdd() {
    if (!url.trim()) return
    enqueue(url.trim())
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet__header">
          <span class="sheet__title">Add Novel</span>
          <button class="btn btn--ghost" onClick={onClose} style="padding: var(--space-2)">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="sheet__body" style="padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3)">
          <input
            class="input"
            type="url"
            placeholder="https://www.royalroad.com/fiction/..."
            value={url}
            onInput={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button class="btn btn--primary" onClick={handleAdd} disabled={!url.trim()}>
            Start Download
          </button>
        </div>
      </div>
    </div>
  )
}
