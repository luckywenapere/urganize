import { NextRequest, NextResponse } from 'next/server';
import { flagOffResponse, requireCuratorUser } from '../../_shared';
import { consumeResolveAttempt, findBank } from '../_shared';
import { isPitchPaymentsEnabled, isValidNubanAccountNumber } from '@/lib/pitch-payments';
import { resolvePaystackAccount } from '@/lib/paystack-server';

/**
 * Look up the name on a bank account, so the curator can confirm it is theirs.
 * Returns the NAME ONLY. Rate limited to ten an hour per curator, because a
 * name lookup by account number is exactly the kind of thing that must not be
 * unlimited (see consumeResolveAttempt).
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

  return NextResponse.json({ accountName: resolved.data.accountName, bankName: bank.name });
}
