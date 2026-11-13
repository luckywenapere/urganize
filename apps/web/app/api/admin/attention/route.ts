import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { readAdminAttention } from '@/lib/admin-attention-server';

// GET /api/admin/attention: the admin menu's red counts (2026-11-12, #1241).
// The same head-only counts the Overview reads, so a page can show them in
// the sidebar without building the whole Overview. Read-only; gated by
// ADMIN_EMAILS through verifyAdmin.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const attention = await readAdminAttention(admin.supabaseAdmin as SupabaseClient);
  return NextResponse.json({ attention }, { headers: { 'Cache-Control': 'no-store' } });
}
