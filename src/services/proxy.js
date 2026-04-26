const PROXY_KEY = 'rr_proxy_url'
const DEFAULT_PROXY = 'https://rr-proxy.rohitmdxb.workers.dev'

const PUBLIC_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

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

  for (const buildUrl of proxies) {
    try {
      const res = await fetch(buildUrl(targetUrl), {
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) return res.text()
    } catch {
      // try next proxy
    }
  }
  throw new Error('All proxies failed. Check your network or configure a custom proxy in settings.')
}
