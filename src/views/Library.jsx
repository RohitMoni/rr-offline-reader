import { useState, useEffect, useRef } from 'preact/hooks'
import { getAllNovels, deleteNovel, getChaptersByIndex, saveProgress, getProgress, getNovel } from '../services/db'
import { subscribe, cancelCurrent, clearLastError, getState } from '../services/downloadManager'

export function Library({ onRead, onDownload, onResume }) {
  const [novels, setNovels] = useState([])
  const [loading, setLoading] = useState(true)
  const [chapterSheet, setChapterSheet] = useState(null) // { novelId, chapters, currentChapterId }
  const [downloadError, setDownloadError] = useState(null)
  const activeChapterRef = useRef(null)
  // Mirrors the novelIds currently in state — used to detect new novels in the subscribe callback
  const novelIdsRef = useRef(new Set())

  // Keep novelIdsRef in sync with state
  useEffect(() => {
    novelIdsRef.current = new Set(novels.map((n) => n.novelId))
  }, [novels])

  useEffect(() => {
    getAllNovels().then((list) => {
      const reversed = list.reverse()
      // Immediately apply any in-progress download state to avoid a second render flicker
      const { current, lastError } = getState()
      const merged = reversed.map((n) =>
        n.novelId === current?.novelId
          ? { ...n, downloadedChapters: current.done, _downloading: true }
          : n
      )
      setNovels(merged)
      setDownloadError(lastError)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    return subscribe(async ({ current, lastError }) => {
      setDownloadError(lastError)

      // Update any novel already in the list
      setNovels((prev) =>
        prev.map((n) => {
          if (n.novelId === current?.novelId) {
            return { ...n, downloadedChapters: current.done, _downloading: true }
          }
          return n._downloading ? { ...n, _downloading: false } : n
        })
      )

      // If the downloading novel isn't in the list yet, fetch it from DB and prepend it
      if (current?.novelId && !novelIdsRef.current.has(current.novelId)) {
        const novel = await getNovel(current.novelId)
        if (novel) {
          setNovels((prev) => {
            if (prev.some((n) => n.novelId === novel.novelId)) return prev
            return [{ ...novel, downloadedChapters: current.done, _downloading: true }, ...prev]
          })
        }
      }
    })
  }, [])

  // Scroll to active chapter after sheet opens
  useEffect(() => {
    if (chapterSheet) {
      setTimeout(() => activeChapterRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
    }
  }, [chapterSheet])

  async function handleDelete(novelId, e) {
    e.stopPropagation()
    if (!confirm('Delete this novel and all its chapters?')) return
    await deleteNovel(novelId)
    setNovels((prev) => prev.filter((n) => n.novelId !== novelId))
  }

  async function openChapterSheet(novelId, e) {
    e.stopPropagation()
    const [chapters, progress] = await Promise.all([
      getChaptersByIndex(novelId),
      getProgress(novelId),
    ])
    setChapterSheet({ novelId, chapters, currentChapterId: progress?.chapterId || null })
  }

  async function selectChapter(chapter) {
    await saveProgress(chapterSheet.novelId, chapter.chapterId, 0)
    setChapterSheet(null)
    onRead(chapterSheet.novelId)
  }

  if (loading) {
    return <div class="empty-state"><div class="empty-state__icon">📚</div><p>Loading library...</p></div>
  }

  const errorBanner = downloadError && (
    <div class="card library__alert" role="alert">
      <div>
        <div class="library__alert-title">Download issue</div>
        <div class="text-muted">
          {downloadError.title && downloadError.title !== 'Loading...' ? `${downloadError.title}: ` : ''}
          {downloadError.chapterTitle ? `${downloadError.chapterTitle}: ` : ''}
          {downloadError.message}
        </div>
      </div>
      <button class="btn btn--ghost" style="padding: var(--space-2)" onClick={clearLastError} title="Dismiss">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  )

  if (novels.length === 0) {
    return (
      <div class="library">
        {errorBanner}
        <div class="empty-state">
          <div class="empty-state__icon">📚</div>
          <p>Your library is empty.</p>
          <button class="btn btn--primary" onClick={onDownload}>Add a novel</button>
        </div>
      </div>
    )
  }

  return (
    <div class="library">
      {errorBanner}
      <div class="library__grid">
        {novels.map((novel) => {
          const pct = novel.totalChapters > 0
            ? Math.min(100, Math.round((novel.downloadedChapters / novel.totalChapters) * 100))
            : 0
          const isIncomplete = novel.downloadedChapters < novel.totalChapters
          return (
            <div class="library__card card" key={novel.novelId} onClick={() => onRead(novel.novelId)}>
              {novel.coverUrl && (
                <img class="library__cover" src={novel.coverUrl} alt="" loading="lazy" />
              )}
              <div class="library__info">
                <div class="library__title">{novel.title}</div>
                <div class="text-muted">{novel.author}</div>
                <div class="text-muted" style="margin-top: 0.25rem">
                  {novel.downloadedChapters} / {novel.totalChapters} chapters
                  {isIncomplete && novel.downloadedChapters > 0 && !novel._downloading && (
                    <span style="color: var(--color-warning); margin-left: 0.4rem">· incomplete</span>
                  )}
                </div>
                <div class="progress-bar" style="margin-top: 0.5rem">
                  <div
                    class={`progress-bar__fill${novel._downloading ? ' progress-bar__fill--active' : ''}`}
                    style={`width: ${pct}%`}
                  />
                </div>
                {novel._downloading && (
                  <button
                    class="btn btn--ghost"
                    style="margin-top: 0.5rem; font-size: var(--font-size-xs); padding: 2px 8px; color: #e05555; gap: 4px"
                    onClick={(e) => { e.stopPropagation(); cancelCurrent() }}
                  >
                    <span class="material-symbols-outlined" style="font-size: 14px">stop_circle</span>
                    Stop
                  </button>
                )}
                {isIncomplete && !novel._downloading && novel.downloadedChapters > 0 && (
                  <button
                    class="btn btn--ghost"
                    style="margin-top: 0.5rem; font-size: var(--font-size-xs); padding: 2px 8px; color: var(--color-accent); gap: 4px"
                    onClick={(e) => { e.stopPropagation(); onResume?.(novel.sourceUrl) }}
                  >
                    <span class="material-symbols-outlined" style="font-size: 14px">refresh</span>
                    Resume download
                  </button>
                )}
              </div>
              <div class="library__actions">
                <button
                  class="btn btn--ghost"
                  style="padding: var(--space-2)"
                  onClick={(e) => openChapterSheet(novel.novelId, e)}
                  title="Chapters"
                >
                  <span class="material-symbols-outlined">format_list_bulleted</span>
                </button>
                <button
                  class="btn btn--ghost"
                  style="padding: var(--space-2); color: #e05555"
                  onClick={(e) => handleDelete(novel.novelId, e)}
                  title="Delete"
                >
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {chapterSheet && (
        <div class="sheet-backdrop" onClick={() => setChapterSheet(null)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <div class="sheet__header">
              <span class="sheet__title">Chapters</span>
              <button class="btn btn--ghost" style="padding: var(--space-2)" onClick={() => setChapterSheet(null)}>
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="sheet__body">
              {chapterSheet.chapters.length === 0 ? (
                <p style="padding: var(--space-4); color: var(--color-text-muted); text-align: center">No chapters downloaded yet.</p>
              ) : (
                chapterSheet.chapters.map((ch, i) => {
                  const isActive = ch.chapterId === chapterSheet.currentChapterId
                  return (
                    <button
                      key={ch.chapterId}
                      ref={isActive ? activeChapterRef : null}
                      class={`sheet__item${isActive ? ' sheet__item--active' : ''}`}
                      onClick={() => selectChapter(ch)}
                    >
                      <span class="sheet__item-num">{i + 1}</span>
                      <span class="sheet__item-title">{ch.title}</span>
                      {isActive && <span class="material-symbols-outlined" style="font-size: 16px; flex-shrink: 0; color: var(--color-accent)">bookmark</span>}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .library { padding: var(--space-4); }
        .library__grid { display: flex; flex-direction: column; gap: var(--space-3); }
        .library__alert {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: var(--space-3);
          margin-bottom: var(--space-4);
          border-color: var(--color-warning);
        }
        .library__alert-title {
          font-size: var(--font-size-sm);
          font-weight: 700;
          margin-bottom: var(--space-1);
        }
        .library__card {
          display: grid;
          grid-template-columns: 64px 1fr auto;
          gap: var(--space-3);
          align-items: start;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .library__card:hover { border-color: var(--color-accent); }
        .library__cover {
          width: 64px;
          height: 90px;
          object-fit: cover;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        .library__info { flex: 1; min-width: 0; }
        .library__title {
          font-weight: 600;
          font-size: var(--font-size-base);
          margin-bottom: 0.15rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .library__actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1);
          align-self: start;
        }
      `}</style>
    </div>
  )
}
