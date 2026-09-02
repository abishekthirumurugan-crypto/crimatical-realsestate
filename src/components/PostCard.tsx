import { Link } from '../lib/router';
import type { Post } from '../content/site';

interface PostCardProps {
  post: Post;
  /**
   * `sizes` for the card image. The journal index runs three across on a wide
   * screen; other placements may differ, so the caller states the width.
   */
  sizes?: string;
}

/** "Vasanth Ramanathan" → "VR". Derived, so the data never has to repeat it. */
function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * One journal entry as a card: image, date, reading time, title, description
 * and who wrote it.
 *
 * Shared between the journal index and the teaser row on Home so the two can
 * never drift apart.
 */
export default function PostCard({
  post,
  sizes = '(max-width: 48rem) 100vw, (max-width: 72rem) 50vw, 30vw',
}: PostCardProps) {
  return (
    <Link to={`/blog/${post.slug}`} className="post-card">
      <div className="post-card__media">
        <img
          src={`/stills/${post.image}-600.webp`}
          srcSet={`/stills/${post.image}-600.webp 600w, /stills/${post.image}-1200.webp 1200w`}
          sizes={sizes}
          alt={post.imageAlt}
          loading="lazy"
          decoding="async"
          width={1200}
          height={675}
        />
        <span className="post-card__badge">{post.category}</span>
      </div>

      <div className="post-card__body">
        <div className="post-card__meta">
          <time dateTime={post.date}>{post.dateLabel}</time>
          <span className="post-card__sep" aria-hidden="true" />
          <span>{post.readingTime} read</span>
        </div>

        <h3 className="post-card__title">{post.title}</h3>
        <p className="post-card__excerpt">{post.excerpt}</p>

        <span className="post-card__foot">
          <span className="post-card__author">
            <span className="post-card__avatar" aria-hidden="true">
              {initialsOf(post.author)}
            </span>
            {post.author}
          </span>
          <span className="post-card__go" aria-hidden="true">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
