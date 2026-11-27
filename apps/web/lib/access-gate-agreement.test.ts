import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/team-billing-server', () => ({ invalidateTeamAccess: vi.fn() }));

import { decideAppAccess } from './access-gate';
import { isEmailLetIn } from './access-gate-server';

// #1415 (27 Nov 2026). Two places answer "may this person in?":
//   - decideAppAccess, the gate, asked after the account exists;
//   - isEmailLetIn, asked by the sign-up form BEFORE it makes the account.
// When sign-up opened on 8 Nov only the gate learned about it. The form kept
// answering "invite-only", so nobody without an invite could sign up with an
// email and a password for 19 days, while Google (which skips the form's
// question) worked. This test uses the real SIGNUP_OPEN, whatever it is set to.

/** A database that knows nothing about this email. */
function emptyDatabase() {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'is', 'ilike', 'limit']) builder[method] = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return { from: () => builder } as never;
}

describe('the sign-up form and the gate agree', () => {
  it('never turns away an email the gate would let in', async () => {
    const gate = decideAppAccess({
      approvedAt: null,
      allowlisted: false,
      hasForeignMembership: false,
      hasEmailInvite: false,
    });
    expect(await isEmailLetIn(emptyDatabase(), 'someone.new@example.com')).toBe(gate.allowed);
  });
});
