import { useState } from 'preact/hooks'
import { getProxyUrl, setProxyUrl } from '../services/proxy'

export function Settings({ onBack }) {
  const [proxyUrl, setProxyUrlState] = useState(getProxyUrl)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setProxyUrl(proxyUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style="padding: var(--space-4); max-width: 600px; margin: 0 auto">
      <button class="btn btn--ghost" style="margin-bottom: var(--space-4)" onClick={onBack}>← Back</button>
      <div class="card">
        <h2 style="font-size: var(--font-size-xl); margin-bottom: var(--space-4)">Settings</h2>

        <div style="display: flex; flex-direction: column; gap: var(--space-3)">
          <div>
            <label style="display: block; font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: var(--space-2)">
              Custom CORS Proxy URL (optional)
            </label>
            <input
              class="input"
              type="url"
              placeholder="https://rr-proxy.your-username.workers.dev"
              value={proxyUrl}
              onInput={(e) => setProxyUrlState(e.target.value)}
            />
            <p class="text-muted" style="margin-top: var(--space-2)">
              Clear this field to try public proxies only. For best reliability, enter your own Cloudflare Worker URL.
            </p>
          </div>
          <button class="btn btn--primary" onClick={handleSave}>
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
