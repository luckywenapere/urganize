import { NextRequest, NextResponse } from 'next/server';
import {
  CREDIT_TOKEN_SHAPE,
  createCreditsServiceClient,
  isMetadataFeatureEnabled,
} from '@/lib/credits-server';
import { findSubmissionIdByEmail, validateSubmissionSplits } from '@/lib/credit-submissions';
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
// open-ended firehose. Cheap ceiling, not a rate limiter. Checked on the
// INSERT path only: a full release must still accept a correction from
// someone who already submitted, since that adds no row.
const MAX_SUBMISSIONS_PER_RELEASE = 100;
const SHORT_FIELD_MAX = 200;
const LONG_FIELD_MAX = 500;

const readString = (value: unknown): string => String(value ?? '').trim();
const readCappedString = (value: unknown, max: number): string => readString(value).slice(0, max);

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
    .select('release_id,owner_user_id,closed_at')
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

  // Checked BEFORE the body is even read: someone who loaded the form while the
  // link was open and submits after the owner closed it must be told the link
  // closed, not nitpicked about a field. The form renders this string verbatim.
  if (link.closed_at) {
    return NextResponse.json(
      {
        error:
          'This request is closed. The release team is not collecting credits through this link right now.',
      },
      { status: 403 }
    );
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

  // Splits are required for writers and producers and capped at one decimal
  // place — both rules live in lib/credit-submissions.ts so the form and this
  // route can never disagree about them.
  const splits = validateSubmissionSplits({
    roles,
    songwriterSplit: body.songwriterSplit,
    masterSplit: body.masterSplit,
  });
  if (!splits.ok) {
    return NextResponse.json({ error: splits.error }, { status: 400 });
  }

  const row = {
    release_id: releaseId,
    owner_user_id: ownerUserId,
    legal_name: legalName,
    stage_name: readCappedString(body.stageName, SHORT_FIELD_MAX) || null,
    roles,
    contribution: readCappedString(body.contribution, LONG_FIELD_MAX) || null,
    email,
    phone: readCappedString(body.phone, SHORT_FIELD_MAX) || null,
    country: readCappedString(body.country, SHORT_FIELD_MAX) || null,
    songwriter_split: splits.songwriterSplit,
    pro_affiliation: readCappedString(body.proAffiliation, SHORT_FIELD_MAX) || null,
    ipi_number: readCappedString(body.ipiNumber, SHORT_FIELD_MAX) || null,
    publisher_name: readCappedString(body.publisherName, SHORT_FIELD_MAX) || null,
    publisher_ipi: readCappedString(body.publisherIpi, SHORT_FIELD_MAX) || null,
    master_split: splits.masterSplit,
    instagram_handle: readCappedString(body.instagramHandle, SHORT_FIELD_MAX) || null,
    x_handle: readCappedString(body.xHandle, SHORT_FIELD_MAX) || null,
    bio: readCappedString(body.bio, LONG_FIELD_MAX) || null,
    confirmed_accurate: true,
  };

  // Same email on the same release = the same person correcting themselves, so
  // the earlier answer is UPDATED rather than duplicated (founder spec,
  // 2026-08-27). Before this, one person submitting twice at 50% each made the
  // owner's writing-share total read 100% with only one contributor credited.
  //
  // Select-then-update-or-insert rather than .upsert(): supabase-js hands
  // `onConflict` to PostgREST as a plain COLUMN LIST, so it cannot target the
  // partial expression index this relies on — `(release_id, lower(email))
  // where email is not null`. The index is still what makes the concurrent
  // case safe: a racing insert fails 23505 and is retried as an update below.
  const findExisting = async (): Promise<string | null> => {
    const { data, error } = await client
      .from(RELEASE_CREDIT_SUBMISSIONS_TABLE)
      .select('id,email')
      .eq('release_id', releaseId);
    if (error) throw error;
    return findSubmissionIdByEmail(
      (data || []).map((item) => ({
        id: String((item as { id?: unknown }).id || ''),
        email: ((item as { email?: unknown }).email ?? null) as string | null,
      })),
      email
    );
  };

  const updateExisting = async (submissionId: string): Promise<boolean> => {
    // created_at is deliberately untouched (their place in the owner's list is
    // when they FIRST answered) and updated_at is bumped by the table's own
    // set_updated_at trigger.
    const { data, error } = await client
      .from(RELEASE_CREDIT_SUBMISSIONS_TABLE)
      .update(row)
      .eq('id', submissionId)
      .eq('release_id', releaseId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  };

  try {
    const existingId = await findExisting();
    if (existingId && (await updateExisting(existingId))) {
      return NextResponse.json({ ok: true, updated: true });
    }

    // Insert path: the ceiling applies here only.
    const { count, error: countError } = await client
      .from(RELEASE_CREDIT_SUBMISSIONS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('release_id', releaseId);
    if (countError) throw countError;
    if ((count || 0) >= MAX_SUBMISSIONS_PER_RELEASE) {
      return NextResponse.json(
        {
          error:
            'This release has reached its submission limit. Contact the release owner directly.',
        },
        { status: 429 }
      );
    }

    const insertResult = await client
      .from(RELEASE_CREDIT_SUBMISSIONS_TABLE)
      .insert(row)
      .select('id')
      .maybeSingle();

    if (insertResult.error) {
      // Two submissions with the same email landed at once; the index rejected
      // the loser. Retry as the update it should have been.
      if (insertResult.error.code === '23505') {
        const racedId = await findExisting();
        if (racedId && (await updateExisting(racedId))) {
          return NextResponse.json({ ok: true, updated: true });
        }
      }
      throw insertResult.error;
    }
    if (!insertResult.data) {
      return NextResponse.json({ error: 'Could not submit your credit.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: false }, { status: 201 });
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';
    console.error('[credits] submission failed', { releaseId, message });
    return NextResponse.json(
      { error: 'Could not submit right now. Please try again.' },
      { status: 500 }
    );
  }
}
