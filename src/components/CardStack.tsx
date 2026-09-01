/*
 * A deck of cards where a deck reads better, an ordinary grid where it does not.
 *
 * Every card grid on this site is `repeat(auto-fit, minmax(N, 1fr))`, which on
 * a phone resolves to one column — four spec cards, three residences and three
 * journal entries all become the same thing, a long single-file scroll past
 * cards that have nothing to do but go by. This wraps those runs in a deck at
 * that width only, so each card pins near the top of the screen and the next
 * rides up over it.
 *
 * It sits INSIDE the existing grid container rather than replacing it, and on a
 * desktop it renders its children and nothing else. So `.spec`, `.units`,
 * `.posts` and the rest keep their class, their `data-reveal` and every rule
 * written against them, and the desktop DOM is byte-for-byte what it was.
 * Stacked, the container simply has one child instead of four — `auto-fit`
 * collapses the empty tracks and the stack takes the full width.
 *
 * ---------------------------------------------------------------------------
 *
 * The pin is CSS. This file writes exactly one thing, and that is the point.
 *
 * What was here before pinned from JavaScript — read `scrollY`, work out where
 * each card belongs, write a `translate3d` — and it shook. It had to. Scrolling
 * is composited off the main thread and the transform is written on it, so the
 * card gets painted at the position the previous frame asked for: a frame
 * behind the page going down, a frame ahead of it coming back, which is the
 * up-and-down judder you see when you rock the wheel. Three separate patches
 * went in against the symptom — caching the viewport height, gating the resize
 * handler, reading `offsetTop` instead of `getBoundingClientRect` to break a
 * feedback loop — and none of them could fix it, because the lag is in the
 * architecture and not in the arithmetic.
 *
 * `position: sticky` is resolved during layout, before the frame is composited.
 * A pinned card is not tracking the scroll position; it IS the layout. There is
 * no frame for it to be behind. CardStack.css has the rest of that reasoning.
 *
 * So the only thing left for JavaScript is the depth — each card shrinking a
 * little as the cards above land on it. That is written as a `scale` on a
 * wrapper whose `transform-origin` is `top center`, so even a late write cannot
 * move the card's top edge. A scale that is a frame behind is invisible.
 */

