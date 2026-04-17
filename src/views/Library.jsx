import { useState, useEffect } from 'preact/hooks'
import { getAllNovels, deleteNovel } from '../services/db'

export function Library({ onRead, onDownload, onResume }) {
  const [novels, setNovels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllNovels().then((list) => {
      setNovels(list.reverse())
      setLoading(false)
    })
  }, [])

  async function handleDelete(novelId, e) {
    e.stopPropagation()
    if (!confirm('Delete this novel and all its chapters?')) return
    await deleteNovel(novelId)
    setNovels((prev) => prev.filter((n) => n.novelId !== novelId))
  }

  if (loading) {
    return <div class="empty-state"><div class="empty-state__icon">📚</div><p>Loading library...</p></div>
  }

  if (novels.length === 0) {
    return (
      <div class="empty-state">
        <div class="empty-state__icon">📚</div>
        <p>Your library is empty.</p>
        <button class="btn btn--primary" onClick={onDownload}>Download a novel</button>
      </div>
    )
  }

  return (
    <div class="library">
      <div class="library__grid">
        {novels.map((novel) => (
          <div class="library__card card" key={novel.novelId} onClick={() => onRead(novel.novelId)}>
            {novel.coverUrl && (
              <img class="library__cover" src={novel.coverUrl} alt="" loading="lazy" />
            )}
            <div class="library__info">
              <div class="library__title">{novel.title}</div>
              <div class="text-muted">{novel.author}</div>
              <div class="text-muted" style="margin-top: 0.25rem">
                {novel.downloadedChapters} / {novel.totalChapters} chapters
                {novel.downloadedChapters < novel.totalChapters && novel.downloadedChapters > 0 && (
                  <span style="color: var(--color-warning); margin-left: 0.4rem">· incomplete</span>
                )}
              </div>
              <div class="progress-bar" style="margin-top: 0.5rem">
                <div
                  class="progress-bar__fill"
                  style={`width: ${Math.round((novel.downloadedChapters / novel.totalChapters) * 100)}%`}
                />
              </div>
              {novel.downloadedChapters < novel.totalChapters && (
                <button
                  class="btn btn--ghost"
                  style="margin-top: 0.5rem; font-size: var(--font-size-xs); padding: 2px 8px; color: var(--color-accent)"
                  onClick={(e) => { e.stopPropagation(); onResume?.(novel.sourceUrl) }}
                >
                  ↻ Resume download
                </button>
              )}
            </div>
            <button
              class="btn btn--ghost library__delete"
              onClick={(e) => handleDelete(novel.novelId, e)}
              title="Delete"
            >
              🗑
            </button>
          </div>
        ))}
      </div>
      <style>{`
        .library { padding: var(--space-4); }
        .library__grid { display: flex; flex-direction: column; gap: var(--space-3); }
        .library__card {
          display: grid;
          grid-template-columns: 64px 1fr auto;
          gap: var(--space-3);
          align-items: start;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .library__card:hover { border-color: var(--color-accent); }
        .library__cover {
          width: 64px;
          height: 90px;
          object-fit: cover;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        .library__info { flex: 1; min-width: 0; }
        .library__title {
          font-weight: 600;
          font-size: var(--font-size-base);
          margin-bottom: 0.15rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .library__delete { align-self: start; flex-shrink: 0; }
      `}</style>
    </div>
  )
}
