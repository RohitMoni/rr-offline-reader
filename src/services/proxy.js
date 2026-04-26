const PROXY_KEY = 'rr_proxy_url'
const DEFAULT_PROXY = 'https://rr-proxy.rohitmdxb.workers.dev'

const PUBLIC_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

const REQUEST_TIMEOUT_MS = 30000
const REQUEST_ATTEMPTS = 2

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getStoredProxyUrl() {
  return localStorage.getItem(PROXY_KEY)
}

function getCustomProxy() {
  const stored = getStoredProxyUrl()
  if (stored === '') return null

  const proxyBase = stored || DEFAULT_PROXY
  return (url) => `${proxyBase}?url=${encodeURIComponent(url)}`
}

export function getProxyUrl() {
  return getStoredProxyUrl() ?? DEFAULT_PROXY
}

export function setProxyUrl(url) {
  const trimmed = url.trim()
  localStorage.setItem(PROXY_KEY, trimmed ? trimmed.replace(/\/$/, '') : '')
}

export async function fetchViaProxy(targetUrl) {
  const custom = getCustomProxy()
  const proxies = custom ? [custom, ...PUBLIC_PROXIES] : PUBLIC_PROXIES
  const errors = []

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    for (const buildUrl of proxies) {
      try {
        const res = await fetch(buildUrl(targetUrl), {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (res.ok) return res.text()
        errors.push(`HTTP ${res.status}`)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Network error')
      }
    }

    if (attempt < REQUEST_ATTEMPTS) {
      await sleep(1000 * attempt)
    }
  }

  const latestError = errors.at(-1)
  throw new Error(
    `All proxies failed${latestError ? ` (${latestError})` : ''}. Keep the app open or try again on a stronger connection.`
  )
}
