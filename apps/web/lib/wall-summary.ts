/**
 * What the billing wall says is waiting for the team, in real numbers. The point is
 * ownership: the manager is not being asked to buy something new, they are being
 * asked to keep what is already theirs. Facts only, no threat and no countdown, which
 * is the wall's standing copy rule.
 *
 * Pure so the wording can be tested. Zero and unreadable counts are left out, so the
 * line never says "0 rollouts" or guesses.
 */
export type WallSummaryCounts = {
  rollouts: number | null;
  activities: number | null;
  teammates: number | null;
};

const noun = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function join(parts: string[]): string {
  // No Oxford comma: house copy rule.
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function describeWallSummary(counts: WallSummaryCounts): string | null {
  const parts: { text: string; count: number }[] = [];
  if (counts.rollouts && counts.rollouts > 0) {
    parts.push({ text: noun(counts.rollouts, 'rollout', 'rollouts'), count: counts.rollouts });
  }
  if (counts.activities && counts.activities > 0) {
    parts.push({ text: noun(counts.activities, 'activity', 'activities'), count: counts.activities });
  }
  if (counts.teammates && counts.teammates > 0) {
    parts.push({ text: noun(counts.teammates, 'teammate', 'teammates'), count: counts.teammates });
  }
  if (parts.length === 0) return null;
  const single = parts.length === 1 && parts[0].count === 1;
  return `Your ${join(parts.map((part) => part.text))} ${single ? 'is' : 'are'} exactly where you left ${single ? 'it' : 'them'}.`;
}
