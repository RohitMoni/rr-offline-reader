import { useState, useRef } from 'preact/hooks'
import { fetchNovelMeta, fetchChapterContent } from '../services/scraper'
import { saveNovel, saveChapter, getNovel } from '../services/db'

const DELAY_MS = 600

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export function Downloader({ onDone }) {
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState('idle') // idle | fetching-meta | downloading | done | error
  const [novel, setNovel] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [error, setError] = useState('')
  const abortRef = useRef(false)

  async function handleStart() {
    if (!url.trim()) return
    abortRef.current = false
    setError('')
    setPhase('fetching-meta')

    try {
      const meta = await fetchNovelMeta(url.trim())
      setNovel(meta)
      setPhase('downloading')

      const existing = await getNovel(meta.novelId)
      const novelRecord = {
        ...meta,
        chapters: undefined,
        downloadedChapters: existing?.downloadedChapters || 0,
        lastReadChapterId: existing?.lastReadChapterId || null,
      }
      await saveNovel(novelRecord)

      let downloaded = existing?.downloadedChapters || 0

      for (let i = 0; i < meta.chapters.length; i++) {
        if (abortRef.current) break
        const chapterMeta = meta.chapters[i]
        setProgress({ done: i, total: meta.chapters.length, current: chapterMeta.title })

        try {
          const chapter = await fetchChapterContent(meta.novelId, chapterMeta)
          if (chapter) {
            await saveChapter(chapter)
            downloaded++
            await saveNovel({ ...novelRecord, downloadedChapters: downloaded })
          }
        } catch {
          // skip failed chapters, continue
        }

        await sleep(DELAY_MS)
      }

      setProgress({ done: meta.chapters.length, total: meta.chapters.length, current: '' })
      setPhase('done')
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }

  function handleAbort() {
    abortRef.current = true
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

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
            disabled={phase !== 'idle' && phase !== 'error'}
          />
          {phase === 'idle' || phase === 'error' ? (
            <button class="btn btn--primary" onClick={handleStart} disabled={!url.trim()}>
              Download
            </button>
          ) : phase === 'downloading' ? (
            <button class="btn btn--danger" onClick={handleAbort}>Stop</button>
          ) : null}
        </div>

        {error && (
          <div class="downloader__error" style="margin-top: var(--space-4)">
            <p style="color: #e05555; font-size: var(--font-size-sm)">{error}</p>
          </div>
        )}
      </div>

      {phase === 'fetching-meta' && (
        <div class="card" style="margin-top: var(--space-4); text-align: center; color: var(--color-text-muted)">
          Fetching novel info...
        </div>
      )}

      {(phase === 'downloading' || phase === 'done') && novel && (
        <div class="card" style="margin-top: var(--space-4)">
          <div style="font-weight: 600; margin-bottom: var(--space-2)">{novel.title}</div>
          <div class="text-muted" style="margin-bottom: var(--space-3)">{novel.author}</div>

          <div class="progress-bar" style="margin-bottom: var(--space-2)">
            <div class="progress-bar__fill" style={`width: ${pct}%`} />
          </div>
          <div style="display: flex; justify-content: space-between">
            <span class="text-muted">
              {phase === 'done' ? 'Complete' : progress.current}
            </span>
            <span class="text-muted">{progress.done} / {progress.total}</span>
          </div>

          {phase === 'done' && (
            <button class="btn btn--primary" style="width: 100%; margin-top: var(--space-4)" onClick={onDone}>
              Go to Library
            </button>
          )}
        </div>
      )}

      <style>{`
        .downloader { padding: var(--space-4); max-width: 600px; margin: 0 auto; }
      `}</style>
    </div>
  )
}
