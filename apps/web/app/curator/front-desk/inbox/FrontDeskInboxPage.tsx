'use client';

import { useDeskAccess } from '@/lib/front-desk/client';
import { DeskGate } from '@/components/front-desk/parts';
import { CuratorInbox } from '@/components/front-desk/CuratorDesk';

export function FrontDeskInboxPage() {
  const access = useDeskAccess();
  return (
    <DeskGate access={access}>
      {access.state === 'on' ? <CuratorInbox mode={access.isCurator ? 'curator' : 'sample'} curatorName={access.curatorName} /> : null}
    </DeskGate>
  );
}
