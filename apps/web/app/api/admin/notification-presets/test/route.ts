import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../../_shared';
import { sendPushToUsers } from '@/lib/push-server';
import { getNotificationPresets } from '@/lib/notification-presets-server';
import { fillCreditPlaceholders } from '@/lib/credit-notifications';

// "Send test to me" (mobile push notifications, 2026-08-10) — exercises
// whichever transport(s) the admin's own account has registered (Web Push
// subscription, native FCM/APNs token, or both) without touching any other
// user. Reuses the exact copy from the current effective presets so a test
// send is representative of what a real one would look like.

type TestBody = { category?: unknown };

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as TestBody;
  const category = String(body.category || '');
  const client = admin.supabaseAdmin as SupabaseClient;
  const presets = await getNotificationPresets(client);

  let payload: { title: string; body: string; url?: string; tag?: string };
  if (category === 'releaseReminders') {
    const step = presets.releaseReminders.steps[0];
    if (!step) {
      return NextResponse.json({ error: 'No release reminder steps configured.' }, { status: 400 });
    }
    payload = {
      title: step.title,
      body: step.body.replace('{releaseTitle}', 'Test Release'),
      url: '/dashboard',
      tag: 'urganize-test',
    };
  } else if (category === 'motivational') {
    const nudge = presets.motivational.pool[0];
    if (!nudge) {
      return NextResponse.json({ error: 'No motivational nudges configured.' }, { status: 400 });
    }
    payload = { title: nudge.title, body: nudge.body, url: '/dashboard', tag: 'urganize-test' };
  } else if (category === 'deadlineReminders') {
    const copy = presets.deadlineReminders.copy.task_due_soon;
    payload = {
      title: copy.title,
      body: copy.body.replace('{taskTitle}', '“Test Activity”'),
      url: '/dashboard',
      tag: 'urganize-test',
    };
  } else if (category === 'creditSubmissions') {
    const copy = presets.creditSubmissions.copy;
    // Substituted through the same helper the real send uses, so a test push
    // cannot render placeholders differently from the genuine one.
    payload = {
      title: fillCreditPlaceholders(copy.title, {
        collaboratorName: 'Ada Example',
        releaseTitle: 'Test Release',
      }),
      body: fillCreditPlaceholders(copy.body, {
        collaboratorName: 'Ada Example',
        releaseTitle: 'Test Release',
      }),
      url: '/dashboard',
      tag: 'urganize-test',
    };
  } else {
    return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });
  }

  const result = await sendPushToUsers(client, [admin.userId], payload);
  return NextResponse.json({ ok: true, sent: result.sent });
}
