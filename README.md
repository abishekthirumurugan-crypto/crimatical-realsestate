# Temp RealEstate — scroll-scrubbed property site

A four-page development site whose hero is ten seconds of construction footage,
scrubbed frame by frame against scroll depth. React 19 + TypeScript + Vite,
**zero runtime dependencies beyond React** — no GSAP, no Framer Motion, no
Lenis, and no router library.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit && vite build
npm run typecheck
npm run encode     # re-encode realestate.mp4 -> public/video/
```

> **This is a template build.** The company, the project, the people, the
> addresses and every figure are invented. See [Where the content lives](#where-the-content-lives).

## Pages

| Route | | |
|-------|---|---|
| `/` | Home | The film, then stats, about, specification, build log, residences, services, why-us, testimonials, partners, journal, CTA |
| `/about` | About us | Story, key figures, four operating rules, milestone timeline, team |
| `/blog` | Journal | Category filter and a card grid — image, date, title, description — six entries |
| `/blog/:slug` | Entry | Hero image, long-form post, newer/older navigation |
| `/contact` | Contact us | Enquiry form, office address, direct lines, opening hours |
| anything else | 404 | |

### Routing

[src/lib/router.tsx](src/lib/router.tsx) is a ~90-line History API router:
`useRoute()`, `navigate()`, and a `<Link>` that keeps a real `href` so
middle-click and "open in new tab" behave like links. It handles in-page
anchors (`/#build-log`), resets scroll on every route change, and turns off the
browser's own scroll restoration — which would otherwise try to restore an
offset from a route that was five viewports of scroll-driven film.

**Deploying:** these are real paths, not hashes, so the host must serve
`index.html` for unknown paths. Vite's dev server and `vite preview` already do.
On Netlify add `/* /index.html 200` to `_redirects`; on nginx,
`try_files $uri /index.html;`.

## Where the content lives

Nothing is hard-coded in JSX. Two files:

- **[src/content/site.ts](src/content/site.ts)** — company name, address, phone,
  hours, navigation, About page copy, the team, all six journal entries, footer
  link groups.
- **[src/content/project.ts](src/content/project.ts)** — Block A: the six build
  phases (and where each one sits in the film), specification table, residence
  types.

The logo lives at `public/image/logo.png`, with 96px and 192px derivatives
generated beside it — [Logo.tsx](src/components/Logo.tsx) serves them via
`srcset` so a 34px header mark does not download the 147 KB original. It appears
in the header lockup, the film loader, the footer, and as the favicon.

## How the scrubbing works

Four things, in order of how much they matter:

**1. The encode.** The source master had two keyframes in 240 frames, so a
backward seek could cost 229 frame decodes. Re-encoded at GOP 10 that worst case
is 9. No amount of JavaScript compensates for a long GOP — see
[FFMPEG.md](FFMPEG.md).

**2. One rAF loop owns everything.** Scroll listeners are passive and do no DOM
work at all; they only wake the loop. The loop then does one
`getBoundingClientRect` read, computes, and writes — never read-write-read, so
fast scrolling cannot thrash layout. A burst of 200 scroll events still costs
exactly one tick.

**3. Seeks are gated on the decoder.** Assigning `currentTime` faster than the
decoder can present frames queues seeks that are already stale when they resolve,
and the picture drifts behind the scroll. `ScrollVideo` keeps exactly one seek in
flight, always to the newest target, released by `requestVideoFrameCallback` or
`seeked` (whichever lands first) with a 250 ms watchdog so a quiet decoder can
never deadlock it.

**4. Frame-rate-independent smoothing.** The scrub target is eased with
`1 - (1 - smoothing)^(dt / 16.67)` rather than the usual `eased += (target -
eased) * smoothing`. The naive version converges twice as fast on a 120 Hz
display as on a 60 Hz one; this one produces an identical curve on any refresh
rate and survives dropped frames unchanged.

Beyond that: seek targets snap to frame centres when you pass `fps`, so
sub-frame seeks that would change nothing on screen are skipped; the loop parks
itself when the ease settles, so an idle page costs zero frames; and an
`IntersectionObserver` plus `visibilitychange` stop it entirely when the stage is
off-screen or the tab is hidden.

### Loading

