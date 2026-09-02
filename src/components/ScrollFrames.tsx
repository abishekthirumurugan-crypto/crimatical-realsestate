/**
 * The film as an image sequence on a canvas, for WebKit.
 *
 * This exists because the `<video>` route cannot be made to work on iOS. Three
 * attempts went into it and each failed in the same place: the element decodes,
 * reports its duration, satisfies every seek, and composites nothing. Blob
 * source, direct URL, gesture-primed playback, a canvas mirroring the decoder —
 * all of them still depend on iOS handing back a frame, and on the device in
 * question it does not.
 *
 * So nothing here decodes video. There are 240 WebP stills and a `drawImage`,
 * which is the same technique Apple uses on their own scroll pages and for the
 * same reason. It cannot fail the way the video did because there is no media
 * element in it at all.
 *
 * What it costs is weight: 2.9MB against the video's 900KB, at the same 480px
 * and the same 24 frames a second, so the stepping is identical — 21px of
 * scroll per frame on a 390x844 screen. That is the trade, and it is only paid
 * by the browser that needs it; `Home` keeps every other engine on the video.
 *
 * The scroll -> progress half is deliberately the same shape as `ScrollVideo`:
 * one rAF loop that reads layout once, eases toward the target with a
 * frame-rate-independent decay, and parks when it catches up. What it does not
 * need is the whole seek-gating apparatus — an image is either decoded or it is
 * not, and drawing one costs nothing to schedule.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

/** Reference frame duration for the frame-rate-independent lerp. */
const REF_FRAME_MS = 1000 / 60;
/** Stop the rAF loop once eased and target agree within this fraction. */
const SETTLE_EPSILON = 1e-4;
/** Clamp on the rAF delta, so returning from a background tab doesn't jump. */
const MAX_TICK_MS = 100;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface ScrollFramesProps {
  /** Builds the URL for frame `i`, 1-based. */
  frameUrl: (index: number) => string;
  /** How many frames the sequence holds. */
  count: number;
  /** Intrinsic frame size, so the canvas is sized before anything decodes. */
  frameWidth: number;
  frameHeight: number;
  /** Scroll distance, as a multiple of viewport height. */
  scrollLengthVh?: number;
  /** Fraction of the remaining distance closed every 16.67ms. 1 disables it. */
  smoothing?: number;
  objectFit?: CSSProperties['objectFit'];
  respectReducedMotion?: boolean;
  className?: string;
  stageClassName?: string;
  style?: CSSProperties;
  /** Receives eased progress, 0–1, on every tick. */
  onProgress?: (progress: number) => void;
  /** Custom loading UI. Receives 0–1 decode progress. */
  renderLoader?: (progress: number) => ReactNode;
  children?: ReactNode;
  containerRef?: RefObject<HTMLDivElement | null>;
}

