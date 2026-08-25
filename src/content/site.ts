/**
 * Company-level copy: everything that is not specific to Block A.
 *
 * All of it is placeholder for a fictional developer. Change it here — no
 * component hard-codes any of these strings.
 */

export const COMPANY = {
  name: 'Temp RealEstate',
  /** Used in the header lockup next to the mark. */
  shortName: 'Temp',
  tagline: 'We build in public.',
  founded: 2011,
  registration: 'CIN U45200TN2011PTC081194',

  address: {
    line1: '4th Floor, Meridian Works',
    line2: '118 Rajiv Gandhi Salai (OMR)',
    locality: 'Perungudi, Chennai 600096',
    region: 'Tamil Nadu, India',
  },

  email: 'hello@temprealestate.example',
  salesEmail: 'sales@temprealestate.example',
  phone: '+91 44 4820 1900',
  /** Machine-readable form for the tel: link. */
  phoneHref: '+914448201900',
  /**
   * Digits only, country code first — the format wa.me expects, and a separate
   * number because the office line above is a landline. Placeholder.
   */
  whatsapp: '919840012345',
  whatsappMessage: 'Hi — I saw Block A on your site and would like to know more.',

  hours: [
    { days: 'Monday – Friday', time: '09:30 – 18:30' },
    { days: 'Saturday', time: '10:00 – 16:00 (site visits)' },
    { days: 'Sunday', time: 'Closed' },
  ],
} as const;

export interface NavItem {
  label: string;
  to: string;
}

export const NAV: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Details', to: '/details' },
  { label: 'About us', to: '/about' },
  { label: 'Journal', to: '/blog' },
  { label: 'Contact us', to: '/contact' },
];

/* ------------------------------------------------------------------ about */

export const ABOUT = {
  heading: 'Fourteen years of finishing what we started',
  lede: 'Temp RealEstate builds mid-rise residential in Chennai. We film every project from the day the hoarding goes up, and we publish the footage whether the programme held or not.',

  story: [
    'We started in 2011 with a four-unit walk-up in Thiruvanmiyur and a rule we have not broken since: no drawing goes to a buyer that has not been priced by the people who will actually build it. It made us slower than our competitors for about three years. It has made us faster ever since.',
    'Everything we put up is reinforced concrete, cast in situ, by a site team that has been with us an average of nine years. We do not subcontract the frame. It is the one part of a building nobody can inspect after handover, so it is the one part we refuse to hand to a stranger.',
    'The films came later, in 2019, and by accident — a site engineer had been flying a drone over Block C every Friday for his own records. We put four hundred of those stills end to end and realised we had something no brochure could do: proof, in order, at the speed the viewer wants it.',
  ],

  /** Real numbers a buyer would actually ask for. */
  figures: [
    { value: '14', label: 'Years building', note: 'Since 2011' },
    { value: '19', label: 'Projects delivered', note: 'All handed over' },
    { value: '412', label: 'Residences', note: 'Across Chennai' },
    { value: '0', label: 'Projects abandoned', note: 'The number that matters' },
  ],

  values: [
    {
      icon: 'log',
      title: 'The programme is public',
      body: 'Every project page carries its build log, including the stages that ran late. A developer who only publishes the good months is telling you which months to worry about.',
    },
    {
      icon: 'column',
      title: 'We own the frame',
      body: 'Structure is never subcontracted. Our own site team casts every slab and column, and the same engineer signs off from excavation to topping out.',
    },
    {
      icon: 'costing',
      title: 'Priced before it is drawn',
      body: 'No specification reaches a buyer until the quantity surveyor has costed it. It is why our variation notices are rare and why our handover dates hold.',
    },
    {
      icon: 'shield',
      title: 'Handover is not the end',
      body: 'A twenty-four month defects window, staffed by the people who built the place. Snags come back to the team that made them.',
    },
  ],

  milestones: [
    { year: '2011', event: 'Founded. First project, a four-unit walk-up in Thiruvanmiyur.' },
    { year: '2014', event: 'In-house structural team formed. Frame work brought back from subcontract.' },
    { year: '2017', event: 'First mid-rise, Block C in Sholinganallur. Nine floors, 36 residences.' },
    { year: '2019', event: 'Started filming every site weekly. The build logs go public.' },
    { year: '2023', event: 'Four hundredth residence handed over.' },
    { year: '2026', event: 'Block A, Plot 7 tops out. Handover programmed for September.' },
  ],

  team: [
    {
      name: 'Vasanth Ramanathan',
      role: 'Managing Director',
      initials: 'VR',
      focus: 'Structures',
      since: '2011',
      note: 'Civil engineer. Signs off every structural drawing before it leaves the office.',
    },
    {
      name: 'Meera Krishnaswamy',
      role: 'Head of Design',
      initials: 'MK',
      focus: 'Architecture',
      since: '2013',
      note: 'Architect. Responsible for the plan types and for the fight to keep ceilings at three metres.',
    },
    {
      name: 'Arun Pillai',
      role: 'Site Director',
      initials: 'AP',
      focus: 'Site',
      since: '2012',
      note: 'Runs the frame crews. Nine of his eleven foremen have been here a decade.',
    },
    {
      name: 'Fathima Noor',
      role: 'Head of Sales',
      initials: 'FN',
      focus: 'Sales',
      since: '2018',
      note: 'Will tell you which units she would not buy. It is the reason people trust her about the rest.',
    },
  ],
} as const;

