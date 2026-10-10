import { composeDraftHref } from './email/compose-prefill';

// The "Needs a message" list on the founder cockpit (iteration 4, 2026-10-09):
// for each team that slipped this week, who to write to, which lifecycle stage
// the team stalled at, who owns that stage, and a mailto link that opens a
// short draft. NOTHING IS SENT FROM HERE: the links only fill in a draft (in
// the admin Emails composer since iteration 5, or the founder's own mail app),
// and the founder edits and sends it.
//
// PURE and client-safe (no server imports), so the rules are tested here and
// the cockpit view imports the stage words directly.
//
// The stages are the strategy doc's customer lifecycle
// (docs/strategy/company-strategy.md, section 6). A slipped team is placed at
// the FIRST stage it has not finished, in the doc's order:
//
//   3. Activate        a real rollout and a teammate (the doc adds "within 3
//                      days"; for a team that already slipped, what matters is
//                      which of the two is still missing)
//   4. Convert         paying (the Scoreboard's paying rule)
//   5. First release   a rollout whose release went live (the Scoreboard's
//                      releaseLiveAt rule, read off the board row)
//   6. Second release  started another rollout within 90 days of the first
//                      going live (the Scoreboard's rule)
//   7. Expand          everything above is done; the team is quiet anyway
//
// Stages 1, 2 and 8 (reach, sign up, refer) cannot be where a TEAM that exists
// and was active stalls, so they are never returned.
//
// The doc says a team that stalls "gets a direct message from that stage's
// owner within 3 days". Who owns each stage lives in ONE place, LIFECYCLE_STAGES
// below, copied from the doc's table; lib/admin-message-list.test.ts reads the
// doc and fails if the two drift. When the table changes, change that constant.

export type LifecycleStage = { number: number; label: string; owner: string };

/** The strategy doc's customer lifecycle (section 6), all eight stages, with
 *  each stage's owner. The doc's Convert row reads "Oyin (KB follows up)":
 *  Oyin owns it, so Oyin writes. */
export const LIFECYCLE_STAGES = [
  { number: 1, label: 'Reach', owner: 'KB' },
  { number: 2, label: 'Sign up', owner: 'KB' },
  { number: 3, label: 'Activate', owner: 'Chidera' },
  { number: 4, label: 'Convert', owner: 'Oyin' },
  { number: 5, label: 'First release', owner: 'Chidera' },
  { number: 6, label: 'Second release', owner: 'Chidera' },
  { number: 7, label: 'Expand', owner: 'Oyin' },
  { number: 8, label: 'Refer', owner: 'KB' },
] as const satisfies readonly LifecycleStage[];

export type StalledStage = 'activate' | 'convert' | 'first_release' | 'second_release' | 'expand';

function lifecycleStage(number: number): LifecycleStage {
  const found = LIFECYCLE_STAGES.find((entry) => entry.number === number);
  if (!found) throw new Error(`No lifecycle stage ${number}`);
  return found;
}

/** The stages a slipped team can be at, read from LIFECYCLE_STAGES. */
export const STAGE_INFO: Record<StalledStage, LifecycleStage> = {
  activate: lifecycleStage(3),
  convert: lifecycleStage(4),
  first_release: lifecycleStage(5),
  second_release: lifecycleStage(6),
  expand: lifecycleStage(7),
};

export type StageFacts = {
  /** Rollouts that are not test rollouts (the board row's realReleases). */
  realReleases: number;
  /** People on the team, the owner included. */
  members: number;
  /** When the first teammate was invited or joined, owner excluded. */
  firstInviteAt: string | null;
  paying: boolean;
  /** When the team's first rollout went live (the board's releaseLiveAt rule). */
  firstLiveAt: string | null;
  secondReleaseStarted: boolean;
};

export type StalledAt = {
  stage: StalledStage;
  /** What is missing, in a few words: "No rollout yet", "No teammate yet". */
  missing: string;
};

