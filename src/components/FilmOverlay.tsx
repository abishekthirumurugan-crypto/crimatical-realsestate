/**
 * The copy that rides on the film: which space you are walking through, and two
 * lines about it.
 *
 * Set on the picture, which took some doing
 * -----------------------------------------
 * The previous cut was an isolated CGI model floating in white, so dark type
 * could sit in the empty gutters beside it and be read against paper. This cut
 * is a photographic walkthrough — edge-to-edge picture, dark, and moving.
 *
 * Sampled at the scale text is actually read, the ground under a full-height
 * column runs L* 5 to L* 93. Nothing survives that: white needs the ground below
 * about L* 47, the brass accents need it below L* 30, and neither holds for more
 * than a few seconds at a time. Washing a whole column dark enough to fix it
 * takes 80% opacity, at which point the film is gone behind the words.
 *
 * What works is being small. One block, low and left, over a gradient anchored
 * to that corner: the copy sits on a measured 0.76–0.88 of `--dark-deep` while
 * the top and right of the frame — where the room actually is — stay clear.
 * Measured over every frame, white body copy holds 5.3:1 at the film's worst
 * moment and 6.4:1 at its median. See `.film__scrim` in film.css.
 *
 * Performance contract
 * --------------------
 * ScrollVideo calls `onProgress` on every rAF tick — up to 120 times a second.
 * Routing that into React state would re-render this subtree at the same rate
 * and undo the work the scrub loop does to stay off the main thread. So progress
 * arrives imperatively through `api.update()`, and this component renders
 * exactly once: there is no state in it at all. Per frame it writes one custom
 * property, and once ever it sets one attribute.
 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react';

import type { WalkthroughSpace } from '../content/project';

export interface FilmOverlayApi {
  /** Feed eased scroll progress, 0–1. Safe to call every frame. */
  update: (progress: number) => void;
}

interface FilmOverlayProps {
  spaces: WalkthroughSpace[];
  /** Filled by the component with its imperative handle. */
  apiRef: RefObject<FilmOverlayApi | null>;
}

/** The measured roll: its element, its block offsets, and its mask lead-in. */
interface RollGeometry {
  el: HTMLElement;
  offsets: number[];
  lead: number;
}

/** Past this much scroll the reader has understood the interaction. */
const HINT_UNTIL = 0.015;
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Index of the space covering `progress`. Must be ascending by `at`. */
function spaceIndexAt(spaces: WalkthroughSpace[], progress: number): number {
  let index = 0;
  for (let i = 0; i < spaces.length; i += 1) {
    if (progress >= spaces[i].at) index = i;
    else break;
  }
  return index;
}

export default function FilmOverlay({ spaces, apiRef }: FilmOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const hintGoneRef = useRef(false);

  /**
   * Where each block starts within the stack, and the lead-in that keeps its
   * first line clear of the mask.
   *
   * Measured rather than assumed. The blocks are different heights — a name
   * that wraps and one that does not are not the same object — and how tall any
   * of them is depends on how wide the column has resolved, so it cannot be
   * known until layout has run.
   */
  const rollRef = useRef<RollGeometry | null>(null);

  useLayoutEffect(() => {
    const roll = overlayRef.current?.querySelector<HTMLElement>('.roll');
    if (!roll) return;

    const measure = () => {
      const items = Array.from(roll.querySelectorAll<HTMLElement>('.roll__item'));
      if (!items.length) return;

      const height = roll.clientHeight;

      // The two fade positions, read from the stylesheet that draws the mask
      // rather than repeated here, so the two can never disagree.
      const styles = getComputedStyle(roll);
      const readFraction = (name: string, fallback: number) => {
        const value = parseFloat(styles.getPropertyValue(name));
        return Number.isFinite(value) ? value : fallback;
      };

      // Starting a block a lead-in down the window means its opening line
      // arrives already legible instead of half-dissolved.
      const lead = height * readFraction('--roll-lead', 0.08);
      // What is left between the two fades: the band that is actually legible.
      const clear = height * readFraction('--roll-tail', 0.92) - lead;

      // Relative to the first block, so the stack's own offset inside the
      // window never leaks into the numbers.
      const first = items[0].offsetTop;
      const offsets = items.map((item) => item.offsetTop - first);

      /**
       * A stop for the final block.
       *
       * Every other block is carried up by the arrival of the one behind it,
       * but the last has nothing behind it — so if it is taller than the
       * legible band, its tail sits below the window with no scroll left to
       * bring it up, and the closing space is the one you cannot finish
       * reading. This gives it exactly enough travel to clear its own tail and
       * no more, so it comes to rest with its last line in view.
       */
      const last = items[items.length - 1];
      const gap = parseFloat(getComputedStyle(last).paddingBottom) || 0;
      offsets.push(
        (offsets[offsets.length - 1] ?? 0) + Math.max(0, last.offsetHeight - gap - clear),
      );

      rollRef.current = { el: roll, offsets, lead };
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(roll);

    // `.fonts` is unsupported nowhere that matters, but it is optional in the
    // DOM lib, and a rejected promise here would be a font that never loaded.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => observer.disconnect();
  }, [spaces]);

  const update = useCallback(
    (progress: number) => {
      /**
       * The copy rolls like a teleprompter.
       *
       * Every block is in the document inside a masked window. Across a space's
       * share of the scroll the stack travels exactly the distance from that
       * block to the next — so its lines leave through the top of the mask one
       * at a time while the following space's arrive at the bottom. Nothing
       * fades in place and nothing jumps at a boundary.
       *
       * The travel is measured, not a fixed window height, and that is the
       * point. Tying the step to the window meant a block taller than the window
       * ran on into the one behind it — two spaces legible at once, on top of
       * each other. Stepping by the real distance between blocks makes that
       * impossible at any viewport size and for any length of copy.
       *
       * One style write per frame, no React render.
       */
      const roll = rollRef.current;
      if (roll) {
        const stage = spaceIndexAt(spaces, progress);
        const start = spaces[stage].at;
        const end = stage + 1 < spaces.length ? spaces[stage + 1].at : 1;
        const local = clamp01((progress - start) / Math.max(end - start, 1e-4));

        const from = roll.offsets[stage] ?? 0;
        const to = roll.offsets[stage + 1] ?? from;
        roll.el.style.setProperty(
          '--roll-y',
          `${(from + (to - from) * local - roll.lead).toFixed(2)}px`,
        );
      }

      if (!hintGoneRef.current && progress > HINT_UNTIL) {
        hintGoneRef.current = true;
        hintRef.current?.setAttribute('data-gone', 'true');
      }
    },
    [spaces],
  );

  // Publish the handle synchronously on every render, so the very first
  // `onProgress` from ScrollVideo — which can arrive before effects flush —
  // already has somewhere to land.
  apiRef.current = useMemo(() => ({ update }), [update]);

  return (
    <div ref={overlayRef} className="film__overlay">
      {/* The gradient the copy is legible against. Anchored bottom-left so the
          room itself stays clear; see film.css for the measurement. */}
      <div className="film__scrim" aria-hidden="true" />

      {/*
        `aria-hidden` because every word of this is said properly on `/details`,
        and a screen reader should not have to sit through a scrubbed film to
        hear it. The page's own `h1` carries the accessible name.
      */}
      <div className="film__copy" aria-hidden="true">
        <div className="roll">
          <div className="roll__stack">
            {spaces.map((item) => (
              <div key={item.name} className="roll__item">
                <h2 className="film__space">{item.name}</h2>
                <p className="film__body">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={hintRef} className="hint" data-gone="false" aria-hidden="true">
        Scroll to walk through
      </div>
    </div>
  );
}
