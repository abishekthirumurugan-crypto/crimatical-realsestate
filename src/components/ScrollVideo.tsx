/**
 * ScrollVideo — scroll-driven video scrubbing.
 *
 * Replaces an image sequence (e.g. 700 JPEGs) with a single compressed video
 * whose `currentTime` is driven by scroll depth.
 *
 * Why this beats 700 stills:
 *   700 JPEGs at ~120 KB each is ~84 MB and 700 HTTP requests, and the
 *   redundancy between neighbouring frames is paid for in full on every one of
 *   them. The same motion as H.264 with a short GOP is one request and a couple
 *   of MB, because only what *changed* between frames is transmitted.
 *
 * Design notes:
 *   - Zero dependencies. No GSAP / Framer Motion / Lenis needed.
 *   - Scroll events never touch the DOM. They only wake the rAF loop, which owns
 *     every layout read and every write, so fast scrolling cannot thrash layout.
 *   - The scrub target is smoothed with a frame-rate-independent exponential
 *     lerp, so flick-scrolling glides instead of stepping.
 *   - Seeks are gated on decoder readiness via `requestVideoFrameCallback` and
 *     `seeked`, with a watchdog. Issuing seeks faster than the decoder can
 *     present them is the single biggest cause of scrub stutter.
 *
 * The encode matters as much as this file. See FFMPEG.md — a long GOP makes
 * backward scrubbing stutter no matter how good the JavaScript is.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

/* ------------------------------------------------------------------ types */

export interface ScrollVideoSource {
  /** URL of the encoded file. */
  src: string;
  /** Full MIME type, e.g. `video/webm; codecs="vp9"` or `video/mp4; codecs="avc1.640028"`. */
  type: string;
  /** Optional media query. First source whose query matches (and whose type the browser can play) wins. */
  media?: string;
}

export type PreloadStrategy = 'blob' | 'native';

/** A snapshot of what the component is doing, for diagnostics UI. */
export interface ScrollVideoStatus {
  /** The encode selected for this viewport, before any bytes moved. */
  source: ScrollVideoSource | null;
  /** Index of that encode in the `sources` array, or -1. */
  sourceIndex: number;
  matchedMedia: string | null;
  received: number;
  /** 0 when the server sends no Content-Length. */
  total: number;
  /** 0–1, NaN when indeterminate. */
  progress: number;
  /** The whole file is in memory and handed to the element. */
  downloaded: boolean;
  /** The element reports a usable duration; scrubbing has started. */
  ready: boolean;
  /** Intrinsic size of the decoded video, 0 until metadata lands. */
  videoWidth: number;
  videoHeight: number;
  /** Seconds, 0 until metadata lands. */
  duration: number;
  error: Error | null;
}

