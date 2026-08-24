/**
 * All copy and figures for the project page.
 *
 * Placeholder content for a fictional development. Swap the values here — the
 * components read everything from this file and nothing is hard-coded in JSX.
 */

export interface BuildPhase {
  /** Position in the film, 0–1. Must be ascending. Drives the survey rule. */
  at: number;
  /** Short stage name, as it appears on a construction programme. */
  name: string;
  /** One concrete fact about what happened in this stage. */
  note: string;
  /** Month this stage completed, or is programmed to. */
  date: string;
  status: 'complete' | 'scheduled';
  /** Still in `public/stills/`, cut from this stage's beat in the film. */
  image: string;
  imageAlt: string;
  /** The number that stage is measured by. */
  metric: string;
  /** Months since the previous stage. Absent on the first. */
  gap?: string;
}

/**
 * Six stages, matched to the beats of the film. `at` is where each one takes
 * over as you scroll: phase 3 is current from 38% until 58%.
 *
 * The gaps sum to the programme length quoted in `PROJECT.statement` — if you
 * move a date, move that too.
 */
export const PHASES: BuildPhase[] = [
  {
    at: 0,
    name: 'Site',
    note: 'Plot cleared, levelled and hoarded to the pavement line.',
    date: 'Mar 2024',
    status: 'complete',
    image: 'site',
    imageAlt: 'Aerial view of the cleared and levelled plot behind its hoarding',
    metric: '1,860 m² cleared',
  },
  {
    at: 0.18,
    name: 'Substructure',
    note: 'Basement dug out, raft foundation and lower slab poured.',
    date: 'Aug 2024',
    status: 'complete',
    image: 'excavation',
    imageAlt: 'Excavators working the basement dig with the foundation slab poured',
    metric: '2,400 m³ excavated',
    gap: '5 months',
  },
  {
    at: 0.38,
    name: 'Frame',
    note: 'Reinforced concrete frame rising, levels one to four.',
    date: 'Feb 2025',
    status: 'complete',
    image: 'frame',
    imageAlt: 'Reinforced concrete frame under construction with scaffold and crane',
    metric: 'Levels 1–4 cast',
    gap: '6 months',
  },
  {
    at: 0.58,
    name: 'Topped out',
    note: 'Frame complete to roof level, scaffold at full height.',
    date: 'Jul 2025',
    status: 'complete',
    image: 'topped',
    imageAlt: 'The frame complete to roof level, wrapped in scaffold',
    metric: '6 slabs, 3 days early',
    gap: '5 months',
  },
  {
    at: 0.78,
    name: 'Envelope',
    note: 'Stone cladding, glazing and the entrance canopy installed.',
    date: 'Jan 2026',
    status: 'complete',
    image: 'facade',
    imageAlt: 'Completed stone facade and glazed entrance seen from the street',
    metric: '1,120 m² of cladding',
    gap: '6 months',
  },
  {
    at: 0.93,
    name: 'Handover',
    note: 'Interiors fitted, landscaping planted, keys released.',
    date: 'Sep 2026',
    status: 'scheduled',
    image: 'interior',
    imageAlt: 'Finished double-height entrance hall lit at dusk',
    metric: '24 residences',
    gap: '8 months',
  },
];

export const PROJECT = {
  developer: 'Temp RealEstate',
  name: 'Block A',
  plot: 'Plot 7',
  district: 'Perungudi, Chennai',
  /** Sits under the film, once the build has finished on screen. */
  statement:
    'Thirty months from a fenced-off plot of graded earth to a lit hallway. This is the whole of it, in order, at whatever speed you scroll.',
} as const;

export interface SpecRow {
  label: string;
  value: string;
  /**
   * Set small and muted immediately after the value, so a unit reads as part of
   * the figure rather than as a word tacked on at the same size.
   */
  unit?: string;
}

export interface SpecGroup {
  /** Selects the line icon in SpecIcon.tsx. */
  icon: 'scale' | 'area' | 'frame' | 'calendar';
  title: string;
  /** One line under the title, in the card header. */
  summary: string;
  rows: SpecRow[];
}

/**
 * The specification, grouped rather than listed flat.
 *
 * Six loose figures in a row read as trivia; four headed groups read as a
 * document. The extra rows are the ones a buyer actually asks for next —
 * ceiling height, the defects window — and they line up with what the journal
 * and the About page already claim.
 */
export const SPEC_GROUPS: SpecGroup[] = [
  {
    icon: 'scale',
    title: 'Scale',
    summary: 'How much building there is.',
    rows: [
      { label: 'Storeys', value: '6' },
      { label: 'Residences', value: '24' },
      { label: 'Basement parking', value: '1 level' },
    ],
  },
  {
    icon: 'area',
    title: 'Area',
    summary: 'Quoted as RERA carpet.',
    rows: [
      { label: 'Plot area', value: '1,860', unit: 'm²' },
      { label: 'Built-up area', value: '9,240', unit: 'm²' },
      { label: 'Typical floor', value: '1,540', unit: 'm²' },
    ],
  },
  {
    icon: 'frame',
    title: 'Structure',
    summary: 'Cast by our own crews.',
    rows: [
      { label: 'Frame', value: 'RCC' },
      { label: 'Method', value: 'Cast in situ' },
      { label: 'Ceiling height', value: '3.0', unit: 'm' },
    ],
  },
  {
    icon: 'calendar',
    title: 'Delivery',
    summary: 'Dates we are held to.',
    rows: [
      { label: 'Topped out', value: 'Jul 2025' },
      { label: 'Handover', value: 'Sep 2026' },
      { label: 'Defects window', value: '24 months' },
    ],
  },
];

export interface Residence {
  type: string;
  /** Selects the schematic in PlanDiagram.tsx. */
  plan: 'a' | 'b' | 'c';
  /** What the unit is, in words. */
  headline: string;
  /** Carpet area, split from its unit so the figure can be set larger. */
  area: string;
  areaUnit: string;
  beds: number;
  baths: number;
  aspect: string;
  floors: string;
  /** Guide price. Placeholder, and consistent at roughly ₹1.2 lakh per m². */
  price: string;
  available: number;
}

export const RESIDENCES: Residence[] = [
  {
    type: 'Type A',
    plan: 'a',
    headline: 'Two bedrooms',
    area: '112',
    areaUnit: 'm²',
    beds: 2,
    baths: 2,
    aspect: 'East, over the courtyard',
    floors: 'Levels 2–5',
    price: '₹1.35 Cr',
    available: 4,
  },
  {
    type: 'Type B',
    plan: 'b',
    headline: 'Three bedrooms',
    area: '148',
    areaUnit: 'm²',
    beds: 3,
    baths: 3,
    aspect: 'Dual, east and west',
    floors: 'Levels 1–6',
    price: '₹1.78 Cr',
    available: 7,
  },
  {
    type: 'Type C',
    plan: 'c',
    headline: 'Three bedrooms and a study',
    area: '186',
    areaUnit: 'm²',
    beds: 3,
    baths: 3,
    aspect: 'Corner, with terrace',
    floors: 'Levels 5–6',
    price: '₹2.30 Cr',
    available: 2,
  },
];

export const CONTACT = {
  heading: 'Come and see it standing up',
  body: 'Site visits run Saturday mornings while the fit-out finishes. Two units of Type C are left.',
} as const;
