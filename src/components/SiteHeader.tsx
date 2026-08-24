import { useEffect, useState } from 'react';

import Logo from './Logo';
import { Link, useRoute } from '../lib/router';
import { COMPANY, NAV } from '../content/site';

/** `/blog/some-post` should still light up the Journal tab. */
function isActive(route: string, to: string): boolean {
  if (to === '/') return route === '/';
  return route === to || route.startsWith(`${to}/`);
}

/**
 * Fixed navy bar, on every page.
 *
 * It keeps one appearance everywhere rather than going transparent over the
 * film and solid over the concrete. An adaptive header needs to know where the
 * film ends, which means an observer and a resize handler running on the one
 * page that can least afford them — and the gold mark needs a dark ground to
 * read against in either case. Translucency plus a blur is what lets it sit on
 * the film without shutting the top of the frame.
 */
export default function SiteHeader() {
  const route = useRoute();
  const [open, setOpen] = useState(false);

  // Any navigation closes the panel — including a tap on the route you are
  // already on, which `route` alone would not catch.
  useEffect(() => {
    setOpen(false);
  }, [route]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="site-header" data-open={open}>
      <div className="site-header__bar">
        <Link to="/" className="site-header__lockup" aria-label={`${COMPANY.name} — home`}>
          <Logo size={44} wordmark tone="dark" />
        </Link>

        <nav className="site-header__nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="site-header__link"
              data-active={isActive(route, item.to)}
              aria-current={isActive(route, item.to) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="site-header__actions">
          <Link to="/contact" className="button button--primary site-header__cta">
            Book a viewing
          </Link>

          <button
            type="button"
            className="site-header__toggle"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
            <span className="site-header__bars" aria-hidden="true">
              <i />
              <i />
            </span>
          </button>
        </div>
      </div>

      {/* Always rendered so the panel can transition, and so the links stay in
          the accessibility tree in a predictable place; `hidden` keeps them out
          of the tab order while it is shut. */}
      <div className="site-header__panel" id="site-menu" hidden={!open}>
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="site-header__panel-link"
            data-active={isActive(route, item.to)}
          >
            {item.label}
          </Link>
        ))}
        <a className="site-header__panel-meta" href={`tel:${COMPANY.phoneHref}`}>
          {COMPANY.phone}
        </a>
      </div>
    </header>
  );
}
