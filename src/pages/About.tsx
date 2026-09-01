import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import CardStack from '../components/CardStack';
import { Link } from '../lib/router';
import { useReveals } from '../hooks/useReveals';
import { ABOUT, COMPANY } from '../content/site';

export default function About() {
  useReveals();

  return (
    <>
      <PageHero eyebrow="About us" title={ABOUT.heading} lede={ABOUT.lede}>
        <div className="figures">
          {ABOUT.figures.map((figure) => (
            <div key={figure.label} className="figure">
              <div className="figure__value">{figure.value}</div>
              <div className="figure__label">{figure.label}</div>
              <div className="figure__note">{figure.note}</div>
            </div>
          ))}
        </div>
      </PageHero>

      {/* --- the story, beside the work ---------------------------------- */}
      <section className="section shell">
        <div className="split reveal" data-reveal>
          <div className="split__body">
            <span className="tag">Since {COMPANY.founded}</span>
            <h2>How we got here</h2>
            {ABOUT.story.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
          <div className="split__media">
            <div className="media">
              <img
                src="/stills/frame-1200.jpg"
                srcSet="/stills/frame-600.jpg 600w, /stills/frame-1200.jpg 1200w"
                sizes="(max-width: 60rem) 100vw, 45vw"
                alt="Reinforced concrete frame under construction, cast by the company's own crews"
                loading="lazy"
                decoding="async"
                width={1200}
                height={675}
              />
            </div>
          </div>
        </div>
      </section>

      {/* --- the four rules ---------------------------------------------- */}
      <section className="section section--band">
        <div className="shell">
          <div className="section__head">
            <div>
              <span className="tag">What we hold to</span>
              <h2 className="section__heading">Four rules we have not broken</h2>
            </div>
            <p className="section__intro">
              None of these are unusual. What is unusual is writing them down where a buyer can hold
              us to them.
            </p>
          </div>

          <div className="values reveal" data-reveal>
            <CardStack>
              {ABOUT.values.map((value) => (
                <article key={value.title} className="value">
                  <span className="value__icon">
                    <Icon name={value.icon} />
                  </span>
                  <h3 className="value__title">{value.title}</h3>
                  <p className="value__body">{value.body}</p>
                </article>
              ))}
            </CardStack>
          </div>
        </div>
      </section>

      {/* --- milestones --------------------------------------------------- */}
      <section className="section shell">
        <div className="section__head">
          <div>
            <span className="tag">Milestones</span>
            <h2 className="section__heading">Fifteen years, in order</h2>
          </div>
          <p className="section__intro">
            The company's own build log. Same rule as the projects: it goes up whether the year went
            well or not.
          </p>
        </div>

        {/* An ordered list, because the order is the information. */}
        <ol className="mstones reveal" data-reveal>
          {ABOUT.milestones.map((milestone, index) => (
            <li key={milestone.year} className="mstone" data-last={index === ABOUT.milestones.length - 1}>
              <span className="mstone__year">{milestone.year}</span>
              <span className="mstone__spine" aria-hidden="true">
                <span className="mstone__dot" />
              </span>
              <p className="mstone__event">{milestone.event}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* --- the team ------------------------------------------------------ */}
      <section className="section section--band">
        <div className="shell">
          <div className="section__head">
            <div>
              <span className="tag">Who you deal with</span>
              <h2 className="section__heading">Average tenure, nine years</h2>
            </div>
            <p className="section__intro">
              Four people, and you will meet at least two of them before you reserve anything.
            </p>
          </div>

          <div className="team reveal" data-reveal>
            <CardStack>
              {ABOUT.team.map((person) => (
                <article key={person.name} className="person">
                  <header className="person__head">
                    <span className="person__avatar" aria-hidden="true">
                      {person.initials}
                    </span>
                    <span className="person__focus">{person.focus}</span>
                  </header>
                  <h3 className="person__name">{person.name}</h3>
                  <div className="person__role">{person.role}</div>
                  <p className="person__note">{person.note}</p>
                  <div className="person__since">With us since {person.since}</div>
                </article>
              ))}
            </CardStack>
          </div>
        </div>
      </section>

      <section className="section shell">
        <div className="panel reveal" data-reveal>
          <h2>Come and look at a site</h2>
          <p>
            The fastest way to understand how we work is to stand on a floor we have cast. Block A
            runs viewings on Saturday mornings.
          </p>
          <div className="panel__actions">
            <Link to="/contact" className="button button--primary">
              Book a viewing
            </Link>
            <Link to="/" className="button button--outline">
              See the build
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
