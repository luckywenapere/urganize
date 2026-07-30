import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../_shared';

// Cheap admin check for hub pages that have no heavy data fetch of their
// own (the /admin landing page). Data-bearing admin pages keep using their
// own GET as the gate — this exists so the landing doesn't have to pull a
// full dashboard payload just to learn "yes, you're an admin".
export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;
  return NextResponse.json({ ok: true });
}
