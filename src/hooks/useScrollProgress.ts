import { useEffect } from 'react';

/**
 * Write how far down the document the reader is, 0–1, to `--scroll-progress`
 * on the root element.
 *
 * Why a hook and not `animation-timeline: scroll()`
 * ------------------------------------------------
 * The CSS version is better in every way except that it cannot be made to work
 * alongside the parallax in motion.css. A `scroll()` timeline resolves only when
 * the root is not itself a scroll container, and `view()` timelines resolve only
 * when it is — `overflow-x: hidden` decides which, and the two want opposite
 * answers. Measured both ways: with `overflow-x` on `body`, `scroll()` tracked
 * correctly and every `view()` reported `progress: 0`; moved to `html`, `view()`
 * resolved and `scroll()` went `progress: null`. The parallax is the one that
 * cannot be given up, so the rule is done in script.
 *
 * The cost is one custom-property write per scroll frame:
 *
 *  - The listener is passive and does nothing but store a flag, so it never
 *    delays the scroll itself.
 *  - Work is coalesced to one rAF, because a scroll event can fire several
 *    times per frame and each write invalidates style on the root.
 *  - It writes a custom property consumed only by a `transform`, so the frame
 *    costs a composite and never a layout.
 */
export function useScrollProgress(enabled = true): void {
  useEffect(() => {
    // The home page hides the rule — the film already measures the same scroll
    // — so running this there is pure waste, and it is not cheap waste: writing
    // a custom property on the root invalidates style for the whole document,
    // once per scroll frame, on the one page that is also driving a video
    // scrub. It is the page that can least afford it.
    if (!enabled) return;

    const root = document.documentElement;
    let frame = 0;
    let last = -1;

    const write = () => {
      frame = 0;
      const scrollable = root.scrollHeight - window.innerHeight;
      // A document shorter than the viewport has no progress to report; leave
      // the rule empty rather than pinning it full.
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;

      // Three decimals is finer than a 2px bar can show on any display, and it
      // stops a sub-pixel scroll from invalidating style for no visible change.
      const rounded = Math.round(progress * 1000) / 1000;
      if (rounded === last) return;
      last = rounded;
      root.style.setProperty('--scroll-progress', String(rounded));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    write();
    window.addEventListener('scroll', onScroll, { passive: true });
    // The document grows as images decode and as the card decks size themselves,
    // and a stale height reports the wrong progress for the rest of the session.
    const observer = new ResizeObserver(onScroll);
    observer.observe(document.body);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
      root.style.removeProperty('--scroll-progress');
    };
  }, [enabled]);
}
