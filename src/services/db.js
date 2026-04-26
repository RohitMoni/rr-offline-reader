import { openDB } from 'idb'

const DB_NAME = 'rr-reader'
const DB_VERSION = 2

let dbPromise

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('novels')) {
          const novels = db.createObjectStore('novels', { keyPath: 'novelId' })
          novels.createIndex('addedAt', 'addedAt')
        }

        if (!db.objectStoreNames.contains('chapters')) {
          const chapters = db.createObjectStore('chapters', {
            keyPath: ['novelId', 'chapterId'],
          })
          chapters.createIndex('novelId_chapterIndex', ['novelId', 'chapterIndex'])
        }

        if (!db.objectStoreNames.contains('readingProgress')) {
          db.createObjectStore('readingProgress', { keyPath: 'novelId' })
        }

        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'url' })
        }

        if (!db.objectStoreNames.contains('downloadJobs')) {
          const jobs = db.createObjectStore('downloadJobs', { keyPath: 'sourceUrl' })
          jobs.createIndex('updatedAt', 'updatedAt')
        }
      },
    })
  }
  return dbPromise
}

export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    await navigator.storage.persist()
  }
}

// Novels
export async function saveNovel(novel) {
  const db = await getDB()
  await db.put('novels', novel)
}

export async function getNovel(novelId) {
  const db = await getDB()
  return db.get('novels', novelId)
}

export async function getAllNovels() {
  const db = await getDB()
  return db.getAllFromIndex('novels', 'addedAt')
}

export async function deleteNovel(novelId) {
  const db = await getDB()
  const novel = await db.get('novels', novelId)
  const tx = db.transaction(['novels', 'chapters', 'readingProgress', 'downloadJobs'], 'readwrite')
  await tx.objectStore('novels').delete(novelId)
  await tx.objectStore('readingProgress').delete(novelId)
  if (novel?.sourceUrl) {
    await tx.objectStore('downloadJobs').delete(novel.sourceUrl)
  }
  const chapterIndex = tx.objectStore('chapters').index('novelId_chapterIndex')
  const keys = await chapterIndex.getAllKeys(IDBKeyRange.bound([novelId, -Infinity], [novelId, Infinity]))
  for (const key of keys) {
    await tx.objectStore('chapters').delete(key)
  }
  await tx.done
}

// Chapters
export async function saveChapter(chapter) {
  const db = await getDB()
  await db.put('chapters', chapter)
}

export async function getChapter(novelId, chapterId) {
  const db = await getDB()
  return db.get('chapters', [novelId, chapterId])
}

export async function getChaptersByIndex(novelId) {
  const db = await getDB()
  return db.getAllFromIndex(
    'chapters',
    'novelId_chapterIndex',
    IDBKeyRange.bound([novelId, -Infinity], [novelId, Infinity])
  )
}

export async function getChapterCount(novelId) {
  const db = await getDB()
  const range = IDBKeyRange.bound([novelId, -Infinity], [novelId, Infinity])
  return db.countFromIndex('chapters', 'novelId_chapterIndex', range)
}

// Reading progress
export async function saveProgress(novelId, chapterId, scrollPosition) {
  const db = await getDB()
  await db.put('readingProgress', { novelId, chapterId, scrollPosition, updatedAt: Date.now() })
}

export async function getProgress(novelId) {
  const db = await getDB()
  return db.get('readingProgress', novelId)
}

// Assets
export async function saveAsset(url, blob, mimeType) {
  const db = await getDB()
  await db.put('assets', { url, blob, mimeType })
}

export async function getAsset(url) {
  const db = await getDB()
  return db.get('assets', url)
}

// Download jobs
export async function saveDownloadJob(job) {
  const db = await getDB()
  await db.put('downloadJobs', { ...job, updatedAt: Date.now() })
}

export async function getDownloadJob(sourceUrl) {
  const db = await getDB()
  return db.get('downloadJobs', sourceUrl)
}

export async function getAllDownloadJobs() {
  const db = await getDB()
  return db.getAllFromIndex('downloadJobs', 'updatedAt')
}

export async function deleteDownloadJob(sourceUrl) {
  const db = await getDB()
  await db.delete('downloadJobs', sourceUrl)
}
