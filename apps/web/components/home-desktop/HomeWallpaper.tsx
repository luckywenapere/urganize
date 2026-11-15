'use client';

// The wallpaper behind Home on a computer (#1305, part of #1175; founder
// approved docs/mocks/home-wallpaper): None, Forest or Night sky. The rules
// (the three values, when the button shows, what is saved) are
// lib/home-desktop/wallpaper.ts, tested. The pick is on the person's own
// profiles row, so it is known from the first paint (the profile is kept on
// the device) and follows them to any computer.
//
// Three pieces:
//  - HomeWallpaperLayer: mounted by Home on a computer only. It marks <html>
//    with data-home-wallpaper, and globals.css draws the picture, the dimming
//    layer and the light text from that mark. Phones never mount it.
//  - HomeWallpaperChoice: the three options as real radio buttons, used in the
//    top bar's popover, in Customise Home and in Settings.
//  - HomeWallpaperButton: the small button in the top bar with a "New" badge.
//    It shows on Home until the person first sets a picture, then never again.

import { useEffect, useId, useRef, useState } from 'react';
import { create } from 'zustand';
import { Image as ImageGlyph, Sparkles } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import {
  HOME_WALLPAPERS,
  HOME_WALLPAPER_COPY,
  parseHomeWallpaper,
  showWallpaperButton,
  wallpaperAttr,
  type HomeWallpaper,
} from '@/lib/home-desktop/wallpaper';

/** True while Home on a computer is on screen: the top bar's button reads it. */
const useHomeOnScreen = create<{ on: boolean }>(() => ({ on: false }));

/** The person's wallpaper, None until a profile says otherwise. */
export function useHomeWallpaper(): HomeWallpaper {
  return useAuthStore((state) => parseHomeWallpaper(state.user?.home_wallpaper));
}

export function HomeWallpaperLayer() {
  const wallpaper = useHomeWallpaper();
  const attr = wallpaperAttr(wallpaper);

  useEffect(() => {
    useHomeOnScreen.setState({ on: true });
    return () => useHomeOnScreen.setState({ on: false });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!attr) {
      root.removeAttribute('data-home-wallpaper');
      return;
    }
    root.setAttribute('data-home-wallpaper', attr);
    return () => root.removeAttribute('data-home-wallpaper');
  }, [attr]);

  return null;
}

// Small copies of the two pictures, so the choice never downloads the full ones.
const THUMB: Record<HomeWallpaper, string | null> = {
  none: null,
  forest: '/images/wallpapers/forest-thumb.webp',
  night_sky: '/images/wallpapers/night-sky-thumb.webp',
};

/**
 * None, Forest, Night sky. Real radio buttons in a fieldset, so Tab reaches the
 * group, the arrow keys move the pick and a screen reader says "1 of 3". A pick
 * saves at once; a failed save puts the old one back and says so.
 */
export function HomeWallpaperChoice({ source, className = '' }: { source: 'home' | 'customise' | 'settings'; className?: string }) {
  const wallpaper = useHomeWallpaper();
  const save = useAuthStore((state) => state.updateHomeWallpaper);
  const [failed, setFailed] = useState(false);
  const name = useId();

  const pick = async (next: HomeWallpaper) => {
    if (next === wallpaper) return;
    setFailed(false);
    captureAnalyticsEvent({ name: 'home_wallpaper_set', properties: { wallpaper: next, source } });
    try {
      await save(next);
    } catch {
      setFailed(true);
    }
  };

  return (
    <fieldset className={className}>
      <legend className="sr-only">{HOME_WALLPAPER_COPY.title}</legend>
      <div className="grid grid-cols-3 gap-2.5">
        {HOME_WALLPAPERS.map((id) => {
          const thumb = THUMB[id];
          return (
            <label key={id} className="block cursor-pointer text-center">
              <input
                type="radio"
                name={name}
                value={id}
                checked={wallpaper === id}
                onChange={() => void pick(id)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="block h-[60px] rounded-[14px] bg-bg-hover bg-cover bg-center shadow-[0_0_0_1px_rgb(var(--color-stroke)/0.14)] transition-shadow peer-checked:shadow-[0_0_0_2.5px_rgb(var(--color-brand))] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[5px] peer-focus-visible:outline-brand"
                style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
              />
              <span className="mt-1.5 block text-xs font-medium text-content-secondary peer-checked:font-bold peer-checked:text-brand">
                {HOME_WALLPAPER_COPY.options[id]}
              </span>
            </label>
          );
        })}
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-xs text-status-error">
          {HOME_WALLPAPER_COPY.failed}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * The top bar's wallpaper button, on Home on a computer only. A disclosure
 * (aria-expanded and aria-controls, not a menu role): the panel holds the radio
 * group. Escape, a click outside or tabbing out closes it and focus goes back
 * to the button. Once a picture has been set the button is gone for good, but
 * it stays while its own panel is open so the person can try each picture.
 */
export function HomeWallpaperButton() {
  const onHome = useHomeOnScreen((state) => state.on);
  const offered = useAuthStore((state) => showWallpaperButton(state.user));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const offeredRef = useRef(offered);
  useEffect(() => {
    offeredRef.current = offered;
  }, [offered]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = event.target as Node | null;
      if (target && !rootRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      // The button goes once a picture is set, so focus moves to the page
      // then, not to nowhere.
      if (offeredRef.current) triggerRef.current?.focus();
      else document.getElementById('main-content')?.focus();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('focusin', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('focusin', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!onHome || (!offered && !open)) return null;

  return (
    <div ref={rootRef} className="relative hidden lg:block" data-home-wallpaper-button>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={offered ? `${HOME_WALLPAPER_COPY.button}. ${HOME_WALLPAPER_COPY.badge}.` : HOME_WALLPAPER_COPY.button}
        className={`motion-focus motion-press relative grid h-10 w-10 place-items-center rounded-full border border-stroke-default text-content-secondary hover:text-content-primary ${
          open ? 'bg-bg-sidebar-active text-content-primary' : 'bg-bg-surface/70'
        }`}
      >
        <ImageGlyph className="h-[18px] w-[18px]" aria-hidden="true" />
        {offered ? (
          <span
            aria-hidden="true"
            className="home-wallpaper-new pointer-events-none absolute -right-2.5 -top-1.5 inline-flex h-[18px] items-center gap-0.5 rounded-full bg-brand pl-1 pr-1.5 text-[10px] font-bold leading-none text-content-inverse"
          >
            <Sparkles className="home-wallpaper-new-spark h-2.5 w-2.5" />
            {HOME_WALLPAPER_COPY.badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={HOME_WALLPAPER_COPY.title}
          className="absolute right-0 top-full z-50 mt-2 w-[316px] rounded-[24px] border border-stroke-default bg-bg-surface p-[18px] text-left shadow-[0_24px_48px_-16px_rgba(0,0,0,.6)]"
        >
          <p className="text-base font-bold leading-[22px] text-content-primary">{HOME_WALLPAPER_COPY.title}</p>
          <p className="mt-0.5 text-[13px] leading-[18px] text-content-secondary">{HOME_WALLPAPER_COPY.about}</p>
          <HomeWallpaperChoice source="home" className="mt-3.5" />
        </div>
      ) : null}
    </div>
  );
}
