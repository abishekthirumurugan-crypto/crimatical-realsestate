/*
 * React Bits — TargetCursor (JS-CSS variant), typed for this codebase.
 *
 * Source: https://reactbits.dev/r/TargetCursor-JS-CSS.json
 *
 * The logic is the registry's, unchanged. It is written as TSX rather than JSX
 * because `npm run build` runs `tsc --noEmit` with `allowJs` off, so a plain
 * .jsx module would not resolve from the pages that import it.
 *
 * One addition: the colour props accept `var(--token)` and are resolved before
 * they reach GSAP. The corners and the dot are *tweened* between colours, and
 * GSAP's colour plugin parses the value itself — it has no CSS engine, so a
 * `var()` reaches it as an unparseable string and the tween silently does
 * nothing. Resolving at the call site instead of hard-coding a hex is what lets
 * the cursor sit on the palette without pinning a copy of it here.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';

import './TargetCursor.css';

interface TargetCursorProps {
  /** Elements the corners lock on to. */
  targetSelector?: string;
  /** Seconds for one idle revolution. */
  spinDuration?: number;
  /** Hides the native arrow document-wide. Off here; the zone does it in CSS. */
  hideDefaultCursor?: boolean;
  /** Seconds for the corners to settle onto a target. */
  hoverDuration?: number;
  /** Lets the locked corners drift with the pointer. */
  parallaxOn?: boolean;
  /** Resting colour of the corners and the dot. Accepts `var(--token)`. */
  cursorColor?: string;
  /** Colour they tween to over a target. Accepts `var(--token)`. */
  cursorColorOnTarget?: string;
}

/**
 * Resolve `var(--token)` (with an optional fallback) against the document root.
 *
 * Read at the moment it is needed rather than cached, so the value is right
 * even if the palette is swapped at runtime, and so nothing touches the DOM
 * during the first render.
 */
function resolveColor(value: string | undefined): string | undefined {
  if (!value || !value.startsWith('var(') || typeof document === 'undefined') return value;
  const match = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]+))?\)$/.exec(value.trim());
  if (!match) return value;
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
  return resolved || match[2]?.trim() || undefined;
}

interface Point {
  x: number;
  y: number;
}