/** The first lifecycle stage this team has not finished. */
export function stalledStage(facts: StageFacts): StalledAt {
  const hasRollout = facts.realReleases > 0;
  const hasTeammate = facts.members > 1 || Boolean(facts.firstInviteAt);
  if (!hasRollout && !hasTeammate) return { stage: 'activate', missing: 'No rollout or teammate yet' };
  if (!hasRollout) return { stage: 'activate', missing: 'No rollout yet' };
  if (!hasTeammate) return { stage: 'activate', missing: 'No teammate yet' };
  if (!facts.paying) return { stage: 'convert', missing: 'Not paying yet' };
  if (!facts.firstLiveAt) return { stage: 'first_release', missing: 'No release live yet' };
  if (!facts.secondReleaseStarted) return { stage: 'second_release', missing: 'No second rollout yet' };
  return { stage: 'expand', missing: 'Every stage done, quiet anyway' };
}

/** "Stage 4, Convert. Oyin writes." */
export function stageLine(stage: StalledStage): string {
  const info = STAGE_INFO[stage];
  return `Stage ${info.number}, ${info.label}. ${info.owner} writes`;
}

/** The part of a name before the first space, or null when there is none. */
export function firstName(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

/** A plain, editable opener for each stage. The founder rewrites it freely. */
const STAGE_ASK: Record<StalledStage, string> = {
  activate: 'I saw you set up your team on Urganize. Is anything stopping you from getting your first rollout going with your team?',
  convert: 'Your trial on Urganize has ended. Is there anything you need from us before you pick a plan?',
  first_release: 'How is your rollout going? Is anything stopping the release from going live?',
  second_release: 'Congratulations on your release going live. What is next for you, and can we help you plan it?',
  expand: 'I noticed things went quiet on Urganize this week. How are things going, and is there anything we can do better?',
};

/** Characters a mailto URL keeps safe; everything else is percent-encoded. */
function encodeMailtoPart(value: string): string {
  // encodeURIComponent leaves ! ' ( ) * alone, which mail apps read fine, and
  // turns spaces into %20 (never "+", which some mail apps print literally).
  return encodeURIComponent(value);
}

/** Something that looks like one email address, with nothing that could add a
 *  second recipient, a header or a fragment to the link (",", ";", "?", "&",
 *  "#", "%", spaces). */
export function isMailtoSafeEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  return /^[^\s@,;?&#%<>"'()]+@[^\s@,;?&#%<>"'()]+\.[^\s@,;?&#%<>"'()]+$/.test(email);
}

/** The draft for one team: who, a subject and an opener. No greeting: the
 *  admin composer adds "Hi <name>," itself, and the mailto link adds its own. */
export function messageDraft(team: {
  teamName: string | null;
  stage: StalledStage;
}): { subject: string; ask: string } {
  return {
    subject: team.teamName ? `Checking in on ${team.teamName}` : 'Checking in',
    ask: STAGE_ASK[team.stage],
  };
}

/**
 * A mailto link with a short draft for this team, or null when there is no
 * usable email. One recipient only, never a CC or BCC.
 */
export function messageMailto(team: {
  email: string | null;
  ownerName: string | null;
  teamName: string | null;
  stage: StalledStage;
}): string | null {
  if (!isMailtoSafeEmail(team.email)) return null;
  const name = firstName(team.ownerName);
  const { subject, ask } = messageDraft(team);
  const body = `${name ? `Hi ${name},` : 'Hi,'}\n\n${ask}\n\n`;
  return `mailto:${team.email}?subject=${encodeMailtoPart(subject)}&body=${encodeMailtoPart(body)}`;
}

/**
 * A link to the admin Emails composer with this team's draft filled in
 * (iteration 5), or null when there is no usable email. The composer adds the
 * greeting and sign-off, so the body is the opener alone. Nothing is sent
 * until the admin presses Send there.
 */
export function messageComposeHref(team: {
  email: string | null;
  teamName: string | null;
  stage: StalledStage;
}): string | null {
  if (!isMailtoSafeEmail(team.email)) return null;
  const { subject, ask } = messageDraft(team);
  return composeDraftHref({ to: team.email, subject, body: ask });
}
