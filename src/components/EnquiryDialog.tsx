/**
 * The enquiry popup, and the Sell.Do form that lives in it.
 *
 * A native `<dialog>` opened with `showModal()`, which is doing more work here
 * than it looks. It renders in the browser's top layer, so it is above the
 * fixed header, the floating rail, the card-focus scrim and the custom cursor
 * without competing with any of their z-indexes; it makes everything outside
 * itself inert, so the page behind cannot be hovered, tabbed into or clicked;
 * and it brings Escape-to-close and a focus trap with it. All of that would
 * otherwise be a few hundred lines of our own.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribeEnquiry } from '../lib/enquiry';
import { COMPANY } from '../content/site';

import '../styles/enquiry.css';

/**
 * The Sell.Do embed, exactly as their dashboard issues it:
 *
 *   <script src='//forms.cdn.sell.do/t/forms/6425925f8eb6d827e99299d6/6a9151e4a2e3a9e97b860e14.js'
 *           data-form-id='6a9151e4a2e3a9e97b860e14'></script>
 *
 * Two things about how it gets onto the page.
 *
 * It cannot be written as JSX. React does not execute a `<script>` it renders
 * — the tag would appear in the DOM and never run — so the element is built
 * imperatively and appended to the slot below, which is what the vendor's
 * script uses to decide where to draw the form.
 *
 * And the protocol-relative `//` is spelled out as `https://`. On the live
 * site the two are identical; on the dev server, which is plain `http`, `//`
 * resolves to `http://forms.cdn.sell.do` and the form never arrives.
 */
const FORM_SRC =
  'https://forms.cdn.sell.do/t/forms/6425925f8eb6d827e99299d6/6a9151e4a2e3a9e97b860e14.js';
const FORM_ID = '6a9151e4a2e3a9e97b860e14';

/**
 * PASTE THE SELL.DO BASE SCRIPT URL HERE. Until you do, the popup opens and
 * offers the phone number instead of a form.
 *
 * The tag above is only the form's DEFINITION — its fields, its labels, its
 * thank-you text. Fetched and read, all it does is declare the shape of the
 * form and then wait:
 *
 *   document.addEventListener('sell_do_base_framework_ready', function () {
 *     selldo_form_instance.init_form_rendering(form_details_…, false);
 *   });
 *
 * `selldo_form_instance` is the renderer, and nothing in that file defines it.
 * It comes from Sell.Do's base framework, which is the OTHER snippet their
 * dashboard issues — usually labelled the tracking or base script, and usually
 * shown just above the form embed. Without it the event never fires, the
 * renderer is never called, and the slot stays empty: verified against the
 * live URL, which returns 2KB of JSON and two event listeners.
 *
 * It is loaded from here rather than from index.html so that it costs nothing
 * until someone opens the popup. If you also want Sell.Do's site-wide visitor
 * tracking, that snippet belongs in index.html instead — but that is a
 * different decision, on every page, for every reader.
 */
const BASE_SRC: string | null = null;

/**
 * How long to wait for the vendor to draw something before giving up on it.
 * The script's own `onload` cannot answer this: it fires when the definition
 * has been fetched, which happens whether or not a form ever appears.
 */
const RENDER_TIMEOUT_MS = 6000;

type Status = 'idle' | 'loading' | 'ready' | 'failed';

export default function EnquiryDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  // A ref as well as the state: StrictMode runs effects twice in development,
  // and a second copy of a third-party form script is a second form.
  const injected = useRef(false);

  /**
   * The script is fetched on the first open, not at mount.
   *
   * Most readers never open this. Loading a third-party form bundle for all of
   * them would cost a connection to another origin on every page of the site,
   * and hand that origin a request it has no reason to see.
   */
  const inject = useCallback(() => {
    const slot = slotRef.current;
    if (!slot || injected.current) return;
    injected.current = true;
    setStatus('loading');

    // The renderer first, if we have been given it. Order is not actually
    // load-bearing — the form script both listens for the ready event and
    // checks whether the framework has already fired it — but asking for the
    // dependency first is the honest way round.
    if (BASE_SRC && !document.querySelector(`script[src="${BASE_SRC}"]`)) {
      const base = document.createElement('script');
      base.src = BASE_SRC;
      base.async = true;
      document.head.appendChild(base);
    }

    const script = document.createElement('script');
    script.src = FORM_SRC;
    script.async = true;
    script.dataset.formId = FORM_ID;
    // Blocked by an extension, offline, or the vendor is down. Note there is
    // no `onload` handler: see `RENDER_TIMEOUT_MS`.
    script.onerror = () => setStatus('failed');
    slot.appendChild(script);
  }, []);

  /**
   * Whether the vendor actually drew a form, which is a different question
   * from whether its script downloaded.
   *
   * Watched rather than assumed, because the failure this is most likely to
   * meet — the base framework missing — is silent: the definition loads, fires
   * `onload`, and renders nothing. An empty white box under a heading is the
   * worst of the available outcomes, so if no control has appeared by the
   * timeout the reader gets a phone number instead.
   */
  useEffect(() => {
    const slot = slotRef.current;
    if (status !== 'loading' || !slot) return;

    const drawn = () => slot.querySelector('input, select, textarea') !== null;

    const observer = new MutationObserver(() => {
      if (drawn()) setStatus('ready');
    });
    observer.observe(slot, { childList: true, subtree: true });

    const timer = window.setTimeout(() => {
      setStatus(drawn() ? 'ready' : 'failed');
    }, RENDER_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [status]);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  /*
   * `showModal` makes the page inert but does not stop it scrolling — the
   * document still moves behind the popup on a wheel or a trackpad. Hence the
   * class, which goes on `html` because that is where this site's `overflow`
   * already lives; see the note at the top of base.css for why body is
   * deliberately not the scroll container.
   */
  useEffect(
    () =>
      subscribeEnquiry(() => {
        const dialog = dialogRef.current;
        if (!dialog || dialog.open) return;
        dialog.showModal();
        document.documentElement.classList.add('has-modal');
        inject();
      }),
    [inject],
  );

  // Unmounting with the popup open would leave the page unable to scroll.
  useEffect(() => () => document.documentElement.classList.remove('has-modal'), []);

  return (
    <dialog
      ref={dialogRef}
      className="enquiry"
      aria-labelledby="enquiry-title"
      // `close` fires for the button, for Escape and for a backdrop click
      // alike, so this one handler covers every way out.
      onClose={() => document.documentElement.classList.remove('has-modal')}
      // The backdrop is part of the dialog's own box, so a click that lands on
      // the element itself rather than on its contents is a click outside.
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <div className="enquiry__panel">
        <header className="enquiry__head">
          <div>
            <span className="tag">Enquiry</span>
            <h2 className="enquiry__title" id="enquiry-title">
              Ask us about Block A
            </h2>
          </div>
          <button type="button" className="enquiry__close" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </header>

        <div className="enquiry__body">
          {status === 'loading' && (
            <p className="enquiry__note" role="status">
              Loading the form…
            </p>
          )}

          {status === 'failed' && (
            <div className="enquiry__note enquiry__note--error" role="alert">
              <p>
                We could not load the enquiry form. Call us on{' '}
                <a href={`tel:${COMPANY.phoneHref}`}>{COMPANY.phone}</a>, or use the{' '}
                <a href="/contact">contact page</a> — it reaches the same desk.
              </p>
            </div>
          )}

          {/* Where the Sell.Do script draws itself. */}
          <div className="enquiry__form" ref={slotRef} />
        </div>
      </div>
    </dialog>
  );
}
