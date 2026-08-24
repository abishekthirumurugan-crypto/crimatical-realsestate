import type { ReactElement } from 'react';

export type IconName =
  // specification
  | 'scale'
  | 'area'
  | 'frame'
  | 'calendar'
  // services
  | 'blocks'
  | 'portal'
  | 'room'
  | 'retrofit'
  // operating rules
  | 'log'
  | 'column'
  | 'costing'
  | 'shield'
  // contact
  | 'pin'
  | 'phone'
  | 'clock'
  | 'helmet';

/**
 * Every line icon on the site, in one place.
 *
 * Inline SVG on a 24 grid, stroked in `currentColor` — they inherit their
 * colour from whatever badge they sit in, stay sharp at any size and cost
 * nothing over the network. Drawn from the trade rather than picked from a set.
 */
const GLYPHS: Record<IconName, ReactElement> = {
  /* --- specification --- */
  scale: (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="1.5" />
      <path d="M4.5 9h15M4.5 15h15" />
    </>
  ),
  area: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M9.5 19V11H21" />
    </>
  ),
  frame: (
    <>
      <path d="M5 4v16M12 4v16M19 4v16" />
      <path d="M3 8.5h18M3 15.5h18" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),

  /* --- services --- */
  blocks: (
    <>
      <path d="M2.5 21h19" />
      <rect x="4" y="12" width="6.5" height="9" rx="1" />
      <rect x="13.5" y="5" width="6.5" height="16" rx="1" />
      <path d="M15.5 9h2.5M15.5 13h2.5M15.5 17h2.5" />
    </>
  ),
  portal: (
    <>
      <path d="M2.5 21h19" />
      <path d="M5 21V4h14v17" />
      <path d="M5 9.5h14M5 15h14" />
      <path d="M12 4v17" />
    </>
  ),
  room: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 15.5h18" />
      <rect x="6" y="8" width="5" height="4.5" rx="0.75" />
      <path d="M14.5 15.5v-3.5H19" />
    </>
  ),
  retrofit: (
    <>
      <path d="M3 21h9V8.5L7.5 5 3 8.5V21Z" />
      <path d="M6 21v-4.5h3V21" />
      <path d="M20.5 13.5a4.5 4.5 0 1 1-1.6-3.4" />
      <path d="M21 6.5v4h-4" />
    </>
  ),

  /* --- operating rules --- */
  log: (
    <>
      <path d="M6.5 3H14l4 4v13.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-17a.5.5 0 0 1 .5-.5Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12.5h6M9 16h6" />
    </>
  ),
  column: (
    <>
      <path d="M4.5 4h15M4.5 20h15" />
      <path d="M9.5 4v16M14.5 4v16" />
    </>
  ),
  costing: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8.5 7h7" />
      <path d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v6.2c0 4.5-3.2 8.4-7.5 9.3-4.3-.9-7.5-4.8-7.5-9.3V6L12 3Z" />
      <path d="M9 12.2l2.1 2.1 4-4.2" />
    </>
  ),

  /* --- contact --- */
  pin: (
    <>
      <path d="M12 21.5s7-5.9 7-11.5a7 7 0 1 0-14 0c0 5.6 7 11.5 7 11.5Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  phone: (
    <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.6 2.1" />
    </>
  ),
  helmet: (
    <>
      <path d="M2.5 17.5h19" />
      <path d="M5 17.5V14a7 7 0 0 1 14 0v3.5" />
      <path d="M9.5 7.9V4.6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3.3" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 21 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}
