import { useEffect } from 'react';

/**
 * Hover a card, and it rises to the middle of the screen while the rest of the
 * page dims behind it.
 *
 * Why this is JavaScript and not a `:hover` rule
 * ---------------------------------------------
 * "Centre it" is not a value CSS can write. The distance a card has to travel
 * depends on where it happens to sit in a grid that wraps at four widths, so
 * the transform has to be measured per card, per hover. Everything after the
 * measurement is still CSS: one `transform` and one `transition`, both on the
 * compositor. Nothing here animates layout.
 *
 * `position: fixed` was the other way to do it and is worse: the card would
 * leave the flow, its grid slot would collapse, and the whole section would
 * reflow underneath the thing the reader is trying to look at. A transform
 * moves the paint and leaves the layout alone — the slot stays open, so
 * nothing behind the scrim moves.
 *
 * Why the release is measured too
 * -------------------------------
 * Because `:hover` cannot survive the effect. The card moves out from under
 * the pointer, so the browser fires `mouseleave` the instant it arrives, the
 * card snaps home, the pointer is over it again, and it flickers forever.
 *
 * So focus is held while the pointer is inside the UNION of the card's grid
 * slot and where the card now is. The pointer starts in the slot, so nothing
 * fires on arrival; moving toward the centre lands it in the raised card; and
 * leaving both is unambiguously a release.
 *
 * One document-level listener for the whole page rather than handlers on
 * twenty cards, in the spirit of `useReveals`. It is `pointermove` rather than
 * `pointerover`, which matters more than it sounds — see `onPointerMove`.
 */

/**
 * Everything here is a card in a wrapping grid on a light page. `.figure` and
 * `.tl__card` are deliberately absent — they are small enough that raising one
 * to the centre reads as a glitch rather than as a look.
 */
const CARD_SELECTOR = '.unit, .service, .post-card, .person, .spec-card, .value';

/**
 * Hover intent. A mouse crossing a four-up grid on its way somewhere else
 * passes over three cards; without a dwell the page detonates behind it.
 */
const DWELL_MS = 150;

const IN_MS = 460;
const OUT_MS = 300;
/** The curve the reveals use, so the two motions belong to each other. */
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/**
 * The raised card may cover this much of the viewport, and may not scale past
 * the ceiling however small it started. Past roughly 1.5 the type is being
 * blown up rather than brought forward, and a `.service` card at 2x is a
 * paragraph of 30px body copy.
 */
const VIEWPORT_FILL = 0.82;
const MAX_SCALE = 1.5;

/**
 * The floor for running any of this: a hovering, fine pointer on a screen at
 * least 62rem wide.
 *
 * The pointer half is what keeps it off phones and tablets, and it is the
 * honest test — the effect is made of hover, and a touchscreen has none. The
 * width half is what keeps it off a laptop window dragged down to a column:
 * 62rem is the widest layout breakpoint the stylesheets use, so above it the
 * site is in its full desktop layout and a card has somewhere to grow into.
 *
 * `rem` in a media query resolves against the initial font size rather than
 * the root element's, so this is a stable 992px either way.
 */
const WIDE = '(hover: hover) and (pointer: fine) and (min-width: 62rem)';

/** Slack on the keep-focus zone, so the release is not knife-edged. */
const SLACK = 16;

/**
 * Above the header (30), the scroll rule (29) and the floating rail (26);
 * below the custom cursor (70). The scrim sits one step under it — focus.css.
 */
const Z_FOCUS = 41;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** An ancestor whose stacking context was borrowed, and what to put back. */
interface Held {
  el: HTMLElement;
  zIndex: string;
  position: string;
}

/**
 * A `z-index` only competes inside its own stacking context. If any ancestor
 * of the card makes one — and a mid-reveal grid does, because it is animating
 * opacity — then no z-index on the card can lift it over a scrim that lives at
 * the top of the document. So the context itself is raised for the duration
 * and put back afterwards.
 */
