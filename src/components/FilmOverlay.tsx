/**
 * The overlay that rides beside the film: the current construction stage in the
 * two gutter columns, and the survey rule that measures how far through the
 * build you have scrolled.
 *
 * There used to be a third block, stacked under the video, carrying the stage
 * name at 4.5rem. It sat where the video wants to be, so it is gone and the
 * left column leads with the name instead.
 *
 * Performance contract
 * --------------------
 * ScrollVideo calls `onProgress` on every rAF tick — up to 120 times a second.
 * Routing that into React state would re-render this subtree at the same rate
 * and undo the work the scrub loop does to stay off the main thread.
 *
 * So this component takes its progress imperatively, through `api.update()`,
 * and writes to exactly three things:
 *
 *   - the head's `transform`      — compositor-only, no layout
 *   - the readout's `textContent` — gated on the integer percent changing
 *   - the hint's `data-gone`      — written once, on first movement
 *
 * React state is touched only when the *stage* changes, which happens five
 * times across the whole film.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import type { BuildPhase } from '../content/project';

/** A measured roll: its element, its block offsets, and its mask lead-in. */
interface RollGeometry {
  el: HTMLElement;
  offsets: number[];
  lead: number;
}

export interface FilmOverlayApi {
  /** Feed eased scroll progress, 0–1. Safe to call every frame. */
  update: (progress: number) => void;
}

interface FilmOverlayProps {
  phases: BuildPhase[];
  /** Filled by the component with its imperative handle. */
  apiRef: RefObject<FilmOverlayApi | null>;
}

/** Minor graduations every 2% of the film. */
const MINOR_STEP = 0.02;
/** Drop a minor tick this close to a stage mark, so they don't double up. */
const TICK_MERGE = 0.012;
/** Past this much scroll the reader has understood the interaction. */
const HINT_UNTIL = 0.015;
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Total programme length, summed from the gaps between stages.
 *
 * Derived rather than stated, so it cannot drift out of step with the dates the
 * survey rule is already showing.
 */
function programmeMonths(phases: BuildPhase[]): number {
  return phases.reduce((total, phase) => total + (parseInt(phase.gap ?? '0', 10) || 0), 0);
}

/** Index of the stage covering `progress`. Phases must be ascending by `at`. */
function phaseIndexAt(phases: BuildPhase[], progress: number): number {
  let index = 0;
  for (let i = 0; i < phases.length; i += 1) {
    if (progress >= phases[i].at) index = i;
    else break;
  }
  return index;
}

