import { NextRequest, NextResponse } from 'next/server';
import { internalAccountEmails, verifyAdmin } from '../_shared';
import { loadBillingMargin } from '@/lib/billing-margin-server';

// GET /api/admin/billing (founder, 2026-10-22). The margin view: every paying
// team's month (cash, Paystack fee estimate, what we owe TRM, credit cost,
// contribution) and the totals. ADMIN_EMAILS only (verifyAdmin). Read only.
// Our own accounts are left out with internalAccountEmails, like every admin
// page. Rules: lib/billing-margin.ts; reads: lib/billing-margin-server.ts.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;
  const internal = internalAccountEmails();
  const view = await loadBillingMargin(adminResult.supabaseAdmin, {
    now: new Date(),
    isInternalEmail: (email) => internal.has(email),
  });
  return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
}
