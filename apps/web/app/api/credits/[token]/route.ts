import { NextRequest, NextResponse } from 'next/server';
import {
  CREDIT_TOKEN_SHAPE,
  createCreditsServiceClient,
  isMetadataFeatureEnabled,
} from '@/lib/credits-server';
import { RELEASE_CREDIT_ROLE_OPTIONS } from '@/types/credits';
import type { CreditSubmissionInput, ReleaseCreditRole } from '@/types/credits';

const RELEASE_CREDIT_LINKS_TABLE = 'release_credit_links';
const RELEASE_CREDIT_SUBMISSIONS_TABLE = 'release_credit_submissions';

// No auth on this route by design: the unguessable share token IS the access
// control (the same trust model as the public EPK page). Every field is
// re-validated here — CreditSubmissionInput is a client-side contract, not a
// trust boundary, since anyone with the link can call this endpoint.

const EMAIL_SHAPE = /\S+@\S+\.\S+/;
const ROLE_SET = new Set<string>(RELEASE_CREDIT_ROLE_OPTIONS);
// A link is meant for a release's handful of collaborators, not an
// open-ended firehose. Cheap ceiling, not a rate limiter.
const MAX_SUBMISSIONS_PER_RELEASE = 100;
const SHORT_FIELD_MAX = 200;
const LONG_FIELD_MAX = 500;

const readString = (value: unknown): string => String(value ?? '').trim();
const readCappedString = (value: unknown, max: number): string => readString(value).slice(0, max);

function readSplit(value: unknown): { value: number | null; error?: string } {
  if (value === null || value === undefined || value === '') return { value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { value: null, error: 'Splits must be a number between 0 and 100.' };
  }
  return { value: parsed };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  if (!isMetadataFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { token } = await context.params;
  const normalizedToken = readString(token);
  if (!CREDIT_TOKEN_SHAPE.test(normalizedToken)) {
    return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 });
  }

  const client = createCreditsServiceClient();
  if (!client) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data: link, error: linkError } = await client
    .from(RELEASE_CREDIT_LINKS_TABLE)
    .select('release_id,owner_user_id')
    .eq('share_token', normalizedToken)
    .maybeSingle();

  if (linkError) {
    return NextResponse.json({ error: 'Could not resolve this link.' }, { status: 500 });
  }
  // Never distinguish "revoked" from "never existed" — same contract as the
  // public EPK page.
  if (!link?.release_id) {
    return NextResponse.json({ error: 'This link is no longer active.' }, { status: 404 });
  }

  const releaseId = String(link.release_id);
  const ownerUserId = String(link.owner_user_id || '');

  const body = (await request.json().catch(() => ({}))) as CreditSubmissionInput;

  const legalName = readCappedString(body.legalName, SHORT_FIELD_MAX);
  const email = readCappedString(body.email, SHORT_FIELD_MAX);
  const roles = (Array.isArray(body.roles) ? body.roles : []).filter(
    (role): role is ReleaseCreditRole => typeof role === 'string' && ROLE_SET.has(role)
  );

  if (!legalName) {
    return NextResponse.json({ error: 'Legal name is required.' }, { status: 400 });
  }
  if (roles.length === 0) {
    return NextResponse.json({ error: 'Select at least one role.' }, { status: 400 });
  }
  if (!email || !EMAIL_SHAPE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }
  if (body.confirmedAccurate !== true) {
    return NextResponse.json(
      { error: 'Please confirm this information is accurate.' },
      { status: 400 }
    );
  }

  const songwriterSplit = readSplit(body.songwriterSplit);
  if (songwriterSplit.error) {
    return NextResponse.json({ error: songwriterSplit.error }, { status: 400 });
  }
  const masterSplit = readSplit(body.masterSplit);
  if (masterSplit.error) {
    return NextResponse.json({ error: masterSplit.error }, { status: 400 });
  }

  const { count, error: countError } = await client
    .from(RELEASE_CREDIT_SUBMISSIONS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId);

  if (countError) {
    return NextResponse.json(
      { error: 'Could not submit right now. Please try again.' },
      { status: 500 }
    );
  }
  if ((count || 0) >= MAX_SUBMISSIONS_PER_RELEASE) {
    return NextResponse.json(
      { error: 'This release has reached its submission limit. Contact the release owner directly.' },
      { status: 429 }
    );
  }

  const insertResult = await client
    .from(RELEASE_CREDIT_SUBMISSIONS_TABLE)
    .insert({
      release_id: releaseId,
      owner_user_id: ownerUserId,
      legal_name: legalName,
      stage_name: readCappedString(body.stageName, SHORT_FIELD_MAX) || null,
      roles,
      contribution: readCappedString(body.contribution, LONG_FIELD_MAX) || null,
      email,
      phone: readCappedString(body.phone, SHORT_FIELD_MAX) || null,
      country: readCappedString(body.country, SHORT_FIELD_MAX) || null,
      songwriter_split: songwriterSplit.value,
      pro_affiliation: readCappedString(body.proAffiliation, SHORT_FIELD_MAX) || null,
      ipi_number: readCappedString(body.ipiNumber, SHORT_FIELD_MAX) || null,
      publisher_name: readCappedString(body.publisherName, SHORT_FIELD_MAX) || null,
      publisher_ipi: readCappedString(body.publisherIpi, SHORT_FIELD_MAX) || null,
      master_split: masterSplit.value,
      instagram_handle: readCappedString(body.instagramHandle, SHORT_FIELD_MAX) || null,
      x_handle: readCappedString(body.xHandle, SHORT_FIELD_MAX) || null,
      bio: readCappedString(body.bio, LONG_FIELD_MAX) || null,
      confirmed_accurate: true,
    })
    .select('id')
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    return NextResponse.json(
      { error: insertResult.error?.message || 'Could not submit your credit.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