/* ------------------------------------------------------------------- blog */

export interface Post {
  slug: string;
  title: string;
  /** Shown on the index card and used as the meta description. */
  excerpt: string;
  category: string;
  /** ISO date, for <time datetime>. */
  date: string;
  /** Human form, pre-written so no locale surprises. */
  dateLabel: string;
  readingTime: string;
  author: string;
  /**
   * Base name of a still in `public/stills/`. The component builds the 600w and
   * 1200w URLs from it, so both files must exist.
   */
  image: string;
  imageAlt: string;
  /** Paragraphs. A string starting with '## ' becomes a subheading. */
  body: string[];
}

export const POSTS: Post[] = [
  {
    slug: 'why-we-film-every-site',
    title: 'Why we film every site, including the bad months',
    excerpt:
      'A build log that only shows the good weeks tells a buyer exactly which weeks to worry about. Here is what publishing the whole programme has cost us, and what it has bought.',
    category: 'How we work',
    date: '2026-07-28',
    dateLabel: '28 July 2026',
    readingTime: '6 min',
    author: 'Vasanth Ramanathan',
    image: 'site',
    imageAlt:
      'Aerial view of the cleared and levelled plot before work began',
    body: [
      'The first time we published a delay, we lost two reservations inside a week. The monsoon had taken eleven working days off the Block C frame programme, we said so on the project page, and two buyers read it as a warning sign rather than as what it was: weather, reported honestly.',
      'We published the next delay anyway. And the one after that.',
      '## What the footage actually proves',
      'A render proves nothing. Anyone can commission one, and the buyer knows it. A weekly aerial of the same plot, in sequence, dated, is a different kind of claim — it is the only thing a developer can show that is expensive to fake and cheap to verify. Walk past the site and check.',
      'What surprised us is which part buyers scrub back to. It is almost never the finished interiors. It is the frame going up — floor four appearing between one Friday and the next. That is the part that reads as real, because it is the part that looks like work.',
      '## The cost',
      'Filming weekly costs us about ₹40,000 a month per site, most of it in the engineer time to fly and catalogue rather than in equipment. Publishing the delays costs more than that in the short run. We have lost reservations we would have kept by staying quiet.',
      'What it has bought is a sales process where nobody asks us whether the building will be finished. That question, which used to take up half of every first meeting, has simply gone away. It turns out that the fastest way to stop being asked is to have already answered.',
      '## The rule we settled on',
      'The build log goes up whether or not the month went well, within seven days of the month ending, and we do not edit an entry after it is published. If a stage slips we add a line saying so. The old line stays.',
      'It is not a marketing decision at this point. It is just how the company keeps itself honest — a programme you have promised to publish is a programme you plan more carefully.',
    ],
  },
  {
    slug: 'reading-a-build-log',
    title: 'How to read a developer’s build log',
    excerpt:
      'Six things worth checking before you reserve anything, most of which a developer will answer honestly if you ask in the right order.',
    category: 'Buying',
    date: '2026-06-15',
    dateLabel: '15 June 2026',
    readingTime: '8 min',
    author: 'Fathima Noor',
    image: 'structure',
    imageAlt:
      'Reinforced concrete frame at full height, wrapped in scaffold',
    body: [
      'Most buyers ask about the finish. Almost nobody asks about the frame, and the frame is the only part of a building that cannot be fixed later. Here is the order I would ask questions in if I were buying from someone else.',
      '## 1. Who cast the structure',
      'Ask whether the frame was subcontracted, and to whom. There is nothing wrong with a subcontracted frame — plenty of good buildings have one — but you want to know the name, and you want to know whether that firm is still trading. If the answer is vague, that is the answer.',
      '## 2. What the gap between stages was',
      'Look at the dates on the build log, not the photographs. A frame that went from foundation to topping out in five months on a six-storey building either had a very good crew or skipped a curing schedule. Ask which.',
      '## 3. Whether the log was written forward or backward',
      'A log assembled at handover from whatever photographs survived reads differently from one published monthly. Check whether the entries reference things that had not happened yet — a genuine contemporaneous log never does.',
      '## 4. What happened in the monsoon',
      'Every Chennai project loses days between October and December. A build log with no weather delay in it is not a project that avoided weather; it is a log that is not telling you about it.',
      '## 5. The defects window, and who staffs it',
      'Twelve months is common. Twenty-four is better. But the length matters less than who picks up the phone — an in-house team that built the place, or a facilities contractor appointed after handover who has never seen the drawings.',
      '## 6. Ask to see a project they finished five years ago',
      'Not the newest one. The one that has had time to go wrong. Ask to speak to somebody living in it. A developer who cannot produce that after a decade of building is telling you something.',
    ],
  },
  {
    slug: 'three-metre-ceilings',
    title: 'The argument for three-metre ceilings',
    excerpt:
      'It costs about 4% more per floor and it is the first thing value engineering comes for. We have lost this fight twice and won it seven times.',
    category: 'Design',
    date: '2026-05-02',
    dateLabel: '2 May 2026',
    readingTime: '5 min',
    author: 'Meera Krishnaswamy',
    image: 'interior',
    imageAlt:
      'Double-height entrance hall lit at dusk',
    body: [
      'The standard around here is 2.7 metres floor to ceiling, sometimes 2.6 once the false ceiling and the ducting have taken their cut. We build to 3.0 metres before services, which lands at about 2.85 in the living spaces.',
      'It is not a luxury decision. It is a climate one.',
      '## What the extra 300mm does',
      'Warm air stratifies. In a room with a 2.6 metre ceiling in May, the air you are actually breathing at head height is meaningfully warmer than in the same room at 3.0 metres, and the air conditioning works harder to fix it. The taller room is cheaper to run despite having more volume to cool, because the cooled layer sits where the people are.',
      'The second thing it does is windows. A taller room lets the window head go higher, and daylight penetration into a room is governed far more by how high the window is than by how wide. A 300mm taller head throws usable light roughly a metre further into the plan.',
      '## What it costs',
      'About 4% on the frame per floor — more concrete in the columns, more in the shear walls, marginally more steel. On a six-storey building it is close to the cost of one residence. Every value engineering exercise finds it in the first hour.',
      '## Where we lost',
      'Twice. Once on a project where the plot ratio meant the extra height would have cost us a floor, which is not a trade worth making — a sixth floor of 2.7 metre residences houses more people than five floors of 3.0. And once on cost, in 2015, when we were not yet in a position to argue.',
      'The rest of the time the argument that wins is not comfort or daylight. It is that nobody has ever walked into a room and thought it felt too tall.',
    ],
  },
  {
    slug: 'monsoon-programme',
    title: 'Planning a frame programme around the monsoon',
    excerpt:
      'North-east monsoon takes eight to fourteen working days off a Chennai site every year. Pretending otherwise is how handover dates slip.',
    category: 'On site',
    date: '2026-03-19',
    dateLabel: '19 March 2026',
    readingTime: '7 min',
    author: 'Arun Pillai',
    image: 'excavation',
    imageAlt:
      'Excavators working the basement dig with the foundation slab poured',
    body: [
      'Between mid-October and late December we lose days. Not to rain falling — you can pour in light rain with the right precautions — but to what rain does to everything around the pour: access, formwork, curing conditions, and the safety of working at height in wind.',
      'The mistake is to build a programme that assumes an average monsoon and then treat a normal one as an exception.',
      '## What we actually plan for',
      'Fourteen lost working days between 15 October and 31 December, built into the programme from day one. If we lose eight, we are ahead. In fourteen years we have lost more than fourteen exactly twice, and both were years the whole city stopped.',
      '## Sequencing around it',
      'Where we have a choice, the frame goes up between February and September and the monsoon window gets the work that can happen under a slab: blockwork on completed floors, first-fix conduit, lift shaft, basement tanking. There is almost always something dry to do on a building with four floors cast.',
      'What you do not want is to arrive at October with nothing but exposed structural work left. That is the situation where fourteen days becomes forty.',
      '## Curing is the part people underestimate',
      'A slab poured in December in high humidity cures differently from one poured in May, and the strength gain curve is not the same. Our schedule holds forms longer in the monsoon months. It is slower and it is not negotiable, and it is the single most common place I have seen other sites take a shortcut nobody will ever be able to see.',
    ],
  },
  {
    slug: 'what-carpet-area-means',
    title: 'Carpet area, built-up, super built-up: which number to hold us to',
    excerpt:
      'Three numbers describe the same residence and only one of them is the floor you can stand on. Here is how to read all three.',
    category: 'Buying',
    date: '2026-01-24',
    dateLabel: '24 January 2026',
    readingTime: '6 min',
    author: 'Fathima Noor',
    image: 'facade',
    imageAlt:
      'Completed stone facade and glazed entrance from the street',
    body: [
      'Every brochure quotes an area and most quote the largest defensible one. None of this is illegal and most of it is not even misleading, as long as you know which number you are reading.',
      '## Carpet area',
      'The floor inside your walls. What a carpet would cover, minus the walls themselves. This is the number in your sale agreement under RERA and it is the only one that describes space you can occupy.',
      '## Built-up area',
      'Carpet plus the walls, plus your balcony. Typically 10–15% above carpet. Reasonable as a construction figure, less useful as a description of what you get.',
      '## Super built-up area',
      'Built-up plus your share of everything held in common: lobbies, stairs, lift cores, the generator room. Typically 20–35% above carpet depending on how generous the common areas are — which means a building with a beautiful double-height lobby will show a worse carpet-to-super ratio than a mean one. The ratio is not a quality signal in either direction.',
      '## What to do with the three numbers',
      'Ask for carpet area in square metres, ask what the loading factor is, and then compare carpet against carpet between developers. A residence quoted at 186 m² super built-up with a 32% loading is 141 m² of floor; one quoted at 172 m² with an 18% loading is 146 m². The smaller-sounding one is bigger.',
      'On our project pages the figure shown is carpet. It makes our residences look smaller than they are quoted elsewhere. We would rather answer that question than the other one.',
    ],
  },
  {
    slug: 'block-a-topping-out',
    title: 'Block A topped out on schedule. Here is what it took.',
    excerpt:
      'Seventeen months from first excavation to roof level, three days ahead of programme, across two monsoons and a cement shortage.',
    category: 'Projects',
    date: '2025-07-30',
    dateLabel: '30 July 2025',
    readingTime: '5 min',
    author: 'Arun Pillai',
    image: 'topped',
    imageAlt:
      'The frame complete to roof level with scaffold at full height',
    body: [
      'The last slab on Block A was cast on a Tuesday morning in July, seventeen months after the excavators arrived and three days ahead of a programme we set in early 2024. That is closer than it sounds — the buffer was fourteen days and we spent eleven of them.',
      '## Where the eleven days went',
      'Seven to the 2024 north-east monsoon, which was mild. Two to a cement supply gap in March 2025 that hit every site in the district. Two to a reinforcement detail on the level-four transfer beam that our engineer wanted redrawn, which cost us a week of arguing and saved a problem nobody would have found until much later.',
      '## What went right',
      'The same frame crew from foundation to roof. No handover between teams means no week lost to a new foreman learning the drawings, and it means the person who cast level one is the person who cast level six.',
      'Formwork was the other thing. We bought rather than hired the wall forms for this project, which is more expensive up front and meant we were never waiting on a hire return date to strike and re-set. On a six-storey frame that decision alone is worth about three weeks.',
      '## What happens next',
      'Envelope through to January: stone cladding, glazing, the entrance canopy. Then fit-out. Handover is programmed for September 2026 and the buffer on that is six weeks, most of which we expect to spend on the lift commissioning.',
      'The full sequence, February 2024 to now, is on the project page. Scroll it.',
    ],
  },
];

