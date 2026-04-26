import { fetchNovelMeta, fetchChapterContent } from './scraper'
import { saveNovel, saveChapter, getNovel, getChaptersByIndex } from './db'

const DELAY_MS = 600

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const state = {
  current: null,  // { novelId, title, done, total, chapterTitle }
  queue: [],      // [{ url }]
  lastError: null,
}

const subscribers = new Set()

function getSnapshot() {
  return {
    current: state.current ? { ...state.current } : null,
    queue: [...state.queue],
    lastError: state.lastError ? { ...state.lastError } : null,
  }
}

function notify() {
  const snapshot = getSnapshot()
  subscribers.forEach((fn) => fn(snapshot))
}

export function subscribe(fn) {
  fn(getSnapshot())
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getState() {
  return getSnapshot()
}

export function clearLastError() {
  if (!state.lastError) return
  state.lastError = null
  notify()
}

export function enqueue(url) {
  const trimmed = url.trim()
  if (!trimmed) return
  // prevent duplicate queuing
  if (state.queue.some((q) => q.url === trimmed)) return
  if (state.current?.sourceUrl === trimmed) return
  state.lastError = null
  state.queue.push({ url: trimmed })
  notify()
  if (!state.current) processNext()
}

export function cancelCurrent() {
  if (state.current) state.current.aborted = true
}

async function processNext() {
  if (state.queue.length === 0) {
    state.current = null
    notify()
    return
  }

  const { url } = state.queue.shift()
  state.lastError = null
  state.current = { sourceUrl: url, novelId: null, title: 'Loading...', done: 0, total: 0, chapterTitle: '', aborted: false }
  notify()

  try {
    const meta = await fetchNovelMeta(url)
    const [existing, existingChapters] = await Promise.all([
      getNovel(meta.novelId),
      getChaptersByIndex(meta.novelId),
    ])
    const downloadedChapterIds = new Set(existingChapters.map((chapter) => chapter.chapterId))
    let downloaded = downloadedChapterIds.size
    const metaWithoutChapters = { ...meta }
    delete metaWithoutChapters.chapters

    state.current = {
      sourceUrl: url,
      novelId: meta.novelId,
      title: meta.title,
      done: downloaded,
      total: meta.chapters.length,
      chapterTitle: '',
      aborted: false,
      failed: 0,
    }

    let novelRecord = {
      ...metaWithoutChapters,
      downloadedChapters: downloaded,
      lastReadChapterId: existing?.lastReadChapterId || null,
      addedAt: existing?.addedAt || meta.addedAt,
      updatedAt: Date.now(),
    }
    await saveNovel(novelRecord)
    notify()

    for (let i = 0; i < meta.chapters.length; i++) {
      if (state.current.aborted) break
      const chapterMeta = meta.chapters[i]
      state.current.chapterTitle = chapterMeta.title
      notify()

      if (downloadedChapterIds.has(chapterMeta.chapterId)) {
        continue
      }

      try {
        const chapter = await fetchChapterContent(meta.novelId, chapterMeta)
        if (chapter) {
          await saveChapter(chapter)
          downloadedChapterIds.add(chapterMeta.chapterId)
          downloaded = downloadedChapterIds.size
          novelRecord = {
            ...novelRecord,
            downloadedChapters: downloaded,
            updatedAt: Date.now(),
          }
          await saveNovel(novelRecord)
          state.current.done = downloaded
          notify()
        }
      } catch (err) {
        state.current.failed += 1
        state.lastError = {
          sourceUrl: url,
          novelId: meta.novelId,
          title: meta.title,
          chapterTitle: chapterMeta.title,
          message: err instanceof Error ? err.message : 'Unknown download error',
        }
        notify()
      }

      await sleep(DELAY_MS)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown download error'
    state.current = { ...state.current, error: message }
    state.lastError = {
      sourceUrl: url,
      novelId: state.current?.novelId || null,
      title: state.current?.title || 'Download failed',
      message,
    }
    notify()
    await sleep(2000)
  }

  return processNext()
}
