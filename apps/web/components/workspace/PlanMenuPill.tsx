'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp } from '@/components/icons';
import { usePlanMenuFold } from '@/stores/usePlanMenuFold';

/**
 * The slim "Menu" pill that brings a folded plan menu back (#898). As a pull
 * at the top comes on, it grows a little and turns green, so the person can
 * see the pull is doing something before the menu opens.
 *
 * `toTop`: the phone's menu is the header at the top of the page, so opening
 * it mid-plan also glides back up, or the tap would seem to do nothing. The
 * computer's tabs hold under the top bar, so it opens in place there.
 *
 * Sized on the golden scale (#926): 34 tall, 89 wide.
 */
export function PlanMenuPill({ toTop = false }: { toTop?: boolean }) {
  const pull = usePlanMenuFold((state) => state.pull);
  const setFolded = usePlanMenuFold((state) => state.setFolded);
  return (
    <button
      type="button"
      onClick={() => {
        setFolded(false);
        if (toTop) window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      aria-label="Show the plan menu"
      aria-expanded={false}
      style={{
        transform: `translateY(${pull * 8}px) scale(${1 + pull * 0.12})`,
        borderColor: pull > 0 ? `color-mix(in srgb, rgb(var(--color-brand)) ${Math.round(pull * 60)}%, transparent)` : undefined,
      }}
      className={`motion-focus pointer-events-auto inline-flex h-[34px] w-[89px] touch-manipulation items-center justify-center gap-1.5 rounded-full border border-stroke-control bg-bg-surface text-[13px] font-semibold shadow-[0_8px_21px_-8px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.08)] transition-[transform,color] duration-150 hover:text-content-primary ${
        pull >= 0.5 ? 'text-brand' : 'text-content-secondary'
      }`}
    >
      <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
      Menu
    </button>
  );
}

/**
 * The pill floating at the bottom of the screen (#926, founder approved mock
 * `docs/mocks/menu-pill-bottom`), centred on the column it is placed in. How
 * far up it sits lives in `.plan-menu-pill-dock` (globals.css), so it clears
 * the phone's bottom bar or UrgAns box. The anchor is a zero-height line that
 * reads the column's left edge and width. The pill itself goes to <body>, so
 * a transformed parent (the phone's swipe pager) cannot pin it to the page.
 */
export function PlanMenuPillDock({ toTop = false, anchorClassName = '' }: { toTop?: boolean; anchorClassName?: string }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const read = () => {
      const rect = el.getBoundingClientRect();
      // The rollout page draws its phone and desktop layouts together and
      // hides one with CSS, and both carry a dock. A hidden anchor measures
      // zero wide at x=0, and since the pill goes to <body> it would still
      // show, cut off at the left edge (#1069). So no width, no pill. The
      // ResizeObserver brings it back when the layout switches.
      if (rect.width === 0) {
        setBox(null);
        return;
      }
      setBox((prev) => (prev && prev.left === rect.left && prev.width === rect.width ? prev : { left: rect.left, width: rect.width }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    window.addEventListener('resize', read);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', read);
    };
  }, []);

  return (
    <>
      <div ref={anchorRef} aria-hidden="true" className={`h-0 ${anchorClassName}`} />
      {box
        ? createPortal(
            <div
              style={{ left: box.left, width: box.width }}
              className="plan-menu-pill-dock pointer-events-none fixed z-30 flex justify-center"
            >
              <PlanMenuPill toTop={toTop} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
