import type { CSSProperties } from 'react';

import { COMPANY } from '../content/site';

interface LogoProps {
  /** Rendered edge length in px. The mark is square. */
  size?: number;
  /** Show the wordmark alongside the mark. */
  wordmark?: boolean;
  /** `light` is for navy grounds (the footer). Everything else is on white. */
  tone?: 'light' | 'dark';
  className?: string;
}

/**
 * The wordmark is set in two weights, so it has to be split somewhere. The
 * first word takes the gold, the rest takes the body colour — derived from
 * `COMPANY.name` rather than typed out, so renaming the company in one place
 * renames it here too.
 */
const [FIRST_WORD, ...REST_WORDS] = COMPANY.name.split(' ');
const REST = REST_WORDS.join(' ');

/**
 * The shield mark, at whatever size the caller needs.
 *
 * Three widths are shipped so a 34px header mark does not download the 147 KB
 * 500px original — `sizes` tells the browser the CSS width up front, so it can
 * pick before layout. The 500px file stays for the social card.
 */
export default function Logo({ size = 34, wordmark = false, tone = 'dark', className }: LogoProps) {
  return (
    <span
      className={className}
      data-logo=""
      data-tone={tone}
      // Published so the wordmark can size itself off the mark — one prop then
      // controls the whole lockup instead of two values drifting apart.
      style={{ '--logo-size': `${size}px` } as CSSProperties}
    >
      {/* The alt text carries the company name because the wordmark beside it
          is hidden from the accessibility tree — it is a styling split of the
          same words, and announcing them twice helps nobody. */}
      <img
        className="logo__mark"
        src="/image/logo-96.png"
        srcSet="/image/logo-96.png 96w, /image/logo-192.png 192w, /image/logo.png 500w"
        sizes={`${size}px`}
        width={size}
        height={size}
        alt={COMPANY.name}
        decoding="async"
      />
      {wordmark && (
        <span className="logo__word" aria-hidden="true">
          <span className="logo__word-a">{FIRST_WORD}</span>
          {REST && <span className="logo__word-b">{REST}</span>}
        </span>
      )}
    </span>
  );
}
