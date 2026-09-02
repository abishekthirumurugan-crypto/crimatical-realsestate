import { useCallback, useRef, useSyncExternalStore } from 'react';

import ScrollVideo, { prefersNativeMedia, type ScrollVideoSource } from '../components/ScrollVideo';
import ScrollFrames from '../components/ScrollFrames';
import FilmDebug, { isFilmDebug } from '../components/FilmDebug';
import FilmOverlay, { type FilmOverlayApi } from '../components/FilmOverlay';
import Logo from '../components/Logo';
import { PROJECT, SPACES } from '../content/project';

/**
 * Best-first. `ScrollVideo` walks this list and takes the first entry whose
 * `media` query matches and whose codec the browser reports it can play.
 *
 * Both are H.264 rather than one being WebM: see FFMPEG.md. Configuring VP9 for
 * scrubbing (short GOP, no alt-ref) costs it far more than the same treatment
 * costs H.264, and H.264 is the only codec with universal hardware decode —
 * which is what actually sets seek latency.
 */
const SOURCES: ScrollVideoSource[] = [
  {
    src: '/video/walkthrough-mobile.mp4',
    // High@4.1 — `avc1.640029`, not the `64001f` (High@3.1) this used to claim.
    // Both cuts come out of encode-scrub.sh, which pins `-level:v 4.1`, so the
    // string has to say 4.1 whatever the frame size is. Nothing broke on it:
    // `canPlayType` answers for the codec a device supports rather than for the
    // file, and every browser says yes to 3.1, so the source was still picked.
    // It was simply describing a file that does not exist.
    type: 'video/mp4; codecs="avc1.640029"',
    media: '(max-width: 640px)',
  },
  { src: '/video/walkthrough.mp4', type: 'video/mp4; codecs="avc1.640029"' },
];

/**
 * Scrub settings, per class of device.
 *
 * Scrubbing is seek-bound, not download-bound, and the seek budget on a phone is
 * far smaller than on a laptop. Measured on a 390x844 screen: the film spans
 * 5,064px of scroll, so at 24 fps a frame lands every 21px, and an ordinary
 * flick of 1,800px in 450ms asks for **190 seeks a second**.
 *
 * The first attempt at this halved the frame grid to 12 fps to halve the
 * demand. It worked, and it was the wrong trade: 42px of scroll per frame is
 * visible stepping when you scroll slowly. Trailing had been swapped for
 * juddering.
 *
 * The fix is not a point on that trade-off but a cheaper seek, which is an
 * encode problem rather than a player one. The mobile cut is now GOP 2 instead
 * of GOP 10 — worst-case **one** frame decoded per seek instead of nine — which
 * buys back far more than the 24 fps grid costs. So the grid goes back to
 * matching the encode and there is no stepping to see. See FFMPEG.md.
 *
 * Smoothing differs, and it is the phone that wants LESS of it.
 *
 * This was at 0.12 on the reasoning that a phone had spare seek budget once
 * GOP 2 fixed the decoder, and that the headroom was worth spending on glide.
 * That was wrong, and the reason is that a wheel and a thumb are not the same
 * instrument.
 *
 * A wheel is indirect. It arrives in discrete notches with nothing on screen
 * standing in for the hand, so the ease between them never reads as lag — only
 * as weight. A thumb is DIRECT MANIPULATION: the finger is on the picture, so
 * the picture is expected to be under the finger, and a 300ms settle is 300ms
 * of the film visibly trailing the thing dragging it. The lag was never free
 * headroom; it was only unnoticed on the input that hides it.
 *
 * Measured on a 390x844 screen at 6x CPU throttle, scrubbing an 1,800px flick,
 * as how far the frame ON SCREEN sits behind the frame the scroll position is
 * asking for. The seek count is identical down the column — the decoder was
 * never the thing costing this, the ease was:
 *
 *   smoothing   settle    median lag        seeks
 *   0.12        300ms     805ms / 340px      42
 *   0.30        128ms     288ms / 121px      35
 *   0.40         98ms     213ms /  90px      33
 *   0.60         55ms     100ms /  42px      33
 *   1.00 (off)    0ms      21ms /   9px      33
 *
 * 0.60 rather than the 1.00 the table argues for, and the reason is not feel.
 * The rAF loop re-reads scroll position on every tick and keeps ticking until
 * the ease has caught up, so a residual ease is what keeps the film tracking
 * through a run of coalesced scroll events. At 1.00 the loop settles on the
 * frame it starts and parks, which makes every update dependent on an event
 * actually firing — and iOS is not reliable about that during momentum. 42px of
 * lag is two frames of film. It buys a loop that drives itself.
 *
 * The desktop setting is left alone: a wheel is the input the ease is for.
 */
const DESKTOP = { fps: 24, smoothing: 0.16 };
const MOBILE = { fps: 24, smoothing: 0.6 };

/** Mirrors the `media` on the mobile source, so file and settings agree. */
const MOBILE_QUERY = '(max-width: 640px)';

/*
 * The still sequence WebKit gets on a phone instead of the film.
 *
 * Same cut, same 480x854, same 24 frames a second — so the scroll geometry and
 * the stepping are identical to the video and nothing else on the page has to
 * know which one is running. 2.9MB against the video's 900KB, paid only by the
 * engine that cannot play the video at all. See ScrollFrames.tsx.
 *
 * Defined out here because `frameUrl` is a dependency of the preload effect: an
 * arrow rebuilt on every render would restart the download on every render.
 */
const FRAME_COUNT = 240;
const FRAME_W = 480;
const FRAME_H = 854;
const frameUrl = (i: number) => `/frames/mobile/${String(i).padStart(3, '0')}.webp`;

