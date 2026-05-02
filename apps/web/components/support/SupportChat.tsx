'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

type TawkVisitor = {
  name?: string;
  email?: string;
};

type TawkAttributes = Record<string, string>;

type TawkApi = {
  visitor?: TawkVisitor;
  onLoad?: () => void;
  onUnreadCountChanged?: (count: number) => void;
  onChatMaximized?: () => void;
  onChatMinimized?: () => void;
  hideWidget?: () => void;
  showWidget?: () => void;
  maximize?: () => void;
  minimize?: () => void;
  setAttributes?: (attrs: TawkAttributes, cb?: (error: unknown) => void) => void;
  addEvent?: (event: string, metadata: Record<string, unknown>, cb?: (error: unknown) => void) => void;
};

const TAWK_PROPERTY_ID = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID;
const TAWK_WIDGET_ID = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID;
const TAWK_SRC =
  TAWK_PROPERTY_ID && TAWK_WIDGET_ID
    ? `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`
    : null;

let tawkScriptInjected = false;

function ensureTawkApi(): TawkApi {
  if (typeof window === 'undefined') {
    throw new Error('Tawk_API is only available in the browser');
  }
  if (!window.Tawk_API) {
    window.Tawk_API = {};
  }
  return window.Tawk_API;
}

export function SupportChat() {
  const user = useAuthStore((state) => state.user);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!TAWK_SRC) return;
    if (typeof window === 'undefined') return;

    const api = ensureTawkApi();

    api.onLoad = () => {
      setIsReady(true);
      // Hide Tawk's default bubble — we render our own FAB.
      api.hideWidget?.();
    };

    api.onUnreadCountChanged = (count: number) => {
      setUnreadCount(typeof count === 'number' ? count : 0);
    };

    if (tawkScriptInjected) {
      // Script already in the DOM (e.g., this component re-mounted on route change).
      // If Tawk is already loaded, the onLoad above won't fire again; resync state.
      if (typeof api.hideWidget === 'function') {
        setIsReady(true);
        api.hideWidget();
      }
      return;
    }

    window.Tawk_LoadStart = new Date();
    const script = document.createElement('script');
    script.async = true;
    script.src = TAWK_SRC;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.head.appendChild(script);
    tawkScriptInjected = true;
  }, []);

  // Identify the visitor once the widget is ready and we have a profile.
  useEffect(() => {
    if (!isReady || !user || typeof window === 'undefined') return;
    const api = window.Tawk_API;
    if (!api?.setAttributes) return;

    const displayName =
      user.name?.trim() ||
      user.artist_name?.trim() ||
      (user.email ? user.email.split('@')[0] : 'User');

    const attributes: TawkAttributes = {
      name: displayName,
      email: user.email,
      id: user.id,
      role: String(user.role || ''),
    };
    if (user.artist_name) attributes.artist_name = user.artist_name;

    api.setAttributes(attributes, (error) => {
      if (error) {
        // Free-plan Tawk projects accept name/email without a hash; fail soft.
        console.warn('Tawk.to setAttributes failed', error);
      }
    });
  }, [isReady, user]);

  if (!TAWK_SRC) return null;

  const handleClick = () => {
    if (typeof window === 'undefined') return;
    window.Tawk_API?.maximize?.();
  };

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        unreadCount > 0
          ? `Open support chat — ${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`
          : 'Open support chat'
      }
      className="group fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-900 shadow-[0_10px_28px_-8px_rgba(15,23,42,0.35)] ring-1 ring-black/5 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-10px_rgba(15,23,42,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:translate-y-0 md:bottom-6 md:right-6"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]"
      >
        <path d="M5 3.75A2.25 2.25 0 0 0 2.75 6v10.5A2.25 2.25 0 0 0 5 18.75h3.18l3.27 2.86a.75.75 0 0 0 1.24-.56V18.75H19A2.25 2.25 0 0 0 21.25 16.5V6A2.25 2.25 0 0 0 19 3.75H5Z" />
        <path
          d="M8.5 12.25c.9 1.05 2.16 1.7 3.5 1.7s2.6-.65 3.5-1.7"
          fill="none"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-400 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
          {badgeLabel}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-400 ring-2 ring-white"
        />
      )}
    </button>
  );
}
