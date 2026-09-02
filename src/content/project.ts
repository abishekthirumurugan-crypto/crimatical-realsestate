/**
 * All copy and figures for the project page.
 *
 * Placeholder content for a fictional development. Swap the values here — the
 * components read everything from this file and nothing is hard-coded in JSX.
 */

/**
 * A beat of the home-page film.
 *
 * The film is a single forward dolly through a finished apartment — street,
 * gate, hall, bedroom, kitchen, terrace — so its beats are SPACES, not dates.
 * That is why this is a separate export from `PHASES` below rather than a
 * rename of it: `PHASES` is the thirty-month construction programme and it is
 * still exactly right on `/details`, where the build log lives. The two
 * describe the same building at different times and neither stands in for the
 * other.
 *
 * Keep `body` to two lines. It is set over moving picture, and the scrim that
 * makes it legible is sized to a block this tall — a third line pushes the copy
 * up out of the dark part of the gradient.
 */
export interface WalkthroughSpace {
  /**
   * Position in the film, 0–1. Must be ascending.
   *
   * Five beats across ten seconds, so roughly two seconds each — but snapped to
   * the cuts rather than spaced exactly. The camera holds three full seconds in
   * the bedroom and passes the entrance in under one and a half, so an exact
   * two-second split would have named the living room over a shot of a bed.
   */
  at: number;
  /** The space you are in. Short — it is set large. */
  name: string;
  /** Two lines. Concrete nouns and real numbers, no salesmanship. */
  body: string;
}

/**
 * Timings read off the cut, sampled every half second from the encode itself:
 * 0.0–1.2s the facade, 1.2–2.2s the glazed threshold, 2.2–4.2s the living room,
 * 4.2–6.8s the stair hall, 6.8–8.2s the bedroom, 8.2–10s the kitchen.
 *
 * These moved when the film was replaced. The previous cut ran gate → door →
 * hall → bedroom → kitchen with the bedroom on a long three-second hold in the
 * middle; this one spends that hold on a stair the old film did not have, which
 * pushes the bedroom and the kitchen most of a beat later each. A label that
 * does not move with the cut names the wrong room, and on this page that is the
 * one mistake the overlay can make.
 */
export const SPACES: WalkthroughSpace[] = [
  {
    at: 0,
    name: 'The approach',
    body: 'Eighteen metres of frontage. The uplighters run on a photocell rather than a timer.',
  },
  {
    at: 0.16,
    name: 'The entrance',
    body: 'Walnut on a concealed pivot, 2.4 m tall. The grain is book-matched across both leaves.',
  },
  {
    at: 0.32,
    name: 'The living room',
    body: 'Glazed on two sides, 3.0 m to the soffit. The marble runs in one direction throughout.',
  },
  {
    at: 0.7,
    name: 'The principal bedroom',
    body: 'East light, with the walk-in behind the headboard wall. Carpet sits on the slab, not on battens.',
  },
  {
    at: 0.86,
    name: 'The kitchen',
    body: 'Sage lacquer and honed quartz, appliances behind the tall run. Past it, the sixth-floor terrace.',
  },
];

