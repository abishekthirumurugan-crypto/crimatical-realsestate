import { Link } from '../lib/router';
import { useReveals } from '../hooks/useReveals';
import { POSTS_BY_DATE, findPost } from '../content/site';
import NotFound from './NotFound';

interface BlogPostProps {
  slug: string;
}

export default function BlogPost({ slug }: BlogPostProps) {
  useReveals(slug);

  const post = findPost(slug);
  if (!post) return <NotFound />;

  const index = POSTS_BY_DATE.findIndex((entry) => entry.slug === post.slug);
  const previous = index > 0 ? POSTS_BY_DATE[index - 1] : undefined;
  const next = index < POSTS_BY_DATE.length - 1 ? POSTS_BY_DATE[index + 1] : undefined;

  return (
    <>
      <article className="entry">
        <header className="entry__head shell">
          <Link to="/blog" className="entry__back">
            ← Journal
          </Link>
          <p className="eyebrow">{post.category}</p>
          <h1 className="entry__title">{post.title}</h1>
          <p className="entry__excerpt">{post.excerpt}</p>
          <div className="entry__byline">
            <span>{post.author}</span>
            <time dateTime={post.date}>{post.dateLabel}</time>
            <span>{post.readingTime} read</span>
          </div>
        </header>

        {/* Not lazy-loaded: it is the first thing below the title, so it is
            wanted immediately rather than on scroll. */}
        <figure className="entry__media shell">
          <img
            src={`/stills/${post.image}-1200.jpg`}
            srcSet={`/stills/${post.image}-600.jpg 600w, /stills/${post.image}-1200.jpg 1200w`}
            sizes="(max-width: 76rem) 100vw, 1336px"
            alt={post.imageAlt}
            width={1200}
            height={675}
            decoding="async"
          />
        </figure>

        <div className="entry__body shell">
          {/* A paragraph prefixed with '## ' is a subheading. Keeping the body
              as flat strings means the content file stays readable and needs no
              markdown dependency for two levels of structure. */}
          {post.body.map((block) =>
            block.startsWith('## ') ? (
              <h2 key={block}>{block.slice(3)}</h2>
            ) : (
              <p key={block.slice(0, 40)}>{block}</p>
            ),
          )}
        </div>
      </article>

      {/* Both slots are always filled. The grid draws its 1px gaps with its own
          background, so an empty cell is not empty — it shows as a bare strip of
          rule colour. The placeholder keeps the ground continuous. */}
      <nav className="entry__nav shell" aria-label="More entries">
        {previous ? (
          <Link to={`/blog/${previous.slug}`} className="entry__nav-link">
            <span className="entry__nav-label">Newer</span>
            <span className="entry__nav-title">{previous.title}</span>
          </Link>
        ) : (
          <span className="entry__nav-link entry__nav-placeholder" aria-hidden="true" />
        )}
        {next ? (
          <Link to={`/blog/${next.slug}`} className="entry__nav-link entry__nav-link--next">
            <span className="entry__nav-label">Older</span>
            <span className="entry__nav-title">{next.title}</span>
          </Link>
        ) : (
          <span className="entry__nav-link entry__nav-placeholder" aria-hidden="true" />
        )}
      </nav>

      <section className="section shell">
        <div className="panel reveal" data-reveal>
          <h2>Questions about the project?</h2>
          <p>
            The build log for Block A is published monthly, and the sales team will answer anything
            the log does not.
          </p>
          <div className="panel__actions">
            <Link to="/contact" className="button button--primary">
              Contact us
            </Link>
            <Link to="/" className="button button--outline">
              See the build
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
