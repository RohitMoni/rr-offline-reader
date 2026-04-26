import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { getChaptersByIndex, saveProgress, getProgress, saveNovel, getNovel } from '../services/db'
import { subscribe } from '../services/downloadManager'
import '../styles/reader.css'

const FONT_SIZES = [14, 16, 17, 18, 20, 22, 24]
const FONT_SIZE_KEY = 'rr_font_size'

function getStoredFontSize() {
  const stored = parseInt(localStorage.getItem(FONT_SIZE_KEY))
  return FONT_SIZES.includes(stored) ? stored : 17
}

export function Reader({ novelId, onBack }) {
  const [chapters, setChapters] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fontSize, setFontSize] = useState(getStoredFontSize)
  const [dlProgress, setDlProgress] = useState(null) // { done, total } if this novel is downloading
  const contentRef = useRef(null)
  const scrollSaveTimer = useRef(null)
  const chaptersRef = useRef([])
  const currentIndexRef = useRef(0)
  const novelRef = useRef(null)
  const activeChapterId = chapters[currentIndex]?.chapterId

  useEffect(() => {
    chaptersRef.current = chapters
  }, [chapters])

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    async function load() {
      const [chapterList, progress, novelRecord] = await Promise.all([
        getChaptersByIndex(novelId),
        getProgress(novelId),
        getNovel(novelId),
      ])
      setChapters(chapterList)
      novelRef.current = novelRecord

      const preferredChapterId = progress?.chapterId || novelRecord?.lastReadChapterId
      if (preferredChapterId && chapterList.length > 0) {
        const idx = chapterList.findIndex((c) => c.chapterId === preferredChapterId)
        if (idx >= 0) setCurrentIndex(idx)
      }

      setLoading(false)
    }
    load()
  }, [novelId])

  // Append newly downloaded chapters in real time
  useEffect(() => {
    return subscribe(async ({ current }) => {
      if (current?.novelId !== novelId) {
        setDlProgress(null)
        return
      }
      setDlProgress({ done: current.done, total: current.total })
      // Reload chapter list to pick up newly saved chapters
      const updated = await getChaptersByIndex(novelId)
      setChapters(updated)
    })
  }, [novelId])

  // Restore scroll position when chapter changes
  useEffect(() => {
    if (!contentRef.current || !activeChapterId) return
    contentRef.current.scrollTop = 0
    let cancelled = false

    getProgress(novelId).then((progress) => {
      if (cancelled) return
      if (progress?.chapterId === activeChapterId && typeof progress.scrollPosition === 'number') {
        const el = contentRef.current
        if (!el) return
        const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0)
        el.scrollTop = progress.scrollPosition * maxScroll
      }
    })

    return () => {
      cancelled = true
    }
  }, [novelId, activeChapterId])

  const saveScrollProgress = useCallback(() => {
    const chapter = chaptersRef.current[currentIndexRef.current]
    if (!chapter) return Promise.resolve()

    const el = contentRef.current
    const maxScroll = el ? Math.max(el.scrollHeight - el.clientHeight, 0) : 0
    const position = el && maxScroll > 0 ? el.scrollTop / maxScroll : 0
    return saveProgress(novelId, chapter.chapterId, position)
  }, [novelId])

  const persistLastReadChapter = useCallback(async (chapterId) => {
    if (!chapterId) return

    const baseNovel = novelRef.current || await getNovel(novelId)
    if (!baseNovel || baseNovel.lastReadChapterId === chapterId) return

    const updatedNovel = { ...baseNovel, lastReadChapterId: chapterId }
    novelRef.current = updatedNovel
    await saveNovel(updatedNovel)
  }, [novelId])

  const flushReadingState = useCallback(() => {
    clearTimeout(scrollSaveTimer.current)
    const chapter = chaptersRef.current[currentIndexRef.current]
    if (!chapter) return
    void saveScrollProgress()
    void persistLastReadChapter(chapter.chapterId)
  }, [persistLastReadChapter, saveScrollProgress])

  useEffect(() => {
    return () => {
      flushReadingState()
    }
  }, [flushReadingState])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        flushReadingState()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [flushReadingState])

  function handleScroll() {
    clearTimeout(scrollSaveTimer.current)
    scrollSaveTimer.current = setTimeout(() => {
      void saveScrollProgress()
    }, 500)
  }

  async function goToChapter(index) {
    if (index < 0 || index >= chaptersRef.current.length) return

    clearTimeout(scrollSaveTimer.current)
    await saveScrollProgress()
    await persistLastReadChapter(chaptersRef.current[index]?.chapterId)
    setCurrentIndex(index)
  }

  function handleBack() {
    flushReadingState()
    onBack()
  }

  function changeFontSize(delta) {
    const current = FONT_SIZES.indexOf(fontSize)
    const next = Math.max(0, Math.min(FONT_SIZES.length - 1, current + delta))
    const newSize = FONT_SIZES[next]
    setFontSize(newSize)
    localStorage.setItem(FONT_SIZE_KEY, newSize)
  }

  if (loading) {
    return (
      <div class="reader">
        <header class="reader__header">
          <button class="btn btn--ghost" style="padding: var(--space-2)" onClick={handleBack}>
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
        </header>
        <div class="empty-state"><p>Loading chapters...</p></div>
      </div>
    )
  }

  if (chapters.length === 0) {
    return (
      <div class="reader">
        <header class="reader__header">
          <button class="btn btn--ghost" style="padding: var(--space-2)" onClick={handleBack}>
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <span class="reader__header-title">
            {dlProgress ? 'Downloading...' : 'No chapters downloaded'}
          </span>
          {dlProgress && (
            <span class="text-muted" style="font-size: var(--font-size-xs); flex-shrink: 0">
              {dlProgress.done}/{dlProgress.total}
            </span>
          )}
        </header>
        <div class="empty-state">
          {dlProgress ? (
            <>
              <p>Downloading — first chapter coming soon.</p>
              <p class="text-muted">{dlProgress.done} / {dlProgress.total} chapters</p>
            </>
          ) : (
            <>
              <p>No chapters downloaded yet.</p>
              <p class="text-muted">Go back and download the novel first.</p>
            </>
          )}
          <button class="btn btn--ghost" onClick={handleBack}>← Back to Library</button>
        </div>
      </div>
    )
  }

  const chapter = chapters[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < chapters.length - 1

  return (
    <div class="reader">
      <header class="reader__header">
        <button class="btn btn--ghost" style="padding: var(--space-2)" onClick={handleBack}>
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <span class="reader__header-title">{chapter.title}</span>
        <span class="text-muted" style="font-size: var(--font-size-xs); flex-shrink: 0; display: flex; align-items: center; gap: 4px">
          {currentIndex + 1}/{chapters.length}
          {dlProgress && <span style="color: var(--color-accent)">↓</span>}
        </span>
      </header>

      <div
        class="reader__content"
        ref={contentRef}
        onScroll={handleScroll}
      >
        <div style={`max-width: var(--reader-max-width); margin: 0 auto`}>
          <h1 class="reader__chapter-title">{chapter.title}</h1>
          <div
            class="reader__body"
            style={`font-size: ${fontSize}px`}
            dangerouslySetInnerHTML={{ __html: chapter.content }}
          />
          <div style="display: flex; justify-content: space-between; margin-top: var(--space-8); padding-bottom: var(--space-4)">
            <button class="btn btn--ghost" style="gap: var(--space-1)" onClick={() => goToChapter(currentIndex - 1)} disabled={!hasPrev}>
              <span class="material-symbols-outlined" style="font-size: 18px">arrow_back</span> Prev
            </button>
            <button class="btn btn--ghost" style="gap: var(--space-1)" onClick={() => goToChapter(currentIndex + 1)} disabled={!hasNext}>
              Next <span class="material-symbols-outlined" style="font-size: 18px">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      <footer class="reader__toolbar">
        <button class="btn btn--ghost" style="padding: var(--space-2)" onClick={() => goToChapter(currentIndex - 1)} disabled={!hasPrev}>
          <span class="material-symbols-outlined">chevron_left</span>
        </button>

        <div class="reader__toolbar-group">
          <button class="btn btn--ghost" onClick={() => changeFontSize(-1)} disabled={FONT_SIZES.indexOf(fontSize) === 0}>A-</button>
          <span class="reader__font-label">{fontSize}px</span>
          <button class="btn btn--ghost" onClick={() => changeFontSize(1)} disabled={FONT_SIZES.indexOf(fontSize) === FONT_SIZES.length - 1}>A+</button>
        </div>

        <ChapterPicker chapters={chapters} currentIndex={currentIndex} onSelect={goToChapter} />

        <button class="btn btn--ghost" style="padding: var(--space-2)" onClick={() => goToChapter(currentIndex + 1)} disabled={!hasNext}>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </footer>
    </div>
  )
}

