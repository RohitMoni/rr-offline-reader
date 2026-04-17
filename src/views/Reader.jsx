import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { getChaptersByIndex, saveProgress, getProgress, saveNovel, getNovel } from '../services/db'
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
  const contentRef = useRef(null)
  const scrollSaveTimer = useRef(null)

  useEffect(() => {
    async function load() {
      const [chapterList, progress] = await Promise.all([
        getChaptersByIndex(novelId),
        getProgress(novelId),
      ])
      setChapters(chapterList)

      if (progress && chapterList.length > 0) {
        const idx = chapterList.findIndex((c) => c.chapterId === progress.chapterId)
        if (idx >= 0) setCurrentIndex(idx)
      }

      setLoading(false)
    }
    load()
  }, [novelId])

  // Restore scroll position when chapter changes
  useEffect(() => {
    if (!contentRef.current || chapters.length === 0) return
    contentRef.current.scrollTop = 0

    getProgress(novelId).then((progress) => {
      if (progress?.chapterId === chapters[currentIndex]?.chapterId && progress.scrollPosition) {
        const el = contentRef.current
        if (el) el.scrollTop = progress.scrollPosition * el.scrollHeight
      }
    })
  }, [currentIndex, chapters.length])

  const saveScrollProgress = useCallback(() => {
    if (!contentRef.current || chapters.length === 0) return
    const el = contentRef.current
    const position = el.scrollHeight > 0 ? el.scrollTop / el.scrollHeight : 0
    const chapter = chapters[currentIndex]
    if (chapter) saveProgress(novelId, chapter.chapterId, position)
  }, [novelId, currentIndex, chapters])

  function handleScroll() {
    clearTimeout(scrollSaveTimer.current)
    scrollSaveTimer.current = setTimeout(saveScrollProgress, 500)
  }

  async function goToChapter(index) {
    saveScrollProgress()
    setCurrentIndex(index)
    // update lastReadChapterId on the novel record
    const novel = await getNovel(novelId)
    if (novel) {
      await saveNovel({ ...novel, lastReadChapterId: chapters[index]?.chapterId })
    }
  }

  function changeFontSize(delta) {
    const current = FONT_SIZES.indexOf(fontSize)
    const next = Math.max(0, Math.min(FONT_SIZES.length - 1, current + delta))
    const newSize = FONT_SIZES[next]
    setFontSize(newSize)
    localStorage.setItem(FONT_SIZE_KEY, newSize)
  }

  if (loading) {
    return <div class="empty-state"><p>Loading chapters...</p></div>
  }

  if (chapters.length === 0) {
    return (
      <div class="empty-state">
        <p>No chapters downloaded yet.</p>
        <button class="btn btn--ghost" onClick={onBack}>← Back</button>
      </div>
    )
  }

  const chapter = chapters[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < chapters.length - 1

  return (
    <div class="reader">
      <header class="reader__header">
        <button class="btn btn--ghost" style="padding: var(--space-1) var(--space-2)" onClick={onBack}>←</button>
        <span class="reader__header-title">{chapter.title}</span>
        <span class="text-muted" style="font-size: var(--font-size-xs); flex-shrink: 0">
          {currentIndex + 1}/{chapters.length}
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
            <button class="btn btn--ghost" onClick={() => goToChapter(currentIndex - 1)} disabled={!hasPrev}>← Prev</button>
            <button class="btn btn--ghost" onClick={() => goToChapter(currentIndex + 1)} disabled={!hasNext}>Next →</button>
          </div>
        </div>
      </div>

      <footer class="reader__toolbar">
        <button class="btn btn--ghost" onClick={() => goToChapter(currentIndex - 1)} disabled={!hasPrev}>‹</button>

        <div class="reader__toolbar-group">
          <button class="btn btn--ghost" onClick={() => changeFontSize(-1)} disabled={FONT_SIZES.indexOf(fontSize) === 0}>A-</button>
          <span class="reader__font-label">{fontSize}px</span>
          <button class="btn btn--ghost" onClick={() => changeFontSize(1)} disabled={FONT_SIZES.indexOf(fontSize) === FONT_SIZES.length - 1}>A+</button>
        </div>

        <ChapterPicker chapters={chapters} currentIndex={currentIndex} onSelect={goToChapter} />

        <button class="btn btn--ghost" onClick={() => goToChapter(currentIndex + 1)} disabled={!hasNext}>›</button>
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
