import { useCallback, useRef } from 'react';

import ScrollVideo, { type ScrollVideoSource } from '../components/ScrollVideo';
import FilmOverlay, { type FilmOverlayApi } from '../components/FilmOverlay';
import Logo from '../components/Logo';
import { PHASES, PROJECT } from '../content/project';

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
    src: '/video/tower-mobile.mp4',
    type: 'video/mp4; codecs="avc1.64001f"',
    media: '(max-width: 640px)',
  },
  { src: '/video/tower.mp4', type: 'video/mp4; codecs="avc1.640029"' },
];

/** Matches the encode. Lets the scrub snap to frame centres. */
const FPS = 24;

/**
 * Home is the film and nothing else.
 *
 * Everything the project has to say in words lives on `/details` — including the
 * closing panel that used to sit under the film here. This page is the thirty
 * months, scrubbed, and the header nav is the way on from it.
 *
 * The film is centred as a panel with a column of copy either side. It is not
 * full-bleed, and cannot be: see the note at the top of film.css.
 *
 * That is also why the session-skip and replay machinery this page used to
 * carry is gone: it existed to spare a returning reader five viewports of film
 * before they reached the content below. There is no content below any more, so
 * skipping the film would leave an empty page.
 */
export default function Home() {
  const overlayRef = useRef<FilmOverlayApi | null>(null);

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
        {PROJECT.developer} {PROJECT.name}, {PROJECT.district} — thirty months of construction,
        scrubbed by scroll
      </h1>

      <ScrollVideo
        className="film"
        stageClassName="film__stage"
        sources={SOURCES}
        poster="/video/tower-poster.jpg"
        fps={FPS}
        // Five screens for ten seconds of film: slow enough that a single
        // construction stage holds for most of a screen, rather than flicking
        // past between two scroll wheel notches.
        scrollLengthVh={5}
        // Heavier than the 0.12 default. The camera is a slow orbit, and a
        // snappier ease makes it feel like it is being yanked.
        smoothing={0.1}
        // Nothing is ever cropped, and there is nothing to crop against: the
        // encode's tone curve puts the footage's backdrop within three levels
        // of the page, so the letterbox is the same colour as the frame and
        // the film simply covers the screen.
        objectFit="contain"
        // Full-bleed. The only thing left on the video is the compositor hint:
        // `translateZ(0)` keeps it on its own layer, so each scrubbed frame is
        // a texture upload rather than a document repaint. Everything else —
        // the offsets, the size — comes from ScrollVideo's own inline styles,
        // which already say `inset: 0; width: 100%; height: 100%`.
        //
        // It used to be a sized, rounded, shadowed panel inset between the
        // gutters. That was the right answer while the footage sat on a mid-
        // grey sweep: no colour existed that could hide the frame, so the
        // honest move was to draw it deliberately. Grading the backdrop to
        // near-white removed the problem rather than dressing it, and the panel
        // went with it.
        videoStyle={{ transform: 'translateZ(0)' }}
        onProgress={handleProgress}
        renderLoader={renderLoader}
      >
        <FilmOverlay phases={PHASES} apiRef={overlayRef} />
      </ScrollVideo>
    </>
  );
}
