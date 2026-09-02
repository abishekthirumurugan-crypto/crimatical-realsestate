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
  /**
   * Class for the sticky stage — the inner element that is exactly one
   * viewport, holds the video and clips the letterbox.
   *
   * Separate from `className`, which lands on the outer wrapper, because the
   * wrapper is `scrollLengthVh` screens tall. Anything sized against the
   * viewport — a background gradient above all — has to be set here or it
   * resolves against five screens and stretches.
   */
  stageClassName?: string;
  style?: CSSProperties;
  /**
   * Merged over the media element's own styles, after them.
   *
   * The element is absolutely positioned to fill the stage, which a stylesheet
   * cannot override because those styles are inline. This is the seam: pass
   * `insetInline` to reserve gutters beside the frame, for instance, and drive
   * it from a custom property so it can be responsive.
   */
  videoStyle?: CSSProperties;
}

/* -------------------------------------------------------------- constants */

/** Reference frame duration for the frame-rate-independent lerp. */
const REF_FRAME_MS = 1000 / 60;
/** Stop the rAF loop once eased and target agree within this fraction. */
const SETTLE_EPSILON = 1e-4;
/** Never re-issue a seek smaller than this (seconds). */
const MIN_SEEK_DELTA = 1 / 240;
/**
 * If the decoder never reports back, release the gate anyway (ms).
 *
 * A floor, not the value. A fixed watchdog is safe only while it is longer than
 * the decoder actually takes; the moment a device is slower than it, every
 * expiry issues a fresh seek that ABORTS the one still in flight, and a scrub
 * that is merely slow becomes one that never lands a frame at all. The picture
 * freezes while the scroll keeps moving — which is not a slow decoder, it is a
 * decoder being interrupted at a fixed interval forever.
 *
 * So the real watchdog is learned from the device: three times the measured
 * seek latency, floored here and capped below. On anything quick this is
 * exactly the old 250ms; on a phone that needs 400ms a seek, it waits.
 */
const SEEK_WATCHDOG_MS = 250;
/** However slow the decoder proves to be, give up on a seek by here (ms). */
const MAX_SEEK_WATCHDOG_MS = 1000;
/** Weight of the newest sample in the rolling seek-latency estimate. */
const SEEK_LATENCY_ALPHA = 0.2;
/** Smallest progress change worth re-rendering the overlay for. */
const PROGRESS_EPSILON = 1 / 2000;
/** Clamp on the rAF delta, so returning from a background tab doesn't jump the ease. */
const MAX_TICK_MS = 100;
/**
 * How long to wait for a first painted frame before showing the film anyway.
 *
 * The loader holds until the decoder has actually put something on screen, so a
 * decoder that never does would hold it forever — and a spinner that never ends
 * is worse than the thing it is covering for. Failing open is safe here because
 * the element keeps its `poster`: with nothing decoded, what appears is the
 * poster frame, not the blank stage this whole mechanism exists to prevent.
 */
const FIRST_PAINT_TIMEOUT_MS = 5000;

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

/**
 * The part of rVFC's metadata this component uses.
 *
 * `mediaTime` is the presentation timestamp of the frame that was just put on
 * screen — the only way to ask "is the picture showing the frame I asked for?"
 * rather than "has the decoder emitted something?", which is the difference
 * between the seek gate working and the seek gate lying. See the gating effect.
 */
interface FrameMetadata {
  mediaTime: number;
}

/** Video element with the (still non-standard) rVFC hook typed in. */
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: FrameMetadata) => void) => number;
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

