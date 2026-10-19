'use client';

import { useDeskAccess } from '@/lib/front-desk/client';
import { DeskGate } from '@/components/front-desk/parts';
import { TeachUrgAns } from '@/components/front-desk/TeachUrgAns';

// Screen 12. A flagged curator edits their own terms; a flagged account that is
// not a curator (the Flow Test account) sees the approved sample.
export function FrontDeskTeachPage() {
  const access = useDeskAccess();
  return <DeskGate access={access}>{access.state === 'on' ? <TeachUrgAns mode={access.isCurator ? 'curator' : 'sample'} /> : null}</DeskGate>;
}