export default function FilmOverlay({ phases, apiRef }: FilmOverlayProps) {
  const [index, setIndex] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  /** Track width in px, so the head can move by transform rather than `left`. */
  const trackWidthRef = useRef(0);
  /**
   * One entry per roll: the element, the top of each stage's block within its
   * stack, and the lead-in that keeps the first line clear of the mask.
   *
   * Measured rather than assumed. The blocks are different heights — a stage
   * with a three-line body and a stage with an eight-line one are not the same
   * object — and how tall any of them is depends on how wide the gutter has
   * resolved, so it cannot be known until layout has run.
   */
  const rollsRef = useRef<RollGeometry[]>([]);
  const lastPctRef = useRef(-1);
  const hintGoneRef = useRef(false);
  const indexRef = useRef(0);

  // Minor graduations, minus any that would collide with a stage mark.
  const minorTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let t = 0; t <= 1.0001; t += MINOR_STEP) {
      const at = Math.min(t, 1);
      if (phases.some((p) => Math.abs(p.at - at) < TICK_MERGE)) continue;
      ticks.push(at);
    }
    return ticks;
  }, [phases]);

  /* The head is positioned in pixels, so its coordinate space has to be
     re-measured whenever the track resizes — including the gutter change at the
     46rem breakpoint, which no window `resize` guarantee covers on its own. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      trackWidthRef.current = track.clientWidth;
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  /**
   * Measure every roll: where each stage's block starts, and how far the stack
   * has to travel to bring the next one up.
   *
   * Runs on mount, whenever a roll changes width (the gutter is `21vw`, so that
   * is most resizes) and once the webfont has loaded, since Poppins and the
   * fallback do not wrap the same copy onto the same number of lines.
   */
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const rolls = Array.from(overlay.querySelectorAll<HTMLElement>('.roll'));

    const measure = () => {
      rollsRef.current = rolls.map((roll) => {
        const items = Array.from(roll.querySelectorAll<HTMLElement>('.roll__item'));
        const first = items[0]?.offsetTop ?? 0;

        const height = roll.clientHeight;

        // The two fade positions, read from the stylesheet that draws the mask
        // rather than repeated here, so a roll can carry its own if it needs to.
        const styles = getComputedStyle(roll);
        const readFraction = (name: string, fallback: number) => {
          const value = parseFloat(styles.getPropertyValue(name));
          return Number.isFinite(value) ? value : fallback;
        };

        // Starting a stage a lead-in down the window means its opening line
        // arrives already legible instead of half-dissolved.
        const lead = height * readFraction('--roll-lead', 0.15);
        // What is left between the two fades: the band that is actually legible.
        const clear = height * readFraction('--roll-tail', 0.82) - lead;

        // Relative to the first block, so the stack's own offset inside the
        // window never leaks into the numbers.
        const offsets = items.map((item) => item.offsetTop - first);

        /**
         * A stop for the final stage.
         *
         * Every other block is carried up by the arrival of the one behind it,
         * but the last has nothing behind it — so if it is taller than the
         * legible band, its tail sits below the window with no scroll left to
         * bring it up, and the closing stage is the one you cannot finish
         * reading. This gives it exactly enough travel to clear its own tail
         * and no more, so it comes to rest with its last line in view.
         */
        const last = items[items.length - 1];
        if (last) {
          const gap = parseFloat(getComputedStyle(last).paddingBottom) || 0;
          const tail = Math.max(0, last.offsetHeight - gap - clear);
          offsets.push((offsets[offsets.length - 1] ?? 0) + tail);
        }

        return { el: roll, offsets, lead };
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    rolls.forEach((roll) => observer.observe(roll));

    // `.fonts` is unsupported nowhere that matters, but it is optional in the
    // DOM lib, and a rejected promise here would be a font that never loaded.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => observer.disconnect();
  }, [phases]);

  const update = useCallback(
    (progress: number) => {
      const width = trackWidthRef.current;

      const head = headRef.current;
      if (head && width) {
        head.style.transform = `translateX(${progress * width}px)`;
      }

      // The readout can only show 101 distinct values; writing it on every one
      // of 120 frames a second would be 119 wasted text mutations.
      const pct = Math.round(progress * 100);
      if (pct !== lastPctRef.current) {
        lastPctRef.current = pct;
        const readout = readoutRef.current;
        if (readout) readout.textContent = `${String(pct).padStart(2, '0')}%`;
      }

      /**
       * The copy rolls like a teleprompter.
       *
       * Every stage's copy is stacked in the document inside a masked window.
       * Across a stage's share of the scroll, the stack travels exactly the
       * distance from that stage's block to the next one's — so its lines leave
       * through the top of the mask one at a time while the following stage's
       * arrive at the bottom. Nothing fades in place, nothing jumps at a
       * boundary, and the text is always mid-journey.
       *
       * The travel is measured, not a fixed window height, and that is the
       * whole point. Tying the step to the window meant a block taller than the
       * window ran on into the one behind it — two stages legible at once, on
       * top of each other. Stepping by the real distance between blocks makes
       * that impossible at any viewport size and for any length of copy, which
       * matters rather a lot on a template.
       *
       * The last stage has nothing behind it to roll in, so its travel is zero
       * and it holds instead of scrolling away to nothing.
       *
       * One style write per roll per frame, no React render.
       */
      const stage = phaseIndexAt(phases, progress);
      const start = phases[stage].at;
      const end = stage + 1 < phases.length ? phases[stage + 1].at : 1;
      const local = clamp01((progress - start) / Math.max(end - start, 1e-4));

      for (const roll of rollsRef.current) {
        const from = roll.offsets[stage] ?? 0;
        const to = roll.offsets[stage + 1] ?? from;
        roll.el.style.setProperty('--roll-y', `${(from + (to - from) * local - roll.lead).toFixed(2)}px`);
      }

      if (!hintGoneRef.current && progress > HINT_UNTIL) {
        hintGoneRef.current = true;
        hintRef.current?.setAttribute('data-gone', 'true');
      }

      const next = phaseIndexAt(phases, progress);
      if (next !== indexRef.current) {
        indexRef.current = next;
        setIndex(next);
      }
    },
    [phases],
  );

  // Publish the handle synchronously on every render, so the very first
  // `onProgress` from ScrollVideo — which can arrive before effects flush —
  // already has somewhere to land.
  apiRef.current = useMemo(() => ({ update }), [update]);

  // `index` no longer picks the copy — every stage is in the document and the
  // roll decides what is visible. It is still what marks the current date on
  // the survey rule below.
  const months = useMemo(() => programmeMonths(phases), [phases]);

  return (
    <div ref={overlayRef} className="film__overlay">
      <div className="film__wash" aria-hidden="true" />

      {/*
        The two gutters beside the frame. `--film-gutter` in film.css reserves
        the space and decides when there is enough of it; below that these are
        not rendered on screen at all.
      */}
      <aside className="film__aside film__aside--left" aria-hidden="true">
        <div className="roll">
          <div className="roll__stack">
            {phases.map((item, i) => (
              <div key={item.name} className="roll__item">
                {/* Everything the old phase block said, in one line. */}
                <p className="film__aside-eyebrow">
                  Phase {String(i + 1).padStart(2, '0')} of {String(phases.length).padStart(2, '0')}
                  <span> · {item.date}</span>
                </p>
                <h3 className="film__aside-name">{item.name}</h3>
                <p className="film__aside-body">{item.aside.left.body}</p>
                <ul className="film__points">
                  {item.aside.left.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <aside className="film__aside film__aside--right" aria-hidden="true">
        <div className="roll">
          <div className="roll__stack">
            {phases.map((item) => (
              <div key={item.name} className="roll__item">
                <p className="film__aside-eyebrow">{item.date}</p>
                <h3 className="film__aside-title">{item.aside.right.title}</h3>
                <p className="film__aside-body">{item.aside.right.body}</p>
                <p className="film__stat">
                  <span className="film__stat-value">{item.aside.right.stat.value}</span>
                  <span className="film__stat-label">{item.aside.right.stat.label}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        <dl className="film__facts">
          <div>
            <dt>Programme</dt>
            <dd>
              {phases[0]?.date} — {phases[phases.length - 1]?.date}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{months} months</dd>
          </div>
        </dl>
      </aside>

      <div ref={hintRef} className="hint" data-gone="false">
        Scroll to build
      </div>

      <div className="staff">
        <div ref={trackRef} className="staff__ticks">
          {minorTicks.map((at) => (
            <div key={`m${at}`} className="staff__tick" style={{ left: `${at * 100}%` }} />
          ))}
          {phases.map((p) => (
            <div
              key={p.name}
              className="staff__tick staff__tick--major"
              style={{ left: `${p.at * 100}%` }}
            />
          ))}
          <div ref={headRef} className="staff__head" />
        </div>

        <div className="staff__labels">
          {phases.map((p, i) => (
            <div
              key={p.name}
              className="staff__label"
              data-current={i === index}
              style={{ left: `${p.at * 100}%` }}
            >
              {p.date}
            </div>
          ))}
        </div>

        <div ref={readoutRef} className="staff__readout">
          00%
        </div>
      </div>
    </div>
  );
}