import {
  Children,
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

import './CardStack.css';

/**
 * The site's mobile line. The same query Home.tsx picks the mobile film with,
 * so "mobile" means one thing across the codebase.
 */
const MOBILE_QUERY = '(max-width: 640px)';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

interface CardStackProps {
  children: ReactNode;
  /** Class for the deck root. Unused on the viewport that gets the grid. */
  className?: string;
  /** Class for each card's wrapper, for a deck that needs its own spacing. */
  itemClassName?: string;
  /*
   * The four lengths the deck is built from. Each one is a CSS custom property
   * with a default in CardStack.css, and each of these props only overrides it.
   *
   * Passing one writes an inline style, which no stylesheet can then outrank —
   * so a deck that needs to differ BETWEEN widths, as the build log does, is
   * tuned from a class in sections.css and passes none of these. They are here
   * for a one-off that has no business in a stylesheet.
   */
  /** Where a card pins, from the top of the viewport. Any CSS length. */
  stackTop?: string;
  /** How long the assembled deck holds before it leaves. Any CSS length. */
  tail?: string;
  /** Dead space between cards before they stack, in px. */
  itemDistance?: number;
  /** How far each card peeks out below the one that lands on it, in px. */
  itemStackDistance?: number;
  /** Scale of the bottom card once the whole deck is on top of it. */
  baseScale?: number;
  /**
   * The longest a single card's shrink may take, as a fraction of the viewport.
   * A cap, not a duration: a card only 200px from the next one shrinks over
   * those 200px, so the shrink always finishes exactly as its successor lands.
   */
  scaleRamp?: number;
  /**
   * Which viewport gets the deck. The other gets the plain grid.
   *
   * `mobile` is the default and the reason this component exists: every card
   * grid here is `repeat(auto-fit, minmax(N, 1fr))`, which on a phone collapses
   * to one column and becomes a long single-file scroll past cards with nothing
   * to do but go by.
   *
   * `desktop` is for a run that is worth pinning at full size and reads as an
   * ordinary list on a phone.
   *
   * `both` is for a run where the deck IS the section rather than a rescue for
   * a collapsed grid — the build log, six stages that are worth pinning at
   * either width.
   */
  stackAt?: 'mobile' | 'desktop' | 'both';
}

export default function CardStack({
  children,
  className = '',
  itemClassName = '',
  stackTop,
  tail,
  itemDistance,
  itemStackDistance,
  baseScale = 0.92,
  scaleRamp = 0.45,
  stackAt = 'mobile',
}: CardStackProps) {
  const mobile = useMediaQuery(MOBILE_QUERY);
  const reduced = useMediaQuery(REDUCED_QUERY);
  const rootRef = useRef<HTMLDivElement>(null);

  const cards = Children.toArray(children) as ReactElement[];

  const fits = stackAt === 'both' || (stackAt === 'mobile' ? mobile : !mobile);
  /*
   * Reduced motion gets the plain grid, not a slower deck.
   *
   * A deck is a scroll-driven rearrangement of the page — the thing the setting
   * asks us not to do — and unlike the film there is nothing underneath it that
   * only the motion can express. The fallback is already written and already
   * good: the grid these cards came out of.
   */
  const stacked = fits && !reduced;
  const count = cards.length;

  useLayoutEffect(() => {
    // A deck of one is just a card, and stacking it only costs a listener.
    if (!stacked || count < 2) return;

    const root = rootRef.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>('.cardstack__item'));
    const shells = items.map((item) => item.firstElementChild as HTMLElement);
    const n = items.length;
    if (n < 2) return;

    /*
     * Scale spent per card, so the deck is not a pile of identical sizes.
     *
     * Dividing the headroom by the deck rather than using a fixed increment is
     * what lets the journal filter down to a deck of ten without the top of it
     * walking past scale 1: whatever the count, the card at the bottom of the
     * pile ends at exactly `baseScale` and the one on top at exactly 1.
     */
    const step = (1 - baseScale) / (n - 1);

    /** Each card's pinned offset, read back from CSS so the two cannot drift. */
    const pinned = new Array<number>(n).fill(0);
    /** The scroll distance each card's arrival is measured over. */
    const ramps = new Array<number>(n).fill(1);
    const tops = new Array<number>(n).fill(0);
    const written = new Array<number>(n).fill(-1);

    let active = true;
    let queued = false;

    /*
     * Measured on mount, on resize, and when the deck's own height changes.
     *
     * Note what is NOT measured: anything about where a card should be drawn.
     * `pinned` is read back from the stylesheet rather than computed, and it is
     * spent only on asking how close a card is to landing. If this whole
     * function were skipped the deck would still assemble in exactly the right
     * places — the cards would simply forget to shrink.
     *
     * Which is also why a phone's URL bar has stopped being a problem. It fires
     * `resize` on every retraction; the old deck moved every pinned card by up
     * to 18px each time it did, and the fix was a hand-rolled gate that told a
     * URL bar from a rotation by watching the width. Here the pin is a `vh`
     * length, `vh` is the large viewport, and a retracting bar does not change
     * it. Re-measuring on a bar movement reads back the same numbers.
     */
    const measure = () => {
      const cap = Math.max(1, scaleRamp * (window.innerHeight || 1));
      for (let i = 0; i < n; i++) {
        pinned[i] = parseFloat(getComputedStyle(items[i]).top) || 0;
        /*
         * How far card i travels between the card before it landing and itself
         * landing: that card's height, plus the gap between them. Capped at
         * `cap` so a tall card does not shrink its neighbour over a page and a
         * half, and held to the spacing so a short one is not asked to finish a
         * 45vh shrink in 200px — which is the version that reads as a snap, and
         * flips in and out when you rock the scroll.
         *
         * The gap is read off the element rather than taken from the prop, so a
         * media query that narrows `--stack-gap` on a phone is picked up here
         * too. `offsetHeight` and `marginTop` are both layout values, which
         * sticky does not touch — unlike `getBoundingClientRect`, which reports
         * the pinned position and would make this measure itself.
         *
         * Index 0 has no card before it and no card below it to shrink, so its
         * ramp is never spent.
         */
        if (i === 0) {
          ramps[i] = cap;
        } else {
          const gap = parseFloat(getComputedStyle(items[i]).marginTop) || 0;
          ramps[i] = Math.max(1, Math.min(cap, items[i - 1].offsetHeight + gap));
        }
      }
    };

    /*
     * Read every card, then write every card. Two passes rather than one, so a
     * write cannot force a layout that the next read has to wait for.
     *
     * The read is `getBoundingClientRect().top` on the ITEM, which is the
     * sticky box and carries none of our transforms; the write is a scale on
     * the shell inside it. Nothing written here can be read back on the next
     * frame, so there is no loop to oscillate — which the old deck did have,
     * and paid for with a rounding step and a 0.1px dead band that made the
     * motion visibly quantise.
     */
    const frame = () => {
      queued = false;

      for (let i = 0; i < n; i++) tops[i] = items[i].getBoundingClientRect().top;

      // Top card first: a card's size is set by everything stacked on top of it,
      // so the tally is built walking down through the deck.
      let landed = 0;
      for (let i = n - 1; i >= 0; i--) {
        const scale = Math.max(baseScale, 1 - step * landed);
        const next = Math.round(scale * 1e4) / 1e4;
        if (next !== written[i]) {
          written[i] = next;
          shells[i].style.transform = `scale(${next})`;
        }

        const away = tops[i] - pinned[i];
        landed += away <= 0 ? 1 : away >= ramps[i] ? 0 : 1 - away / ramps[i];
      }
    };

    const onScroll = () => {
      if (!active || queued) return;
      queued = true;
      requestAnimationFrame(frame);
    };

    const onResize = () => {
      measure();
      frame();
    };

    /*
     * Off-screen decks cost nothing.
     *
     * Eight of these share the two long pages, and a plain scroll listener each
     * would have all eight reading rects on every frame of a scroll that is
     * nowhere near seven of them. The margin is a screen either side, so a deck
     * is already up to date by the time any of it is visible.
     */
    const io = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting;
        root.dataset.active = active ? 'true' : 'false';
        if (active) frame();
      },
      { rootMargin: '100% 0px 100% 0px' },
    );

    // Card heights move under us — a lazy image decoding, a filter changing the
    // deck. Only the ramps care, and only the root has to be watched: a card
    // that changes height changes the deck's.
    const ro = new ResizeObserver(onResize);

    measure();
    frame();
    io.observe(root);
    ro.observe(root);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      shells.forEach((shell) => {
        shell.style.transform = '';
      });
    };
  }, [stacked, count, baseScale, scaleRamp]);

  if (!stacked || count < 2) return <>{children}</>;

  // Only the overrides that were passed. An absent prop leaves the property
  // undeclared, so CardStack.css's default and any class over it still apply.
  const style = {
    ...(stackTop ? { '--stack-top': stackTop } : null),
    ...(tail ? { '--stack-tail': tail } : null),
    ...(itemDistance !== undefined ? { '--stack-gap': `${itemDistance}px` } : null),
    ...(itemStackDistance !== undefined
      ? { '--stack-peek': `${itemStackDistance}px` }
      : null),
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`cardstack ${className}`.trim()}
      style={style}
      data-active="false"
    >
      {cards.map((card, i) => (
        // `Children.toArray` has already given every child a stable key derived
        // from the one it was written with; reusing it keeps a filtered deck
        // from remounting the cards that did not change.
        <div
          key={card.key ?? i}
          className="cardstack__item"
          style={{ '--i': i } as CSSProperties}
        >
          <div className={`cardstack__card ${itemClassName}`.trim()}>{card}</div>
        </div>
      ))}
      {/* The runway the assembled deck holds on for. An element rather than
          padding because sticky measures the content box — see the note on
          `.cardstack__tail` in CardStack.css. */}
      <div className="cardstack__tail" aria-hidden="true" />
    </div>
  );
}
