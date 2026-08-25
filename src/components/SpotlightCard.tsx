/*
 * React Bits — SpotlightCard (JavaScript + CSS variant), typed for this
 * codebase.
 *
 * Source: https://reactbits.dev/r/SpotlightCard-JS-CSS.json
 *
 * The effect is upstream's — a radial gradient parked at the pointer, faded in
 * on hover. Four things are adapted:
 *
 *  - TSX rather than JSX, because `npm run build` runs `tsc --noEmit` with
 *    `allowJs` off and a .jsx module would not resolve from a page.
 *  - Upstream ships its own look with the effect: a dark fill, a #222 border,
 *    2rem of padding, `overflow: hidden`. All of that is dropped. This
 *    codebase already dresses its cards (`.spec-card`, and the shared glass
 *    and elevation rules), so the component contributes the spotlight and
 *    nothing else. Clipping comes from `border-radius: inherit` on the
 *    pseudo-element rather than `overflow: hidden`, which would have cut off
 *    the hover shadow the elevation layer paints outside the border box.
 *  - The pointer position is written on the next animation frame instead of
 *    inside the event handler. A pointermove can fire several times per frame,
 *    and `setProperty` on an element with a paint-affecting custom property
 *    invalidates it every time; coalescing to one write per frame means one
 *    repaint per frame at most, with four of these on screen at once.
 *  - `as` picks the tag, so a card that was an `<article>` stays one. Upstream
 *    is always a `<div>`.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, ElementType, ReactNode } from 'react';

import './SpotlightCard.css';

interface SpotlightCardProps {
  children: ReactNode;
  /** Tag to render. Kept so semantic wrappers survive the effect. */
  as?: ElementType;
  className?: string;
  /**
   * Colour of the glow. Wants a low alpha — the spotlight sits on a near-white
   * card, so anything solid reads as a stain rather than as light.
   */
  spotlightColor?: string;
  style?: CSSProperties;
}

export default function SpotlightCard({
  children,
  as: Tag = 'div',
  className = '',
  spotlightColor = 'rgba(224, 50, 0, 0.1)',
  style,
}: SpotlightCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);
  const point = useRef({ x: 0, y: 0 });

  const flush = useCallback(() => {
    frame.current = null;
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--spotlight-x', `${point.current.x}px`);
    el.style.setProperty('--spotlight-y', `${point.current.y}px`);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Touch and pen get no spotlight — there is no hover to follow, and the
      // CSS suppresses it on coarse pointers anyway.
      if (event.pointerType !== 'mouse') return;

      const rect = event.currentTarget.getBoundingClientRect();
      point.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  // A pending frame after unmount would touch a detached node.
  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      onPointerMove={handlePointerMove}
      className={`spotlight-card ${className}`.trim()}
      style={{ '--spotlight-color': spotlightColor, ...style } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
