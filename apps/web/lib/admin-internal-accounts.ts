import type { ScoreboardInput } from './scoreboard';

// Leave our own team's accounts out of the founder cockpit and the Scoreboard
// (2026-10-10, iteration 6; the founder's answer: "yes, leave them out").
//
// WHO IS "US" is decided in one place for every admin page:
// internalAccountEmails() in app/api/admin/_shared.ts, ADMIN_EMAILS plus the
// optional METRICS_INTERNAL_EMAILS, the list /admin/metrics has hidden by
// default since 2026-10-07. This file only applies it to the Scoreboard's
// input, so the cockpit and the Scoreboard keep counting with one set of rules
// and still agree with each other exactly.
//
// PURE. It never changes the input it is given (the shared read cache hands the
// same object to both pages), and returns a new one.
//
// What is left out, and why:
//  - A team whose OWNER is one of us, with its releases and referral rows. The
//    team is ours, whoever else is on it.
//  - Our people's activity, and our people as members of anyone else's team,
//    so one of us helping a customer team never makes it "2 people active".
//  - Our people's own subscriptions (MRR counts every subscription, Solo
//    included, so a test payment of ours would otherwise be revenue).
//  - Our people's own accounts from the signup list (URG-267's weekly return
//    table on the Scoreboard), so we are never a cohort member.
//
// The email for each user id comes from the profiles the Scoreboard's read
// already loads (every workspace owner, which is every account, since each
// account is given a workspace of its own). An account with no profile email
// cannot be matched and is counted, never guessed.

export type InternalExclusion = {
  input: ScoreboardInput;
  /** Teams left out because one of us owns them. */
  workspaceIds: Set<string>;
  /** Our people's user ids, as matched by email. */
  userIds: Set<string>;
};

export function internalUserIds(emailByUserId: Map<string, string>, internalEmails: Set<string>): Set<string> {
  const ids = new Set<string>();
  if (internalEmails.size === 0) return ids;
  for (const [userId, email] of emailByUserId) {
    if (internalEmails.has(email.trim().toLowerCase())) ids.add(userId);
  }
  return ids;
}

export function withoutInternalAccounts(input: ScoreboardInput, userIds: Set<string>): InternalExclusion {
  const workspaceIds = new Set<string>();
  if (userIds.size === 0) return { input, workspaceIds, userIds };

  for (const team of input.teams) {
    if (team.ownerUserId && userIds.has(team.ownerUserId)) workspaceIds.add(team.workspaceId);
  }

  const activity = new Map<string, number[]>();
  for (const [userId, times] of input.activity) {
    if (!userIds.has(userId)) activity.set(userId, times);
  }

  const keepReferral = (row: { workspaceId: string }) => !workspaceIds.has(row.workspaceId);

  return {
    input: {
      ...input,
      teams: input.teams
        .filter((team) => !workspaceIds.has(team.workspaceId))
        .map((team) => ({ ...team, memberUserIds: team.memberUserIds.filter((id) => !userIds.has(id)) })),
      releases: input.releases.filter((release) => !workspaceIds.has(release.workspaceId)),
      subscriptions: input.subscriptions.filter((sub) => !userIds.has(sub.userId)),
      activity,
      users: input.users?.filter((user) => !userIds.has(user.userId)),
      referrals: input.referrals
        ? {
            fromTeams: input.referrals.fromTeams.filter(keepReferral),
            fromPartners: input.referrals.fromPartners.filter(keepReferral),
          }
        : input.referrals,
    },
    workspaceIds,
    userIds,
  };
}

/** A usage-log or ledger row of ours: on one of our teams, or charged to one of us. */
export function isInternalRow(
  row: { workspaceId: string | null; ownerUserId: string | null },
  exclusion: Pick<InternalExclusion, 'workspaceIds' | 'userIds'>
): boolean {
  if (row.workspaceId && exclusion.workspaceIds.has(row.workspaceId)) return true;
  if (row.ownerUserId && exclusion.userIds.has(row.ownerUserId)) return true;
  return false;
}
