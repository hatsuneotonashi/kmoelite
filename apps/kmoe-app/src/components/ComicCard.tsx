import { Link } from 'react-router-dom'
import type { ComicListItem } from '../types/domain'
import { Badge } from './Badge'
import { CoverImage } from './CoverImage'

export function ComicCard({ comic }: { comic: ComicListItem }) {
  return (
    <article className="comic-card liquid-card interactive-lift group relative p-3.5">
      <Link to={`/comic/${comic.id}`} aria-label={`查看详情：${comic.title}`} className="block">
        <div className="cover-art aspect-[7/10] w-full overflow-hidden subtle-fill">
          <CoverImage src={comic.coverUrl} title={comic.title} subtitle={comic.author} />
        </div>
        <div className="comic-card-meta min-w-0 pt-3.5">
          <div className="comic-card-title line-clamp-2 text-sm font-bold leading-5 text-[var(--app-fg)]">{comic.title}</div>
          <div className="comic-card-author mt-1 truncate text-xs text-[var(--app-muted)]">{comic.author}</div>
          <div className="comic-card-badges mt-2 flex flex-wrap gap-1.5">
            {comic.status ? <Badge tone="info">{comic.status}</Badge> : null}
            {comic.language ? <Badge>{comic.language}</Badge> : null}
            {comic.score ? <Badge tone="warning">{comic.score}</Badge> : null}
          </div>
          <div className="comic-card-latest mt-2 text-xs font-medium text-[var(--app-muted)]">{comic.latestVolume}</div>
        </div>
      </Link>
    </article>
  )
}