export default function ScrollFrames({
  frameUrl,
  count,
  frameWidth,
  frameHeight,
  scrollLengthVh = 6,
  smoothing = 0.6,
  objectFit = 'cover',
  respectReducedMotion = true,
  className,
  stageClassName,
  style,
  onProgress,
  renderLoader,
  children,
  containerRef,
}: ScrollFramesProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);

  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);

  const targetRef = useRef(0);
  const easedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const runningRef = useRef(false);
  const drawnRef = useRef(-1);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (!respectReducedMotion || typeof window === 'undefined' || !window.matchMedia) return;
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, [respectReducedMotion]);

  const setWrapper = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      if (containerRef) containerRef.current = node;
    },
    [containerRef],
  );

  /* ------------------------------------------------------------- preload -- */

  /*
   * Every frame is fetched up front and the loader holds until they are in.
   *
   * Streaming them in as the reader scrolls would start faster and then stutter
   * on whatever has not arrived, which is the failure this whole exercise is
   * trying to leave behind. 2.9MB with a real percentage in front of it is the
   * honest version.
   *
   * They are held as `Image` rather than `ImageBitmap` on purpose. An
   * ImageBitmap is a decoded buffer this code would own — 240 of them at
   * 480x854 is about 390MB, which no phone will tolerate. An `Image` holds the
   * compressed bytes and lets the engine decode and evict on its own terms; a
   * scrub walks neighbouring frames, which is exactly the access pattern its
   * cache is good at.
   */
  useEffect(() => {
    let cancelled = false;
    let done = 0;
    const images: HTMLImageElement[] = new Array(count);

    for (let i = 0; i < count; i++) {
      const img = new Image();
      img.decoding = 'async';
      const settle = () => {
        if (cancelled) return;
        done += 1;
        setLoaded(done);
        if (done === count) setReady(true);
      };
      img.onload = settle;
      // A frame that 404s must not hold the loader for ever; the draw simply
      // skips it and the previous frame stays up.
      img.onerror = settle;
      img.src = frameUrl(i + 1);
      images[i] = img;
    }
    imagesRef.current = images;

    return () => {
      cancelled = true;
      images.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [count, frameUrl]);

  /* ---------------------------------------------------------------- draw -- */

  const draw = useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      const img = imagesRef.current[index];
      if (!canvas || !img || !img.complete || !img.naturalWidth) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawnRef.current = index;
    },
    [],
  );

  /* ------------------------------------------------------------ the loop -- */

  const readScrollProgress = useCallback((): number => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return targetRef.current;
    const rect = wrapper.getBoundingClientRect();
    const travel = rect.height - window.innerHeight;
    if (travel <= 0) return 0;
    return clamp01(-rect.top / travel);
  }, []);

  const tick = useCallback(
    (now: number) => {
      rafRef.current = null;

      const dt = lastTickRef.current ? Math.min(now - lastTickRef.current, MAX_TICK_MS) : REF_FRAME_MS;
      lastTickRef.current = now;

      targetRef.current = readScrollProgress();
      const target = targetRef.current;
      let eased = easedRef.current;

      if (smoothing >= 1) {
        eased = target;
      } else {
        // Same decay as ScrollVideo: one 30fps tick advances exactly as far as
        // two 60fps ticks, so the curve survives a dropped frame unchanged.
        const alpha = 1 - Math.pow(1 - smoothing, dt / REF_FRAME_MS);
        eased += (target - eased) * alpha;
      }

      const settled = Math.abs(target - eased) < SETTLE_EPSILON;
      if (settled) eased = target;
      easedRef.current = eased;

      const index = Math.min(count - 1, Math.max(0, Math.round(eased * (count - 1))));
      if (index !== drawnRef.current) draw(index);

      onProgressRef.current?.(eased);

      if (!settled) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        runningRef.current = false;
        lastTickRef.current = 0;
      }
    },
    [count, draw, readScrollProgress, smoothing],
  );

  const kick = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useLayoutEffect(() => {
    if (!ready) return;

    // Paint whatever the current scroll position asks for before the loader
    // goes, so the reveal is never a blank canvas.
    easedRef.current = readScrollProgress();
    targetRef.current = easedRef.current;
    draw(Math.round(easedRef.current * (count - 1)));

    if (reduced) return;

    const onScroll = () => kick();
    const onResize = () => {
      drawnRef.current = -1;
      kick();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    kick();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      runningRef.current = false;
    };
  }, [ready, reduced, kick, draw, count, readScrollProgress]);

  /* -------------------------------------------------------------- render -- */

  const wrapperStyle: CSSProperties = {
    position: 'relative',
    height: reduced ? '100vh' : `${scrollLengthVh * 100}vh`,
    ...style,
  };

  const stageStyle: CSSProperties = {
    position: reduced ? 'relative' : 'sticky',
    top: 0,
    height: '100vh',
    width: '100%',
    overflow: 'hidden',
  };

  return (
    <div ref={setWrapper} className={className} style={wrapperStyle} data-scroll-video="" data-scroll-frames="">
      <div className={stageClassName} style={stageStyle}>
        <canvas
          ref={canvasRef}
          width={frameWidth}
          height={frameHeight}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit,
            pointerEvents: 'none',
          }}
        />

        {!ready &&
          (renderLoader ? (
            renderLoader(count ? loaded / count : 0)
          ) : (
            <div style={{ position: 'absolute', inset: 0 }} />
          ))}

        {ready && children}
      </div>
    </div>
  );
}
