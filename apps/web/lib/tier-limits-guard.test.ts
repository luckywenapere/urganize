import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PRICING_TIERS } from '@urganize/pricing';
import type { PricingTierId } from '@urganize/pricing';
import { isSelfServeTier, purchasableTiers } from './billing-plans';
import { checkLimit, type CountableLimitKey } from './entitlements';

// Every countable ceiling, on three axes: it passes at the limit, it refuses
// past it, and the refusal lives on the SERVER.
//
// WHY THE THIRD AXIS IS A SOURCE SCAN RATHER THAN A REQUEST. This repo has no
// component tests and cannot get one: vitest runs `environment: 'node'`, there
// is no jsdom dependency, and the collection globs are `lib/**/*.test.ts` and
// `app/**/*.test.ts`. There is also no database reachable from CI. So "the
// client cannot bypass this" cannot be shown by driving a UI and watching a
// request get refused.
//
// It can be shown STRUCTURALLY, and arguably better: assert that every place a
// limited thing gets created calls the server-side allowance helper. A UI test
// proves one path is guarded on one day; this proves every path is guarded, and
// fails when someone adds a new door. That is the same reasoning
// lib/release-access-guard.test.ts and lib/account-export.test.ts already run
// on, and this file borrows their comment-stripping so a mention in prose can
// never satisfy a check.
//
// The fourth block is the inverse, and it is the one protecting the shows and
// pitching features: prove the external-contact paths are NOT seat-checked.
//
// Mutation-tested (2026-09-01), each independently:
//   - dropping `checkSeatAllowance` from the invite-link route fails the
//     enforcement sweep;
//   - adding a `checkSeatAllowance` call to the DJ pack recipients route fails
//     the external-contact block;
//   - pointing the seat counter at a table other than workspace_members fails
//     the counter block;
//   - a COMMENT naming a helper does not satisfy any usage check.

const APP_ROOT = join(__dirname, '..');

const read = (relative: string): string => readFileSync(join(APP_ROOT, relative), 'utf8');

/** Comments stripped before matching, so prose mentioning a helper cannot pass
 *  for calling it — and so a comment mentioning a banned helper cannot fail. */
const stripComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const source = (relative: string): string => stripComments(read(relative));

// ─────────────────────────────────────────────────────────────────────────────
// 1. At the limit, and past it
// ─────────────────────────────────────────────────────────────────────────────
//
// `current` is the count BEFORE the thing being added, which is how every
// caller passes it. So a tier with a ceiling of N accepts `current = N - 1` and
// refuses `current = N`.

const CAPPED_TIERS: PricingTierId[] = ['solo', 'manager'];

const LIMIT_KEYS: Array<{ key: CountableLimitKey; field: keyof typeof PRICING_TIERS.solo.limits }> =
  [
    { key: 'artists', field: 'artists' },
    { key: 'seats', field: 'seats' },
    { key: 'active_releases', field: 'activeReleases' },
    { key: 'urgans_monthly_actions', field: 'urgansMonthlyActions' },
  ];