/** Newest first, without mutating the export. */
export const POSTS_BY_DATE = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));

export function findPost(slug: string): Post | undefined {
  return POSTS.find((post) => post.slug === slug);
}

/* ----------------------------------------------------------------- footer */

export const FOOTER_LINKS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Company',
    items: [
      { label: 'About us', to: '/about' },
      { label: 'Journal', to: '/blog' },
      { label: 'Contact us', to: '/contact' },
    ],
  },
  {
    heading: 'Current project',
    items: [
      { label: 'Block A — Plot 7', to: '/details' },
      { label: 'Build log', to: '/details#build-log' },
      { label: 'Residences', to: '/details#residences' },
    ],
  },
];

/* ------------------------------------------------------------------ stats */

export interface Stat {
  value: string;
  label: string;
  note: string;
}

export const STATS: Stat[] = [
  { value: '4.9', label: 'Client rating', note: 'Across 132 reviews' },
  { value: '412', label: 'Residences delivered', note: 'Since 2011' },
  { value: '19', label: 'Projects completed', note: 'All handed over' },
  { value: '98%', label: 'Handed over on time', note: 'Last five years' },
];

/* --------------------------------------------------------------- services */

export interface Service {
  /** Selects the line icon in ServiceIcon.tsx. */
  icon: 'blocks' | 'portal' | 'room' | 'retrofit';
  title: string;
  body: string;
  /** What the service actually covers — the detail a paragraph glosses over. */
  covers: string[];
}

