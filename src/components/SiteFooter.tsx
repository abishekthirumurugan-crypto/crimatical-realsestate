import Logo from './Logo';
import { Link } from '../lib/router';
import { COMPANY, FOOTER_LINKS } from '../content/site';

const YEAR = 2026;

/**
 * The footer is the only place on the site where the navy runs full-bleed and
 * the gold is allowed to be structural rather than an accent. Everything above
 * it is concrete and restraint; this is where the brand gets to land.
 */
export default function SiteFooter() {
  const { address } = COMPANY;

  return (
    <footer className="site-footer">
      <div className="site-footer__inner shell">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Logo size={56} wordmark tone="light" className="site-footer__lockup" />
            <p className="site-footer__tagline">{COMPANY.tagline}</p>
            <p className="site-footer__blurb">
              Mid-rise residential in Chennai since {COMPANY.founded}. Every project filmed from
              the day the hoarding goes up, and published whether the programme held or not.
            </p>
          </div>

          <nav className="site-footer__links" aria-label="Footer">
            {FOOTER_LINKS.map((group) => (
              <div key={group.heading} className="site-footer__group">
                <h2 className="site-footer__heading">{group.heading}</h2>
                <ul>
                  {group.items.map((item) => (
                    <li key={`${group.heading}-${item.label}`}>
                      <Link to={item.to}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="site-footer__details">
          <div className="site-footer__detail">
            <h2 className="site-footer__heading">Visit</h2>
            {/* A real <address> so the office is machine-readable, and so screen
                readers announce it as contact information rather than prose. */}
            <address>
              {address.line1}
              <br />
              {address.line2}
              <br />
              {address.locality}
              <br />
              {address.region}
            </address>
          </div>

          <div className="site-footer__detail">
            <h2 className="site-footer__heading">Talk to us</h2>
            <a href={`tel:${COMPANY.phoneHref}`}>{COMPANY.phone}</a>
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            <a href={`mailto:${COMPANY.salesEmail}`}>{COMPANY.salesEmail}</a>
          </div>

          <div className="site-footer__detail">
            <h2 className="site-footer__heading">Open</h2>
            <dl className="site-footer__hours">
              {COMPANY.hours.map((slot) => (
                <div key={slot.days}>
                  <dt>{slot.days}</dt>
                  <dd>{slot.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="site-footer__base">
          <span>
            © {YEAR} {COMPANY.name}
          </span>
          <span>{COMPANY.registration}</span>
          <span className="site-footer__note">Placeholder content — template build</span>
        </div>
      </div>
    </footer>
  );
}