export interface ScrollVideoProps {
  /** Candidate encodings, best-first. */
  sources: ScrollVideoSource[];
  /**
   * Scroll distance allocated to the animation, as a multiple of viewport
   * height. 3 => the sticky stage stays pinned for 3 screens of scrolling.
   * @default 3
   */
  scrollLengthVh?: number;
  /**
   * Smoothing factor, 0–1. Fraction of the remaining distance closed every
   * 16.67 ms. Lower = heavier and more filmic, higher = snappier.
   * 1 disables smoothing entirely.
   * @default 0.12
   */
  smoothing?: number;
  /**
   * Source frame rate. When supplied, seek targets snap to frame centres, which
   * removes redundant sub-frame seeks. Leave undefined to scrub freely.
   */
  fps?: number;
  /** `poster` frame shown before the video paints. */
  poster?: string;
  /**
   * `blob` downloads the file with fetch() and plays it from an object URL:
   * determinate progress, and backward scrubbing never re-hits the network.
   * `native` defers to the browser's own `preload="auto"`.
   * @default 'blob'
   */
  preloadStrategy?: PreloadStrategy;
  /** `crossOrigin` for both the fetch and the media element. */
  crossOrigin?: 'anonymous' | 'use-credentials';
  /**
   * `object-fit` for the video.
   *
   * `cover` fills the stage but crops whatever does not fit — on a phone a 16:9
   * encode loses a large slice of its width or height. `contain` shows the whole
   * frame and letterboxes instead; pair it with `ambientLetterbox` so the bars
   * are not dead black.
   * @default 'cover'
   */
  objectFit?: CSSProperties['objectFit'];
  /**
   * Tint the letterbox with colour sampled from the frame's own edges, so
   * `contain` bars read as part of the picture rather than as bars.
   * Ignored unless `objectFit` is `contain`.
   * @default false
   */
  ambientLetterbox?: boolean;
  /**
   * Honour `prefers-reduced-motion: reduce` by dropping the sticky scrub
   * entirely: the stage collapses to a single static frame and the page scrolls
   * normally. Scroll-jacked motion is a vestibular trigger, and a 3×-viewport
   * spacer with nothing moving in it is just dead space.
   * @default true
   */
  respectReducedMotion?: boolean;
  /** Rendered over the video, inside the sticky stage. Receives eased progress. */
  children?: ReactNode | ((progress: number) => ReactNode);
  /** Custom loading UI. Receives 0–1 download progress (NaN when indeterminate). */
  renderLoader?: (progress: number) => ReactNode;
  /** Fires on every committed progress change, 0–1. Eased, not raw. */
  onProgress?: (progress: number) => void;
  /**
   * Download progress, 0–1 (NaN when the server sends no Content-Length).
   * Lets an external loading screen show the same figure the built-in one does.
   */
  onLoadProgress?: (progress: number) => void;
  /**
   * Richer counterpart to `onLoadProgress`, for a diagnostics panel. Fires when
   * the integer percentage changes or a state flag flips — not per chunk.
   */
  onStatus?: (status: ScrollVideoStatus) => void;
  /** Fires once the video is scrub-ready, with its duration in seconds. */
  onReady?: (duration: number) => void;
  /** Receives the scroll wrapper, for anything that needs the film's page position. */
  containerRef?: RefObject<HTMLDivElement | null>;
  /** Receives the media element, for anything that must follow the film's clock. */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Fires if loading fails. */
  onError?: (error: Error) => void;
  className?: string;
  style?: CSSProperties;
}

/* -------------------------------------------------------------- constants */

/** Reference frame duration for the frame-rate-independent lerp. */
const REF_FRAME_MS = 1000 / 60;
/** Stop the rAF loop once eased and target agree within this fraction. */
const SETTLE_EPSILON = 1e-4;
/** Never re-issue a seek smaller than this (seconds). */
const MIN_SEEK_DELTA = 1 / 240;
/** If the decoder never reports back, release the gate anyway (ms). */
const SEEK_WATCHDOG_MS = 250;
/** Smallest progress change worth re-rendering the overlay for. */
const PROGRESS_EPSILON = 1 / 2000;
/** Clamp on the rAF delta, so returning from a background tab doesn't jump the ease. */
const MAX_TICK_MS = 100;

/* ---------------------------------------------------------------- helpers */

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** `useLayoutEffect` that degrades to `useEffect` where there is no DOM. */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Pick the first source the browser can actually play whose `media` matches.
 * Done in JS because `<source media>` is only honoured inside `<picture>` —
 * browsers ignore it on `<video>`.
 */
function pickSource(sources: ScrollVideoSource[]): ScrollVideoSource | null {
  if (typeof document === 'undefined') return sources[0] ?? null;
  const probe = document.createElement('video');
  for (const source of sources) {
    if (source.media && !window.matchMedia(source.media).matches) continue;
    if (probe.canPlayType(source.type) === '') continue;
    return source;
  }
  return sources.find((s) => !s.media) ?? sources[0] ?? null;
}

/**
 * Bitmap size of the ambient backdrop canvas.
 *
 * Deliberately tiny. It is stretched across the whole stage, so the browser's
 * own bilinear upscale does most of the blurring for free and the CSS blur on
 * top only has to remove the last of the banding. Rasterising a 64×36 texture
 * costs nothing next to blurring a full-resolution frame.
 */
const PROXY_W = 64;
const PROXY_H = 36;
/** Don't redraw the backdrop more often than this. */
const AMBIENT_MS = 180;

/** Video element with the (still non-standard) rVFC hook typed in. */
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/* ------------------------------------------------------- source selection */

