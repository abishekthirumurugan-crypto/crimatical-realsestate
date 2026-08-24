import { useMemo, useState } from 'react';

import PageHero from '../components/PageHero';
import PostCard from '../components/PostCard';
import { useReveals } from '../hooks/useReveals';
import { POSTS_BY_DATE } from '../content/site';

const ALL = 'All';

export default function Blog() {
  const categories = useMemo(
    () => [ALL, ...Array.from(new Set(POSTS_BY_DATE.map((post) => post.category)))],
    [],
  );
  const [category, setCategory] = useState<string>(ALL);

  const posts = useMemo(
    () =>
      category === ALL ? POSTS_BY_DATE : POSTS_BY_DATE.filter((post) => post.category === category),
    [category],
  );

  // Filtering remounts the grid, so the observer has to be rebuilt with it.
  useReveals(category);

  return (
    <>
      <PageHero
        eyebrow="Journal"
        title="Notes from the site and the drawing board"
        lede="What we have learned building mid-rise in Chennai — including the parts that went wrong. Written by the people who did the work."
      />

      <section className="section shell">
        <div className="filters" role="group" aria-label="Filter entries by category">
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              className="filter"
              data-active={name === category}
              aria-pressed={name === category}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>

        {posts.length > 0 ? (
          <div className="posts reveal" data-reveal>
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <p className="empty">
            Nothing filed under {category} yet. Try another category — or read everything.
          </p>
        )}
      </section>
    </>
  );
}
