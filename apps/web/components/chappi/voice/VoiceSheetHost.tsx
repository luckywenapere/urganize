'use client';

import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useVoiceCallStore } from '@/stores/useVoiceCallStore';
import { VoiceSheet } from './VoiceSheet';

/** The one Talk to UrgAns sheet, mounted by AppShell behind the flag. */
export function VoiceSheetHost() {
  const open = useVoiceCallStore((state) => state.open);
  const releaseScope = useVoiceCallStore((state) => state.releaseScope);
  const close = useVoiceCallStore((state) => state.close);
  const name = useAuthStore((state) => state.user?.name ?? null);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const firstName = name ? name.trim().split(/\s+/)[0] ?? null : null;

  return (
    <VoiceSheet
      open={open}
      onClose={close}
      releaseScope={releaseScope}
      firstName={firstName}
      // A call only refreshes what is on screen; it never navigates away from itself.
      onClientActions={(actions) => {
        if (actions.some((action) => action.type === 'refresh')) void loadCommandCenter({ force: true });
      }}
    />
  );
}
