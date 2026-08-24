import { useEffect } from 'react';

/**
 * Reveal every `[data-reveal]` element once, as it comes into view.
 *
 * One observer for the whole page rather than one per element, and each target
 * is unobserved the moment it fires — a reveal that has happened is not worth
 * paying for on subsequent scrolls.
 *
 * `prefers-reduced-motion` is handled in CSS: the `.reveal` class resets to its
 * shown state under the media query, so this can run unconditionally and the
 * content is never left invisible.
 *
 * @param key Re-run when this changes. Required wherever the page swaps its
 *   own content without a route change — the Journal's category filter
 *   remounts the card grid, and a freshly mounted `.reveal` that nothing is
 *   observing stays at `opacity: 0` forever.
 */
export function useReveals(key?: string | number): void {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!targets.length) return;

    // No IntersectionObserver (very old browsers): show everything rather than
    // leaving the page blank below the fold.
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.setAttribute('data-shown', 'true'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute('data-shown', 'true');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);
}
