'use client';

import { ChevronDown } from '@/components/icons';
import { usePlanMenuFold } from '@/stores/usePlanMenuFold';

/**
 * The slim "Menu" pill that brings a folded plan menu back (#898). As a pull
 * at the top comes on, it grows a little and turns green, so the person can
 * see the pull is doing something before the menu opens.
 *
 * `toTop`: the phone's menu is the header at the top of the page, so opening
 * it mid-plan also glides back up, or the tap would seem to do nothing. The
 * computer's tabs hold under the top bar, so it opens in place there.
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
      className={`motion-focus pointer-events-auto inline-flex h-[26px] touch-manipulation items-center gap-1.5 rounded-full border border-stroke-control bg-bg-surface pl-2.5 pr-3 text-xs font-semibold shadow-sm transition-[transform,color] duration-150 hover:text-content-primary ${
        pull >= 0.5 ? 'text-brand' : 'text-content-secondary'
      }`}
    >
      <ChevronDown className="h-3 w-3" aria-hidden="true" />
      Menu
    </button>
  );
}