function useResolvedSource(sources: ScrollVideoSource[]): ScrollVideoSource | null {
  const [resolved, setResolved] = useState<ScrollVideoSource | null>(null);

  // Identity-stable key so a fresh array literal each render doesn't re-run this.
  const key = sources.map((s) => `${s.src}|${s.type}|${s.media ?? ''}`).join('~');
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  // Re-evaluate whenever a `media` query flips (orientation change, resize).
  useIsomorphicLayoutEffect(() => {
    const list = sourcesRef.current;
    const update = () => setResolved(pickSource(list));
    update();

    const queries = list
      .filter((s): s is ScrollVideoSource & { media: string } => Boolean(s.media))
      .map((s) => window.matchMedia(s.media));
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, [key]);

  return resolved;
}

/* -------------------------------------------------------- reduced motion */

function usePrefersReducedMotion(enabled: boolean): boolean {
  const [reduced, setReduced] = useState(false);

  useIsomorphicLayoutEffect(() => {
    if (!enabled) {
      setReduced(false);
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [enabled]);

  return reduced;
}

/* --------------------------------------------------------- blob preloader */

interface LoadState {
  /** Object URL when the blob strategy finished, else the raw src. */
  url: string | null;
  /** 0–1, or NaN when the server sends no Content-Length. */
  progress: number;
  /** Bytes received so far. */
  received: number;
  /** Bytes advertised by Content-Length, or 0 when the server sent none. */
  total: number;
  error: Error | null;
}

const EMPTY_LOAD: LoadState = {
  url: null,
  progress: 0,
  received: 0,
  total: 0,
  error: null,
};

/** With no Content-Length there is no percentage to change, so tick on time. */
const BYTES_TICK_MS = 250;

function useVideoBytes(
  source: ScrollVideoSource | null,
  strategy: PreloadStrategy,
  crossOrigin: ScrollVideoProps['crossOrigin'],
): LoadState {
  const [state, setState] = useState<LoadState>(EMPTY_LOAD);

  useEffect(() => {
    if (!source) return;

    if (strategy === 'native') {
      setState({ ...EMPTY_LOAD, url: source.src, progress: Number.NaN });
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(source.src, {
          signal: controller.signal,
          credentials: crossOrigin === 'use-credentials' ? 'include' : 'same-origin',
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

        const total = Number(response.headers.get('Content-Length')) || 0;
        const reader = response.body?.getReader();

        // No Content-Length (chunked transfer, some CDNs) — we can't show a
        // percentage, so tell the loader to go indeterminate rather than sitting
        // at "0%" for the whole download.
        if (!total && !cancelled) {
          setState((prev) => ({ ...prev, progress: Number.NaN, total: 0 }));
        }

        // No streaming body available — fall back to an opaque await.
        if (!reader) {
          const blob = await response.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setState({
            url: objectUrl,
            progress: 1,
            received: blob.size,
            total: blob.size,
            error: null,
          });
          return;
        }

        const chunks: Uint8Array[] = [];
        let received = 0;
        let lastPct = -1;
        let lastTick = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          chunks.push(value);
          received += value.length;
          if (cancelled) continue;

          // A multi-MB body arrives in thousands of chunks. Re-render only when
          // the displayed integer percentage changes — or, with no
          // Content-Length to compute one from, a few times a second so the byte
          // counter still moves.
          if (total) {
            const pct = Math.floor((received / total) * 100);
            if (pct === lastPct) continue;
            lastPct = pct;
          } else {
            const now = performance.now();
            if (now - lastTick < BYTES_TICK_MS) continue;
            lastTick = now;
          }

          const at = received;
          setState((prev) => ({
            ...prev,
            received: at,
            // `total` has to ride along on every update, not just the final one:
            // a reader that has a percentage but no denominator can only report
            // the size as unknown, which contradicts the percentage.
            total,
            progress: total ? clamp01(at / total) : Number.NaN,
          }));
        }
        if (cancelled) return;

        const blob = new Blob(chunks as BlobPart[], { type: source.type.split(';')[0] });
        objectUrl = URL.createObjectURL(blob);
        setState({
          url: objectUrl,
          progress: 1,
          received: blob.size,
          total: total || blob.size,
          error: null,
        });
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return;
        // A failed prefetch shouldn't kill the experience — let the element try
        // the network itself.
        setState({
          ...EMPTY_LOAD,
          url: source.src,
          progress: Number.NaN,
          error: err as Error,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, strategy, crossOrigin]);

  return state;
}

/* -------------------------------------------------------------- component */

export default function ScrollVideo({
  sources,
  scrollLengthVh = 3,
  smoothing = 0.12,
  fps,
  poster,
  preloadStrategy = 'blob',
  crossOrigin,
  objectFit = 'cover',
  ambientLetterbox = false,
  respectReducedMotion = true,
  children,
  renderLoader,
  onProgress,
  onLoadProgress,
  onStatus,
  onReady,
  onError,
  className,
  style,
  containerRef,
  videoRef: externalVideoRef,
}: ScrollVideoProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<FrameCallbackVideo>(null);

  const setWrapper = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      if (containerRef) containerRef.current = node;
    },
    [containerRef],
  );

  const setVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node as FrameCallbackVideo | null;
      if (externalVideoRef) externalVideoRef.current = node;
    },
    [externalVideoRef],
  );

  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);

  const reducedMotion = usePrefersReducedMotion(respectReducedMotion);
  const source = useResolvedSource(sources);
  const {
    url,
    progress: downloadProgress,
    received,
    total,
    error: loadError,
  } = useVideoBytes(source, preloadStrategy, crossOrigin);

  /* --- mutable scrub state; deliberately outside React to avoid re-renders -- */
  const targetRef = useRef(0); // raw scroll progress, 0–1
  const easedRef = useRef(0); // smoothed progress, 0–1
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const runningRef = useRef(false);
  const visibleRef = useRef(true);
  const seekPendingRef = useRef(false);
  const seekIssuedAtRef = useRef(0);
  const lastSeekTimeRef = useRef(-1);
  const durationRef = useRef(0);
  const committedProgressRef = useRef(0);
  const readyFiredRef = useRef(false);

  // Only the render-prop form of `children` reads `progress`; with plain
  // children or none, the state update is pure overhead.
  const needsProgressStateRef = useRef(false);
  needsProgressStateRef.current = typeof children === 'function';

  // Keep callbacks fresh without restarting the loop.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  /* -------------------------------------------------- scroll -> target ---- */

  /** Pure layout READ. Only ever called from inside the rAF tick. */
  const readScrollProgress = useCallback((): number => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return targetRef.current;

    const rect = wrapper.getBoundingClientRect();
    // Scrollable travel = total height minus the one viewport the stage occupies.
    const travel = rect.height - window.innerHeight;
    if (travel <= 0) return 0;
    return clamp01(-rect.top / travel);
  }, []);

  /* ------------------------------------------------------ the rAF loop ---- */

  const tick = useCallback(
    (now: number) => {
      rafRef.current = null;

      const video = videoRef.current;
      if (!video) {
        runningRef.current = false;
        return;
      }

      const dt = lastTickRef.current
        ? Math.min(now - lastTickRef.current, MAX_TICK_MS)
        : REF_FRAME_MS;
      lastTickRef.current = now;

      // --- READ phase -------------------------------------------------------
      // One getBoundingClientRect per frame, before any write. Nothing else in
      // this component reads layout, so there is no read-write-read cycle to
      // force a synchronous reflow — this is what "no layout thrashing" means
      // in practice, and it is why the scroll handler itself does nothing.
      targetRef.current = readScrollProgress();

      // --- SMOOTH phase -----------------------------------------------------
      const target = targetRef.current;
      let eased = easedRef.current;

      if (smoothing >= 1) {
        eased = target;
      } else {
        // Frame-rate independent exponential decay: one 30 fps tick advances the
        // ease exactly as far as two 60 fps ticks, so the curve is identical on a
        // 30, 60 or 120 Hz display and survives dropped frames unchanged.
        //
        // The naive `eased += (target - eased) * smoothing` does NOT have this
        // property — it converges twice as fast at 120 Hz as at 60 Hz.
        const alpha = 1 - Math.pow(1 - smoothing, dt / REF_FRAME_MS);
        eased += (target - eased) * alpha;
      }

      const settled = Math.abs(target - eased) < SETTLE_EPSILON;
      if (settled) eased = target;
      easedRef.current = eased;

      // --- WRITE phase ------------------------------------------------------
      const duration = durationRef.current;
      if (duration > 0) {
        // Stay a hair inside the media range; seeking to exactly `duration`
        // parks on a black frame in some decoders.
        const epsilon = fps ? 1 / (fps * 2) : 0.01;
        let time = eased * (duration - epsilon);

        // Snap to the centre of a frame: sub-frame seeks cost a decode and
        // change nothing on screen. Frame n occupies [n/fps, (n+1)/fps); its
        // centre is (n + 0.5)/fps, which is the safest point to land on.
        if (fps) time = (Math.round(time * fps - 0.5) + 0.5) / fps;

        if (seekPendingRef.current && now - seekIssuedAtRef.current > SEEK_WATCHDOG_MS) {
          seekPendingRef.current = false; // decoder went quiet; don't deadlock
        }

        // The gate is the whole trick. Assigning `currentTime` faster than the
        // decoder can present frames queues seeks that are already stale by the
        // time they resolve, and the picture then lags the scroll by a growing
        // margin. One seek in flight at a time, always to the newest target.
        if (!seekPendingRef.current && Math.abs(time - lastSeekTimeRef.current) >= MIN_SEEK_DELTA) {
          seekPendingRef.current = true;
          seekIssuedAtRef.current = now;
          lastSeekTimeRef.current = time;
          video.currentTime = time;
        }
      }

      // --- COMMIT -----------------------------------------------------------
      // Ref callback: free, no render.
      onProgressRef.current?.(eased);

      // React state: costs a render of the overlay subtree, so only pay for it
      // when something actually reads `progress`, and only when the value moved
      // enough to be visible.
      if (
        needsProgressStateRef.current &&
        (settled || Math.abs(eased - committedProgressRef.current) >= PROGRESS_EPSILON)
      ) {
        committedProgressRef.current = eased;
        setProgress(eased);
      }

      // Keep spinning while the ease is still catching up or a seek is in flight.
      // Otherwise park: an idle scroll video should cost zero frames.
      if (!settled || seekPendingRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        runningRef.current = false;
        lastTickRef.current = 0;
      }
    },
    [fps, readScrollProgress, smoothing],
  );

  // Read inside `kick`, which is called from event handlers and from the
  // readiness effect — both of which would otherwise start the loop before the
  // reduced-motion branch has had a chance to opt out of it.
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const kick = useCallback(() => {
    // Under reduced motion there is no scrub at all: the loop would drive
    // `currentTime` from scroll position and immediately undo the still frame
    // parked below.
    if (reducedMotionRef.current) return;
    if (runningRef.current || !visibleRef.current) return;
    runningRef.current = true;
    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  /* ------------------------------------------------ metadata / readiness -- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    const markReady = () => {
      // `duration` is the gate: without a finite one there is nothing to map
      // scroll onto and every seek would be a no-op. This is why the scroll
      // listeners below only attach once this has passed.
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      durationRef.current = video.duration;

      // The "have we already fired?" latch is a ref, not the `ready` state.
      // React may run state updaters twice, so notifying from inside one both
      // fires `onReady` twice and — if the parent reacts by setting its own
      // state — updates another component mid-render.
      if (!readyFiredRef.current) {
        readyFiredRef.current = true;
        onReadyRef.current?.(video.duration);
      }
      setReady(true);
      kick();
    };

    const handleError = () => {
      onErrorRef.current?.(new Error(video.error?.message || 'Video failed to load'));
    };

    // iOS/Safari will not composite a frame until the element has been "played"
    // at least once, even when every seek succeeds. A muted play/pause primes it.
    const prime = () => {
      const attempt = video.play();
      if (attempt && typeof attempt.then === 'function') {
        attempt
          .then(() => video.pause())
          .catch(() => {
            /* autoplay refused; the first user gesture will unlock it */
          });
      }
    };

    video.addEventListener('loadedmetadata', markReady);
    video.addEventListener('canplaythrough', markReady);
    video.addEventListener('error', handleError);
    video.addEventListener('loadeddata', prime, { once: true });

    // The element may already be past those events (cached blob, fast decode),
    // in which case no further one will ever fire.
    if (video.readyState >= 1) markReady();

    return () => {
      video.removeEventListener('loadedmetadata', markReady);
      video.removeEventListener('canplaythrough', markReady);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadeddata', prime);
    };
  }, [url, kick]);

  useEffect(() => {
    if (loadError) onErrorRef.current?.(loadError);
  }, [loadError]);

  // Mirror the download figure outward so an external loading screen can show
  // the same number the built-in one would have.
  const onLoadProgressRef = useRef(onLoadProgress);
  onLoadProgressRef.current = onLoadProgress;
  useEffect(() => {
    onLoadProgressRef.current?.(downloadProgress);
  }, [downloadProgress]);

  // The diagnostics snapshot. Keyed on primitives that only move when something
  // a reader would notice has changed, so this is not a per-chunk firehose —
  // `useVideoBytes` already throttles its own state to whole percentage points.
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => {
    if (!onStatusRef.current) return;
    const video = videoRef.current;
    const index = source ? sources.indexOf(source) : -1;
    onStatusRef.current({
      source,
      sourceIndex: index,
      matchedMedia: source?.media ?? null,
      received,
      total,
      progress: downloadProgress,
      downloaded: Boolean(url) && preloadStrategy === 'blob' && downloadProgress === 1,
      ready,
      videoWidth: video?.videoWidth ?? 0,
      videoHeight: video?.videoHeight ?? 0,
      duration: durationRef.current,
      error: loadError,
    });
    // `sources` is intentionally not a dep: it is a fresh array each render in
    // most call sites, and `source` already captures the only part that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, received, total, downloadProgress, url, ready, preloadStrategy, loadError]);

  /* ------------------------------------------------------- seek gating ---- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;

    const release = () => {
      if (!seekPendingRef.current) return;
      seekPendingRef.current = false;
      kick(); // the loop may have parked while waiting on this seek
    };

    // Two signals, whichever lands first:
    //
    //  - rVFC fires when a frame is actually *presented*, the most honest
    //    "decoder is free again" signal. But it only fires for a NEW frame, so a
    //    seek that resolves to the frame already on screen may never call it.
    //  - `seeked` always fires when a seek completes, including that case.
    //
    // Using both keeps the paint-accurate timing where available without ever
    // parking on the watchdog.
    const useRvfc = typeof video.requestVideoFrameCallback === 'function';
    let handle: number | null = null;

    if (useRvfc) {
      const onFrame = () => {
        release();
        handle = video.requestVideoFrameCallback!(onFrame);
      };
      handle = video.requestVideoFrameCallback!(onFrame);
    }
    video.addEventListener('seeked', release);

    return () => {
      if (useRvfc && handle !== null) video.cancelVideoFrameCallback?.(handle);
      video.removeEventListener('seeked', release);
    };
  }, [ready, kick]);

  /* -------------------------------------------------- ambient backdrop ---- */

  /**
   * Fill the stage behind a `contain`-fitted video with a blurred, enlarged copy
   * of the frame itself, so the screen is never letterboxed with dead colour.
   *
   * The cost is one `drawImage` into a 64×36 canvas five times a second. The
   * upscale to full stage is a GPU stretch of a tiny texture, not a
   * full-resolution blur.
   */
  useEffect(() => {
    if (!ready || objectFit !== 'contain' || !ambientLetterbox) return;
    const video = videoRef.current;
    const canvas = backdropRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    let stopped = false;

    const paint = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(paint);
      if (now - last < AMBIENT_MS) return;
      last = now;

      if (!video.videoWidth || !video.videoHeight) return;
      try {
        // Stretched rather than cover-cropped: at this blur radius the
        // distortion is not perceptible, and it guarantees the backdrop carries
        // colour from every edge of the frame.
        ctx.drawImage(video, 0, 0, PROXY_W, PROXY_H);
        canvas.style.opacity = '1';
      } catch {
        // A cross-origin frame taints the canvas. Give up quietly; the flat
        // stage colour behind is a perfectly good fallback.
        stopped = true;
        cancelAnimationFrame(raf);
      }
    };

    raf = requestAnimationFrame(paint);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      canvas.style.opacity = '0';
    };
  }, [ready, objectFit, ambientLetterbox]);

  /* ------------------------------------- listeners: scroll / resize / vis -- */

  useEffect(() => {
    if (!ready || reducedMotion) return;

    // Passive: never blocks the compositor. Does no DOM work — just wakes the
    // loop, so a burst of 200 scroll events still costs exactly one rAF tick.
    const onScroll = () => kick();
    const onResize = () => {
      lastSeekTimeRef.current = -1; // geometry moved; force a re-seek
      kick();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });

    // Don't burn frames while the stage is off-screen or the tab is hidden.
    const wrapper = wrapperRef.current;
    let observer: IntersectionObserver | null = null;
    if (wrapper) {
      observer = new IntersectionObserver(
        ([entry]) => {
          visibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting) kick();
        },
        { rootMargin: '15% 0px' },
      );
      observer.observe(wrapper);
    }

    const onVisibility = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden) kick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    kick(); // sync to wherever the page already is (reload mid-page, hash jump)

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      runningRef.current = false;
    };
  }, [ready, kick, reducedMotion]);

  /* ----------------------------------------------- reduced-motion still --- */

  // Park on a representative frame rather than frame 0, which on most films is
  // a near-black fade-in.
  useEffect(() => {
    if (!reducedMotion || !ready) return;
    const video = videoRef.current;
    if (!video || !durationRef.current) return;
    video.currentTime = durationRef.current * 0.5;
  }, [reducedMotion, ready]);

  /* -------------------------------------------------------------- render -- */

  const wrapperStyle = useMemo<CSSProperties>(
    () => ({
      position: 'relative',
      // With reduced motion there is no scrub, so the tall spacer would be an
      // empty scroll past a frozen image. Collapse it to one screen.
      height: reducedMotion ? '100vh' : `${scrollLengthVh * 100}vh`,
      ...style,
    }),
    [scrollLengthVh, style, reducedMotion],
  );

  const stageStyle = useMemo<CSSProperties>(
    () => (reducedMotion ? { ...STAGE_STYLE, position: 'relative' } : STAGE_STYLE),
    [reducedMotion],
  );

  const loaderPct = Number.isNaN(downloadProgress) ? null : Math.round(downloadProgress * 100);

  return (
    <div ref={setWrapper} className={className} style={wrapperStyle} data-scroll-video="">
      <div style={stageStyle}>
        {objectFit === 'contain' && ambientLetterbox && (
          <canvas
            ref={backdropRef}
            width={PROXY_W}
            height={PROXY_H}
            aria-hidden="true"
            style={BACKDROP_STYLE}
          />
        )}

        <video
          ref={setVideo}
          src={url ?? undefined}
          poster={poster}
          crossOrigin={crossOrigin}
          // Decoder-friendly attributes. `muted` + `playsInline` are what let
          // mobile browsers decode without a user gesture or a fullscreen
          // takeover; `preload="auto"` tells the browser to buffer the whole
          // file rather than just enough to start playing.
          muted
          playsInline
          preload="auto"
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          aria-hidden="true"
          style={{ ...VIDEO_STYLE, objectFit, opacity: ready ? 1 : 0 }}
        />

        {!ready &&
          (renderLoader ? (
            renderLoader(downloadProgress)
          ) : (
            <div style={LOADER_STYLE}>
              <div style={SPINNER_STYLE} />
              <div style={LOADER_TEXT_STYLE}>
                {loaderPct === null ? 'Loading' : `Loading ${loaderPct}%`}
              </div>
            </div>
          ))}

        {ready && (typeof children === 'function' ? children(progress) : children)}
      </div>

      <style>{KEYFRAMES}</style>
    </div>
  );
}

