import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ScrollVideo, { type ScrollVideoSource } from '../components/ScrollVideo';
import FilmOverlay, { type FilmOverlayApi } from '../components/FilmOverlay';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import PlanDiagram from '../components/PlanDiagram';
import PostCard from '../components/PostCard';
import { Link } from '../lib/router';
import { useReveals } from '../hooks/useReveals';
import { PHASES, PROJECT, RESIDENCES, SPEC_GROUPS } from '../content/project';
import { BENEFITS, PARTNERS, POSTS_BY_DATE, SERVICES, STATS, TESTIMONIALS } from '../content/site';

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
    src: '/video/block-a-mobile.mp4',
    type: 'video/mp4; codecs="avc1.64001f"',
    media: '(max-width: 640px)',
  },
  { src: '/video/block-a.mp4', type: 'video/mp4; codecs="avc1.640029"' },
];

/** Matches the encode. Lets the scrub snap to frame centres. */
const FPS = 24;

/**
 * Whether the visitor has already scrolled the film to the end this session.
 *
 * sessionStorage, not localStorage: the film is the point of the page on a
 * first visit, and it should come back for a genuinely new visit. What it
 * should not do is make you scroll five viewports again every time you come
 * back from About or Contact.
 *
 * Both accessors are guarded — storage throws outright in some privacy modes.
 */
const FILM_SEEN_KEY = 'temp-realestate:film-seen';

