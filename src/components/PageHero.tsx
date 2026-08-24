import type { ReactNode } from 'react';

interface PageHeroProps {
  /** Small mono label above the title. Usually the section name. */
  eyebrow: string;
  title: string;
  lede?: string;
  /** Optional row of figures or meta beneath the lede. */
  children?: ReactNode;
}

/**
 * The opening block on every page except Home, which opens with the film.
 *
 * It carries the top padding that clears the fixed header — pages must not add
 * their own, or the offset drifts between routes.
 */
export default function PageHero({ eyebrow, title, lede, children }: PageHeroProps) {
  return (
    <section className="page-hero">
      <div className="shell">
        <span className="tag">{eyebrow}</span>
        <h1 className="page-hero__title">{title}</h1>
        {lede && <p className="page-hero__lede">{lede}</p>}
        {children}
      </div>
    </section>
  );
}