/* ---------------------------------------------------------------- styles */

const STAGE_STYLE: CSSProperties = {
  position: 'sticky',
  top: 0,
  height: '100vh',
  width: '100%',
  overflow: 'hidden',
  // Deliberately no `contain`: containment on a sticky element is
  // inconsistently implemented across engines, and `overflow: hidden` already
  // gives this stage the only clipping it needs.
  backgroundColor: '#000',
};

const BACKDROP_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  // Scaled past the edges so the blur's own soft falloff never reveals a
  // lighter rim where the texture ends.
  transform: 'scale(1.12)',
  filter: 'blur(34px) saturate(1.15) brightness(0.82)',
  opacity: 0,
  transition: 'opacity 400ms ease',
  pointerEvents: 'none',
};

const VIDEO_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  transition: 'opacity 300ms ease',
  // Promote to its own compositor layer so each new frame is a texture upload,
  // not a document repaint.
  willChange: 'transform',
  transform: 'translateZ(0)',
};

const LOADER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '14px',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '13px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const SPINNER_STYLE: CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.18)',
  borderTopColor: 'rgba(255,255,255,0.9)',
  animation: 'sv-spin 800ms linear infinite',
};

const LOADER_TEXT_STYLE: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.75,
};

const KEYFRAMES = '@keyframes sv-spin{to{transform:rotate(360deg)}}';