function makesStackingContext(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  return (
    (cs.position !== 'static' && cs.zIndex !== 'auto') ||
    cs.transform !== 'none' ||
    cs.filter !== 'none' ||
    cs.perspective !== 'none' ||
    Number.parseFloat(cs.opacity) < 1 ||
    cs.isolation === 'isolate' ||
    cs.mixBlendMode !== 'normal' ||
    cs.contain.includes('paint') ||
    cs.contain.includes('layout') ||
    cs.willChange.includes('transform') ||
    cs.willChange.includes('opacity')
  );
}

function inside(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

export function useCardFocus(): void {
  useEffect(() => {
    const root = document.documentElement;
    const wide = window.matchMedia(WIDE);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');

    /** The raised card, or null. */
    let card: HTMLElement | null = null;
    /** Where the pointer may go without releasing it. */
    let zone: Box | null = null;
    let held: Held[] = [];

    let dwell = 0;
    let settle = 0;
    /** The card the dwell timer is counting down for. */
    let pending: HTMLElement | null = null;
    /** The element the last pointermove hit, so most moves cost nothing. */
    let lastHit: Element | null = null;
    /**
     * Ends the last release now instead of when its timer says so. Only
     * `focus` and teardown call it — see the note there.
     */
    let flush: (() => void) | null = null;

    /** Put a card and its borrowed ancestors back exactly as they were. */
    function reset(el: HTMLElement, ancestors: Held[]): void {
      el.style.transform = '';
      el.style.transition = '';
      el.style.willChange = '';
      el.style.zIndex = '';
      el.style.position = '';
      delete el.dataset.cardFocus;
      ancestors.forEach((h) => {
        h.el.style.zIndex = h.zIndex;
        h.el.style.position = h.position;
      });
    }

    function release(): void {
      window.clearTimeout(dwell);
      pending = null;
      // Force the next move to re-read what is under the pointer: the page it
      // is over is about to change shape.
      lastHit = null;
      if (!card) return;

      const going = card;
      const ancestors = held;
      card = null;
      zone = null;
      held = [];
      delete root.dataset.cardFocus;

      // Everything this release still owes: the card's inline styles, and the
      // stacking contexts borrowed from its ancestors. Kept as a closure so
      // that it always puts back THIS card and THESE ancestors, whatever has
      // been focused since.
      const done = (): void => {
        window.clearTimeout(settle);
        if (flush === done) flush = null;
        reset(going, ancestors);
      };

      // Navigated away mid-hover: there is nothing left to animate.
      if (!going.isConnected) {
        done();
        return;
      }

      going.dataset.cardFocus = 'leaving';
      going.style.willChange = 'transform';
      going.style.transition = [
        `transform ${OUT_MS}ms ${EASE}`,
        `box-shadow ${OUT_MS}ms ease`,
        `border-color ${OUT_MS}ms ease`,
        `background-color ${OUT_MS}ms ease`,
      ].join(', ');
      // Cleared rather than set to `none`: the card drops back to whatever
      // transform its own stylesheet gives it, which for `.unit` and friends
      // is the -2px hover lift it is very likely still under.
      going.style.transform = '';

      flush = done;
      // A timer rather than `transitionend`, because there may be no
      // transition to end — a card that never moved fires nothing, and its
      // z-index would then never come off.
      settle = window.setTimeout(done, OUT_MS + 60);
    }

    function focus(target: HTMLElement): void {
      release();
      // Finish that release here and now. A card halfway home still holds a
      // raised z-index and its ancestors' stacking contexts; left running, it
      // would sit undimmed on top of the scrim beside the card replacing it,
      // and would later restore ancestor values that this focus has since
      // overwritten. The cost is that the outgoing card cuts the last of its
      // return, which is a small move at low speed with the eye on the card
      // arriving.
      flush?.();

      const slot = target.getBoundingClientRect();
      if (!slot.width || !slot.height) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const scale = Math.max(
        1,
        Math.min(MAX_SCALE, (vw * VIEWPORT_FILL) / slot.width, (vh * VIEWPORT_FILL) / slot.height),
      );

      // `translate` then `scale`: the scale is about the card's own centre, so
      // it does not move it, and the translate lands that centre on the
      // viewport's. Both are in the card's untransformed pixels.
      const dx = vw / 2 - (slot.left + slot.width / 2);
      const dy = vh / 2 - (slot.top + slot.height / 2);

      const halfW = (slot.width * scale) / 2;
      const halfH = (slot.height * scale) / 2;

      zone = {
        left: Math.min(slot.left, vw / 2 - halfW) - SLACK,
        top: Math.min(slot.top, vh / 2 - halfH) - SLACK,
        right: Math.max(slot.right, vw / 2 + halfW) + SLACK,
        bottom: Math.max(slot.bottom, vh / 2 + halfH) + SLACK,
      };

      held = [];
      for (let el = target.parentElement; el && el !== document.body; el = el.parentElement) {
        if (!makesStackingContext(el)) continue;
        held.push({ el, zIndex: el.style.zIndex, position: el.style.position });
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.style.zIndex = String(Z_FOCUS);
      }

      card = target;
      target.dataset.cardFocus = 'active';
      if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
      target.style.zIndex = String(Z_FOCUS);
      target.style.willChange = 'transform';
      target.style.transition = [
        `transform ${IN_MS}ms ${EASE}`,
        `box-shadow ${IN_MS}ms ease`,
        `border-color ${IN_MS}ms ease`,
        `background-color ${IN_MS}ms ease`,
      ].join(', ');
      // Inline, because `.reveal[data-shown] > *` and `.spec[data-shown]
      // .spec-card` both write `transform` from a stylesheet and both outrank
      // any single-class rule this could be given.
      target.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
      root.dataset.cardFocus = 'on';

      // Dropping the hint once the card has arrived lets the browser
      // re-rasterise the layer at its final size. Held, the type stays as it
      // was drawn at 1x and stretched — legible, but visibly soft at 1.5.
      window.setTimeout(() => {
        if (card === target) target.style.willChange = '';
      }, IN_MS + 40);
    }

    /**
     * Arming and releasing both hang off `pointermove`, and the arming half is
     * the reason why.
     *
     * `pointerover` was the obvious listener and it is the wrong one: it fires
     * only when the element under the pointer CHANGES, and this effect exists
     * to move a card out from under the pointer. That desynchronises the
     * browser's hover bookkeeping — after a release the pointer is frequently
     * still recorded as being inside the card it never formally left, so
     * hovering that same card a second time dispatches no `pointerover` at all
     * and the effect arms exactly once per card, per visit.
     *
     * `pointermove` has no such state. It fires on every movement of the
     * mouse, so re-entering a card always re-arms — and the dwell no longer
     * needs a `:hover` check to confirm the pointer stayed, because any move
     * that leaves the card changes the candidate and cancels the timer.
     */
    function onPointerMove(event: PointerEvent): void {
      if (event.pointerType && event.pointerType !== 'mouse') return;

      // A card is up: the only question left is whether it stays up.
      if (card) {
        if (zone && !inside(zone, event.clientX, event.clientY)) release();
        return;
      }

      if (!wide.matches || still.matches) return;

      // Moving within one element is most of what a pointer does, and it
      // cannot change the answer. `closest` is cheap; this is cheaper.
      const hit = event.target as Element | null;
      if (hit === lastHit) return;
      lastHit = hit;

      const target = hit?.closest<HTMLElement>(CARD_SELECTOR) ?? null;
      // Still the same candidate — a move between two children of one card —
      // so let its dwell keep running rather than restarting it.
      if (target === pending) return;

      window.clearTimeout(dwell);
      pending = target;
      if (!target) return;

      dwell = window.setTimeout(() => {
        pending = null;
        if (target.isConnected) focus(target);
      }, DWELL_MS);
    }

    /** The pointer left the window without a move that says where it went. */
    function onPointerLeave(): void {
      window.clearTimeout(dwell);
      pending = null;
      lastHit = null;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') release();
    }

    // `click` in the bubble phase, so a card that is a link has already
    // handled it and started the route change before the card is sent home.
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('click', release);
    document.addEventListener('keydown', onKeyDown);
    // Each of these invalidates the geometry the zone was measured from.
    window.addEventListener('scroll', release, { passive: true });
    window.addEventListener('resize', release);
    window.addEventListener('blur', release);

    return () => {
      release();
      flush?.();
      window.clearTimeout(dwell);
      delete root.dataset.cardFocus;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('click', release);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', release);
      window.removeEventListener('resize', release);
      window.removeEventListener('blur', release);
    };
  }, []);
}
