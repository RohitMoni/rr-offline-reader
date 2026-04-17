import { openDB } from 'idb'

const DB_NAME = 'rr-reader'
const DB_VERSION = 1

let dbPromise

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const novels = db.createObjectStore('novels', { keyPath: 'novelId' })
        novels.createIndex('addedAt', 'addedAt')

        const chapters = db.createObjectStore('chapters', {
          keyPath: ['novelId', 'chapterId'],
        })
        chapters.createIndex('novelId_chapterIndex', ['novelId', 'chapterIndex'])

        db.createObjectStore('readingProgress', { keyPath: 'novelId' })
        db.createObjectStore('assets', { keyPath: 'url' })
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
  const tx = db.transaction(['novels', 'chapters', 'readingProgress'], 'readwrite')
  await tx.objectStore('novels').delete(novelId)
  await tx.objectStore('readingProgress').delete(novelId)
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
