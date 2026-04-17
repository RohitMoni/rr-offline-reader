import { fetchNovelMeta, fetchChapterContent } from './scraper'
import { saveNovel, saveChapter, getNovel } from './db'

const DELAY_MS = 600

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const state = {
  current: null,  // { novelId, title, done, total, chapterTitle }
  queue: [],      // [{ url }]
}

const subscribers = new Set()

function notify() {
  const snapshot = {
    current: state.current ? { ...state.current } : null,
    queue: [...state.queue],
  }
  subscribers.forEach((fn) => fn(snapshot))
}

export function subscribe(fn) {
  fn({ current: state.current ? { ...state.current } : null, queue: [...state.queue] })
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getState() {
  return { current: state.current, queue: [...state.queue] }
}

export function enqueue(url) {
  const trimmed = url.trim()
  if (!trimmed) return
  // prevent duplicate queuing
  if (state.queue.some((q) => q.url === trimmed)) return
  if (state.current?.sourceUrl === trimmed) return
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
  state.current = { sourceUrl: url, novelId: null, title: 'Loading...', done: 0, total: 0, chapterTitle: '', aborted: false }
  notify()

  try {
    const meta = await fetchNovelMeta(url)
    const existing = await getNovel(meta.novelId)

    state.current = {
      sourceUrl: url,
      novelId: meta.novelId,
      title: meta.title,
      done: existing?.downloadedChapters || 0,
      total: meta.chapters.length,
      chapterTitle: '',
      aborted: false,
    }

    const novelRecord = {
      ...meta,
      chapters: undefined,
      downloadedChapters: existing?.downloadedChapters || 0,
      lastReadChapterId: existing?.lastReadChapterId || null,
    }
    await saveNovel(novelRecord)
    notify()

    let downloaded = existing?.downloadedChapters || 0

    for (let i = 0; i < meta.chapters.length; i++) {
      if (state.current.aborted) break
      const chapterMeta = meta.chapters[i]
      state.current.done = i
      state.current.chapterTitle = chapterMeta.title
      notify()

      try {
        const chapter = await fetchChapterContent(meta.novelId, chapterMeta)
        if (chapter) {
          await saveChapter(chapter)
          downloaded++
          await saveNovel({ ...novelRecord, downloadedChapters: downloaded })
          state.current.done = downloaded
          notify()
        }
      } catch {
        // skip failed chapter
      }

      await sleep(DELAY_MS)
    }
  } catch (err) {
    state.current = { ...state.current, error: err.message }
    notify()
    await sleep(2000)
  }

  processNext()
}