export interface BuildPhase {
  /**
   * Position in the old construction film, 0–1.
   *
   * Vestigial. The home-page film is a walkthrough now and takes its beats from
   * `SPACES` above; nothing reads this any more. Kept because the ordering it
   * encodes is the programme order, which `/details` renders, and because a
   * future cut of the build film would want it back.
   */
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
  /**
   * Copy for the two columns beside the frame. Changes with the stage, so the
   * space either side of the building is doing work rather than sitting empty.
   */
  aside: {
    /** Paragraph and the three facts behind it. The column's heading is
        `name` above — a second one only repeated it. */
    left: { body: string; points: string[] };
    /** Heading, paragraph, and the one figure the stage is measured by. */
    right: { title: string; body: string; stat: { value: string; label: string } };
  };
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
    name: 'Foundation',
    note: 'Raft slab cast and the ground floor set out.',
    date: 'Mar 2024',
    status: 'complete',
    image: 'raft',
    imageAlt: 'The raft slab and ground floor set out, before the frame goes up',
    metric: 'Raft slab poured',
    aside: {
      left: {
        body: 'The raft is 900 mm of concrete poured in one continuous operation. Stopping halfway would leave a cold joint under the whole building, so the pour ran nineteen hours.',
        points: ['Raft depth 900 mm', 'Nineteen-hour pour', 'Grade M35 concrete'],
      },
      right: {
        title: 'Why it matters',
        body: 'Everything above is only as good as this. It is also the last time anyone will see the structure that carries the building.',
        stat: { value: '1,860', label: 'm² of slab' },
      },
    },
  },
  {
    at: 0.42,
    name: 'Lower levels',
    note: 'Frame out of the ground, slabs cast floor by floor.',
    date: 'Aug 2024',
    status: 'complete',
    image: 'lower',
    imageAlt: 'The lower levels of the concrete frame cast above the slab',
    metric: 'Frame out of the ground',
    gap: '5 months',
    aside: {
      left: {
        body: 'Columns cast first, then the slab formed and poured around them. Three floors in five months, which is the pace one crew and one set of forms allows.',
        points: ['Levels one to three', 'One crew, one set of forms', 'Crane erected in week three'],
      },
      right: {
        title: 'On site',
        body: 'Fourteen people and a single tower crane. The same foreman ran this floor and every floor above it.',
        stat: { value: '5', label: 'months to level three' },
      },
    },
  },
  {
    at: 0.54,
    name: 'Mid rise',
    note: 'Core running ahead of the slabs, formwork climbing with it.',
    date: 'Feb 2025',
    status: 'complete',
    image: 'mid',
    imageAlt: 'The frame at mid height with the core running ahead of the slabs',
    metric: 'Core ahead of the slabs',
    gap: '6 months',
    aside: {
      left: {
        body: 'The stair and lift core climbs two levels ahead of the slabs. It gives the crane something to tie to and the crews a safe route up.',
        points: ['Core two levels ahead', 'Climbing formwork', 'Nine-day slab cycle'],
      },
      right: {
        title: 'Curing',
        body: 'Forms stay up longer through the monsoon months. It is slower, it is not negotiable, and it is invisible in the finished building.',
        stat: { value: '9', label: 'day slab cycle' },
      },
    },
  },
  {
    at: 0.63,
    name: 'Topped out',
    note: 'Frame complete to roof level, balconies formed.',
    date: 'Jul 2025',
    status: 'complete',
    image: 'roof',
    imageAlt: 'The frame complete to roof level with balconies formed',
    metric: 'Roof slab cast, 3 days early',
    gap: '5 months',
    aside: {
      left: {
        body: 'The roof slab went in on a Tuesday, three days ahead of a programme set two years earlier. The buffer was fourteen days and eleven had been spent.',
        points: ['Roof slab cast', 'Scaffold at full height', 'Three days ahead'],
      },
      right: {
        title: 'What is left',
        body: 'From here the building stops growing and starts being finished. Nothing after this point changes the shape of it.',
        stat: { value: '3', label: 'days ahead of programme' },
      },
    },
  },
  {
    at: 0.72,
    name: 'Envelope',
    note: 'Cladding, glazing and the balcony planting installed.',
    date: 'Jan 2026',
    status: 'complete',
    image: 'clad',
    imageAlt: 'Cladding and glazing installed with balcony planting going in',
    metric: '1,120 m² of cladding',
    gap: '6 months',
    aside: {
      left: {
        body: 'Cladding hung floor by floor from the top down, glazing behind it, then the balcony planting once the crane came off the roof.',
        points: ['Cladding hung top down', 'Glazing behind it', 'Planting once the crane came off'],
      },
      right: {
        title: 'Watertight',
        body: 'The day the building first kept the rain out is the day the interior programme could start. Everything after it depended on that date.',
        stat: { value: '1,120', label: 'm² of cladding' },
      },
    },
  },
  {
    at: 0.85,
    name: 'Complete',
    note: 'Landscaping in, snagging closed, keys released.',
    date: 'Sep 2026',
    status: 'scheduled',
    image: 'done',
    imageAlt: 'The completed tower with balcony planting and landscaping',
    metric: 'Snagging closed',
    gap: '8 months',
    aside: {
      left: {
        body: 'Snagging runs floor by floor with the foreman who built each one. Keys are released only once the floor above has passed as well.',
        points: ['Snagging floor by floor', 'Keys once the floor above passes', 'Then twenty-four months'],
      },
      right: {
        title: 'Then two more years',
        body: 'The defects window is staffed by the same team. Whoever built your floor is who comes back to it.',
        stat: { value: '24', label: 'month defects window' },
      },
    },
  },
];

export const PROJECT = {
  developer: 'Temp RealEstate',
  name: 'Block A',
  plot: 'Plot 7',
  district: 'Perungudi, Chennai',
  /** Used on `/details`. The home page is the film and carries no prose. */
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

/* ---------------------------------------------------------------- gallery */

/**
 * The accordion gallery in the "About the project" split.
 *
 * The four files in `public/gallery/` are generated placeholders. Overwrite
 * them in place with your own square shots, keeping the same names, and
 * nothing here needs to change — only `label` and `alt` are worth editing.
 *
 * Square sources are what this is set up for: each panel crops its image to
 * fill, so a 1:1 photo loses its left and right edges on the collapsed panels
 * and keeps its centre. Anything important belongs in the middle of the frame.
 */
export interface GalleryShot {
  /** Path under `public/`, served verbatim. */
  image: string;
  /** Caption, revealed on the expanded panel only. */
  label: string;
  /** Read out in place of the caption, which is hidden from assistive tech. */
  alt: string;
}

export const GALLERY: GalleryShot[] = [
  {
    image: '/gallery/shot-1.webp',
    label: 'Elevation',
    alt: 'The finished street elevation of Block A',
  },
  {
    image: '/gallery/shot-2.webp',
    label: 'Balconies',
    alt: 'Balconies on the east face, seen from the approach',
  },
  {
    image: '/gallery/shot-3.webp',
    label: 'Entrance',
    alt: 'The entrance canopy and lobby doors',
  },
  {
    image: '/gallery/shot-4.webp',
    label: 'Terrace',
    alt: 'The shared terrace on the top level',
  },
];
