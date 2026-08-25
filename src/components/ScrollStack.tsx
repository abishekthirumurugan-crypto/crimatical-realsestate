/*
 * React Bits — ScrollStack (JavaScript + CSS variant), typed for this codebase.
 *
 * The transform maths is upstream's, unchanged. Four things are adapted:
 *
 *  - TSX rather than JSX, because `npm run build` runs `tsc --noEmit` with
 *    `allowJs` off and a .jsx module would not resolve from a page.
 *  - In window-scroll mode the root no longer carries the scroller styles.
 *    Upstream applies `height: 100%; overflow-y: auto` unconditionally, which
 *    puts a dead 100%-height scroll box around a stack that is being driven by
 *    the window instead. A modifier class turns those off.
 *  - Reduced motion skips Lenis entirely and reads native scroll. Lenis is a
 *    smooth-scroll hijack; that is exactly what the setting asks us not to do.
 *  - The end spacer is measured through a ref rather than a document-wide
 *    querySelector, so a second stack on the same page cannot capture it.
 */

import { useLayoutEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import Lenis from 'lenis';

import './ScrollStack.css';

export function ScrollStackItem({
  children,
  itemClassName = '',
}: {
  children: ReactNode;
  itemClassName?: string;
}) {
  return <div className={`scroll-stack-card ${itemClassName}`.trim()}>{children}</div>;
}

interface ScrollStackProps {
  children: ReactNode;
  className?: string;
  /** Gap between cards before they stack, in px. */
  itemDistance?: number;
  /** Scale added back per card, so lower cards are not all the same size. */
  itemScale?: number;
  /** How far each stacked card peeks out below the one above, in px. */
  itemStackDistance?: number;
  /** Where in the viewport a card pins, as a percentage of its height. */
  stackPosition?: string;
  /** Where the shrink finishes, as a percentage of viewport height. */
  scaleEndPosition?: string;
  /** Scale of the first card once fully stacked. */
  baseScale?: number;
  scaleDuration?: number;
  rotationAmount?: number;
  blurAmount?: number;
  /** Drive the stack from the page scroll rather than a nested scroll box. */
  useWindowScroll?: boolean;
  onStackComplete?: () => void;
}

interface CardTransform {
  translateY: number;
  scale: number;
  rotation: number;
  blur: number;
}

export default function ScrollStack({
  children,
  className = '',
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = '20%',
  scaleEndPosition = '10%',
  baseScale = 0.85,
  scaleDuration = 0.5,
  rotationAmount = 0,
  blurAmount = 0,
  useWindowScroll = false,
  onStackComplete,
}: ScrollStackProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stackCompletedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const cardsRef = useRef<HTMLElement[]>([]);
  const lastTransformsRef = useRef(new Map<number, CardTransform>());
  /** Layout-space tops, cached so we never re-read a transformed box. */
  const offsetsRef = useRef<{ cards: number[]; end: number }>({ cards: [], end: 0 });
  const isUpdatingRef = useRef(false);

  const calculateProgress = useCallback((scrollTop: number, start: number, end: number) => {
    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / (end - start);
  }, []);

  const parsePercentage = useCallback((value: string | number, containerHeight: number) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return parseFloat(String(value));
  }, []);

  const getScrollData = useCallback(() => {
    if (useWindowScroll) {
      return { scrollTop: window.scrollY, containerHeight: window.innerHeight };
    }
    const scroller = scrollerRef.current;
    return {
      scrollTop: scroller?.scrollTop ?? 0,
      containerHeight: scroller?.clientHeight ?? 0,
    };
  }, [useWindowScroll]);

  /*
   * Upstream measures window-mode cards with getBoundingClientRect(), which
   * reports the box AFTER transforms. Every frame then reads back the
   * translate it wrote the frame before:
   *
   *   translateY = scrollTop - cardTop + C,  cardTop = cardTop0 + translateY
   *   => translateY_next = translateY_ideal - translateY_prev
   *
   * which oscillates T, 0, T, 0 forever — the card snapping in and out of its
   * pinned position on every animation frame.
   *
   * offsetTop is a layout value, so a transform cannot move it. Walking the
   * offsetParent chain gives a document-relative top that stays put no matter
   * what we have already written to the card.
   */
  const measureOffsets = useCallback(() => {
    const documentTop = (el: HTMLElement) => {
      let top = 0;
      let node: HTMLElement | null = el;
      while (node) {
        top += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return top;
    };
    const read = (el: HTMLElement) => (useWindowScroll ? documentTop(el) : el.offsetTop);

    offsetsRef.current = {
      cards: cardsRef.current.map(read),
      end: endRef.current ? read(endRef.current) : 0,
    };
  }, [useWindowScroll]);

  const updateCardTransforms = useCallback(() => {
    if (!cardsRef.current.length || isUpdatingRef.current) return;

    isUpdatingRef.current = true;

    const { scrollTop, containerHeight } = getScrollData();
    const stackPositionPx = parsePercentage(stackPosition, containerHeight);
    const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight);

    const { cards: cardTops, end: endElementTop } = offsetsRef.current;
    if (cardTops.length !== cardsRef.current.length) {
      isUpdatingRef.current = false;
      return;
    }

    cardsRef.current.forEach((card, i) => {
      if (!card) return;

      const cardTop = cardTops[i];
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      const triggerEnd = cardTop - scaleEndPositionPx;
      const pinStart = cardTop - stackPositionPx - itemStackDistance * i;
      const pinEnd = endElementTop - containerHeight / 2;

      const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd);
      const targetScale = baseScale + i * itemScale;
      const scale = 1 - scaleProgress * (1 - targetScale);
      const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;

      let blur = 0;
      if (blurAmount) {
        let topCardIndex = 0;
        for (let j = 0; j < cardsRef.current.length; j++) {
          const jCardTop = cardTops[j];
          const jTriggerStart = jCardTop - stackPositionPx - itemStackDistance * j;
          if (scrollTop >= jTriggerStart) {
            topCardIndex = j;
          }
        }

        if (i < topCardIndex) {
          const depthInStack = topCardIndex - i;
          blur = Math.max(0, depthInStack * blurAmount);
        }
      }

      let translateY = 0;
      const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;

      if (isPinned) {
        translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i;
      } else if (scrollTop > pinEnd) {
        translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i;
      }

      const newTransform: CardTransform = {
        translateY: Math.round(translateY * 100) / 100,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100,
      };

      const lastTransform = lastTransformsRef.current.get(i);
      const hasChanged =
        !lastTransform ||
        Math.abs(lastTransform.translateY - newTransform.translateY) > 0.1 ||
        Math.abs(lastTransform.scale - newTransform.scale) > 0.001 ||
        Math.abs(lastTransform.rotation - newTransform.rotation) > 0.1 ||
        Math.abs(lastTransform.blur - newTransform.blur) > 0.1;

      if (hasChanged) {
        const transform = `translate3d(0, ${newTransform.translateY}px, 0) scale(${newTransform.scale}) rotate(${newTransform.rotation}deg)`;
        const filter = newTransform.blur > 0 ? `blur(${newTransform.blur}px)` : '';

        card.style.transform = transform;
        card.style.filter = filter;

        lastTransformsRef.current.set(i, newTransform);
      }

      if (i === cardsRef.current.length - 1) {
        const isInView = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isInView && !stackCompletedRef.current) {
          stackCompletedRef.current = true;
          onStackComplete?.();
        } else if (!isInView && stackCompletedRef.current) {
          stackCompletedRef.current = false;
        }
      }
    });

    isUpdatingRef.current = false;
  }, [
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    onStackComplete,
    calculateProgress,
    parsePercentage,
    getScrollData,
  ]);

  const handleScroll = useCallback(() => {
    updateCardTransforms();
  }, [updateCardTransforms]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const cards = Array.from(
      scroller.querySelectorAll<HTMLElement>('.scroll-stack-card'),
    );

    cardsRef.current = cards;
    const transformsCache = lastTransformsRef.current;

    cards.forEach((card, i) => {
      if (i < cards.length - 1) {
        card.style.marginBottom = `${itemDistance}px`;
      }
      card.style.willChange = 'transform, filter';
      card.style.transformOrigin = 'top center';
      card.style.backfaceVisibility = 'hidden';
      card.style.transform = 'translateZ(0)';
      card.style.perspective = '1000px';
    });

    // Layout is settled now that margins are written; cache the tops. They
    // only move if the page reflows, so a ResizeObserver is enough to keep
    // them honest without paying for a layout read every frame.
    measureOffsets();

    const ro = new ResizeObserver(() => {
      measureOffsets();
      lastTransformsRef.current.clear();
      updateCardTransforms();
    });
    ro.observe(scroller);
    cards.forEach((card) => ro.observe(card));

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let detachNative: (() => void) | undefined;

    if (reduced) {
      // Native scroll, no smoothing. The stack still assembles; it just
      // tracks the wheel one-to-one instead of gliding after it.
      const target: HTMLElement | Window = useWindowScroll ? window : scroller;
      target.addEventListener('scroll', handleScroll, { passive: true });
      detachNative = () => target.removeEventListener('scroll', handleScroll);
    } else {
      const lenis = useWindowScroll
        ? new Lenis({
            duration: 1.2,
            easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            touchMultiplier: 2,
            infinite: false,
            wheelMultiplier: 1,
            lerp: 0.1,
            syncTouch: true,
            syncTouchLerp: 0.075,
          })
        : new Lenis({
            wrapper: scroller,
            content: scroller.querySelector('.scroll-stack-inner') as HTMLElement,
            duration: 1.2,
            easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            touchMultiplier: 2,
            infinite: false,
            wheelMultiplier: 1,
            lerp: 0.1,
            syncTouch: true,
            syncTouchLerp: 0.075,
          });

      lenis.on('scroll', handleScroll);

      const raf = (time: number) => {
        lenis.raf(time);
        animationFrameRef.current = requestAnimationFrame(raf);
      };
      animationFrameRef.current = requestAnimationFrame(raf);

      lenisRef.current = lenis;
    }

    updateCardTransforms();

    return () => {
      ro.disconnect();
      detachNative?.();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (lenisRef.current) {
        lenisRef.current.destroy();
        lenisRef.current = null;
      }
      stackCompletedRef.current = false;
      cardsRef.current = [];
      transformsCache.clear();
      isUpdatingRef.current = false;
    };
  }, [
    itemDistance,
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    scaleDuration,
    rotationAmount,
    blurAmount,
    useWindowScroll,
    onStackComplete,
    handleScroll,
    measureOffsets,
    updateCardTransforms,
  ]);

  const rootClass = [
    'scroll-stack-scroller',
    useWindowScroll ? 'scroll-stack-scroller--window' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass} ref={scrollerRef}>
      <div className="scroll-stack-inner">
        {children}
        {/* Spacer so the last pin can release cleanly */}
        <div className="scroll-stack-end" ref={endRef} />
      </div>
    </div>
  );
}
