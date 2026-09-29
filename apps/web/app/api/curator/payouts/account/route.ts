import { NextRequest, NextResponse } from 'next/server';
import { CURATOR_PROFILES_TABLE, flagOffResponse, requireCuratorUser } from '../../_shared';
import {
  PAYOUT_ACCOUNT_COLUMNS,
  consumeResolveAttempt,
  findBank,
  loadCurrentPayoutAccount,
  toCuratorPayoutAccount,
} from '../_shared';
import {
  CURATOR_TERMS_VERSION,
  PITCH_PLATFORM_FEE_BPS,
  accountNameMatches,
  isPitchPaymentsEnabled,
  isValidNubanAccountNumber,
  lastFour,
} from '@/lib/pitch-payments';
import { PAYOUT_ACCOUNTS_TABLE, alertFounderPitchPayments } from '@/lib/pitch-payments-server';
import {
  createPaystackSubaccount,
  resolvePaystackAccount,
  setPaystackSubaccountActive,
} from '@/lib/paystack-server';

/** The curator's current payout account, or null before they have added one. */
export async function GET(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const current = await loadCurrentPayoutAccount(auth.adminClient, auth.user.id);
  if ('error' in current) {
    return NextResponse.json({ error: 'Could not load your bank account.' }, { status: 500 });
  }
  return NextResponse.json({ account: current.row ? toCuratorPayoutAccount(current.row) : null });
}

/**
 * Save a bank account and set up the Paystack subaccount behind it.
 *
 * THE NAME IS RESOLVED AGAIN HERE rather than trusted from the confirmation
 * screen: the client shows the curator a name, but only this call decides what
 * gets stored and matched.
 *
 * A name that matches the curator's profile goes live at once. One that does not
 * (a brand name, a business account, a nickname) waits in 'needs_review' for an
 * admin, and the subaccount is still created now, because approving it later
 * would need the full account number, which is never stored.
 *
 * Changing banks retires the old account and its subaccount. Pitches already
 * paid keep settling to the old one: their split was fixed when they were paid.
 */
