'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL param that opens the Chappi slide-in panel on the catalog (`/dashboard`
 * desktop). Peer of `?release=` (see `useReleaseScope.ts`) — both live on the
 * same URL so the split view is shareable and survives a refresh.
 */
const CHAT_PARAM = 'chat';

export type ChatPanel = {
  isChatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
};

/**
 * Read/write the `?chat=1` search param via the App Router. Open pushes a
 * new history entry (so browser Back closes the panel, mirroring the mobile
 * drill-in pattern in `useReleaseScope`); close replaces (so repeated
 * open/close cycles don't pile up history). Both preserve every other param,
 * in particular `?release=`.
 */
export function useChatPanel(): ChatPanel {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isChatOpen = Boolean(searchParams.get(CHAT_PARAM));

  const openChat = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(CHAT_PARAM, '1');
    const query = params.toString();
    router.push(`${pathname ?? ''}${query ? `?${query}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const closeChat = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(CHAT_PARAM);
    const query = params.toString();
    router.replace(`${pathname ?? ''}${query ? `?${query}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const toggleChat = useCallback(() => {
    if (isChatOpen) {
      closeChat();
    } else {
      openChat();
    }
  }, [isChatOpen, closeChat, openChat]);

  return { isChatOpen, openChat, closeChat, toggleChat };
}
