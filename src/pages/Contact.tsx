import { useState, type FormEvent } from 'react';

import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { useReveals } from '../hooks/useReveals';
import { COMPANY, FAQS, PROMISES } from '../content/site';
import { RESIDENCES } from '../content/project';

const MAPS_QUERY = encodeURIComponent(
  `${COMPANY.address.line1}, ${COMPANY.address.line2}, ${COMPANY.address.locality}`,
);

export default function Contact() {
  useReveals();
  const [sent, setSent] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Template build: there is no endpoint behind this. The success state is
    // here so the layout and copy of the confirmed path are done — wire the
    // submit to your form handler and drop this branch.
    setSent(true);
  };

  return (
    <>
      <PageHero
        eyebrow="Contact us"
        title="Talk to someone who has been on the site"
        lede="Sales, site visits, and anything the build log does not answer."
      >
        <ul className="promises">
          {PROMISES.map((promise) => (
            <li key={promise}>{promise}</li>
          ))}
        </ul>
      </PageHero>

      <section className="section shell">
        <div className="contact">
          <div className="contact__form-wrap">
            {sent ? (
              <div className="contact__sent" role="status">
                <h2>Thanks — that is with us.</h2>
                <p>
                  Someone from the sales team will come back to you within one working day. If it
                  is urgent, call {COMPANY.phone}.
                </p>
                <button type="button" className="button button--outline" onClick={() => setSent(false)}>
                  Send another
                </button>
              </div>
            ) : (
              <form className="contact__form" onSubmit={handleSubmit}>
                <h2 className="contact__form-title">Send an enquiry</h2>

                <div className="field">
                  <label htmlFor="name">Your name</label>
                  <input id="name" name="name" type="text" autoComplete="name" required />
                </div>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="field">
                    <label htmlFor="phone">Phone</label>
                    <input id="phone" name="phone" type="tel" autoComplete="tel" />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="interest">What are you asking about</label>
                  <select id="interest" name="interest" defaultValue="">
                    <option value="" disabled>
                      Choose one
                    </option>
                    {RESIDENCES.map((unit) => (
                      <option key={unit.type} value={unit.type}>
                        {unit.type} — {unit.beds}, {unit.area}
                      </option>
                    ))}
                    <option value="visit">A site visit</option>
                    <option value="other">Something else</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="message">Message</label>
                  <textarea id="message" name="message" rows={5} required />
                </div>

                <button type="submit" className="button button--primary">
                  Send enquiry
                </button>

                <p className="contact__disclaimer">
                  Template build — this form does not submit anywhere yet.
                </p>
              </form>
            )}
          </div>

          <aside className="contact__aside">
            <div className="contact__block">
              <h2 className="contact__block-title">
                <span className="contact__block-icon">
                  <Icon name="pin" size={18} />
                </span>
                Office
              </h2>
              <address>
                {COMPANY.address.line1}
                <br />
                {COMPANY.address.line2}
                <br />
                {COMPANY.address.locality}
                <br />
                {COMPANY.address.region}
              </address>
              <a
                className="contact__map-link"
                href={`https://www.google.com/maps/search/?api=1&query=${MAPS_QUERY}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open in Maps ↗
              </a>
            </div>

            <div className="contact__block">
              <h2 className="contact__block-title">
                <span className="contact__block-icon">
                  <Icon name="phone" size={18} />
                </span>
                Direct
              </h2>
              <a href={`tel:${COMPANY.phoneHref}`}>{COMPANY.phone}</a>
              <a href={`mailto:${COMPANY.salesEmail}`}>{COMPANY.salesEmail}</a>
              <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            </div>

            <div className="contact__block">
              <h2 className="contact__block-title">
                <span className="contact__block-icon">
                  <Icon name="clock" size={18} />
                </span>
                Open
              </h2>
              <dl className="contact__hours">
                {COMPANY.hours.map((slot) => (
                  <div key={slot.days}>
                    <dt>{slot.days}</dt>
                    <dd>{slot.time}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="contact__block">
              <h2 className="contact__block-title">
                <span className="contact__block-icon">
                  <Icon name="helmet" size={18} />
                </span>
                Site visits
              </h2>
              <p className="contact__note">
                Block A, Plot 7 is a working site until handover. Visits are Saturday mornings only,
                booked ahead, with boots and a hard hat provided at the gate.
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* --- answered already --------------------------------------------- */}
      <section className="section section--band">
        <div className="shell">
          <div className="section__head">
            <div>
              <span className="tag">Before you write</span>
              <h2 className="section__heading">Answered already</h2>
            </div>
            <p className="section__intro">
              The six things the sales team is asked most, answered where you can read them without
              sending anything.
            </p>
          </div>

          {/* Native <details>: keyboard-operable, findable by the browser's own
              in-page search, and no JavaScript to go wrong. */}
          <div className="faqs reveal" data-reveal>
            {FAQS.map((faq) => (
              <details key={faq.question} className="faq" name="contact-faq">
                <summary className="faq__q">{faq.question}</summary>
                <p className="faq__a">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