export const SERVICES: Service[] = [
  {
    icon: 'blocks',
    title: 'Residential development',
    body: 'We buy the land, design the building and sell the residences. One party is accountable from the first survey to the day you get the keys.',
    covers: ['Land acquisition', 'Design', 'Approvals', 'Sales'],
  },
  {
    icon: 'portal',
    title: 'Structural engineering',
    body: 'Frame design and construction in house. Our own crews cast every slab and column, and the same engineer signs off from excavation to topping out.',
    covers: ['RCC frame', 'Formwork', 'Reinforcement', 'Sign-off'],
  },
  {
    icon: 'room',
    title: 'Interior fit-out',
    body: 'Kitchens, joinery, flooring and finishes specified at drawing stage and costed before they reach you, so the handover matches the brochure.',
    covers: ['Kitchens', 'Joinery', 'Flooring', 'Finishes'],
  },
  {
    icon: 'retrofit',
    title: 'Renovation and retrofit',
    body: 'Structural repair, waterproofing and modernisation of existing buildings — including several we did not build, which is a harder job.',
    covers: ['Structural repair', 'Waterproofing', 'Services', 'Modernisation'],
  },
];

/* ----------------------------------------------------------- why choose us */

export interface Benefit {
  title: string;
  body: string;
}

export const BENEFITS: Benefit[] = [
  {
    title: 'We own the frame',
    body: 'Structure is never subcontracted. It is the one part nobody can inspect after handover.',
  },
  {
    title: 'Priced before it is drawn',
    body: 'No specification reaches a buyer until the quantity surveyor has costed it. Variations are rare because of it.',
  },
  {
    title: 'The programme is public',
    body: 'Every project publishes its build log monthly, including the stages that ran late.',
  },
  {
    title: 'Twenty-four month defects window',
    body: 'Staffed by the people who built the place, not a contractor appointed afterwards.',
  },
];

