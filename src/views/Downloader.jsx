import { useState, useEffect } from 'preact/hooks'
import { enqueue, cancelCurrent, subscribe } from '../services/downloadManager'

export function Downloader({ initialUrl, onDone }) {
  const [url, setUrl] = useState(initialUrl || '')
  const [dlState, setDlState] = useState({ current: null, queue: [] })

  useEffect(() => subscribe(setDlState), [])

  function handleAdd() {
    if (!url.trim()) return
    enqueue(url.trim())
    setUrl('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd()
  }

  const { current, queue } = dlState
  const isIdle = !current && queue.length === 0

  return (
    <div class="downloader">
      <div class="card">
        <h2 style="margin-bottom: var(--space-4); font-size: var(--font-size-xl)">Download Novel</h2>
        <div style="display: flex; flex-direction: column; gap: var(--space-3)">
          <input
            class="input"
            type="url"
            placeholder="https://www.royalroad.com/fiction/..."
            value={url}
            onInput={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button class="btn btn--primary" onClick={handleAdd} disabled={!url.trim()}>
            Add to queue
          </button>
        </div>
      </div>

      {current && (
        <div class="card" style="margin-top: var(--space-4)">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2)">
            <span style="font-weight: 600; font-size: var(--font-size-sm)">Downloading</span>
            <button class="btn btn--ghost" style="font-size: var(--font-size-xs); color: #e05555" onClick={cancelCurrent}>
              Stop
            </button>
          </div>
          <div style="font-weight: 600; margin-bottom: var(--space-1)">{current.title}</div>
          {current.error ? (
            <p style="color: #e05555; font-size: var(--font-size-sm)">{current.error}</p>
          ) : (
            <>
              <div class="progress-bar" style="margin-bottom: var(--space-2)">
                <div
                  class="progress-bar__fill"
                  style={`width: ${current.total > 0 ? Math.round((current.done / current.total) * 100) : 0}%`}
                />
              </div>
              <div style="display: flex; justify-content: space-between">
                <span class="text-muted" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%">
                  {current.chapterTitle}
                </span>
                <span class="text-muted">{current.done} / {current.total}</span>
              </div>
            </>
          )}
        </div>
      )}

      {queue.length > 0 && (
        <div class="card" style="margin-top: var(--space-4)">
          <div style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: var(--space-3)">
            Queue ({queue.length})
          </div>
          {queue.map((item, i) => (
            <div key={i} style="font-size: var(--font-size-sm); padding: var(--space-2) 0; border-top: 1px solid var(--color-border); color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              {item.url}
            </div>
          ))}
        </div>
      )}

      {isIdle && (
        <div style="margin-top: var(--space-4); text-align: center">
          <button class="btn btn--ghost" onClick={onDone}>← Back to Library</button>
        </div>
      )}

      <style>{`
        .downloader { padding: var(--space-4); max-width: 600px; margin: 0 auto; }
      `}</style>
    </div>
  )
}
