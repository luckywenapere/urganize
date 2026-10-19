'use client';

import { useDeskAccess } from '@/lib/front-desk/client';
import { DeskGate } from '@/components/front-desk/parts';
import { AskAboutPitch } from '@/components/front-desk/AskAboutPitch';

// Screens 13 + 15, inside the app chrome (the nav is the shell's, untouched).
export function FrontDeskAskPage({ pitchId }: { pitchId: string }) {
  const access = useDeskAccess();
  return (
    <DeskGate access={access} standalone={false}>
      {access.state === 'on' ? <AskAboutPitch pitchId={pitchId} /> : null}
    </DeskGate>
  );
}