/* ----------------------------------------------------------- testimonials */

export interface Testimonial {
  quote: string;
  name: string;
  /** Which residence they own, and where. */
  unit: string;
  project: string;
  /** Monogram shown in place of a stock photograph. */
  initials: string;
  /** When the review was given — after the defects window, not at handover. */
  date: string;
  rating: number;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'They published a delay before I noticed it. That told me more about how they work than any brochure could, and it is why I bought the second unit.',
    name: 'Ramya Subramanian',
    unit: 'Type B',
    project: 'Block C, Sholinganallur',
    initials: 'RS',
    date: 'March 2026',
    rating: 5,
  },
  {
    quote:
      'The handover date they gave me in 2023 is the date I got the keys. I had been warned by everyone that this does not happen here.',
    name: 'Anand Varghese',
    unit: 'Type C',
    project: 'Horizon Court, Thoraipakkam',
    initials: 'AV',
    date: 'January 2026',
    rating: 5,
  },
  {
    quote:
      'Two snags in the first year, both fixed by the foreman who built the flat. He still had the drawings on his phone.',
    name: 'Priya Nandakumar',
    unit: 'Type A',
    project: 'Block C, Sholinganallur',
    initials: 'PN',
    date: 'November 2025',
    rating: 5,
  },
];

/* --------------------------------------------------------------- partners */

