'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X } from 'lucide-react';

export type MoreNavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
  isActive: boolean;
};

type MobileMoreSheetProps = {
  items: MoreNavItem[];
  onClose: () => void;
};

/**
 * The bottom bar's overflow.
 *
 * WHY THIS EXISTS. The bar is `flex-1` slots across the full width, so every
 * optional tab makes it narrower for everyone. Four fixed slots plus Song,
 * Notes and Pitches already reached the measured ceiling of seven (~53px each
 * at 375px, against a 48px centre button); Shows would have been the eighth
 * and would have squeezed that button. Rather than keep adding tabs until the
 * bar breaks, the optional GLOBAL surfaces live here and the bar stays a fixed
 * six.
 *
 * Song deliberately stayed a tab (founder call, 2026-08-30 — "put song back in
 * the bottom navigation bar"), so this holds only what was already conditional.
 *
 * Portals to document.body: AppShell's `lazy-fade` wrapper carries a transform
 * that breaks `position: fixed` for every descendant — the same reason every
 * modal in this app portals.
 */
export function MobileMoreSheet({ items, onClose }: MobileMoreSheetProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!isMounted) return null;

  return createPortal(
    // Above the bar (z-30) and below the modals this app opens (z-[170]), so a
    // sheet can never cover a dialog it did not open.
    <div className="fixed inset-0 z-[140] flex flex-col justify-end lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="relative rounded-t-2xl border-t border-stroke-subtle bg-bg-base px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            More
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="motion-focus grid h-9 w-9 place-items-center rounded-full text-content-tertiary hover:text-content-primary"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <ul className="mt-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                aria-current={item.isActive ? 'page' : undefined}
                className={`motion-focus flex h-12 items-center gap-3 rounded-lg px-2 text-sm font-semibold transition-colors ${
                  item.isActive
                    ? 'text-brand'
                    : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                <item.Icon className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
