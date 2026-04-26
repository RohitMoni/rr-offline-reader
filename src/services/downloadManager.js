import { fetchNovelMeta, fetchChapterContent } from './scraper'
import {
  saveNovel,
  saveChapter,
  getNovel,
  getChaptersByIndex,
  saveDownloadJob,
  getAllDownloadJobs,
  deleteDownloadJob,
} from './db'

const DELAY_MS = 600
const CHAPTER_ATTEMPTS = 3
const RESUMABLE_STATUSES = new Set(['queued', 'downloading'])

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const state = {
  current: null,  // { novelId, title, done, total, chapterTitle }
  queue: [],      // [{ url }]
  lastError: null,
  initialized: false,
  processing: false,
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

function hasPendingUrl(url) {
  return state.queue.some((q) => q.url === url) || state.current?.sourceUrl === url
}

export async function removeDownload(url) {
  const trimmed = url?.trim()
  if (!trimmed) return

  state.queue = state.queue.filter((job) => job.url !== trimmed)
  if (state.current?.sourceUrl === trimmed) {
    state.current.aborted = true
    state.current.cancelled = true
  }

  await deleteDownloadJob(trimmed)
  notify()
}

async function queuePersistedJob(url, status = 'queued') {
  await saveDownloadJob({
    sourceUrl: url,
    status,
    createdAt: Date.now(),
  })
}

function startProcessing() {
  if (!state.current && !state.processing) processNext()
}

export async function initializeDownloads() {
  if (state.initialized) {
    startProcessing()
    return
  }

  state.initialized = true
  const jobs = await getAllDownloadJobs()
  jobs
    .filter((job) => RESUMABLE_STATUSES.has(job.status))
    .forEach((job) => {
      if (!hasPendingUrl(job.sourceUrl)) {
        state.queue.push({ url: job.sourceUrl })
      }
    })

  notify()
  startProcessing()
}

export async function resumeDownloads() {
  const jobs = await getAllDownloadJobs()
  jobs
    .filter((job) => RESUMABLE_STATUSES.has(job.status))
    .forEach((job) => {
      if (!hasPendingUrl(job.sourceUrl)) {
        state.queue.push({ url: job.sourceUrl })
      }
    })

  notify()
  startProcessing()
}

export async function enqueue(url) {
  const trimmed = url.trim()
  if (!trimmed) return
  // prevent duplicate queuing
  if (hasPendingUrl(trimmed)) return
  state.lastError = null
  try {
    await queuePersistedJob(trimmed)
    state.queue.push({ url: trimmed })
    notify()
    startProcessing()
  } catch (err) {
    state.lastError = {
      sourceUrl: trimmed,
      title: 'Download failed',
      message: err instanceof Error ? err.message : 'Could not save download job',
    }
    notify()
  }
}

export function cancelCurrent() {
  if (state.current) {
    state.current.aborted = true
    state.current.cancelled = true
    deleteDownloadJob(state.current.sourceUrl).catch(() => {})
  }
}

async function processNext() {
  if (state.processing) return
  state.processing = true

  if (state.queue.length === 0) {
    state.current = null
    state.processing = false
    notify()
    return
  }

  const { url } = state.queue.shift()
  state.lastError = null
  state.current = { sourceUrl: url, novelId: null, title: 'Loading...', done: 0, total: 0, chapterTitle: '', aborted: false }
  notify()

  try {
    await saveDownloadJob({
      sourceUrl: url,
      status: 'downloading',
      title: 'Loading...',
      done: 0,
      total: 0,
      createdAt: Date.now(),
    })

    const meta = await fetchNovelMeta(url)
    if (state.current.cancelled) {
      await deleteDownloadJob(url)
      state.current = null
      state.processing = false
      notify()
      return processNext()
    }

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
      aborted: state.current.aborted,
      cancelled: state.current.cancelled,
      failed: 0,
    }
    await saveDownloadJob({
      sourceUrl: url,
      status: 'downloading',
      novelId: meta.novelId,
      title: meta.title,
      done: downloaded,
      total: meta.chapters.length,
      createdAt: Date.now(),
    })

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
      await saveDownloadJob({
        sourceUrl: url,
        status: 'downloading',
        novelId: meta.novelId,
        title: meta.title,
        done: downloaded,
        total: meta.chapters.length,
        chapterTitle: chapterMeta.title,
        createdAt: Date.now(),
      })

      if (downloadedChapterIds.has(chapterMeta.chapterId)) {
        continue
      }

      try {
        let chapter = null
        for (let attempt = 1; attempt <= CHAPTER_ATTEMPTS; attempt++) {
          try {
            chapter = await fetchChapterContent(meta.novelId, chapterMeta)
            break
          } catch (err) {
            if (attempt === CHAPTER_ATTEMPTS) throw err
            await sleep(1200 * attempt)
          }
        }

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
          await saveDownloadJob({
            sourceUrl: url,
            status: 'downloading',
            novelId: meta.novelId,
            title: meta.title,
            done: downloaded,
            total: meta.chapters.length,
            chapterTitle: chapterMeta.title,
            createdAt: Date.now(),
          })
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

    if (state.current.cancelled) {
      await deleteDownloadJob(url)
    } else if (downloaded >= meta.chapters.length) {
      await deleteDownloadJob(url)
    } else {
      await saveDownloadJob({
        sourceUrl: url,
        status: 'queued',
        novelId: meta.novelId,
        title: meta.title,
        done: downloaded,
        total: meta.chapters.length,
        createdAt: Date.now(),
      })
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
    await saveDownloadJob({
      sourceUrl: url,
      status: 'queued',
      novelId: state.current?.novelId || null,
      title: state.current?.title || 'Download failed',
      message,
      createdAt: Date.now(),
    })
    notify()
    await sleep(2000)
  }

  state.processing = false
  return processNext()
}