/** Consultants and suppliers, shown as wordmarks rather than logo files. */
export const PARTNERS: string[] = [
  'Meridian Structures',
  'Kavery Cement',
  'Southbank Surveyors',
  'Lakshmi Glazing',
  'Arcus Lifts',
  'Verde Landscapes',
];

/* ------------------------------------------------------------- contact --- */

/** Shown as chips under the Contact heading — what a sender can expect. */
export const PROMISES: string[] = [
  'Replied to within one working day',
  'Site visits, Saturday mornings',
  'You will speak to us, not an agency',
];

export interface Faq {
  question: string;
  answer: string;
}

/**
 * The questions the sales team is actually asked, answered where they can be
 * read without sending anything.
 */
export const FAQS: Faq[] = [
  {
    question: 'Can I visit the site before handover?',
    answer:
      'Yes, on Saturday mornings, booked ahead. Block A is a working site until handover, so visits are escorted and boots and a hard hat are provided at the gate. Children under twelve cannot come onto the slab.',
  },
  {
    question: 'Is the area you quote carpet or super built-up?',
    answer:
      'Carpet, in square metres, which is the figure in the sale agreement under RERA. It makes our residences look smaller than the same units quoted elsewhere on super built-up. Ask any developer for their loading factor and compare carpet against carpet.',
  },
  {
    question: 'What is included in the guide price?',
    answer:
      'The residence, its balcony or terrace, one covered parking space, and the fit-out specification on the plan sheet. Registration, stamp duty, GST and the maintenance deposit are additional and itemised before you reserve.',
  },
  {
    question: 'What happens if the handover date slips?',
    answer:
      'It goes on the build log the month it happens, with the reason. The programme carries a six-week buffer on handover; beyond that, the delay clauses in the sale agreement apply. We have published every delay since 2019.',
  },
  {
    question: 'Who fixes problems after I move in?',
    answer:
      'The people who built it. The defects window runs twenty-four months and is staffed in house, not handed to a facilities contractor. In practice the foreman who ran your floor is the one who comes back.',
  },
  {
    question: 'Do you sell through agents?',
    answer:
      'No. Every enquiry reaches our own sales team, and the price you are quoted is the price on the rate card. There is no commission built in for anyone to negotiate away.',
  },
];
