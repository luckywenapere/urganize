import { isReleaseActive } from './release-activity';
import { EMPTY_LEAD_STATS, type LeadStats } from './directory-profile-type';

/**
 * The numbers a profile leads with, counted from work that already exists.
 *
 * Pure: the server loader reads the rows, this decides what they mean. Nothing
 * here is typed by anybody, which is the line the whole directory rests on.
 */

export type LeadReleaseRow = { status: string | null; isTest: boolean };

export type LeadRecordRow = { releaseId: string | null; showId: string | null };

export type LeadStatsInput = {
  releases: readonly LeadReleaseRow[];
  artistCount: number;
  /** Active people on the team the person owns, themselves included. */
  teamMembers: number;
  records: readonly LeadRecordRow[];
};

const positive = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/**
 * TEST ROLLOUTS DO NOT COUNT. The one-tap test path exists so somebody can look
 * around, and a manager who tried it should not read as having run one. An
 * unknown status counts as active, the same rule the active-rollout cap uses
 * (lib/release-activity.ts), so the two cannot disagree.
 */
export function summarizeLeadStats(input: LeadStatsInput): LeadStats {
  const real = input.releases.filter((release) => !release.isTest);

  const releaseIds = new Set<string>();
  const showIds = new Set<string>();
  for (const record of input.records) {
    if (record.releaseId) releaseIds.add(record.releaseId);
    if (record.showId) showIds.add(record.showId);
  }

  return {
    ...EMPTY_LEAD_STATS,
    rolloutsRun: real.length,
    artistsManaged: positive(input.artistCount),
    activeRollouts: real.filter((release) => isReleaseActive(release.status)).length,
    releases: real.length,
    teamSize: positive(input.teamMembers),
    rolloutsWorkedOn: releaseIds.size,
    shows: showIds.size,
  };
}