`preloadStrategy="blob"` (the default) downloads the file with `fetch()` and
plays it from an object URL. Two reasons: you get a **real** progress
percentage from `Content-Length` instead of a spinner, and once it is in memory
backward scrubbing never re-hits the network.

`index.html` warms that exact request with `rel="preload" as="fetch"` —
`as="fetch"`, not `as="video"`, because a preload only helps when its destination
matches the request that follows. It is **injected by an inline script rather
than written as static markup**, because one `index.html` serves all four routes
and a static hint would pull 3 MB on About, Journal and Contact, which never
mount the film.

Nothing starts scrubbing until the element reports a finite `duration`
(`loadedmetadata` / `canplaythrough`, plus a `readyState` check for the case
where the events already fired). Until then the loader is on screen.

## `<ScrollVideo>` props

| Prop | Type | Default | |
|------|------|---------|---|
| `sources` | `ScrollVideoSource[]` | — | Candidate encodes, best-first. The first whose `media` matches **and** whose codec the browser reports it can play wins. Done in JS because browsers ignore `media` on `<source>` inside `<video>`. |
| `scrollLengthVh` | `number` | `3` | Scroll distance as a multiple of viewport height. |
| `smoothing` | `number` | `0.12` | Fraction of remaining distance closed per 16.67 ms. Lower is heavier; `1` disables smoothing. |
| `fps` | `number` | — | Source frame rate. Snaps seeks to frame centres. |
| `poster` | `string` | — | Shown before the video paints. |
| `preloadStrategy` | `'blob' \| 'native'` | `'blob'` | `native` defers to the browser's own `preload="auto"`. |
| `objectFit` | `CSSProperties['objectFit']` | `'cover'` | |
| `ambientLetterbox` | `boolean` | `false` | With `contain`, tints the bars from the frame's own edges via a 64×36 canvas. |
| `respectReducedMotion` | `boolean` | `true` | Under `prefers-reduced-motion: reduce`, drops the scrub, collapses the spacer to one screen and parks on a mid-film frame. |
| `children` | `ReactNode \| (p: number) => ReactNode` | — | Rendered over the video. **The render-prop form re-renders on scrub** — prefer `onProgress` for anything hot. |
| `onProgress` | `(p: number) => void` | — | Every tick, eased. Ref callback — costs no render. |
| `onLoadProgress` / `onStatus` | | — | Download progress; `onStatus` is the richer diagnostics snapshot. |
| `onReady` | `(duration: number) => void` | — | Fires once, when scrubbing starts. |
| `containerRef` / `videoRef` | `RefObject` | — | Escape hatches to the wrapper and the media element. |
| `renderLoader` | `(p: number) => ReactNode` | — | `p` is `NaN` when the server sends no `Content-Length`. |
| `onError` | `(e: Error) => void` | — | |

### Using it elsewhere

[ScrollVideo.tsx](src/components/ScrollVideo.tsx) has no imports beyond React and
no project-specific styling — copy the single file.

```tsx
<ScrollVideo
  sources={[{ src: '/video/out.mp4', type: 'video/mp4; codecs="avc1.640029"' }]}
  fps={25}
  scrollLengthVh={4}
  onProgress={(p) => overlayRef.current?.update(p)}
>
  <MyOverlay apiRef={overlayRef} />
</ScrollVideo>
```

The overlay pattern is worth copying too: `onProgress` fires up to 120×/second,
so [FilmOverlay](src/components/FilmOverlay.tsx) takes it imperatively and writes
to three things only — a `transform` (compositor-only), a `textContent` gated on
the integer percent changing, and one attribute written once. React state is
touched only when the construction stage changes, five times across the film.

## Design

