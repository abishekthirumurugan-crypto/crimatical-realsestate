/**
 * The overlay that rides on top of the film: the current construction stage,
 * and the survey rule that measures how far through the build you have scrolled.
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

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { BuildPhase } from '../content/project';

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

  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  /** Track width in px, so the head can move by transform rather than `left`. */
  const trackWidthRef = useRef(0);
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

  const phase = phases[index];

  return (
    <div className="film__overlay">
      <div className="film__scrim" />

      <div ref={hintRef} className="hint" data-gone="false">
        Scroll to build
      </div>

      <div className="phase">
        <div className="phase__marker">
          Phase {String(index + 1).padStart(2, '0')}
          <span>of {String(phases.length).padStart(2, '0')}</span>
          <span>{phase.date}</span>
        </div>

        {/* Keyed on the stage so React remounts them and the entry animation
            re-runs; the marker above is deliberately not keyed, so something
            stays legible through the cross-fade. */}
        <h2 key={`n${index}`} className="phase__name phase__swap">
          {phase.name}
        </h2>
        <p key={`d${index}`} className="phase__note phase__swap">
          {phase.note}
        </p>
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