export async function POST(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const bankCode = typeof payload.bankCode === 'string' ? payload.bankCode.trim() : '';
  const accountNumber = typeof payload.accountNumber === 'string' ? payload.accountNumber.replace(/\s/g, '') : '';
  if (!bankCode) return NextResponse.json({ error: 'Pick your bank.' }, { status: 400 });
  if (!isValidNubanAccountNumber(accountNumber)) {
    return NextResponse.json({ error: 'Enter your 10-digit account number.' }, { status: 400 });
  }
  if (payload.acceptTerms !== true) {
    return NextResponse.json({ error: 'Read and accept the Curator Terms to get paid.' }, { status: 400 });
  }
  if (payload.termsVersion !== CURATOR_TERMS_VERSION) {
    return NextResponse.json({ error: 'The terms changed. Read them again, then save.' }, { status: 409 });
  }

  const bank = await findBank(auth.adminClient, bankCode);
  if (!bank) return NextResponse.json({ error: 'Pick your bank from the list.' }, { status: 400 });

  const allowed = await consumeResolveAttempt(auth.adminClient, auth.user.id);
  if (!allowed.ok) return allowed.response;

  const resolved = await resolvePaystackAccount(accountNumber, bank.code);
  if (!resolved.ok) {
    return NextResponse.json(
      {
        error: resolved.transient
          ? 'Could not reach the bank right now. Try again in a minute.'
          : "We couldn't find that account. Check the number and the bank.",
      },
      { status: resolved.transient ? 502 : 404 }
    );
  }
  const accountName = resolved.data.accountName;

  const [{ data: curatorProfile }, { data: profile }] = await Promise.all([
    auth.adminClient.from(CURATOR_PROFILES_TABLE).select('display_name').eq('user_id', auth.user.id).maybeSingle(),
    auth.adminClient.from('profiles').select('name').eq('id', auth.user.id).maybeSingle(),
  ]);
  const displayName = String((curatorProfile as Record<string, unknown> | null)?.display_name || '').trim();
  const profileName = String((profile as Record<string, unknown> | null)?.name || '').trim();
  const matches = accountNameMatches(accountName, [displayName, profileName]);

  const subaccount = await createPaystackSubaccount({
    businessName: displayName || accountName,
    bankCode: bank.code,
    accountNumber,
    percentageCharge: PITCH_PLATFORM_FEE_BPS / 100,
    contactEmail: auth.user.email || null,
    contactName: profileName || accountName,
  });
  if (!subaccount.ok) {
    console.error('[curator/payouts] subaccount creation failed', subaccount.message);
    return NextResponse.json(
      { error: 'Paystack could not set up that account. Try again in a minute.' },
      { status: 502 }
    );
  }

  // Retire the old account first: the unique index allows one current account.
  // If the new insert then fails, the old one is put back as it was.
  const previous = await loadCurrentPayoutAccount(auth.adminClient, auth.user.id);
  const previousRow = 'row' in previous ? previous.row : null;
  const now = new Date().toISOString();
  if (previousRow) {
    await auth.adminClient
      .from(PAYOUT_ACCOUNTS_TABLE)
      .update({ status: 'retired', retired_at: now })
      .eq('id', String(previousRow.id));
  }

  const status = matches ? 'active' : 'needs_review';
  const { data: inserted, error: insertError } = await auth.adminClient
    .from(PAYOUT_ACCOUNTS_TABLE)
    .insert({
      curator_user_id: auth.user.id,
      bank_code: bank.code,
      bank_name: bank.name,
      account_last4: lastFour(accountNumber),
      resolved_account_name: accountName,
      paystack_subaccount_code: subaccount.data.subaccountCode,
      status,
      terms_version: CURATOR_TERMS_VERSION,
      terms_accepted_at: now,
      activated_at: matches ? now : null,
    })
    .select(PAYOUT_ACCOUNT_COLUMNS)
    .maybeSingle();

  if (insertError || !inserted) {
    if (previousRow) {
      await auth.adminClient
        .from(PAYOUT_ACCOUNTS_TABLE)
        .update({ status: String(previousRow.status), retired_at: null })
        .eq('id', String(previousRow.id));
    }
    console.error('[curator/payouts] could not save the payout account', insertError?.message);
    return NextResponse.json({ error: 'Could not save your bank account. Try again.' }, { status: 500 });
  }

  const previousCode = previousRow ? String(previousRow.paystack_subaccount_code || '') : '';
  if (previousCode && previousCode !== subaccount.data.subaccountCode) {
    // Awaited: a serverless function can be frozen the moment it answers, so a
    // floating request may never be sent. paystackRequest never throws.
    await setPaystackSubaccountActive(previousCode, false);
  }

  if (!matches) {
    await alertFounderPitchPayments(auth.adminClient, {
      kind: 'payout_needs_review',
      subject: 'Payout account to review',
      headline:
        "A curator's bank account name does not match their profile. No money goes to it until you approve it on the admin page.",
      facts: [
        ['Curator', displayName || 'no display name'],
        ['Profile name', profileName || 'none'],
        ['Name at the bank', accountName],
        ['Bank', `${bank.name} ending ${lastFour(accountNumber)}`],
      ],
      metadata: { curatorUserId: auth.user.id, accountId: String((inserted as Record<string, unknown>).id) },
    });
  }

  return NextResponse.json(
    { account: toCuratorPayoutAccount(inserted as Record<string, unknown>) },
    { status: 201 }
  );
}

/**
 * Stop being paid into this account. Paid pitching stops with it, so the curator
 * goes back to taking free pitches until they add another. Pitches already paid
 * are not affected.
 */
export async function DELETE(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const current = await loadCurrentPayoutAccount(auth.adminClient, auth.user.id);
  if ('error' in current) {
    return NextResponse.json({ error: 'Could not load your bank account.' }, { status: 500 });
  }
  if (!current.row) return NextResponse.json({ account: null });

  const { error } = await auth.adminClient
    .from(PAYOUT_ACCOUNTS_TABLE)
    .update({ status: 'retired', retired_at: new Date().toISOString() })
    .eq('id', String(current.row.id));
  if (error) {
    return NextResponse.json({ error: 'Could not remove your bank account.' }, { status: 500 });
  }

  const code = String(current.row.paystack_subaccount_code || '');
  if (code) await setPaystackSubaccountActive(code, false);

  return NextResponse.json({ account: null });
}
