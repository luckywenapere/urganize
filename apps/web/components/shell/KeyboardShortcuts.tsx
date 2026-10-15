'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { askUrgansTarget } from '@/lib/ask-urgans';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { requestComposerFocus } from '@/lib/composer-focus';
import { GO_SEQUENCE_MS, decideGoKey, isBareKey } from '@/lib/keyboard-shortcuts';
import { HOME_HREF } from '@/lib/shell-nav';
import { isTypingTarget } from '@/lib/tasks';
import { useChappiStore } from '@/stores/useChappiStore';
import { useHomeChatStore } from '@/stores/useHomeChatStore';
import { useShellStore } from '@/stores/useShellStore';
import { useShellAreas } from './useShellAreas';

const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

/**
 * G then a key goes to a top-bar area, and / puts the cursor in UrgAns
 * (URG-92, 2026-10-15; the list is in lib/keyboard-shortcuts.ts). Desktop only:
 * a phone has no keyboard to speak of. Never while typing, while ⌘K is open,
 * or while a dialog is up. Mounted beside CommandBar in AppShell.
 *
 * Listens in the capture phase so that G C goes to Catalogue instead of also
 * opening a new activity (the bare C shortcut listens in the bubble phase).
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname() ?? HOME_HREF;
  const areas = useShellAreas();
  const pendingSince = useRef<number | null>(null);
  const latest = useRef({ pathname, areas });
  latest.current = { pathname, areas };

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');

    const goTo = (key: string) => {
      const area = latest.current.areas.find((item) => item.key === key);
      if (!area) return;
      const onHome = latest.current.pathname === HOME_HREF;
      const homeChat = useHomeChatStore.getState();
      if (key === 'urgans') {
        // The same view the UrgAns pill opens: Home's chat full width.
        homeChat.setListCollapsed(true);
        if (!onHome) router.push(HOME_HREF);
        return;
      }
      if (key === 'home') homeChat.setListCollapsed(false);
      if (key === 'catalogue') leaveReleaseForCatalog();
      router.push(area.href);
    };

    const focusUrgans = () => {
      const target = askUrgansTarget(latest.current.pathname, true);
      if (target === 'home-composer') requestComposerFocus();
      else if (target === 'drawer') useChappiStore.getState().setRailOpen(true);
      else router.push('/dashboard/urgans');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!desktop.matches || event.defaultPrevented || event.repeat) return;
      if (isTypingTarget(event.target)) return;
      if (useShellStore.getState().commandOpen) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      // A G pressed long ago no longer starts anything.
      if (pendingSince.current !== null && Date.now() - pendingSince.current > GO_SEQUENCE_MS) {
        pendingSince.current = null;
      }

      if (event.key === '/' && isBareKey(event) && pendingSince.current === null) {
        if (!CHAPPI_ENABLED) return;
        event.preventDefault();
        focusUrgans();
        return;
      }

      const decision = decideGoKey(
        event,
        pendingSince.current,
        Date.now(),
        latest.current.areas.map((area) => area.key)
      );
      if (decision.kind === 'start') {
        pendingSince.current = Date.now();
        event.preventDefault();
      } else if (decision.kind === 'go') {
        pendingSince.current = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        goTo(decision.area);
      } else if (decision.kind === 'cancel') {
        pendingSince.current = null;
        // The key after G belongs to the sequence even when it matched
        // nothing, so it never also opens a new activity.
        if (isBareKey(event)) event.stopImmediatePropagation();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [router]);

  return null;
}
