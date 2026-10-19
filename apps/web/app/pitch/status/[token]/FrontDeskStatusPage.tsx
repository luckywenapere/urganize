'use client';

import { useDeskAccess } from '@/lib/front-desk/client';
import { DeskGate } from '@/components/front-desk/parts';
import { StatusAsk } from '@/components/front-desk/StatusAsk';
import { SAMPLE_STATUS_TOKEN } from '@/lib/front-desk/sample';

// Screen 14. Real no-login status links (screens 8–9) are not built yet, so only
// the sample token renders, and only for the flagged preview account. Any other
// token is the same calm "not here" as the flag being off: nothing is looked up.
export function FrontDeskStatusPage({ token }: { token: string }) {
  const access = useDeskAccess();
  const gated = token === SAMPLE_STATUS_TOKEN ? access : access.state === 'loading' ? access : ({ state: 'off' } as const);
  return <DeskGate access={gated}>{gated.state === 'on' ? <StatusAsk /> : null}</DeskGate>;
}
