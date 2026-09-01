import { useEffect, useState } from 'react';

import { useRoute } from '../lib/router';
import { openEnquiry } from '../lib/enquiry';
import { COMPANY } from '../content/site';

/**
 * WhatsApp, call and enquiry, pinned to the middle of the right edge.
 *
 * Hidden while the film is on screen. The film is the one full-bleed moment on
 * the site and three coloured discs sitting on it would undo that — so this
 * watches for ScrollVideo's own `[data-scroll-video]` wrapper rather than being
 * told about it. That keeps the two components independent: the film can mount,
 * unmount or move page and this still behaves.
 */
export default function FloatingActions() {
  const route = useRoute();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const film = document.querySelector<HTMLElement>('[data-scroll-video]');

    // No film on this route: the rail is simply always available.
    if (!film) {
      setVisible(true);
      return;
    }

    /**
     * An observer, not a scroll handler.
     *
     * This used to read `getBoundingClientRect().bottom` inside a
     * rAF-coalesced scroll listener — correct, and one forced layout flush per
     * scroll frame on the one page that is also driving a video scrub. On a
     * phone that is enough to cost frames: the read has to resolve style and
     * layout before the scrub loop gets to do its compositor work.
     *
     * "Has the film left the viewport" is exactly what an IntersectionObserver
     * answers, off the main thread and only when the answer changes.
     */
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(film);

    return () => observer.disconnect();
  }, [route]);

  const waText = encodeURIComponent(COMPANY.whatsappMessage);

  return (
    <nav className="actions" data-visible={visible} aria-label="Contact shortcuts">
      <a
        className="actions__item actions__item--whatsapp"
        href={`https://wa.me/${COMPANY.whatsapp}?text=${waText}`}
        target="_blank"
        rel="noreferrer noopener"
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
      >
        <span className="actions__icon" aria-hidden="true">
          {/* WhatsApp brand glyph. */}
          <svg viewBox="0 0 24 24" fill="currentColor" width="21" height="21" focusable="false">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.885 3.488" />
          </svg>
        </span>
        <span className="actions__label">WhatsApp</span>
      </a>

      <a
        className="actions__item actions__item--call"
        href={`tel:${COMPANY.phoneHref}`}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
      >
        <span className="actions__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" width="21" height="21" focusable="false">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.28-.28.68-.36 1.02-.25 1.12.37 2.32.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2Z" />
          </svg>
        </span>
        <span className="actions__label">Call us</span>
      </a>

      {/* A button, not a link to /contact: it opens the enquiry popup in
          place. The contact page is still there and still linked from the
          header and the footer — this is the shortcut, and a shortcut that
          leaves the page you are reading is not one. */}
      <button
        type="button"
        className="actions__item actions__item--enquiry"
        onClick={openEnquiry}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
      >
        <span className="actions__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" width="21" height="21" focusable="false">
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z" />
          </svg>
        </span>
        <span className="actions__label">Enquire</span>
      </button>
    </nav>
  );
}
