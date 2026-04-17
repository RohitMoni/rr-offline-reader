import DOMPurify from 'dompurify'
import { fetchViaProxy } from './proxy'

// Selectors — update here if RR changes their DOM
const SELECTORS = {
  title: 'h1.font-white',
  author: '.author-name-covers a, h4.font-white a',
  cover: '.cover-art-container img, .novel-cover img',
  chapterRows: 'table#chapters tbody tr, .chapter-row',
  chapterLink: 'a[href*="/chapter/"]',
  chapterTitle: 'a[href*="/chapter/"]',
  chapterContent: '.chapter-content',
  paywallIndicator: '.subscription-notice, .patreon-notice, [class*="patreon"]',
}

function parseNovelId(url) {
  const match = url.match(/\/fiction\/(\d+)/)
  if (!match) throw new Error('Not a valid Royal Road fiction URL')
  return match[1]
}

function parseChapterId(url) {
  const match = url.match(/\/chapter\/(\d+)/)
  return match ? match[1] : null
}

function buildRRUrl(path) {
  return path.startsWith('http') ? path : `https://www.royalroad.com${path}`
}

export async function fetchNovelMeta(novelUrl) {
  const novelId = parseNovelId(novelUrl)
  const html = await fetchViaProxy(novelUrl)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const title =
    doc.querySelector(SELECTORS.title)?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    'Unknown Title'

  const author =
    doc.querySelector(SELECTORS.author)?.textContent?.trim() || 'Unknown Author'

  const coverEl = doc.querySelector(SELECTORS.cover)
  const coverUrl = coverEl?.getAttribute('src') || coverEl?.getAttribute('data-src') || null

  const chapterRows = doc.querySelectorAll(SELECTORS.chapterRows)
  const chapters = []

  chapterRows.forEach((row, index) => {
    const link = row.querySelector(SELECTORS.chapterLink)
    if (!link) return

    const href = link.getAttribute('href')
    const chapterId = parseChapterId(href)
    if (!chapterId) return

    chapters.push({
      chapterId,
      chapterIndex: index,
      title: link.textContent?.trim() || `Chapter ${index + 1}`,
      url: buildRRUrl(href),
    })
  })

  if (chapters.length === 0) {
    throw new Error('No chapters found. The URL may be invalid or the page structure has changed.')
  }

  return {
    novelId,
    title,
    author,
    coverUrl,
    totalChapters: chapters.length,
    downloadedChapters: 0,
    addedAt: Date.now(),
    updatedAt: Date.now(),
    sourceUrl: novelUrl,
    chapters,
  }
}

export async function fetchChapterContent(novelId, chapterMeta) {
  const html = await fetchViaProxy(chapterMeta.url)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  if (doc.querySelector(SELECTORS.paywallIndicator)) {
    return null // paywalled — skip
  }

  const contentEl = doc.querySelector(SELECTORS.chapterContent)
  if (!contentEl) return null

  const sanitized = DOMPurify.sanitize(contentEl.innerHTML, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr', 'img', 'a', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target'],
  })

  const wordCount = contentEl.textContent?.trim().split(/\s+/).length || 0

  return {
    novelId,
    chapterId: chapterMeta.chapterId,
    chapterIndex: chapterMeta.chapterIndex,
    title: chapterMeta.title,
    content: sanitized,
    wordCount,
    downloadedAt: Date.now(),
  }
}