function readFilmSeen(): boolean {
  try {
    return sessionStorage.getItem(FILM_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFilmSeen(): void {
  try {
    sessionStorage.setItem(FILM_SEEN_KEY, '1');
  } catch {
    /* storage unavailable; the film simply plays again next time */
  }
}

/** Close enough to the top that there is nothing left to scroll up to. */
const AT_TOP_PX = 4;
/** Past this, the reader has moved on and the offer is withdrawn. */
const REPLAY_DISMISS_PX = 180;
/** Ignore scroll jitter below this many pixels when reading direction. */
const DIRECTION_DEADZONE_PX = 3;
/** Finger travel that counts as a deliberate pull downward. */
const TOUCH_PULL_PX = 12;


/** Three most recent, for the teaser near the foot of the page. */
const LATEST = POSTS_BY_DATE.slice(0, 3);

/** Section artwork, cut from the film itself rather than bought in. */
function Still({ name, alt }: { name: string; alt: string }) {
  return (
    <div className="media">
      <img
        src={`/stills/${name}-1200.jpg`}
        srcSet={`/stills/${name}-600.jpg 600w, /stills/${name}-1200.jpg 1200w`}
        sizes="(max-width: 60rem) 100vw, 45vw"
        alt={alt}
        loading="lazy"
        decoding="async"
        width={1200}
        height={675}
      />
    </div>
  );
}

export default function Home() {
  useReveals();

  const overlayRef = useRef<FilmOverlayApi | null>(null);

  // Read once, on mount. Returning to Home mid-session lands on the content.
  const [showFilm, setShowFilm] = useState(() => !readFilmSeen());
  const [replayVisible, setReplayVisible] = useState(false);
  const seenWrittenRef = useRef(false);
  /** The film's scroll wrapper, so its extent can be measured exactly. */
  const filmRef = useRef<HTMLDivElement | null>(null);
  /**
   * The stat cards — the anchor scroll is preserved against.
   *
   * Deliberately the inner content, not the section: collapsing the film also
   * adds header clearance *inside* that section, and anchoring on its border
   * box would let that padding shove the cards down ~76px at the moment of
   * removal. Measuring what the reader is actually looking at cancels it.
   */
  const contentRef = useRef<HTMLDivElement | null>(null);

  // A ref callback, not state: this runs on every rAF tick while scrubbing, and
  // the overlay writes straight to the DOM from here. Nothing re-renders.
  const handleProgress = useCallback((progress: number) => {
    overlayRef.current?.update(progress);

    // Latched in a ref so reaching the end writes once, not on every frame.
    if (!seenWrittenRef.current && progress >= 0.99) {
      seenWrittenRef.current = true;
      writeFilmSeen();
    }
  }, []);

  /**
   * Retire the film once it has been scrolled fully out of view.
   *
   * Leaving it in the document meant scrolling up walked straight back into
   * five viewports of scrubbing — the button was decorative. Taking it out
   * makes the button the only way back in, which is the point of it.
   *
   * Removing that much layout from above the reader would throw the page
   * upward, so the scroll is preserved against the first section: measure it,
   * commit the removal synchronously, measure again, correct the difference.
   * `flushSync` is what makes the two measurements straddle the same frame —
   * without it the page paints in the wrong place before the correction lands.
   */
  useEffect(() => {
    if (!showFilm) return;
    let frame = 0;

    const check = () => {
      frame = 0;
      const film = filmRef.current;
      const anchor = contentRef.current;
      if (!film || !anchor) return;
      // Any part of the film still on screen means it is still wanted.
      if (window.scrollY < film.offsetHeight) return;

      const before = anchor.getBoundingClientRect().top;
      flushSync(() => setShowFilm(false));
      const after = anchor.getBoundingClientRect().top;
      window.scrollBy(0, after - before);
      writeFilmSeen();
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [showFilm]);

  /**
   * Offer the film back — but only on an attempt to scroll *past* the top of
   * the content.
   *
   * Showing it on any upward scroll meant it followed the reader all the way up
   * from the footer, which is not where anyone is thinking about the film. The
   * moment that matters is arriving at the top and pushing further: there is
   * nothing left to scroll to, so no scroll event fires at all and the gesture
   * itself has to be read — wheel, touch drag, or the keyboard equivalents.
   *
   * Only relevant once the film has been retired; while it is on the page the
   * reader is already in it.
   */
  useEffect(() => {
    if (showFilm) {
      setReplayVisible(false);
      return;
    }

    let lastY = window.scrollY;
    let frame = 0;
    const atTop = () => window.scrollY <= AT_TOP_PX;

    // Withdraw as soon as they head back down, or leave the top behind.
    const evaluate = () => {
      frame = 0;
      const y = window.scrollY;
      const goingDown = y > lastY + DIRECTION_DEADZONE_PX;
      if (Math.abs(y - lastY) > DIRECTION_DEADZONE_PX) lastY = y;
      if (goingDown || y > REPLAY_DISMISS_PX) setReplayVisible(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(evaluate);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && atTop()) setReplayVisible(true);
    };

    let touchStartY = 0;
    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? 0;
      // Finger travelling down the screen is a pull upward through the page.
      if (y - touchStartY > TOUCH_PULL_PX && atTop()) setReplayVisible(true);
      touchStartY = y;
    };

    // Keyboard readers never fire a wheel event, and at the top these keys
    // scroll nowhere — so they are the same gesture by another means.
    const onKeyDown = (event: KeyboardEvent) => {
      if (!atTop()) return;
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') {
        setReplayVisible(true);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [showFilm]);

  const replayFilm = useCallback(() => {
    // A no-op when the film is already on the page; then this is purely the
    // jump back to its start.
    setShowFilm(true);
    // Mounting the film pushes the content down by five viewports, so go to the
    // start of it rather than staying where the page used to be. Deferred a
    // frame so the layout it is scrolling to actually exists.
    requestAnimationFrame(() => window.scrollTo(0, 0));
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

      <button
        type="button"
        className="replay"
        data-visible={replayVisible}
        // Hidden from the tree as well as the eye when it is not offered, so it
        // cannot be tabbed to from the middle of the page.
        aria-hidden={!replayVisible}
        tabIndex={replayVisible ? 0 : -1}
        onClick={replayFilm}
      >
        <span className="replay__icon" aria-hidden="true">
          ↑
        </span>
        Watch the build
      </button>

      {showFilm && (
      <ScrollVideo
        className="film"
        sources={SOURCES}
        poster="/video/block-a-poster.jpg"
        fps={FPS}
        // Five screens for ten seconds of film: slow enough that a single
        // construction stage holds for most of a screen, rather than flicking
        // past between two scroll wheel notches.
        scrollLengthVh={5}
        // Heavier than the 0.12 default. The footage is a slow aerial push, and
        // a snappier ease makes the camera feel like it is being yanked.
        smoothing={0.1}
        objectFit="cover"
        containerRef={filmRef}
        onProgress={handleProgress}
        renderLoader={renderLoader}
      >
        <FilmOverlay phases={PHASES} apiRef={overlayRef} />
      </ScrollVideo>
      )}

      {/* --- stats ------------------------------------------------------- */}
      <section className="section section--tight shell" data-first={!showFilm}>
        <div className="stats reveal" data-reveal ref={contentRef}>
          {STATS.map((stat) => (
            <div key={stat.label} className="stat">
              <div className="stat__value">{stat.value}</div>
              <div className="stat__label">{stat.label}</div>
              <div className="stat__note">{stat.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* --- about ------------------------------------------------------- */}
      <section className="section shell">
        <div className="split reveal" data-reveal>
          <div className="split__body">
            <span className="tag">About the project</span>
            <h2>Thirty months from graded earth to a lit hallway</h2>
            <p>
              Block A is six storeys of reinforced concrete on Plot 7, Perungudi. We filmed it every
              week from the day the hoarding went up, and the whole sequence is the film above —
              scrubbed at whatever speed you scroll.
            </p>
            <p>
              Nothing in it is a render until the final beats, and those are labelled. The frame you
              are looking at for most of the scroll is the building as it actually stood that week.
            </p>
            <div className="panel__actions">
              <Link to="/about" className="button button--primary">
                How we build
              </Link>
              <Link to="/contact" className="button button--outline">
                Book a viewing
              </Link>
            </div>
          </div>
          <div className="split__media">
            {/* Referenced by URL, not imported. Anything under `public/` is
                already copied verbatim into the build; importing it as well
                makes Vite emit a second hashed copy of the same bytes. */}
            <div className="media">
              <img
                src="/image/home1.jpg"
                srcSet="/image/home1-600.jpg 600w, /image/home1.jpg 1024w"
                sizes="(max-width: 60rem) 100vw, 45vw"
                alt="The hoarding and site gate, before the first dig"
                loading="lazy"
                decoding="async"
                width={1024}
                height={572}
              />
            </div>
          </div>
        </div>
      </section>

      {/* --- specification ----------------------------------------------- */}
      <section className="section shell" id="specification">
        <div className="section__head">
          <div>
            <span className="tag">Specification</span>
            <h2 className="section__heading">The building, in numbers</h2>
          </div>
          <p className="section__intro">
            {PROJECT.name} — {PROJECT.plot}, {PROJECT.district}
          </p>
        </div>
        <div className="spec reveal" data-reveal>
          {SPEC_GROUPS.map((group) => (
            <article key={group.title} className="spec-card">
              <header className="spec-card__head">
                <span className="spec-card__icon">
                  <Icon name={group.icon} />
                </span>
                <div>
                  <h3 className="spec-card__title">{group.title}</h3>
                  <p className="spec-card__summary">{group.summary}</p>
                </div>
              </header>

              <dl className="spec-card__rows">
                {group.rows.map((row) => (
                  <div key={row.label} className="spec-row">
                    <dt className="spec-row__label">{row.label}</dt>
                    <dd className="spec-row__value">
                      {row.value}
                      {row.unit && <small>{row.unit}</small>}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      {/* --- build log --------------------------------------------------- */}
      <section className="section shell" id="build-log">
        <div className="section__head">
          <div>
            <span className="tag">Build log</span>
            <h2 className="section__heading">Six stages, published monthly</h2>
          </div>
          <p className="section__intro">
            The same six stages the survey rule marks on the film. That tells you where you are;
            this tells you when it happened.
          </p>
        </div>
        <ol className="timeline-log reveal" data-reveal>
          {PHASES.map((phase, index) => (
            <li key={phase.name} className="tl" data-status={phase.status}>
              <div className="tl__when">
                <span className="tl__stage">Stage {String(index + 1).padStart(2, '0')}</span>
                <time className="tl__date">{phase.date}</time>
                {phase.gap && <span className="tl__gap">+{phase.gap}</span>}
              </div>

              <div className="tl__spine" aria-hidden="true">
                <span className="tl__dot" />
              </div>

              <article className="tl__card">
                <div className="tl__media">
                  <img
                    src={`/stills/${phase.image}-600.jpg`}
                    srcSet={`/stills/${phase.image}-600.jpg 600w, /stills/${phase.image}-1200.jpg 1200w`}
                    sizes="(max-width: 52rem) 100vw, 12rem"
                    alt={phase.imageAlt}
                    loading="lazy"
                    decoding="async"
                    width={1200}
                    height={675}
                  />
                </div>

                <div className="tl__body">
                  <h3 className="tl__name">{phase.name}</h3>
                  <p className="tl__note">{phase.note}</p>
                  <p className="tl__metric">{phase.metric}</p>
                </div>

                <span className="tl__badge">
                  {phase.status === 'complete' ? 'Complete' : 'Scheduled'}
                </span>
              </article>
            </li>
          ))}
        </ol>
      </section>

      {/* --- residences -------------------------------------------------- */}
      <section className="section section--band" id="residences">
        <div className="shell">
          <div className="section__head">
            <div>
              <span className="tag">Residences</span>
              <h2 className="section__heading">Three plan types, thirteen left</h2>
            </div>
            <Link to="/contact" className="section__more">
              Enquire about availability
            </Link>
          </div>
          <div className="units reveal" data-reveal>
            {RESIDENCES.map((unit) => (
              <article key={unit.type} className="unit">
                <div className="unit__plan">
                  <PlanDiagram name={unit.plan} />
                  <span className="unit__left" data-scarce={unit.available <= 2}>
                    {unit.available} left
                  </span>
                </div>

                <div className="unit__head">
                  <span className="unit__type">{unit.type}</span>
                  <h3 className="unit__headline">{unit.headline}</h3>
                </div>

                <dl className="unit__specs">
                  <div className="unit__spec">
                    <dd>
                      {unit.area}
                      <small>{unit.areaUnit}</small>
                    </dd>
                    <dt>Carpet</dt>
                  </div>
                  <div className="unit__spec">
                    <dd>{unit.beds}</dd>
                    <dt>Bedrooms</dt>
                  </div>
                  <div className="unit__spec">
                    <dd>{unit.baths}</dd>
                    <dt>Bathrooms</dt>
                  </div>
                </dl>

                <dl className="unit__meta">
                  <div>
                    <dt>Aspect</dt>
                    <dd>{unit.aspect}</dd>
                  </div>
                  <div>
                    <dt>Floors</dt>
                    <dd>{unit.floors}</dd>
                  </div>
                </dl>

                <footer className="unit__foot">
                  <div className="unit__price">
                    <span>Guide price</span>
                    <strong>{unit.price}</strong>
                  </div>
                  <Link to="/contact" className="unit__cta">
                    Enquire →
                  </Link>
                </footer>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --- services ---------------------------------------------------- */}
      <section className="section shell">
        <div className="section__head">
          <div>
            <span className="tag">What we do</span>
            <h2 className="section__heading">Four things, done by us</h2>
          </div>
          <p className="section__intro">
            We do not act as a main contractor for other developers, and we do not sell land. This
            is the whole list.
          </p>
        </div>
        <div className="services reveal" data-reveal>
          {SERVICES.map((service, index) => (
            <article key={service.title} className="service">
              <header className="service__head">
                <span className="service__icon">
                  <Icon name={service.icon} />
                </span>
                <span className="service__num">{String(index + 1).padStart(2, '0')}</span>
              </header>

              <h3 className="service__title">{service.title}</h3>
              <p className="service__body">{service.body}</p>

              <ul className="service__covers">
                {service.covers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* --- why choose us ----------------------------------------------- */}
      <section className="section section--band">
        <div className="shell">
          <div className="split split--reverse reveal" data-reveal>
            <div className="split__body">
              <span className="tag">Why clients trust us</span>
              <h2>Four rules we have not broken</h2>
              <p>
                None of these are unusual. What is unusual is writing them down where a buyer can
                hold us to them.
              </p>
              <ul className="split__list">
                {BENEFITS.map((benefit) => (
                  <li key={benefit.title}>
                    <div>
                      <strong>{benefit.title}</strong>
                      <span>{benefit.body}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="split__media">
              <Still
                name="structure"
                alt="Reinforced concrete frame at full height with scaffold"
              />
            </div>
          </div>
        </div>
      </section>

      {/* --- testimonials ------------------------------------------------ */}
      <section className="section shell">
        <div className="section__head">
          <div>
            <span className="tag">Owners</span>
            <h2 className="section__heading">What people say after handover</h2>
          </div>
          <p className="section__intro">
            Collected at the end of the twenty-four month defects window, not on completion day.
          </p>
        </div>
        <div className="testimonials reveal" data-reveal>
          {TESTIMONIALS.map((item) => (
            <figure key={item.name} className="quote">
              <span className="quote__mark" aria-hidden="true">
                &ldquo;
              </span>

              <div className="quote__top">
                <span
                  className="quote__stars"
                  aria-label={`Rated ${item.rating} out of 5`}
                  title={`Rated ${item.rating} out of 5`}
                >
                  {'★'.repeat(item.rating)}
                </span>
                <span className="quote__date">{item.date}</span>
              </div>

              <blockquote className="quote__body">{item.quote}</blockquote>

              <figcaption className="quote__foot">
                <span className="quote__avatar" aria-hidden="true">
                  {item.initials}
                </span>
                <span className="quote__who">
                  <span className="quote__name">{item.name}</span>
                  <span className="quote__role">
                    {item.unit} · {item.project}
                  </span>
                </span>
                <span className="quote__verified">Verified owner</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* --- partners ---------------------------------------------------- */}
      <section className="section section--tight shell">
        <p className="partners__label">Consultants and suppliers on Block A</p>
        <div className="partners reveal" data-reveal>
          {PARTNERS.map((partner) => (
            <span key={partner} className="partner">
              {partner}
            </span>
          ))}
        </div>
      </section>

      {/* --- journal ----------------------------------------------------- */}
      <section className="section shell">
        <div className="section__head">
          <div>
            <span className="tag">Journal</span>
            <h2 className="section__heading">Notes from the site</h2>
          </div>
          <Link to="/blog" className="section__more">
            All entries
          </Link>
        </div>
        <div className="posts reveal" data-reveal>
          {LATEST.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      </section>

      {/* --- CTA --------------------------------------------------------- */}
      <section className="section shell">
        <div className="panel reveal" data-reveal>
          <h2>Come and see it standing up</h2>
          <p>
            Site visits run Saturday mornings while the fit-out finishes, booked ahead, with boots
            and a hard hat provided at the gate. Two units of Type C are left.
          </p>
          <div className="panel__actions">
            <Link to="/contact" className="button button--primary">
              Book a viewing
            </Link>
            <Link to="/about" className="button button--outline">
              About us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
