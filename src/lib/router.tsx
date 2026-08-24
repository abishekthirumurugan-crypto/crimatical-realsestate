/**
 * A four-page router in sixty lines.
 *
 * This site has four routes and no data loading, so react-router would be
 * ~15 KB gzipped to solve a problem this size — and the whole project's claim
 * is that it ships no runtime dependencies beyond React. The History API does
 * everything needed here.
 *
 * Deployment note: this pushes real paths, not hashes, so the host has to serve
 * `index.html` for unknown paths. Vite's dev server and `vite preview` already
 * do. See README.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

const RouteContext = createContext<string>('/');

/** Current pathname, e.g. `/blog/handover-checklist`. Always starts with `/`. */
export function useRoute(): string {
  return useContext(RouteContext);
}

/** Strip a trailing slash so `/about/` and `/about` are the same route. */
function normalise(path: string): string {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path || '/';
}

/** Scroll to `#some-id`. Returns false when there is no such element. */
function scrollToHash(hash: string): boolean {
  if (!hash || hash === '#') return false;
  const target = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!target) return false;
  target.scrollIntoView({ block: 'start' });
  return true;
}

export function navigate(to: string): void {
  const url = new URL(to, window.location.origin);
  const samePath = normalise(url.pathname) === normalise(window.location.pathname);

  window.history.pushState({}, '', to);

  // Same route means no re-render, so the provider's scroll effect will not
  // run — an in-page anchor like `/#build-log` has to be handled here or it
  // does nothing at all.
  if (samePath) {
    if (!scrollToHash(url.hash)) window.scrollTo(0, 0);
    return;
  }

  // pushState does not fire popstate, so the provider has to be told directly.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => normalise(window.location.pathname));

  useEffect(() => {
    // The browser would otherwise try to restore a scroll offset from the
    // previous route — and on this site the previous route may have been five
    // viewports of scroll-driven film.
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const onPop = () => setPath(normalise(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.history.scrollRestoration = previous;
    };
  }, []);

  // Every route change starts at the top, including back and forward: landing
  // halfway down a page you have not seen yet reads as a broken link. An
  // explicit `#anchor` overrides that.
  //
  // Deferred by a frame so the incoming route has committed and its anchor
  // targets exist to be found.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!scrollToHash(window.location.hash)) window.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [path]);

  return <RouteContext.Provider value={path}>{children}</RouteContext.Provider>;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: ReactNode;
}

/**
 * An `<a>` that stays inside the app. It keeps a real `href`, so middle-click,
 * ctrl-click, "open in new tab" and link previews all behave like links —
 * only a plain left click is intercepted.
 */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      // Let the browser handle anything that is not a plain left click.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      navigate(to);
    },
    [to, onClick],
  );

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
