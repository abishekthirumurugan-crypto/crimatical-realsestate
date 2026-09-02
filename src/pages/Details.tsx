import { useState } from 'react';
import type { CSSProperties } from 'react';

import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import PlanDiagram from '../components/PlanDiagram';
import PostCard from '../components/PostCard';
import TargetCursor from '../components/TargetCursor';
import AccordionGallery from '../components/AccordionGallery';
import CardStack from '../components/CardStack';
import SpotlightCard from '../components/SpotlightCard';
import { Link } from '../lib/router';
import { openEnquiry } from '../lib/enquiry';
import { useReveals } from '../hooks/useReveals';
import { GALLERY, PHASES, PROJECT, RESIDENCES, SPEC_GROUPS } from '../content/project';
import { BENEFITS, PARTNERS, POSTS_BY_DATE, SERVICES, STATS, TESTIMONIALS } from '../content/site';

/** Three most recent, for the teaser near the foot of the page. */
const LATEST = POSTS_BY_DATE.slice(0, 3);

/** Section artwork, cut from the film itself rather than bought in. */
function Still({ name, alt }: { name: string; alt: string }) {
  return (
    <div className="media">
      <img
        src={`/stills/${name}-1200.webp`}
        srcSet={`/stills/${name}-600.webp 600w, /stills/${name}-1200.webp 1200w`}
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

/**
 * Everything about the project that is not the film.
 *
 * Home is the film and nothing else, so this is where the specification, the
 * build log, the residences and the rest actually live.
 */
export default function Details() {
  useReveals();

  /*
   * The target cursor is asked for on the stats row and nowhere else, so the
   * overlay is kept mounted — it tracks the pointer across the page, which is
   * what stops it flying in from the middle of the viewport — and only shown
   * while the pointer is inside the row. The native arrow is hidden by
   * `.cursor-zone` in CSS rather than by `hideDefaultCursor`, which would
   * have taken it off every page of the site.
   */
  const [statsHovered, setStatsHovered] = useState(false);

  return (
    <>
      <PageHero
        eyebrow="The project"
        title={`${PROJECT.name} ${PROJECT.plot}, ${PROJECT.district}`}
        lede="The specification, the programme, the plan types and what we do. The film on the home page is the same thirty months, scrubbed."
      />

      {/* --- stats ------------------------------------------------------- */}
      <div className="cursor-zone-layer" data-active={statsHovered}>
        <TargetCursor
          spinDuration={2.6}
          hideDefaultCursor={false}
          parallaxOn
          hoverDuration={0.95}
          cursorColor="var(--ink)"
          cursorColorOnTarget="var(--primary)"
        />
      </div>
      <section className="section section--tight shell">
        <div
          className="stats reveal cursor-zone"
          data-reveal
          onMouseEnter={() => setStatsHovered(true)}
          onMouseLeave={() => setStatsHovered(false)}
        >
          {STATS.map((stat) => (
            <div key={stat.label} className="stat cursor-target">
              {/* Two faces, so the hover turn can stop at 180deg. A single
                  element can only come back the right way up by going all the
                  way round, and 360deg passes edge-on twice which reads as
                  two flips, not one. The back is `aria-hidden` because it
                  repeats the front verbatim and a screen reader should hear
                  each figure once. */}
              <div className="stat__face stat__face--front">
                <div className="stat__value">{stat.value}</div>
                <div className="stat__label">{stat.label}</div>
                <div className="stat__note">{stat.note}</div>
              </div>
              <div className="stat__face stat__face--back" aria-hidden="true">
                <div className="stat__value">{stat.value}</div>
                <div className="stat__label">{stat.label}</div>
                <div className="stat__note">{stat.note}</div>
              </div>
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
              Block A is reinforced concrete on Plot 7, Perungudi, cast by our own crews. The
              programme below is the whole of it six stages, thirty months, published as each one
              closed rather than assembled at the end.
            </p>
            <p>
              The same sequence runs as a film on the home page, scrubbed at whatever speed you
              scroll. This page is the version you can read.
            </p>
            <div className="panel__actions">
              <Link to="/" className="button button--primary">
                Watch the build
              </Link>
              <Link to="/contact" className="button button--outline">
                Book a viewing
              </Link>
            </div>
          </div>
          <div className="split__media">
            {/* The shots are referenced by URL, not imported. Anything under
                `public/` is already copied verbatim into the build; importing
                it as well makes Vite emit a second hashed copy of the bytes —
                and it would stop the four files being drop-in replaceable. */}
            <AccordionGallery
              items={GALLERY}
              defaultIndex={0}
              height={420}
              gap={8}
              radius={12}
              expandRatio={0.5}
              duration={0.45}
              /* The site is flat and square-cornered everywhere else, so the
                 3D tilt is dialled back from the default 8deg to a hint. */
              tilt={4}
              parallax={0.4}
              /* No darkening on the collapsed panels either — the renders are
                 already dusk shots and were reading as muddy. Greyscale alone
                 marks which panel is open. */
              dim={0}
              /* Captions off — the photographs carry themselves. `label` stays
                 in the content file because it still feeds each panel's
                 aria-label for anyone not looking at the screen. */
              showLabels={false}
              /* With the captions off this is the active indicator and the
                 keyboard focus ring, both of which land on a photograph;
                 --primary itself measures only 3.7:1 against a dark one. */
              accentColor="var(--primary-on-dark)"
              /* Inert while dim is 0; kept so that turning the dim back on
                 tints with --ink rather than the component's purple-black. */
              overlayColor="var(--ink)"
            />
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
        {/* Reveal sits on the grid, not on each card: one observer target
            fires the whole set, and `--spec-i` walks the cascade across it in
            source order regardless of how the four cards happen to wrap. */}
        <div className="spec reveal" data-reveal>
          <CardStack>
            {SPEC_GROUPS.map((group, index) => (
              <SpotlightCard
                as="article"
                key={group.title}
                className="spec-card"
                style={{ '--spec-i': index } as CSSProperties}
              >
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
              </SpotlightCard>
            ))}
          </CardStack>
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
        {/*
          The one section that stacks at BOTH widths, which is why it passes
          `stackAt` at all.

          Every other `CardStack` here is a rescue: a `repeat(auto-fit,
          minmax(N, 1fr))` grid collapses to one column on a phone and becomes a
          long single-file scroll, so the deck gives those cards something to do.
          This one is not a rescue. Each card is an image and a paragraph, the
          deck of six IS the section, and it is worth pinning whether it is
          being read on a desk or in a hand.

          The pin and ramp figures are `CardStack`'s defaults, tuned here first
          and left there. The two that are not: the deck is six cards deep
          rather than three or four, so it is given more room between them and a
          slightly wider peek to count them by — and on a phone both of those
          come down again, in sections.css, because a card that is nearly half
          the screen tall does not need 120px of runway to announce itself.
        */}
        <div className="stage-list">
          <CardStack className="stage-stack" stackAt="both">
            {PHASES.map((phase, index) => (
              <article key={phase.name} className="stage-card">
                <div className="stage-card__media">
                  <img
                    src={`/stills/${phase.image}-600.webp`}
                    srcSet={`/stills/${phase.image}-600.webp 600w, /stills/${phase.image}-1200.webp 1200w`}
                    sizes="(max-width: 52rem) 100vw, 16rem"
                    alt={phase.imageAlt}
                    loading="lazy"
                    decoding="async"
                    width={1200}
                    height={675}
                  />
                </div>

                <div className="stage-card__body">
                  <div className="stage-card__head">
                    <span className="stage-card__stage">
                      Stage {String(index + 1).padStart(2, '0')}
                    </span>
                    <time className="stage-card__date">{phase.date}</time>
                    {phase.gap && <span className="stage-card__gap">+{phase.gap}</span>}
                  </div>
                  <h3 className="stage-card__name">{phase.name}</h3>
                  <p className="stage-card__note">{phase.note}</p>
                  <p className="stage-card__metric">{phase.metric}</p>
                </div>

                <span
                  className={`stage-card__badge${
                    phase.status === 'scheduled' ? ' stage-card__badge--scheduled' : ''
                  }`}
                >
                  {phase.status === 'complete' ? 'Complete' : 'Scheduled'}
                </span>
              </article>
            ))}
          </CardStack>
        </div>
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
            <CardStack>
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
                    {/* Opens the enquiry popup rather than leaving for the
                        contact page — the reader is looking at the plan they
                        want to ask about. */}
                    <button type="button" className="unit__cta" onClick={openEnquiry}>
                      Enquire →
                    </button>
                  </footer>
                </article>
              ))}
            </CardStack>
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
          <CardStack>
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
          </CardStack>
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
          <CardStack>
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
          </CardStack>
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
          <CardStack>
            {LATEST.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </CardStack>
        </div>
      </section>

      {/* --- CTA ---------------------------------------------------------
          Moved down from the home page, which is now the film alone. The
          actions had to change with it: "See the details" pointed here, and
          a button that reloads the page you are already on is not one. */}
      <section className="section shell">
        <div className="panel">
          <h2>That is the building. Here is the paperwork.</h2>
          <p>
            The specification, the month-by-month build log, the three plan types and what is left
            of them — all of it is above. What it cannot show you is the stairwell at eye level.
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