function ChapterPicker({ chapters, currentIndex, onSelect }) {
  const [open, setOpen] = useState(false)

  return (
    <div style="position: relative">
      <button class="btn btn--ghost" style="font-size: var(--font-size-xs)" onClick={() => setOpen((o) => !o)}>
        Ch. {currentIndex + 1} ▾
      </button>
      {open && (
        <div class="chapter-picker">
          {chapters.map((ch, i) => (
            <button
              key={ch.chapterId}
              class={`chapter-picker__item${i === currentIndex ? ' chapter-picker__item--active' : ''}`}
              onClick={() => { onSelect(i); setOpen(false) }}
            >
              {ch.title}
            </button>
          ))}
          <style>{`
            .chapter-picker {
              position: absolute;
              bottom: calc(100% + 8px);
              left: 50%;
              transform: translateX(-50%);
              width: min(320px, 90vw);
              max-height: 50vh;
              overflow-y: auto;
              background: var(--color-surface);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-lg);
              box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
              z-index: 100;
              -webkit-overflow-scrolling: touch;
            }
            .chapter-picker__item {
              display: block;
              width: 100%;
              padding: var(--space-3) var(--space-4);
              text-align: left;
              background: none;
              border: none;
              border-bottom: 1px solid var(--color-border);
              color: var(--color-text);
              font-size: var(--font-size-sm);
              cursor: pointer;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .chapter-picker__item:last-child { border-bottom: none; }
            .chapter-picker__item:hover { background: var(--color-surface-2); }
            .chapter-picker__item--active { color: var(--color-accent); font-weight: 600; }
          `}</style>
        </div>
      )}
    </div>
  )
}
