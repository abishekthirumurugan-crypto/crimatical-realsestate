import PageHero from '../components/PageHero';
import { Link } from '../lib/router';
import { useReveals } from '../hooks/useReveals';

export default function NotFound() {
  // The CTA panel below carries `.reveal`, which stays at opacity 0 until an
  // observer marks it shown.
  useReveals();

  return (
    <>
      <PageHero
        eyebrow="404"
        title="Nothing at this address"
        lede="The page you asked for is not here. It may have been renamed, or the link may have been mistyped."
      />
      <section className="section shell">
        <div className="panel reveal" data-reveal>
          <div className="panel__actions">
            <Link to="/" className="button button--primary">
              Back to the build
            </Link>
            <Link to="/blog" className="button button--outline">
              Read the journal
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