// A position: fixed element is positioned relative to the viewport UNLESS an
// ancestor establishes a containing block (transform, perspective, filter,
// will-change of those, or contain). When that happens, the cursor's translate
// no longer maps to viewport coordinates, so we measure and compensate for it.
const getContainingBlock = (element: HTMLElement | null): HTMLElement | null => {
  let node = element?.parentElement ?? null;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (
      style.transform !== 'none' ||
      style.perspective !== 'none' ||
      style.filter !== 'none' ||
      style.willChange.includes('transform') ||
      style.willChange.includes('perspective') ||
      style.willChange.includes('filter') ||
      /paint|layout|strict|content/.test(style.contain)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

const getContainingBlockOffset = (block: HTMLElement | null): Point => {
  if (!block) return { x: 0, y: 0 };
  const rect = block.getBoundingClientRect();
  return { x: rect.left + block.clientLeft, y: rect.top + block.clientTop };
};

/** gsap.getProperty widens to string | number; every read here is numeric. */
const num = (target: object, prop: string): number => gsap.getProperty(target, prop) as number;

export default function TargetCursor({
  targetSelector = '.cursor-target',
  spinDuration = 2,
  hideDefaultCursor = true,
  hoverDuration = 0.2,
  parallaxOn = true,
  cursorColor = 'var(--ink)',
  cursorColorOnTarget,
}: TargetCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<NodeListOf<HTMLElement> | null>(null);
  const spinTl = useRef<gsap.core.Timeline | null>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const containingBlockRef = useRef<HTMLElement | null>(null);

  const isActiveRef = useRef(false);
  const targetCornerPositionsRef = useRef<Point[] | null>(null);
  const tickerFnRef = useRef<(() => void) | null>(null);
  const activeStrengthRef = useRef(0);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    const userAgent = navigator.userAgent || navigator.vendor || '';
    const mobileRegex = /android|webos|iphone|ipad|ipot|blackberry|iemobile|opera mini/i;
    const isMobileUserAgent = mobileRegex.test(userAgent.toLowerCase());
    return (hasTouchScreen && isSmallScreen) || isMobileUserAgent;
  }, []);

  const constants = useMemo(
    () => ({
      borderWidth: 3,
      cornerSize: 12,
    }),
    [],
  );

  const moveCursor = useCallback((x: number, y: number) => {
    if (!cursorRef.current) return;
    const { x: offsetX, y: offsetY } = getContainingBlockOffset(containingBlockRef.current);
    gsap.to(cursorRef.current, {
      x: x - offsetX,
      y: y - offsetY,
      duration: 0.1,
      ease: 'power3.out',
    });
  }, []);

  useEffect(() => {
    if (isMobile || !cursorRef.current) return;

    const originalCursor = document.body.style.cursor;
    if (hideDefaultCursor) {
      document.body.style.cursor = 'none';
    }

    const cursor = cursorRef.current;
    cornersRef.current = cursor.querySelectorAll<HTMLElement>('.target-cursor-corner');

    containingBlockRef.current = getContainingBlock(cursor);
    const getOffset = () => getContainingBlockOffset(containingBlockRef.current);

    let activeTarget: HTMLElement | null = null;
    let currentLeaveHandler: (() => void) | null = null;
    let resumeTimeout: ReturnType<typeof setTimeout> | null = null;

    const cleanupTarget = (target: HTMLElement) => {
      if (currentLeaveHandler) {
        target.removeEventListener('mouseleave', currentLeaveHandler);
      }
      currentLeaveHandler = null;
    };

    const initialOffset = getOffset();
    gsap.set(cursor, {
      xPercent: -50,
      yPercent: -50,
      x: window.innerWidth / 2 - initialOffset.x,
      y: window.innerHeight / 2 - initialOffset.y,
    });

    const createSpinTimeline = () => {
      if (spinTl.current) {
        spinTl.current.kill();
      }
      spinTl.current = gsap
        .timeline({ repeat: -1 })
        .to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    };

    createSpinTimeline();

    const tickerFn = () => {
      if (!targetCornerPositionsRef.current || !cursorRef.current || !cornersRef.current) {
        return;
      }

      const strength = activeStrengthRef.current;
      if (strength === 0) return;

      const positions = targetCornerPositionsRef.current;
      const cursorX = num(cursorRef.current, 'x');
      const cursorY = num(cursorRef.current, 'y');

      const corners = Array.from(cornersRef.current);
      corners.forEach((corner, i) => {
        const currentX = num(corner, 'x');
        const currentY = num(corner, 'y');

        const targetX = positions[i].x - cursorX;
        const targetY = positions[i].y - cursorY;

        const finalX = currentX + (targetX - currentX) * strength;
        const finalY = currentY + (targetY - currentY) * strength;

        const duration = strength >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05;

        gsap.to(corner, {
          x: finalX,
          y: finalY,
          duration: duration,
          ease: duration === 0 ? 'none' : 'power1.out',
          overwrite: 'auto',
        });
      });
    };

    tickerFnRef.current = tickerFn;

    const moveHandler = (e: MouseEvent) => moveCursor(e.clientX, e.clientY);
    window.addEventListener('mousemove', moveHandler);

    const scrollHandler = () => {
      if (!activeTarget || !cursorRef.current) return;
      const { x: offsetX, y: offsetY } = getOffset();
      const mouseX = num(cursorRef.current, 'x') + offsetX;
      const mouseY = num(cursorRef.current, 'y') + offsetY;
      const elementUnderMouse = document.elementFromPoint(mouseX, mouseY);
      const isStillOverTarget =
        elementUnderMouse &&
        (elementUnderMouse === activeTarget ||
          elementUnderMouse.closest(targetSelector) === activeTarget);
      if (!isStillOverTarget) {
        if (currentLeaveHandler) {
          currentLeaveHandler();
        }
      }
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    const mouseDownHandler = () => {
      if (!dotRef.current) return;
      gsap.to(dotRef.current, { scale: 0.7, duration: 0.3 });
      gsap.to(cursorRef.current, { scale: 0.9, duration: 0.2 });
    };

    const mouseUpHandler = () => {
      if (!dotRef.current) return;
      gsap.to(dotRef.current, { scale: 1, duration: 0.3 });
      gsap.to(cursorRef.current, { scale: 1, duration: 0.2 });
    };

    window.addEventListener('mousedown', mouseDownHandler);
    window.addEventListener('mouseup', mouseUpHandler);

    const enterHandler = (e: MouseEvent) => {
      const allTargets: HTMLElement[] = [];
      let current = e.target as HTMLElement | null;
      while (current && current !== document.body) {
        if (current.matches(targetSelector)) {
          allTargets.push(current);
        }
        current = current.parentElement;
      }
      const target = allTargets[0] || null;
      if (!target || !cursorRef.current || !cornersRef.current) return;
      if (activeTarget === target) return;
      if (activeTarget) {
        cleanupTarget(activeTarget);
      }
      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
        resumeTimeout = null;
      }

      activeTarget = target;
      const corners = Array.from(cornersRef.current);
      corners.forEach((corner) => gsap.killTweensOf(corner, 'x,y'));

      gsap.killTweensOf(cursorRef.current, 'rotation');
      spinTl.current?.pause();
      gsap.set(cursorRef.current, { rotation: 0 });

      const onTarget = resolveColor(cursorColorOnTarget);
      if (onTarget) {
        gsap.to(corners, {
          borderColor: onTarget,
          duration: 0.15,
          ease: 'power2.out',
        });
        if (dotRef.current) {
          gsap.to(dotRef.current, {
            backgroundColor: onTarget,
            duration: 0.15,
            ease: 'power2.out',
          });
        }
      }

      const rect = target.getBoundingClientRect();
      const { borderWidth, cornerSize } = constants;
      const { x: offsetX, y: offsetY } = getOffset();
      const cursorX = num(cursorRef.current, 'x');
      const cursorY = num(cursorRef.current, 'y');

      const positions: Point[] = [
        { x: rect.left - borderWidth - offsetX, y: rect.top - borderWidth - offsetY },
        { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.top - borderWidth - offsetY },
        {
          x: rect.right + borderWidth - cornerSize - offsetX,
          y: rect.bottom + borderWidth - cornerSize - offsetY,
        },
        {
          x: rect.left - borderWidth - offsetX,
          y: rect.bottom + borderWidth - cornerSize - offsetY,
        },
      ];
      targetCornerPositionsRef.current = positions;

      isActiveRef.current = true;
      if (tickerFnRef.current) {
        gsap.ticker.add(tickerFnRef.current);
      }

      gsap.to(activeStrengthRef, {
        current: 1,
        duration: hoverDuration,
        ease: 'power2.out',
      });

      corners.forEach((corner, i) => {
        gsap.to(corner, {
          x: positions[i].x - cursorX,
          y: positions[i].y - cursorY,
          duration: 0.2,
          ease: 'power2.out',
        });
      });

      const leaveHandler = () => {
        if (tickerFnRef.current) {
          gsap.ticker.remove(tickerFnRef.current);
        }

        isActiveRef.current = false;
        targetCornerPositionsRef.current = null;
        gsap.set(activeStrengthRef, { current: 0, overwrite: true });
        activeTarget = null;

        const resting = resolveColor(cursorColor);
        if (cursorColorOnTarget && cornersRef.current && resting) {
          gsap.to(Array.from(cornersRef.current), {
            borderColor: resting,
            duration: 0.15,
            ease: 'power2.out',
          });
          if (dotRef.current) {
            gsap.to(dotRef.current, {
              backgroundColor: resting,
              duration: 0.15,
              ease: 'power2.out',
            });
          }
        }

        if (cornersRef.current) {
          const resting = Array.from(cornersRef.current);
          gsap.killTweensOf(resting, 'x,y');
          const { cornerSize } = constants;
          const home = [
            { x: -cornerSize * 1.5, y: -cornerSize * 1.5 },
            { x: cornerSize * 0.5, y: -cornerSize * 1.5 },
            { x: cornerSize * 0.5, y: cornerSize * 0.5 },
            { x: -cornerSize * 1.5, y: cornerSize * 0.5 },
          ];
          const tl = gsap.timeline();
          resting.forEach((corner, index) => {
            tl.to(
              corner,
              {
                x: home[index].x,
                y: home[index].y,
                duration: 0.3,
                ease: 'power3.out',
              },
              0,
            );
          });
        }

        resumeTimeout = setTimeout(() => {
          if (!activeTarget && cursorRef.current && spinTl.current) {
            const currentRotation = num(cursorRef.current, 'rotation');
            const normalizedRotation = currentRotation % 360;
            spinTl.current.kill();
            spinTl.current = gsap
              .timeline({ repeat: -1 })
              .to(cursorRef.current, { rotation: '+=360', duration: spinDuration, ease: 'none' });
            gsap.to(cursorRef.current, {
              rotation: normalizedRotation + 360,
              duration: spinDuration * (1 - normalizedRotation / 360),
              ease: 'none',
              onComplete: () => {
                spinTl.current?.restart();
              },
            });
          }
          resumeTimeout = null;
        }, 50);

        cleanupTarget(target);
      };

      currentLeaveHandler = leaveHandler;
      target.addEventListener('mouseleave', leaveHandler);
    };

    window.addEventListener('mouseover', enterHandler, { passive: true });

    const resizeHandler = () => {
      containingBlockRef.current = getContainingBlock(cursor);
    };
    window.addEventListener('resize', resizeHandler);

    return () => {
      if (tickerFnRef.current) {
        gsap.ticker.remove(tickerFnRef.current);
      }

      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseover', enterHandler);
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('mousedown', mouseDownHandler);
      window.removeEventListener('mouseup', mouseUpHandler);

      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
      }
      if (activeTarget) {
        cleanupTarget(activeTarget);
      }

      spinTl.current?.kill();
      document.body.style.cursor = originalCursor;

      isActiveRef.current = false;
      targetCornerPositionsRef.current = null;
      activeStrengthRef.current = 0;
    };
  }, [
    targetSelector,
    spinDuration,
    moveCursor,
    constants,
    hideDefaultCursor,
    isMobile,
    hoverDuration,
    parallaxOn,
    cursorColor,
    cursorColorOnTarget,
  ]);

  useEffect(() => {
    if (isMobile || !cursorRef.current || !spinTl.current) return;
    if (spinTl.current.isActive()) {
      spinTl.current.kill();
      spinTl.current = gsap
        .timeline({ repeat: -1 })
        .to(cursorRef.current, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    }
  }, [spinDuration, isMobile]);

  if (isMobile) {
    return null;
  }

  return (
    <div ref={cursorRef} className="target-cursor-wrapper">
      <div ref={dotRef} className="target-cursor-dot" style={{ backgroundColor: cursorColor }} />
      <div className="target-cursor-corner corner-tl" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-tr" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-br" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-bl" style={{ borderColor: cursorColor }} />
    </div>
  );
}
