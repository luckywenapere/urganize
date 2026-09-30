import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../_shared';
import { loadSequenceOverview } from '@/lib/email/sequence-server';
import { budgetPayload } from '../_compose';

/**
 * GET /api/admin/emails/sequence — the onboarding sequence for its admin page:
 * whether it is switched on, each of the five emails, and how many of each have
 * gone out or are waiting.
 *
 * Admin only (ADMIN_EMAILS). Read only: the switch is the
 * EMAIL_ONBOARDING_SEQUENCE env var, not a button, so turning it on is a
 * deliberate deploy rather than a stray click.
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const [overview, budget] = await Promise.all([
    loadSequenceOverview(admin.supabaseAdmin),
    budgetPayload(admin.supabaseAdmin),
  ]);
  return NextResponse.json({ ...overview, budget });
}
