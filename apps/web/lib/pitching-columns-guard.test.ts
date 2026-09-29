import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The two pitch column lists must stay apart, and the curator's must stay
 * narrow.
 *
 * WHY THIS EXISTS, and why now (2026-09-09): the team-side list gained
 * `release_id` when the Pitching page arrived, because that page spans releases
 * and a row has to say which one it belongs to. That makes "these two lists are
 * nearly the same, let us share one constant" a tempting and completely wrong
 * tidy-up — the curator side selects no release id, no owner id and no
 * playlist id ON PURPOSE, so a curator's read path cannot follow anything back
 * into a team's data. Every field their card renders is denormalized onto the
 * pitch row for exactly that reason (see the migration header).
 *
 * A comment cannot stop that edit. This can.
 *
 * Extended 2026-09-25 for the payment columns curator pitch payments added
 * (CURATOR_PITCH_PAYMENT_COLUMNS / SENT_PITCH_PAYMENT_COLUMNS). They are two
 * MORE lists that happen to read identically today — both are just
 * `payment_kind,response_due_at` — which is the exact same "share one constant"
 * temptation the base pair already carries, and the exact same reason not to:
 * the base pair proves that identical-looking lists genuinely diverge once a
 * side gets a field the other must never have (release_id landed on the team
 * side and nowhere near the curator side). Nothing stops a future payment field
 * from doing the same.
 *
 * It reads the real source rather than importing the constants: the curator
 * module pulls in server-only auth helpers, and the property under test is
 * textual anyway.
 */

const readSource = (relative: string): string =>
  readFileSync(join(process.cwd(), relative), 'utf8');

/** The `select(...)` string a module assigns to one exported constant. */
function columnList(source: string, constant: string): string {
  const match = new RegExp(`export const ${constant}\\s*(?::[^=]*)?=\\s*\\n?\\s*'([^']*)'`).exec(
    source
  );
  if (!match) throw new Error(`Could not find ${constant} — did it move or change shape?`);
  return match[1];
}

describe('pitch column lists', () => {
  const curatorSource = readSource('app/api/curator/_shared.ts');
  const teamSource = readSource('app/api/pitching/_shared.ts');
  const curator = columnList(curatorSource, 'CURATOR_PITCH_COLUMNS');
  const team = columnList(teamSource, 'SENT_PITCH_COLUMNS');
  const curatorPayment = columnList(curatorSource, 'CURATOR_PITCH_PAYMENT_COLUMNS');
  const teamPayment = columnList(teamSource, 'SENT_PITCH_PAYMENT_COLUMNS');

  it('never lets the curator read a release, owner or playlist id', () => {
    for (const forbidden of ['release_id', 'owner_user_id', 'playlist_id', 'created_by']) {
      expect(curator.split(',')).not.toContain(forbidden);
    }
  });

  it('keeps the two lists separate rather than sharing one', () => {
    expect(curator).not.toBe(team);
  });

  // The team side genuinely needs it: without release_id the team-wide list
  // cannot group by release or check per-release access.
  it('does give the team the release id it groups and filters by', () => {
    expect(team.split(',')).toContain('release_id');
  });

  // What the curator DOES need, so a narrowing that broke their inbox would
  // fail here too rather than shipping an empty card.
  it('still gives the curator everything their card renders', () => {
    for (const needed of ['song_title', 'artist_name', 'pitcher_name', 'status', 'note']) {
      expect(curator.split(',')).toContain(needed);
    }
  });

  // The payment additions carry the same base-pair invariant: whatever the
  // curator's own payment columns add, none of it may be a release, owner or
  // playlist id.
  it('never lets the curator payment columns read a release, owner or playlist id', () => {
    for (const forbidden of ['release_id', 'owner_user_id', 'playlist_id', 'created_by']) {
      expect(curatorPayment.split(',')).not.toContain(forbidden);
    }
  });

  // What each side's card needs from the payment fields: the curator needs the
  // deadline to enforce and display; the team needs to know a pitch was paid
  // for at all (it reads what was actually paid from pitch_payments separately,
  // never from this list).
  it('gives each side response_due_at, which both need to show a deadline', () => {
    expect(curatorPayment.split(',')).toContain('response_due_at');
    expect(teamPayment.split(',')).toContain('response_due_at');
  });

  it('gives each side payment_kind, so a free pitch never reads as paid', () => {
    expect(curatorPayment.split(',')).toContain('payment_kind');
    expect(teamPayment.split(',')).toContain('payment_kind');
  });
});
