'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { SWIPE_TABS, lerpIndicator, swipeAreaForPath, swipeBackAction, swipeBackFor, swipeLitTab, swipeTabIndex, swipeUnderline, type SwipeTabKey } from '@/lib/swipe-nav';
import { readPreviousLocation } from '@/lib/nav-history';
import { ArrowLeft } from '@/components/icons';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';
import { useNeedsYouStore } from '@/stores/useNeedsYouStore';
import { getSwipeProgress, subscribeSwipeProgress } from './progress';
import { AvatarMenu } from './AvatarMenu';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The swipe navigation's top bar (URG-380). Phone: Home · Assistant at
 * the left, 17px/600, inactive at 45%, a 2.5px green underline that follows
 * the pager every frame (its x and width lerp between the labels), and the
 * avatar at the right. Desktop: the Urganize mark left, the tabs centred, the
 * avatar right. A green dot on UrgAns while something needs you and you are
 * not there. Never moves during a swipe.
 */
export function SwipeTopBar({ showHelp, pagerActive }: { showHelp: boolean; pagerActive: boolean }) {
  const pathname = usePathname();
  const area = swipeAreaForPath(pathname);
  const router = useRouter();
  const back = pagerActive ? null : swipeBackFor(pathname);
  const go = useSwipeNavStore((state) => state.go);
  const unread = useNeedsYouStore((state) => state.items.reduce((count, item) => (item.read ? count : count + 1), 0));
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // The underline: on a tab, it rides the pager's progress; on a pushed screen
  // it sits under the area that screen belongs to, or hides.
  useIsoLayoutEffect(() => {
    const row = rowRef.current;
    const indicator = indicatorRef.current;
    if (!row || !indicator) return;
    const measure = () =>
      tabRefs.current.map((tab) => {
        if (!tab) return { left: 0, width: 0 };
        const base = row.getBoundingClientRect();
        const rect = tab.getBoundingClientRect();
        return { left: rect.left - base.left, width: rect.width };
      });
    let rects = measure();
    const paint = (progress: number) => {
      // The rollout chats sit inside Ask Chappi, so the underline holds there;
      // on the way to Settings it fades, and the ring on your photo says where
      // you are instead (#1320).
      const underline = swipeUnderline(progress);
      const { left, width } = lerpIndicator(rects, underline.tab);
      indicator.style.transform = `translateX(${left}px)`;
      indicator.style.width = `${width}px`;
      indicator.style.opacity = String(underline.opacity);
      // Label colour follows the same progress: full at its tab, 45% a tab away.
      labelRefs.current.forEach((label, i) => {
        if (!label) return;
        const near = Math.max(0, 1 - Math.abs(underline.tab - i));
        // Opacity, not a colour, so the light theme keeps its own ink.
        label.style.opacity = String(0.45 + 0.55 * near);
      });
    };
    if (!pagerActive) {
      if (area === null) {
        indicator.style.opacity = '0';
        labelRefs.current.forEach((label) => label && (label.style.opacity = ''));
        return;
      }
      indicator.style.opacity = '1';
      paint(swipeTabIndex(area));
      return;
    }
    indicator.style.opacity = '1';
    paint(getSwipeProgress());
    const unsubscribe = subscribeSwipeProgress(paint);
    const onResize = () => {
      rects = measure();
      paint(getSwipeProgress());
    };
    window.addEventListener('resize', onResize);
    void document.fonts?.ready.then(onResize);
    return () => {
      unsubscribe();
      window.removeEventListener('resize', onResize);
    };
  }, [pagerActive, area]);

  const onTab = (key: SwipeTabKey) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!pagerActive || !go) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    go(key);
  };

  // From md (768px, tablets) the bar takes the computer's shape: the mark on
  // the left, the tabs in the middle, 72px tall (#1320), so a tablet does not
  // look like a different app. Below md it is the phone bar.
  return (
    <header
      className="swipe-topbar sticky top-0 z-40 shrink-0 bg-bg-base pt-[env(safe-area-inset-top,0px)] md:border-b md:border-content-primary/[0.06]"
      data-swipe-topbar
    >
      <div className="relative flex h-[50px] items-center px-5 md:h-[72px] md:px-8">
        <Link href={SWIPE_TABS[0].href} className="motion-focus hidden items-center md:flex" aria-label="Urganize, Artists">
          <Logo size="sm" priority />
        </Link>
        <nav aria-label="Primary" className="flex h-full items-center md:absolute md:inset-y-0 md:left-1/2 md:-translate-x-1/2">
          <div ref={rowRef} className="relative flex h-full items-center gap-6 md:gap-14">
            {SWIPE_TABS.map((tab, i) => {
              const active = area !== null && swipeLitTab(area) === tab.key;
              return (
                <Link
                  key={tab.key}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  href={tab.href}
                  onClick={onTab(tab.key)}
                  aria-current={active ? 'page' : undefined}
                  data-swipe-tab={tab.key}
                  className="motion-focus relative flex h-full items-center text-[17px] font-semibold md:text-[19px]"
                >
                  <span
                    ref={(el) => {
                      labelRefs.current[i] = el;
                    }}
                    className={`text-content-primary ${active ? '' : 'opacity-45'}`}
                  >
                    {tab.label}
                  </span>
                  {tab.key === 'urgans' && unread > 0 && (area === null || swipeLitTab(area) !== 'urgans') ? (
                    <>
                      <span aria-hidden="true" className="absolute -right-2 top-[13px] h-1.5 w-1.5 rounded-full bg-brand md:top-[23px]" />
                      <span className="sr-only">, something needs you</span>
                    </>
                  ) : null}
                </Link>
              );
            })}
            <span
              ref={indicatorRef}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-1 left-0 h-[2.5px] rounded-full bg-brand md:bottom-2.5"
              style={{ width: 0 }}
            />
          </div>
        </nav>
        <div className="ml-auto">
          <AvatarMenu showHelp={showHelp} settingsActive={area === 'settings'} />
        </div>
      </div>
      {back ? (
        <div className="px-3 lg:hidden">
          <Link
            href={back.href}
            data-swipe-back
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              const action = swipeBackAction(readPreviousLocation(), pathname ?? '', back.href, window.history.length);
              if (action.kind === 'history') window.history.back();
              else router.replace(action.href);
            }}
            className="motion-focus -ml-1 flex h-11 w-fit items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-content-primary/70 hover:text-content-primary"
          >
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            Back
          </Link>
        </div>
      ) : null}
    </header>
  );
}
