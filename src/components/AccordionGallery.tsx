/*
 * React Bits — AccordionGallery (JavaScript + CSS variant), typed for this
 * codebase.
 *
 * The logic is the upstream component's, unchanged. Two things are adapted:
 *
 *  - It is TSX rather than JSX, because `npm run build` runs `tsc --noEmit`
 *    with `allowJs` off and a .jsx module would not resolve from a page.
 *  - The ref callbacks use block bodies. The upstream `ref={el => (refs[i] =
 *    el)}` returns the assigned element, and React 19 treats a returned value
 *    from a ref callback as a cleanup function.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { gsap } from 'gsap';

import './AccordionGallery.css';

export interface AccordionItem {
  image: string;
  label?: string;
  link?: string;
  alt?: string;
}

interface AccordionGalleryProps {
  items: AccordionItem[];
  /** Panel expanded on load, so the gallery never looks dead. */
  defaultIndex?: number;
  accentColor?: string;
  overlayColor?: string;
  textColor?: string;
  /** Height of the row in px (width of the column when vertical). */
  height?: number;
  gap?: number;
  radius?: number;
  /** Fraction of the row the expanded panel takes, 0.2–0.9. */
  expandRatio?: number;
  orientation?: 'horizontal' | 'vertical';
  duration?: number;
  ease?: string;
  /** Strength of the internal image drift as panels resize; 0 disables it. */
  parallax?: number;
  /** Degrees of 3D rotation on collapsed panels, easing to flat on the open one. */
  tilt?: number;
  /**
   * How far collapsed panels are darkened, 0–1. Upstream hard-codes 0.35; it
   * is a prop here so a gallery can show its photographs undimmed. The open
   * panel is never dimmed either way.
   */
  dim?: number;
  stagger?: number;
  trigger?: 'hover' | 'click';
  showLabels?: boolean;
  grayscale?: boolean;
  className?: string;
}

/**
 * Below this width the stylesheet stacks the panels into a column, and the
 * component has to know it: the layout maths grows panels along one axis, and
 * once stacked that axis is the container's height, not its width. Keep this
 * in step with the media query in AccordionGallery.css.
 */
const STACK_QUERY = '(max-width: 520px)';

/**
 * Floor on `expandRatio` while stacked. At the 0.5 the details page passes in,
 * an open panel is only three times the height of a closed one, which on a
 * phone reads as four strips rather than one photograph over three thumbnails.
 */
const STACKED_EXPAND_RATIO = 0.62;

