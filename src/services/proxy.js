const PROXY_KEY = 'rr_proxy_url'
const DEFAULT_PROXY = 'https://rr-proxy.rohitmdxb.workers.dev'

const PUBLIC_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

function getCustomProxy() {
  const stored = localStorage.getItem(PROXY_KEY) || DEFAULT_PROXY
  return (url) => `${stored}?url=${encodeURIComponent(url)}`
}

export function getProxyUrl() {
  return localStorage.getItem(PROXY_KEY) || DEFAULT_PROXY
}

export function setProxyUrl(url) {
  if (url) {
    localStorage.setItem(PROXY_KEY, url.replace(/\/$/, ''))
  } else {
    localStorage.removeItem(PROXY_KEY)
  }
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
