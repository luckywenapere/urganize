import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/releases/_shared';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { readDeployVersion } from '@/lib/deploy-version';
import { sendEmail } from '@/lib/email';
import { HELP_INBOX, HELP_TOPIC_LABELS, offersSetupCall, parseHelpRequest } from '@/lib/self-serve';

// Self-serve checkout (2026-10-22): the in-app Help. GET says who the reply goes
// to and whether a setup call is offered; POST sends the message to the
// founder's inbox with the team, plan, page and version attached, Reply-To the
// person. Open route (no paywall): a walled team is exactly who needs help.
// Never logs the message, the email or the name.

async function readContext(userId: string, email: string | null) {
  const access = await getTeamAccessForUser(userId, email).catch(() => null);
  const plan = access && access.state === 'paid' ? access.tier : null;
  return { teamName: access?.teamName ?? null, plan };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const context = await readContext(auth.user.id, auth.user.email ?? null);
  return NextResponse.json({
    email: auth.user.email ?? null,
    plan: context.plan,
    offersCall: offersSetupCall(context.plan),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const email = auth.user.email ?? null;
  if (!email) return NextResponse.json({ error: 'Your account has no email for us to reply to.' }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = parseHelpRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Could not send that. Try again.' }, { status: 500 });

  const [context, profile] = await Promise.all([
    readContext(auth.user.id, email),
    admin.from('profiles').select('name').eq('id', auth.user.id).maybeSingle(),
  ]);
  const name = ((profile.data as { name: string | null } | null)?.name ?? '').trim();

  const send = await sendEmail(admin, {
    templateId: 'help_request',
    to: HELP_INBOX,
    trigger: `help_${parsed.value.topic}`,
    replyTo: email,
    props: {
      topicLabel: HELP_TOPIC_LABELS[parsed.value.topic],
      message: parsed.value.message,
      fromLabel: name || email,
      replyEmail: email,
      teamName: context.teamName,
      plan: context.plan,
      pagePath: parsed.value.pagePath,
      version: readDeployVersion().version,
    },
  });
  if (!send.ok) {
    console.error('[help] send failed', send.reason ?? 'error');
    return NextResponse.json({ error: 'Could not send that. Try again, or email support@urganize.app.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
