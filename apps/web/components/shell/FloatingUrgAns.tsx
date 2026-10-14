'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { useChappiStore } from '@/stores/useChappiStore';
import { useShellStore } from '@/stores/useShellStore';

// The chat card is heavy and is only ever needed once the button has been
// pressed, so it is its own chunk and is not requested until then.
const ChappiSidePanel = dynamic(
  () => import('@/components/chappi/ChappiSidePanel').then((m) => m.ChappiSidePanel),
  { ssr: false }
);

/**
 * 2026-10-15 (founder): the round bottom-right button is gone now that UrgAns
 * has its own pill in the desktop top bar (TopNav). The drawer stays: "Ask
 * UrgAns" in the search bar still opens it over the page (lib/ask-urgans.ts),
 * and it closes from its own header.
 *
 * Originally: UrgAns on every screen (strategy doc: "UrgAns has an entry point on every
 * screen"). A round button at the bottom right opens the chat in a drawer over
 * the page, so asking never costs the manager the screen they were on.
 *
 * Desktop only. A phone has UrgAns in its bottom bar as a full page, because a
 * drawer on a phone is a full page anyway and the bottom-right corner is the
 * place a thumb is most likely to catch by accident. The assistant's own page
 * does not get the button either: it IS the chat.
 *
 * The drawer reuses the existing chat card whole (history, scope picker,
 * confirmation cards, credits line), driven by the same store the assistant page
 * uses, so a conversation started here continues there.
 *
 * Deliberately NO Escape-to-close: the assistant opens modals that close on
 * Escape themselves, and a second handler here would close both.
 */
export function FloatingUrgAns() {
  const pathname = usePathname() ?? '';
  const open = useChappiStore((state) => state.railOpen);
  const openCreate = useShellStore((state) => state.openCreate);
  // Keeps the chat mounted after its first open so a closed drawer does not
  // lose the transcript's scroll, an upload card or a reply still on its way.
  const [everOpened, setEverOpened] = useState(false);
  if (open && !everOpened) setEverOpened(true);

  // Home and the assistant's own page are the chat already.
  if (pathname === '/dashboard/urgans' || pathname === '/dashboard/home') return null;

  return (
    <div className="hidden lg:block">
      {everOpened ? (
        <ErrorBoundary name="urgans-drawer" onError={reportBoundaryError}>
          <aside
            aria-label="UrgAns assistant"
            aria-hidden={!open}
            inert={!open}
            className={`fixed bottom-6 right-6 top-[88px] z-[60] flex w-[min(440px,calc(100vw-3rem))] flex-col transition-[opacity,transform] duration-slow ease-standard ${
              open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
            }`}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl shadow-lg">
              <ChappiSidePanel open={open} onNewRelease={openCreate} />
            </div>
          </aside>
        </ErrorBoundary>
      ) : null}
    </div>
  );
}
