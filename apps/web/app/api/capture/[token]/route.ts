import { NextRequest, NextResponse } from 'next/server';
import {
  CAPTURE_TOKEN_SHAPE,
  createCaptureServiceClient,
  isCaptureFeatureEnabled,
} from '@/lib/capture-server';
import { isUsableDestination } from '@/lib/capture-playbook';
import type { CaptureLeadInput } from '@/types/capture';
import { MAX_CAPTURE_LEADS_PER_PAGE } from '@/app/api/releases/[releaseId]/capture/_shared';

// The public capture submit (2026-08-14).
//
// No auth by design: the unguessable share token IS the access control (the
// same trust model as the public EPK and credits pages). Every field is
// re-validated here — CaptureLeadInput is a client-side contract, not a trust
// boundary, since anyone with the link can call this endpoint.
//
// THE DESTINATION URL IS RETURNED ONLY BY THIS ROUTE, never by the page's
// server render. That is the whole exchange: the fan pays with an email and is
// paid with the link, and putting the link in the initial HTML would make the
// page trivially bypassable by anyone who opened view-source.

const RELEASE_CAPTURE_PAGES_TABLE = 'release_capture_pages';
const RELEASE_CAPTURE_LEADS_TABLE = 'release_capture_leads';

// Same shape check the credits route uses. Deliberately loose: the goal is to
// reject obvious junk, not to adjudicate RFC 5322 — a fan whose real address
// this rejects is a lost sign-up, which costs more than a bad row does.
const EMAIL_SHAPE = /\S+@\S+\.\S+/;
const EMAIL_MAX = 200;
const NAME_MAX = 120;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  if (!isCaptureFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { token } = await context.params;
  const normalizedToken = String(token ?? '').trim();
  if (!CAPTURE_TOKEN_SHAPE.test(normalizedToken)) {
    return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 });
  }

  const client = createCaptureServiceClient();
  if (!client) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data: page, error: pageError } = await client
    .from(RELEASE_CAPTURE_PAGES_TABLE)
    .select('id,release_id,owner_user_id,destination_url,destination_label,collect_name,is_paused')
    .eq('share_token', normalizedToken)
    .maybeSingle();

  if (pageError) {
    return NextResponse.json({ error: 'Could not resolve this link.' }, { status: 500 });
  }
  // Never distinguish "rotated" from "never existed" — same contract as the
  // public EPK page.
  if (!page?.release_id) {
    return NextResponse.json({ error: 'This link is no longer active.' }, { status: 404 });
  }

  if (page.is_paused === true) {
    return NextResponse.json(
      { error: 'This list is closed right now. Try again soon.' },
      { status: 409 }
    );
  }

  const destinationUrl = String(page.destination_url || '');
  // Re-checked here rather than trusted from the page render: this is the
  // moment the promise comes due, and collecting an address we cannot pay for
  // is the one outcome this feature must never produce.
  if (!isUsableDestination(destinationUrl)) {
    return NextResponse.json(
      { error: 'This page is not ready yet. Check back shortly.' },
      { status: 409 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as CaptureLeadInput;

  // Lowercased so the unique index on (capture_page_id, email) actually
  // de-duplicates rather than treating Sam@ and sam@ as two people.
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
    .slice(0, EMAIL_MAX);

  if (!email || !EMAIL_SHAPE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const name = String(body.name ?? '')
    .trim()
    .slice(0, NAME_MAX);

  if (page.collect_name === true && !name) {
    return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });
  }

  const capturePageId = String(page.id || '');

  const { count, error: countError } = await client
    .from(RELEASE_CAPTURE_LEADS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('capture_page_id', capturePageId);

  if (countError) {
    return NextResponse.json(
      { error: 'Could not sign you up right now. Please try again.' },
      { status: 500 }
    );
  }
  if ((count || 0) >= MAX_CAPTURE_LEADS_PER_PAGE) {
    return NextResponse.json(
      { error: 'This list is full. Contact the artist directly.' },
      { status: 429 }
    );
  }

  // Upsert on the (capture_page_id, email) unique index: a fan who submits
  // twice — a double tap, or coming back for the link a week later — is one
  // lead and still gets the link. An error here would punish the exact
  // behaviour the page wants to encourage.
  const { error: insertError } = await client.from(RELEASE_CAPTURE_LEADS_TABLE).upsert(
    {
      capture_page_id: capturePageId,
      release_id: String(page.release_id),
      owner_user_id: String(page.owner_user_id || ''),
      email,
      name: name || null,
      consented: body.consented === true,
    },
    { onConflict: 'capture_page_id,email', ignoreDuplicates: false }
  );

  if (insertError) {
    return NextResponse.json(
      { error: 'Could not sign you up right now. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      destinationUrl,
      destinationLabel: String(page.destination_label || ''),
    },
    { status: 201 }
  );
}
