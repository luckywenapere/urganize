'use client';

import { useDeskAccess } from '@/lib/front-desk/client';
import { DeskGate } from '@/components/front-desk/parts';
import { CuratorPitch } from '@/components/front-desk/CuratorDesk';

export function FrontDeskPitchPage({ pitchId }: { pitchId: string }) {
  const access = useDeskAccess();
  return (
    <DeskGate access={access}>
      {access.state === 'on' ? (
        <CuratorPitch mode={access.isCurator && pitchId !== 'sample' ? 'curator' : 'sample'} curatorName={access.curatorName} pitchId={pitchId} />
      ) : null}
    </DeskGate>
  );
}