export default function AccordionGallery({
  items,
  defaultIndex = 2,
  // Defaults follow the stylesheet, which reads the palette. Upstream's are a
  // white accent over a purple-black dim; neither exists in this palette, and a
  // default is what the next use of this component inherits.
  accentColor = 'var(--primary-on-dark)',
  overlayColor = 'var(--dark-deep)',
  textColor = '#ffffff',
  height = 460,
  gap = 10,
  radius = 16,
  expandRatio = 0.52,
  orientation = 'horizontal',
  duration = 0.6,
  ease = 'power3.out',
  parallax = 0.5,
  tilt = 8,
  dim = 0.35,
  stagger = 0.06,
  trigger = 'hover',
  showLabels = true,
  grayscale = true,
  className = '',
}: AccordionGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const mediaRefs = useRef<(HTMLElement | null)[]>([]);
  const barRefs = useRef<(HTMLElement | null)[]>([]);
  const textRefs = useRef<(HTMLElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const firstRunRef = useRef(true);
  const mediaSizeRef = useRef(320);

  const count = items.length;
  const [active, setActive] = useState(Math.min(Math.max(defaultIndex, 0), count - 1));
  // Read at first render, not in an effect, so the opening layout is already
  // the right one — measuring a row and then a column shows as a jump.
  const [stacked, setStacked] = useState(
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(STACK_QUERY).matches
      : false,
  );

  // Stacked and `orientation="vertical"` are one layout to everything below.
  const vertical = orientation === 'vertical' || stacked;
  const ratio = Math.min(
    Math.max(stacked ? Math.max(expandRatio, STACKED_EXPAND_RATIO) : expandRatio, 0.2),
    0.9,
  );

  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const applyLayout = useCallback(
    (animate: boolean) => {
      const panels = panelRefs.current;
      if (!panels.length) return;

      const grow = count > 1 ? (ratio * (count - 1)) / (1 - ratio) : 1;
      const mediaSize = mediaSizeRef.current;

      tlRef.current?.kill();
      const dur = animate && !prefersReduced ? duration : 0;
      const tl = gsap.timeline();

      panels.forEach((panel, i) => {
        if (!panel) return;
        const isActive = i === active;
        const media = mediaRefs.current[i];
        const bar = barRefs.current[i];
        const text = textRefs.current[i];

        const rot = isActive ? 0 : i < active ? tilt : -tilt;
        const rotProp = vertical ? { rotateX: -rot } : { rotateY: rot };

        tl.to(panel, { flexGrow: isActive ? grow : 1, ...rotProp, duration: dur, ease }, 0);

        if (media) {
          const drift = Math.max(-1.5, Math.min(1.5, active - i));
          const shift = drift * parallax * mediaSize * 0.06;
          const gray = grayscale ? (isActive ? 0 : 1) : 0;
          tl.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: vertical ? 0 : isActive ? 0 : shift,
              y: vertical ? (isActive ? 0 : shift) : 0,
              '--ag-gray': gray,
              '--ag-dim': isActive ? 0 : dim,
              duration: dur,
              ease,
            },
            0,
          );
        }

        if (showLabels && bar && text) {
          if (isActive) {
            tl.to(
              [bar, text],
              { opacity: 1, x: 0, duration: dur, ease, stagger: prefersReduced ? 0 : stagger },
              0,
            );
          } else {
            tl.to([bar, text], { opacity: 0, x: -14, duration: dur * 0.6, ease }, 0);
          }
        }
      });

      tlRef.current = tl;
    },
    [
      active,
      count,
      ratio,
      duration,
      ease,
      vertical,
      tilt,
      dim,
      parallax,
      grayscale,
      showLabels,
      stagger,
      prefersReduced,
    ],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(STACK_QUERY);
    const sync = () => setStacked(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const total = vertical ? rect.height : rect.width;
      const usable = Math.max(total - gap * (count - 1), 120);
      const size = Math.max(140, usable * ratio * 1.22);
      mediaSizeRef.current = size;
      el.style.setProperty('--ag-media-size', `${size}px`);
      applyLayout(!firstRunRef.current);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyLayout, gap, count, ratio, vertical]);

  useEffect(() => {
    applyLayout(!firstRunRef.current);
    firstRunRef.current = false;
  }, [applyLayout]);

  useEffect(
    () => () => {
      tlRef.current?.kill();
    },
    [],
  );

  const handleEnter = (i: number) => {
    if (trigger === 'hover') setActive(i);
  };

  const handleClick = (i: number, e: MouseEvent) => {
    if (i !== active) {
      e.preventDefault();
      setActive(i);
    }
  };

  const handleKeyDown = (i: number, e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i + 1) % count);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i - 1 + count) % count);
    }
  };

  const rootStyle = {
    '--ag-accent': accentColor,
    '--ag-overlay': overlayColor,
    '--ag-text': textColor,
    '--ag-gap': `${gap}px`,
    '--ag-radius': `${radius}px`,
    // Stacked, the stylesheet owns the height: a desktop `height` prop laid
    // down the screen would either overflow the viewport or, as `auto`, leave
    // flex-grow nothing to hand the open panel.
    height: stacked ? undefined : vertical ? `${Math.round(height * 1.6)}px` : `${height}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`accordion-gallery${vertical ? ' accordion-gallery--vertical' : ''}${
        className ? ` ${className}` : ''
      }`}
      style={rootStyle}
      role="list"
      aria-label="Image accordion gallery"
    >
      {items.map((item, i) => {
        const isActive = i === active;
        const Tag = (item.link ? 'a' : 'div') as 'a';
        return (
          <Tag
            key={item.image}
            ref={(el: HTMLElement | null) => {
              panelRefs.current[i] = el;
            }}
            className={`ag-panel${isActive ? ' ag-panel--active' : ''}`}
            style={{ borderRadius: `${radius}px` }}
            href={item.link || undefined}
            onClick={(e) => handleClick(i, e)}
            onMouseEnter={() => handleEnter(i)}
            onFocus={() => setActive(i)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            role="listitem"
            tabIndex={0}
            aria-current={isActive ? 'true' : undefined}
            aria-label={item.label}
          >
            <span className="ag-panel__frame">
              <span
                className="ag-panel__media"
                ref={(el) => {
                  mediaRefs.current[i] = el;
                }}
              >
                <img src={item.image} alt={item.alt || item.label || ''} draggable="false" />
              </span>
              <span className="ag-panel__overlay" aria-hidden="true" />
            </span>
            {showLabels && (
              <span className="ag-panel__label" aria-hidden="true">
                <span
                  className="ag-panel__bar"
                  ref={(el) => {
                    barRefs.current[i] = el;
                  }}
                />
                <span
                  className="ag-panel__text"
                  ref={(el) => {
                    textRefs.current[i] = el;
                  }}
                >
                  {item.label}
                </span>
              </span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}