describe('every countable ceiling passes at the limit and refuses past it', () => {
  for (const tier of CAPPED_TIERS) {
    for (const { key, field } of LIMIT_KEYS) {
      const limit = PRICING_TIERS[tier].limits[field];

      it(`${tier}/${key}: the last one allowed is allowed`, () => {
        // A capped tier with a ceiling of 1 has no "one below" to test other
        // than zero, which is the real first-use case and worth asserting.
        expect(limit).not.toBeNull();
        const verdict = checkLimit({ tier, key, current: (limit as number) - 1 });
        expect(verdict.allowed).toBe(true);
      });

      it(`${tier}/${key}: the next one is refused, and the refusal says what to do`, () => {
        const verdict = checkLimit({ tier, key, current: limit as number });
        expect(verdict.allowed).toBe(false);
        if (verdict.allowed) throw new Error('expected a refusal');

        // The number in the message comes from the limit, never a literal, so a
        // re-cut tier cannot leave the copy lying.
        expect(verdict.message).toContain(String(limit));
        // And it names the tier that lifts it, so the refusal is actionable.
        // Case-insensitive because the release message puts the upgrade second,
        // after the thing the manager can do alone right now ("Archive one you
        // have finished, or upgrade to Label") — which is the better order and
        // should not be flattened just to make this assertion simpler.
        expect(verdict.message).toMatch(/upgrade to Label/i);
        expect(verdict.limit).toBe(limit);
        expect(verdict.key).toBe(key);
      });
    }
  }

  // The uncapped tiers are the safety property the whole enforcement layer
  // rests on: everything the resolver cannot confidently place lands on one of
  // these, so a wrong answer grants rather than refuses.
  it('never refuses an uncapped tier, at any count', () => {
    for (const tier of ['label', 'enterprise'] as PricingTierId[]) {
      for (const { key } of LIMIT_KEYS) {
        expect(checkLimit({ tier, key, current: 10_000 }).allowed, `${tier}/${key}`).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The refusal is server-side, at EVERY creation point
// ─────────────────────────────────────────────────────────────────────────────
//
// The list is explicit rather than a directory walk, because "which routes can
// create a limited thing" is a judgement that should require an edit when it
// changes. Each entry names the door and the helper that has to guard it.

const ENFORCEMENT_POINTS: Array<{
  what: CountableLimitKey;
  door: string;
  file: string;
  helper: string;
}> = [
  // Seats have THREE doors. Missing any one leaves the ceiling bypassable, and
  // the third was added 2026-09-01 so a refusal reaches the person who can act
  // on it rather than the invitee who cannot.
  {
    what: 'seats',
    door: 'invite one teammate by email',
    file: 'app/api/workspace/members/invite/route.ts',
    helper: 'checkSeatAllowance',
  },
  {
    what: 'seats',
    door: 'mint a shareable sign-in link',
    file: 'app/api/workspace/invite-link/route.ts',
    helper: 'checkSeatAllowance',
  },
  {
    what: 'seats',
    door: 'redeem a shareable sign-in link',
    file: 'lib/invite-claims-server.ts',
    helper: 'checkSeatAllowance',
  },
  // Artists have TWO doors: the button in Settings, and naming an unseen artist
  // on release creation, which mints one.
  {
    what: 'artists',
    door: 'add an artist from Settings',
    file: 'app/api/workspace/artists/route.ts',
    helper: 'checkArtistAllowance',
  },
  {
    what: 'artists',
    door: 'name a new artist while creating a release',
    file: 'app/api/releases/route.ts',
    helper: 'checkArtistAllowance',
  },
  {
    what: 'active_releases',
    door: 'create a release',
    file: 'app/api/releases/route.ts',
    helper: 'checkActiveReleaseAllowance',
  },
  {
    what: 'urgans_monthly_actions',
    door: 'take an assistant turn',
    file: 'app/api/urgans/route.ts',
    helper: 'checkUrgansAllowance',
  },
];

describe('every creation point enforces its ceiling on the server', () => {
  it.each(ENFORCEMENT_POINTS)('$what — $door', ({ file, helper }) => {
    const body = source(file);
    // Called, not merely imported: a bare import satisfies a naive grep while
    // the check sits dead. Requiring the call parenthesis is what distinguishes
    // them.
    expect(body).toContain(`${helper}(`);
  });

  it('records the hit, so a ceiling reached is a buy signal rather than silence', () => {
    // Every refusal path logs a `limit_hit` billing event. These rows are the
    // clearest upgrade intent the product produces, and a refusal that records
    // nothing is a sale nobody hears about.
    for (const { file } of ENFORCEMENT_POINTS) {
      expect(source(file), file).toContain('recordLimitHit(');
    }
  });

  it('strips comments before matching (guards this guard)', () => {
    expect(stripComments('// checkSeatAllowance(x)\nconst a = 1;')).not.toContain(
      'checkSeatAllowance('
    );
    expect(stripComments('/* checkSeatAllowance(x) */')).not.toContain('checkSeatAllowance(');
    expect(stripComments('checkSeatAllowance(x)')).toContain('checkSeatAllowance(');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2b. A tier is never offered before it can be charged
// ─────────────────────────────────────────────────────────────────────────────
//
// The other half of enforcement, and the one that protects the customer rather
// than the revenue: `purchasableTiers()` is what the wall renders, and it must
// only ever name a tier whose Paystack Plan codes are really configured.
//
// Four times in this repo's history a price has been advertised that nothing
// could charge. Every previous fix was a note about minting Plans first; this
// function is meant to make the order of operations unnecessary.

describe('purchasableTiers only names tiers this deployment can charge', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('offers nothing when no Plan codes are set', () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('PAYSTACK_PLAN_')) delete process.env[key];
    }
    expect(purchasableTiers()).toEqual([]);
  });

  it('offers a tier only once BOTH of its intervals are configured', () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('PAYSTACK_PLAN_')) delete process.env[key];
    }

    // Monthly alone is not enough. The wall's interval toggle is always live, so
    // a half-configured tier just moves the failure one click later.
    process.env.PAYSTACK_PLAN_SOLO_MONTHLY_NGN = 'PLN_solo_monthly';
    expect(purchasableTiers()).toEqual([]);

    process.env.PAYSTACK_PLAN_SOLO_YEARLY_NGN = 'PLN_solo_annual';
    expect(purchasableTiers()).toEqual(['solo']);
  });

  it('keeps pricing-page order, cheapest first', () => {
    process.env.PAYSTACK_PLAN_SOLO_MONTHLY_NGN = 'PLN_a';
    process.env.PAYSTACK_PLAN_SOLO_YEARLY_NGN = 'PLN_b';
    process.env.PAYSTACK_PLAN_MANAGER_MONTHLY_NGN = 'PLN_c';
    process.env.PAYSTACK_PLAN_MANAGER_YEARLY_NGN = 'PLN_d';
    expect(purchasableTiers()).toEqual(['solo', 'manager']);
  });

  // A SALES-LED TIER IS KEPT OUT BY TWO INDEPENDENT THINGS, and this asserts
  // them separately because only one of them can be exercised from a test.
  //
  // Said plainly after mutation-testing this block: deleting the
  // `isSelfServeTier(tier)` guard from purchasableTiers() does NOT fail any
  // test, because Label has no entry in TIER_PLAN_CODE_ENV_VAR (its mapping
  // moved to RETIRED_TIER_PLAN_CODE_ENV_VAR, which getTierPaystackPlanCode
  // does not read) and Group is absent from PRICING_TIER_ORDER. So today the
  // env mapping alone is what excludes them, and the predicate is
  // defence-in-depth against one specific future edit: someone re-adding a
  // sales-led tier to TIER_PLAN_CODE_ENV_VAR. That edit WOULD be caught.
  //
  // Rather than write an assertion that looks like it proves more than it does,
  // both halves are pinned where each is really checkable.
  it('has no self-serve Plan mapping for a sales-led tier', () => {
    // Setting every legacy Label var must not make Label chargeable.
    process.env.PAYSTACK_PLAN_LABEL_NGN = 'PLN_label';
    process.env.PAYSTACK_PLAN_MONTHLY_NGN = 'PLN_legacy_monthly';
    process.env.PAYSTACK_PLAN_ANNUAL_NGN = 'PLN_legacy_annual';
    process.env.PAYSTACK_PLAN_SOLO_MONTHLY_NGN = 'PLN_a';
    process.env.PAYSTACK_PLAN_SOLO_YEARLY_NGN = 'PLN_b';
    const offered = purchasableTiers();
    expect(offered).not.toContain('label');
    expect(offered).not.toContain('enterprise');
    expect(offered).toContain('solo');
  });

  it('and the self-serve predicate rejects every sales-led tier', () => {
    // The second guard, asserted directly since purchasableTiers cannot be made
    // to exercise it. Duplicated deliberately from entitlements.test.ts so this
    // block stands on its own.
    for (const tier of Object.keys(PRICING_TIERS) as PricingTierId[]) {
      if (!PRICING_TIERS[tier].contactSales) continue;
      expect(isSelfServeTier(tier), `${tier} must not be self-serve`).toBe(false);
    }
  });

  it('treats an empty env var as unset, not as a code', () => {
    process.env.PAYSTACK_PLAN_SOLO_YEARLY_NGN = '   ';
    expect(purchasableTiers()).not.toContain('solo');
  });

  it('needs only the annual Plan, because that is the only one sold', () => {
    // This required BOTH a monthly and an annual code until 2026-09-08, when
    // the interval toggle went away. Leaving the monthly requirement in place
    // would have made every tier unpurchasable the moment the monthly prices
    // were removed — the single sharpest way that reprice could have taken
    // checkout down with no test failing anywhere.
    delete process.env.PAYSTACK_PLAN_SOLO_MONTHLY_NGN;
    process.env.PAYSTACK_PLAN_SOLO_YEARLY_NGN = 'PLN_solo_year';
    expect(purchasableTiers()).toContain('solo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The seat counter counts members, and only members
// ─────────────────────────────────────────────────────────────────────────────

describe('the seat counter counts team membership and nothing else', () => {
  const counter = source('lib/seats-server.ts');

  it('counts workspace_members, excluding removed rows', () => {
    expect(counter).toContain("'workspace_members'");
    // `invited` and `active` both occupy a seat; only `removed` frees one. That
    // matches every other read of this table, and counting differently from the
    // list the manager is looking at would be worse than any particular answer.
    expect(counter).toContain("neq('status', 'removed')");
  });

  it('touches no external-contact table', () => {
    // If a seat count ever learned about pack recipients or curator profiles,
    // sending a DJ their tracks would consume a seat.
    for (const table of [
      'pack_recipients',
      'curator_profiles',
      'curator_playlists',
      'playlist_pitches',
      'release_credit_submissions',
      'release_capture_leads',
    ]) {
      expect(counter, table).not.toContain(table);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. External contacts are never seat-checked
// ─────────────────────────────────────────────────────────────────────────────
//
// THIS IS THE BLOCK THAT KEEPS THE SHOWS AND PITCHING FEATURES WORKING ON THE
// TIER THEY WERE SOLD ON. A DJ receiving a pack, a curator receiving a pitch and
// a producer filling in a credits link all interact with the account without
// logging in and without belonging to it. Charging any of them a seat would mean
// a Solo team with its one collaborator in place could no longer send a DJ the
// tracks for tonight's show — which is the whole feature.
//
// Asserted as an absence, which is the honest shape: there is no seat check to
// find in these files, and the test's job is to notice the day someone adds one.

const EXTERNAL_CONTACT_PATHS: Array<{ what: string; file: string }> = [
  { what: 'send a DJ pack to a recipient', file: 'app/api/packs/[packId]/recipients/route.ts' },
  { what: 'pitch a song to a curator playlist', file: 'app/api/pitching/pitches/route.ts' },
  { what: 'receive a collaborator credit submission', file: 'app/api/credits/[token]/route.ts' },
];

describe('external contacts never consume a seat', () => {
  it.each(EXTERNAL_CONTACT_PATHS)('$what', ({ file }) => {
    const body = source(file);
    for (const banned of [
      'checkSeatAllowance',
      'countTeamSeats',
      // The tier resolvers, too: reaching for either here is the first step
      // toward gating one of these paths on a plan.
      'getWorkspaceTier',
      'checkLimit',
    ]) {
      expect(body, `${file} must not call ${banned}`).not.toContain(`${banned}(`);
    }
  });

  it('and they do not write to workspace_members either', () => {
    // A subtler version of the same mistake: not a seat CHECK, but a seat
    // created as a side effect of an external interaction.
    for (const { file } of EXTERNAL_CONTACT_PATHS) {
      expect(source(file), file).not.toContain('workspace_members');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Features are not gated by tier — only volume is
// ─────────────────────────────────────────────────────────────────────────────

describe('the product surface is the same on every tier', () => {
  // "Gate seats, not features" (founder, 2026-09-01). A Solo manager keeps
  // activity assignment, shows, setlists, DJ packs and the assistant; what
  // their plan limits is how many people and how much usage. So none of these
  // routes may consult an entitlement at all.
  const UNGATED = [
    // Assignment rides the task create/update routes.
    'app/api/tasks/route.ts',
    'app/api/tasks/[id]/route.ts',
    // Shows, their setlists, and the pack that goes out to the DJ.
    'app/api/events/route.ts',
    'app/api/events/[eventId]/setlists/route.ts',
    'app/api/setlists/[setlistId]/items/route.ts',
    'app/api/setlists/[setlistId]/pack/route.ts',
    // The song catalog the setlist is built from.
    'app/api/songs/route.ts',
  ];

  it.each(UNGATED)('%s reads no entitlement', (file) => {
    const body = source(file);
    for (const banned of ['getEntitlement', 'resolveEntitlements', 'checkLimit', 'resolveTeamTier']) {
      expect(body, `${file} must not call ${banned}`).not.toContain(`${banned}(`);
    }
  });
});