/**
 * Whether this engine has to be handed the file's own URL rather than a blob.
 *
 * The blob strategy downloads the file with `fetch()` and plays it from an
 * `URL.createObjectURL` handle. That is a real win where it works — determinate
 * progress, and scrubbing backwards never re-hits the network — but WebKit
 * cannot use it for media. Object URLs do not answer byte-range requests, and
 * range support is what iOS requires before it will decode a video. What you
 * get instead is the shape observed on an iPhone:
 *
 *   - The fetch itself is ordinary XHR-level work and succeeds, so the loader
 *     runs all the way to 100%.
 *   - Safari parses enough of the blob to report `duration`, so `loadedmetadata`
 *     fires and the component thinks it is ready.
 *   - No frame is ever decoded, `play()` cannot prime it, and the poster is
 *     dropped the moment a source is attached. Black stage, overlay copy on top
 *     of nothing.
 *
 * Every browser on iOS is WebKit underneath — Chrome and Firefox there are
 * skins over the same engine — so the test is the platform, not the brand.
 * Desktop Safari is included because it is the same media stack.
 *
 * Sniffing the engine is not usually the right instinct, and it is here only
 * because the alternative is worse: the outcome cannot be feature-detected
 * before committing to it. `MediaSource`/range support cannot be queried for a
 * blob without loading one, and finding out by waiting for a paint that never
 * comes costs the reader the whole timeout on the one platform that fails.
 */
let nativeMediaPreferred: boolean | null = null;