/**
 * Home is the film and nothing else.
 *
 * Everything the project has to say in words lives on `/details` — including the
 * closing panel that used to sit under the film here. This page is the thirty
 * months, scrubbed, and the header nav is the way on from it.
 *
 * The film is full-bleed and the copy sits on a solid band at its foot. It
 * cannot sit on the picture: see the note at the top of FilmOverlay.tsx for the
 * measurement that settles it.
 *
 * That is also why the session-skip and replay machinery this page used to
 * carry is gone: it existed to spare a returning reader five viewports of film
 * before they reached the content below. There is no content below any more, so
 * skipping the film would leave an empty page.
 */
export default function Home() {
  const overlayRef = useRef<FilmOverlayApi | null>(null);
  // Only for `/?debug` — see FilmDebug. Held unconditionally because hooks
  // cannot be called conditionally; it costs one ref.
  const filmRef = useRef<HTMLVideoElement | null>(null);
  const debugging = isFilmDebug();

  // Read once per media-query change rather than per frame. `useSyncExternal-
  // Store` because the query is state outside React, and reading it during
  // render keeps the first paint on the right settings instead of mounting
  // desktop and correcting.
  const isMobile = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(MOBILE_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
  const scrub = isMobile ? MOBILE : DESKTOP;

  /*
   * A phone running WebKit gets the stills; everything else gets the film.
   *
   * Narrow on purpose. Desktop Safari is left on the video — it may well have
   * the same compositing fault, but the sequence that exists is the portrait
   * 480px cut, and shipping that to a 1440px window would be worse than the
   * bug. If it turns out to be broken there too it wants its own landscape
   * sequence rather than this one stretched.
   */
  const useFrames = isMobile && prefersNativeMedia();

  // A ref callback, not state: this runs on every rAF tick while scrubbing, and
  // the overlay writes straight to the DOM from here. Nothing re-renders.
  const handleProgress = useCallback((progress: number) => {
    overlayRef.current?.update(progress);
  }, []);

  const renderLoader = useCallback((progress: number) => {
    const indeterminate = Number.isNaN(progress);
    return (
      <div className="loader">
        <Logo size={72} className="loader__logo" />
        <div className="loader__label">Loading the build</div>
        <div className="loader__rule">
          <div
            className="loader__fill"
            data-indeterminate={indeterminate}
            style={indeterminate ? undefined : { width: `${progress * 100}%` }}
          />
        </div>
        <div className="loader__pct">
          {indeterminate ? '——' : `${String(Math.round(progress * 100)).padStart(2, '0')}%`}
        </div>
      </div>
    );
  }, []);

  return (
    <>
      <h1 className="visually-hidden">
        {PROJECT.developer} {PROJECT.name}, {PROJECT.district} — a walk through a finished
        apartment, from the street to the terrace, scrubbed by scroll
      </h1>

      {useFrames ? (
        <ScrollFrames
          className="film"
          stageClassName="film__stage"
          frameUrl={frameUrl}
          count={FRAME_COUNT}
          frameWidth={FRAME_W}
          frameHeight={FRAME_H}
          scrollLengthVh={6}
          smoothing={scrub.smoothing}
          objectFit="cover"
          onProgress={handleProgress}
          renderLoader={renderLoader}
        >
          <FilmOverlay spaces={SPACES} apiRef={overlayRef} />
        </ScrollFrames>
      ) : (
      <ScrollVideo
        className="film"
        stageClassName="film__stage"
        sources={SOURCES}
        poster="/video/walkthrough-poster.jpg"
        fps={scrub.fps}
        // Six screens for ten seconds of film. One more than the construction
        // cut had, because this camera never stops: it is a continuous forward
        // dolly at roughly 11% mean inter-frame change, where the old one was a
        // slow orbit around a static object. The same scroll distance would run
        // the walk past you.
        scrollLengthVh={6}
        // See DESKTOP / MOBILE above. Lighter than the 0.12 default even on a
        // laptop: smoothing is a lag, and lag costs what the footage is moving
        // at. On a slow orbit 0.1 read as weight; on a fast dolly it reads as
        // the picture arriving late to the scroll.
        smoothing={scrub.smoothing}
        // `cover`, where every previous cut used `contain`.
        //
        // `contain` existed to protect a subject that sat in the middle of an
        // empty frame; letterbox was free because the bars matched the footage.
        // Neither holds now. This is edge-to-edge picture, so bars would be
        // bars — and the composition is a corridor-centred forward dolly, which
        // is the one thing that crops safely: what leaves at the edges is wall.
        //
        // Portrait screens crop hard — a 390x844 phone keeps under a third of
        // the width — and it was going to be a `contain` fallback until the crop
        // was actually looked at: the hall, the bedroom and the kitchen all
        // centre on what the camera is walking toward, so the tall crop reads as
        // a deliberate portrait framing while `contain` would have given a
        // letterboxed strip a fifth of the screen high. (The fallback could not
        // have worked anyway: ScrollVideo sets `object-fit` inline, so no
        // stylesheet rule can outrank it.)
        objectFit="cover"
        // Full-bleed. The only thing left on the video is the compositor hint:
        // `translateZ(0)` keeps it on its own layer, so each scrubbed frame is a
        // texture upload rather than a document repaint. Everything else comes
        // from ScrollVideo's own inline styles, which already say
        // `inset: 0; width: 100%; height: 100%`.
        videoStyle={{ transform: 'translateZ(0)' }}
        onProgress={handleProgress}
        renderLoader={renderLoader}
        videoRef={filmRef}
      >
        <FilmOverlay spaces={SPACES} apiRef={overlayRef} />
      </ScrollVideo>
      )}

      {debugging && <FilmDebug videoRef={filmRef} />}
    </>
  );
}