The visual system follows the [Struxel](https://struxel-template.webflow.io/)
reference, whose tokens were read off its stylesheet rather than eyeballed:

| | |
|---|---|
| Page | `#f6f6f6`, with white `#ffffff` cards |
| Ink / body | `#0a0a0a` headings, `#615f5f` body |
| Border | `#e5e7eb` hairline |
| Type | Poppins throughout, 300–600 |
| Headings | **Title Case, weight 500, no tracking, no uppercase** |
| Scale | 48 / 34 / 28 / 24 / 20 px headings; 16 px body at 160% |
| Accent | `#e03200` — their `--_color---primary` |
| Shape | 12px card corners, 30px pill buttons |
| Container | 1336px |

Roles are separated by weight and colour rather than by typeface — one family
does headings, body and figures.

### The accent

`#e03200` is the reference's `--_color---primary`. Reading its stylesheet, it is
applied to **fills** (primary button, form submit, success message, hero card),
**active and hover states** (nav links, footer links, dropdowns) and **hover
borders** — never to headings or large surfaces. This project uses it the same
way.

It ships as three values, because one hex cannot cover the grounds this page
has. Measured:

| | on `#f6f6f6` | on white | on navy |
|---|---|---|---|
| `--primary` `#e03200` | 4.20 ✗ | 4.54 ✓ | 3.43 ✗ |
| `--primary-ink` `#c42c00` | 5.24 ✓ | 5.66 ✓ | — |
| `--primary-on-dark` `#ff6a3d` | — | — | 5.47 ✓ |

So `--primary` does fills and states on white, `--primary-ink` does small accent
**text** on light grounds, and `--primary-on-dark` does accents on the navy —
the film overlay, the footer and the featured entry. White on a `--primary` fill
is 4.54:1, which carries button text.

The navy from `logo.png` stays, but only as a dark **surface** (footer, CTA
panels, the film well) now that the accent carries every interactive state. The
gold is retired from the UI entirely and survives only inside the logo lockup,
where it belongs to the mark rather than to the interface.

Two things stay dark on purpose. The **film** is footage — a light scrim over
moving video is unreadable. And the **footer** is the one place the brand gets
to land full-bleed.

The signature is the **survey rule** along the bottom of the film: a levelling
staff laid on its side, graduated every 2 %, with major marks at the six
construction stages and a travelling head reading the current position. The same
instrument that set the floor levels in the footage, measuring how far through
the build you have scrolled.

### The film, and getting back to it

The film is five viewports of scrubbing, so Home is careful about when it puts
you through that.

**It retires itself.** The moment the film has been scrolled fully out of view
it is removed from the document, and a flag is written to `sessionStorage`.
That is what makes the "Watch the build" button meaningful: while the film was
left in the page, scrolling up simply walked back into it and the button was
decorative.

**Returning to Home in the same session** skips it entirely — the page opens on
the stats bar. The first section carries `data-first` and supplies its own
header clearance, since the film is what used to provide it.

**The button** appears only on an attempt to scroll *past* the top of the
content — you arrive at the top, push further, and the offer appears. Clicking
it remounts the film and jumps to its start.

That distinction matters: showing it on any upward scroll meant it followed the
reader all the way up from the footer, which is not where anyone is thinking
about the film. And because there is nothing left to scroll to at the top, no
scroll event fires there at all — so the gesture itself is read, from `wheel`,
a touch drag, or `ArrowUp` / `PageUp` / `Home` for keyboard readers. It is
withdrawn as soon as the reader heads back down.

`sessionStorage`, not `localStorage`: the film is the point of the page for a
genuine first-time visitor, so it should return for a new session — it just
should not repeat within one.

#### Removing 4,500px of layout without moving the page

Taking the film out from above the reader would throw the page upward by
exactly its height. The scroll is preserved by measuring around the change:

```
before = stats.getBoundingClientRect().top
flushSync(() => setShowFilm(false))
after  = stats.getBoundingClientRect().top
window.scrollBy(0, after - before)
```

Two details matter. `flushSync` is what makes both measurements straddle one
frame — without it React commits later and the page paints in the wrong place
before the correction lands. And the anchor is the **stat cards**, not the
section that holds them: collapsing also adds header clearance *inside* that
section, and measuring its border box would let that padding shove the cards
down ~76px at the moment of removal. Measuring what the reader is actually
looking at cancels it, verified to the pixel.

One accepted cost: unmounting the film revokes its object URL, so replaying
re-requests the video. In production that is an HTTP cache hit.

### Floating contact rail

[FloatingActions.tsx](src/components/FloatingActions.tsx) pins WhatsApp, call
and enquiry to the middle of the right edge — and hides them while the film is
on screen, since the film is the site's one full-bleed moment and three coloured
discs on top of it would undo that.

It finds the film by querying ScrollVideo's own `[data-scroll-video]` wrapper
rather than being told about it. That keeps the two components independent: the
film can mount, unmount (Home retires it after it is scrolled past) or move to
another page, and the rail still behaves. The cached node is only re-queried
when it goes stale, and the visibility test is `getBoundingClientRect().bottom
<= 0` — the film has to have *left the viewport*, not merely finished scrubbing,
since its last frame is still on screen at that point.

Each button is a pill collapsed to a circle; hover or focus expands it leftward
to reveal its label, clipped by `max-width` so opening one never reflows
anything outside the rail. Under 40rem it moves to the bottom-right corner as a
row of plain circles, clear of `env(safe-area-inset-bottom)`.

The WhatsApp number is a **separate placeholder field** in
[site.ts](src/content/site.ts) — the office number is a landline, and `wa.me`
wants digits only with the country code first.

### Journal cards

[PostCard.tsx](src/components/PostCard.tsx) is the single card used by both the
journal index and the teaser row on Home, so the two cannot drift apart. It
renders image → date → title → description, with the category as a badge over
the image.

Each entry names a still in `public/stills/` via its `image` field in
[site.ts](src/content/site.ts); the component builds the 600w and 1200w URLs
from that name, so both files have to exist. The detail page reuses the same
still as a hero.

One layout constraint worth knowing: `overflow: hidden` sits on
`.post-card__media`, never on `.post-card`. The hover lift is a box-shadow on an
`::after` child, and clipping the card would clip that shadow away with it.

### Elevation and edges

`src/styles/elevation.css` loads last and owns `box-shadow` for every card, so
components do not each invent their own.

**Borders.** The reference's `#e5e7eb` measures 1.24:1 against a white card and
1.15:1 against the page — on a near-white ground the card edge effectively
disappears. `--border` is `#d8dde4` (1.37 / 1.26) and `--border-strong` is
`#c9d0da`, both very slightly cool so the edge reads crisp rather than dirty.

**Shadows** follow three rules, all standard practice:

1. **Layered.** Offset and blur roughly double per layer. One shadow reads as a
   flat grey smear; three thin ones read as light falling past an object.
2. **Negative spread on later layers**, the way Tailwind's scale does it, so the
   shade stays tucked under the card instead of haloing around it.
3. **Tinted, not black.** `hsl(220deg 45% 20%)` — the navy's own hue. Neutral
   black over a warm near-white page goes muddy.

The ladder is `--shadow-xs` (controls, header) → `--shadow-sm` (cards at rest) →
`--shadow-md` (card hover) → `--shadow-lg` (dark panels).

**The hover lift animates opacity, not `box-shadow`.** Transitioning box-shadow
re-rasterises the shadow every frame, and this page can have twenty cards on
screen. The raised shadow lives on an `::after` whose opacity transitions
instead, which is a compositor-only property — and the two shadows cross-fade
rather than one morphing into the other, which looks better anyway. The card's
border firms to `--border-strong` at the same time, because a card that gains
only a shadow still reads as flat at its edge.

Sources: [Josh Comeau on designing shadows](https://www.joshwcomeau.com/css/designing-shadows/),
[Tailwind's box-shadow scale](https://tailwindcss.com/docs/box-shadow).

### Section artwork

`public/stills/` holds five frames cut from the film itself at 600px and 1200px,
served through `srcset`. The reference template is image-heavy and this project
has exactly one asset — so the artwork is the footage, which is also the only
honest picture of the building available.

## Known limits

- **The contact form does not submit anywhere.** `handleSubmit` calls
  `preventDefault` and flips to the success state so the confirmed path is
  designed; wire it to your handler and delete that branch.
- **Fonts load from Google Fonts.** Self-host them if you need the site to work
  offline or want to drop the third-party connection.
- The six phase positions in `PHASES[].at` are eyeballed against the film's
  beats. Adjust them if you re-cut the footage.
- There is no sitemap, robots.txt, or per-route server-rendered `<title>` — the
  title is set client-side on navigation, which is fine for users and crawlers
  that execute JS, but a static host will serve the same HTML `<title>` to
  anything that does not.
"# crimatical-realsestate" 
"# crimatical-realsestate" 