export function prefersNativeMedia(): boolean {
  if (nativeMediaPreferred !== null) return nativeMediaPreferred;
  if (typeof navigator === 'undefined') return (nativeMediaPreferred = false);

  const ua = navigator.userAgent;
  const iOS =
    /iP(hone|ad|od)/.test(ua) ||
    // iPadOS 13+ claims to be a Mac; the touch points are what give it away.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Android|Edg|OPR|SamsungBrowser/.test(ua);

  return (nativeMediaPreferred = iOS || safari);
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
  stageClassName,
  style,
  videoStyle,
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
  /**
   * Whether a frame has actually been PUT ON SCREEN, as opposed to `ready`,
   * which only says metadata arrived. On iOS those are far apart: a video can
   * report its duration, satisfy every seek, and still composite nothing until
   * it has been played once. Revealing on `ready` is what showed a blank stage.
   */
  const [painted, setPainted] = useState(false);
  const [progress, setProgress] = useState(0);

  const reducedMotion = usePrefersReducedMotion(respectReducedMotion);
  const source = useResolvedSource(sources);

  /*
   * WebKit is given the file's own URL even when the caller asked for a blob —
   * see `prefersNativeMedia`. It costs the determinate progress bar there (no
   * `fetch`, so no Content-Length to count), which the loader already handles by
   * showing an indeterminate rule. A progress bar that is honest about a video
   * that will never play is not worth keeping.
   */
  const effectivePreload: PreloadStrategy =
    preloadStrategy === 'blob' && prefersNativeMedia() ? 'native' : preloadStrategy;
  const {
    url,
    progress: downloadProgress,
    received,
    total,
    error: loadError,
  } = useVideoBytes(source, effectivePreload, crossOrigin);

  /* --- mutable scrub state; deliberately outside React to avoid re-renders -- */
  const targetRef = useRef(0); // raw scroll progress, 0–1
  const easedRef = useRef(0); // smoothed progress, 0–1
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const runningRef = useRef(false);
  const visibleRef = useRef(true);
  const seekPendingRef = useRef(false);
  const seekIssuedAtRef = useRef(0);
  /** Rolling estimate of how long THIS decoder takes to serve a seek (ms). */
  const seekLatencyRef = useRef(0);
  const lastSeekTimeRef = useRef(-1);
  const durationRef = useRef(0);
  const committedProgressRef = useRef(0);
  const readyFiredRef = useRef(false);
  /** Whether the muted play/pause that unlocks iOS compositing has succeeded. */
  const primedRef = useRef(false);
  const paintedRef = useRef(false);
  const mirrorRef = useRef<HTMLCanvasElement>(null);

  /**
   * WebKit does not get to decide whether the picture appears.
   *
   * On iOS the `<video>` element is an unreliable thing to *look at*: it will
   * decode and seek happily while compositing nothing, which is the black stage
   * with the overlay copy on top of it. A canvas has no such opinion — whatever
   * `drawImage` can read out of the decoder is what lands on screen. So on
   * WebKit the element becomes a decoder we pull frames out of rather than
   * something the reader sees, and the canvas is the picture.
   *
   * The element stays in the layout underneath, at full opacity, because Safari
   * only permits muted autoplay for elements it treats as visible — being
   * covered by the canvas is not the same as being hidden.
   */
  const mirrored = prefersNativeMedia();

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

  const markPainted = useCallback(() => {
    if (paintedRef.current) return;
    paintedRef.current = true;
    setPainted(true);
  }, []);

  /**
   * Copy the decoder's current frame onto the canvas.
   *
   * Called only where the picture can actually have changed — a completed seek,
   * a presented frame — so an idle film still costs nothing per frame, which is
   * the property the rAF loop is careful about everywhere else.
   */
  const drawMirror = useCallback(() => {
    const video = videoRef.current;
    const canvas = mirrorRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      markPainted();
    } catch {
      // A tainted (cross-origin) frame cannot be read back. Nothing to do here
      // but leave the element itself showing through.
      canvas.style.display = 'none';
    }
  }, [markPainted]);

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

        // Learned from the device rather than assumed — see SEEK_WATCHDOG_MS.
        const watchdog = Math.min(
          MAX_SEEK_WATCHDOG_MS,
          Math.max(SEEK_WATCHDOG_MS, seekLatencyRef.current * 3),
        );
        if (seekPendingRef.current && now - seekIssuedAtRef.current > watchdog) {
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

    /*
     * iOS/Safari will not composite a video frame until the element has been
     * "played" at least once, even when every seek succeeds. A muted play/pause
     * primes it. Every seek after that paints; without it, none of them do and
     * the stage stays the flat colour behind the video.
     *
     * The catch here used to be empty, with a comment saying the first user
     * gesture would unlock it. Nothing was listening for one, so it never did.
     * That is the whole of the "blank film on a fresh load" bug:
     *
     *   - Land on the page. iOS has had no interaction with this document yet,
     *     so `play()` rejects. `prime` was bound `{ once: true }`, so that was
     *     the only attempt that would ever be made. `loadedmetadata` still
     *     fires, so `ready` flips true, the loader hides and the video is given
     *     `opacity: 1` — over a decoder that has never presented a frame. Flat
     *     background, and every scrub silently landing on nothing.
     *   - Reload, and it happens again: a new document has no interaction
     *     either, which is why refreshing never fixed it.
     *   - Tap through to /details and back and it works, because tapping the
     *     link WAS the interaction. Home remounts, this effect runs again, and
     *     this time `play()` is allowed.
     *
     * So the retry the comment promised is now actually here. Any gesture that
     * grants user activation re-attempts the prime, and the first success tears
     * the listeners down. `touchend` is on the list and is what a scroll on a
     * phone ends with, so on iOS the film unlocks on the reader's first swipe
     * even if they never tap anything.
     */
    let detachGesture: (() => void) | undefined;
    /*
     * One attempt at a time, and it has to be a synchronous flag.
     *
     * A single tap fires `pointerup`, `touchend` AND `click`, so three
     * listeners call this before any of them yields. `primedRef` is only set in
     * the `.then()`, which is a microtask away, so it cannot stop the other two
     * — measured, one tap produced three play() calls. On iOS that is three
     * play/pause pairs on a video the reader is looking at.
     */
    let priming = false;

    const prime = () => {
      if (primedRef.current || priming) return;
      priming = true;

      const settle = () => {
        priming = false;
        primedRef.current = true;
        detachGesture?.();
        // The decoder has a frame now; put it on the canvas immediately rather
        // than waiting for the reader to move and cause a seek.
        if (mirrored) drawMirror();
        // The decoder can present now, but the scrub already wrote the seek it
        // wanted and will not repeat itself. Forget it, so the next tick asks
        // again and this time a frame lands.
        lastSeekTimeRef.current = -1;
        kick();
      };

      let attempt: Promise<void> | undefined;
      try {
        attempt = video.play();
      } catch {
        // Some engines throw synchronously instead of rejecting.
        priming = false;
        armGesture();
        return;
      }

      if (!attempt || typeof attempt.then !== 'function') {
        // Older engines return nothing from play(); assume it took.
        video.pause();
        settle();
        return;
      }

      attempt
        .then(() => {
          video.pause();
          settle();
        })
        .catch(() => {
          // Not refused forever — refused until this document has been
          // interacted with. Wait for that and try again.
          priming = false;
          armGesture();
        });
    };

    function armGesture() {
      if (detachGesture || primedRef.current) return;
      const retry = () => prime();
      // The four that grant user activation. `touchstart` deliberately is not
      // one of them — the spec activates on `touchend`, so a swipe counts only
      // once the finger lifts.
      const events = ['pointerup', 'touchend', 'click', 'keydown'] as const;
      events.forEach((e) => window.addEventListener(e, retry, { passive: true }));
      detachGesture = () => {
        events.forEach((e) => window.removeEventListener(e, retry));
        detachGesture = undefined;
      };
    }

    video.addEventListener('loadedmetadata', markReady);
    video.addEventListener('canplaythrough', markReady);
    video.addEventListener('error', handleError);
    video.addEventListener('loadeddata', prime, { once: true });

    // Armed up front rather than only from the `catch` above, because the
    // failure that leaves the film blank can also be `loadeddata` never
    // arriving at all — in which case `prime` is never called and there would
    // be nothing to fail and arm the retry.
    armGesture();

    // The element may already be past those events (cached blob, fast decode),
    // in which case no further one will ever fire.
    if (video.readyState >= 1) markReady();
    if (video.readyState >= 2) prime();

    return () => {
      video.removeEventListener('loadedmetadata', markReady);
      video.removeEventListener('canplaythrough', markReady);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadeddata', prime);
      detachGesture?.();
    };
  }, [url, kick, mirrored, drawMirror]);

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
      downloaded: Boolean(url) && effectivePreload === 'blob' && downloadProgress === 1,
      ready,
      videoWidth: video?.videoWidth ?? 0,
      videoHeight: video?.videoHeight ?? 0,
      duration: durationRef.current,
      error: loadError,
    });
    // `sources` is intentionally not a dep: it is a fresh array each render in
    // most call sites, and `source` already captures the only part that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, received, total, downloadProgress, url, ready, effectivePreload, loadError]);

  /* ------------------------------------------------------- seek gating ---- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;

    /*
     * Fail open. A decoder that never paints must not hold the loader forever —
     * the element still has its poster, so what shows is the first frame as a
     * still rather than an empty stage, and the gesture retry keeps working
     * underneath so the film takes over as soon as it can.
     */
    const paintTimer = window.setTimeout(markPainted, FIRST_PAINT_TIMEOUT_MS);

    const release = () => {
      if (!seekPendingRef.current) return;
      // What this decoder actually costs, kept as a rolling mean so one slow
      // seek does not move the watchdog much and a slow DEVICE moves it fast.
      const latency = performance.now() - seekIssuedAtRef.current;
      seekLatencyRef.current = seekLatencyRef.current
        ? seekLatencyRef.current * (1 - SEEK_LATENCY_ALPHA) + latency * SEEK_LATENCY_ALPHA
        : latency;
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
    //
    // But rVFC fires for EVERY presented frame, not only for the one this seek
    // asked for — and a frame the decoder had already queued before the seek
    // was issued presents first. Released on that, the gate opens while the
    // real seek is still in flight, the next tick assigns `currentTime` again,
    // and the browser aborts the seek it had not finished. Under a continuous
    // scroll that repeats every frame: seeks are issued steadily, each one
    // cancels the last, and the picture stops advancing while the scroll does
    // not. So a presented frame only counts if it IS the frame we asked for —
    // within half a frame of it. `seeked` remains the guaranteed release, so a
    // seek that lands somewhere unexpected still opens the gate; this only
    // stops rVFC opening it early and wrongly.
    const useRvfc = typeof video.requestVideoFrameCallback === 'function';
    let handle: number | null = null;

    /*
     * "Is this the frame the seek asked for?", compared as frame INDICES.
     *
     * Not as a distance in seconds, which is the obvious way and is wrong here:
     * the seek target is a frame CENTRE, `(n + 0.5) / fps`, while the frame that
     * satisfies it presents at its own PTS of `n / fps`. A matching frame is
     * therefore always exactly half a frame from the request — sitting on the
     * boundary of any half-frame tolerance, and landing on whichever side of it
     * floating-point rounding happens to fall. Indices have no boundary to sit
     * on: the frame containing the requested centre is `floor(asked * fps)`,
     * the presented one is `round(mediaTime * fps)`, and either they are the
     * same frame or they are not.
     *
     * Without a declared fps there are no frame indices to compare, so a
     * distance is all there is; 50ms is roughly a frame at any sane rate.
     */
    const isAskedFor = (mediaTime: number) => {
      const asked = lastSeekTimeRef.current;
      if (asked < 0) return false;
      if (!fps) return Math.abs(mediaTime - asked) <= 0.05;
      return Math.round(mediaTime * fps) === Math.floor(asked * fps);
    };

    if (useRvfc) {
      const onFrame = (_now: number, metadata: FrameMetadata) => {
        handle = video.requestVideoFrameCallback!(onFrame);
        // ANY frame means the decoder produced something, whether or not it is
        // the one the scrub asked for. Mirror it, and let the loader go.
        if (mirrored) drawMirror();
        markPainted();
        if (isAskedFor(metadata.mediaTime)) release();
      };
      handle = video.requestVideoFrameCallback!(onFrame);
    }

    /*
     * `seeked` doubles as the paint signal where rVFC is missing.
     *
     * rVFC is the honest one — it fires when a frame is PRESENTED — but Safari
     * only shipped it in 15.4, and an older iPhone is exactly the device this
     * is protecting. A completed seek is weaker evidence (the decoder resolved
     * the seek, which is not quite "and drew it") but it is the best signal
     * those versions offer, and the timeout below covers the rest.
     */
    // A completed seek is the only moment the picture can change, so it is the
    // only moment the mirror needs redrawing.
    const onSeeked = () => {
      if (mirrored) drawMirror();
      markPainted();
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('seeked', release);

    return () => {
      window.clearTimeout(paintTimer);
      if (useRvfc && handle !== null) video.cancelVideoFrameCallback?.(handle);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('seeked', release);
    };
  }, [ready, kick, fps, mirrored, drawMirror, markPainted]);

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
      <div className={stageClassName} style={stageStyle}>
        {objectFit === 'contain' && ambientLetterbox && (
          <canvas
            ref={backdropRef}
            width={PROXY_W}
            height={PROXY_H}
            aria-hidden="true"
            style={BACKDROP_STYLE}
          />
        )}

        {mirrored && (
          <canvas ref={mirrorRef} aria-hidden="true" style={{ ...MIRROR_STYLE, objectFit }} />
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
          /*
           * Never faded out, where this used to be `opacity: ready ? 1 : 0`.
           *
           * Two reasons, and the loader covers it either way — it is opaque and
           * `inset: 0`, so the reader sees the loader and nothing else until it
           * goes.
           *
           * The first is the poster. A hidden element hides its `poster` too,
           * so the fail-open path below had nothing to fail open TO. Visible,
           * the worst case stops being an empty stage and becomes a still.
           *
           * The second is Safari's own rule. It permits muted autoplay only for
           * elements it considers visible, and pauses ones that are not — so
           * hiding the video while waiting to prime it may well have been part
           * of why the prime was refused. That part is reasoning rather than
           * measurement: it is not a heuristic Apple documents precisely, and I
           * have no iPhone here to prove it on. It costs nothing to satisfy.
           */
          style={{ ...VIDEO_STYLE, objectFit, ...videoStyle }}
        />

        {/* Held until a frame is actually on screen, not merely until metadata
            arrived — see `painted`. */}
        {!painted &&
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

        {/* The overlay belongs to the film, so it arrives with the film rather
            than sitting over the loading screen. */}
        {painted && (typeof children === 'function' ? children(progress) : children)}
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
  //
  // No background either: an inline colour here would beat any class the caller
  // puts on the wrapper, which is exactly what happens with `object-fit:
  // contain` — the letterbox takes the stage's colour, and the caller is the
  // only one who knows what the footage sits on. Set it on the wrapper.
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

/**
 * The canvas that IS the picture on WebKit. Same box as the video, one layer up.
 *
 * `object-fit` is handed the same value the video gets, so the crop is the one
 * the caller asked for and the two elements cannot disagree about framing.
 */
const MIRROR_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 1,
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
