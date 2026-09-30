/**
 * Why the wizard's main button is not ready yet, in a sentence.
 *
 * The button is disabled until a step is complete. A disabled button that does
 * not say what it is waiting for leaves a person tapping it and getting nothing,
 * on the one flow where giving up costs a whole new customer. So the reason is
 * shown beside it, and the button points at it.
 *
 * Pure, and a function of plain booleans rather than of the wizard's state, so
 * it can be tested (vitest reaches `lib/` and nothing else in this repo) and so
 * it cannot drift from the rule it explains: `canAdvance` in the wizard is the
 * rule, and every branch here names a condition that rule checks.
 *
 * Returns null when nothing is in the way, and for the steps that never block
 * (the last question and the invite step).
 */
export type NextBlockerInput = {
  step: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  releaseTypeAvailable: boolean;
  whereStuckCount: number;
  hasStage: boolean;
  hasTitle: boolean;
  dateValid: boolean;
  hasName: boolean;
  hasEmail: boolean;
  passwordLongEnough: boolean;
  needsArtistName: boolean;
  hasArtistName: boolean;
};

export function describeNextBlocker(input: NextBlockerInput): string | null {
  switch (input.step) {
    case 0:
      return input.releaseTypeAvailable ? null : 'Pick a kind of rollout to go on.';
    case 1:
      return input.whereStuckCount > 0 ? null : 'Choose at least one to go on.';
    case 2:
      return input.hasStage ? null : 'Choose one to go on.';
    case 3: {
      const missing: string[] = [];
      if (!input.hasTitle) missing.push('a title');
      if (!input.dateValid) missing.push('a release date');
      if (missing.length === 0) return null;
      return `Add ${missing.join(' and ')} to go on.`;
    }
    case 5: {
      const missing: string[] = [];
      if (!input.hasName) missing.push('your name');
      if (!input.hasEmail) missing.push('your email');
      if (!input.passwordLongEnough) missing.push('a password of 6 or more characters');
      if (input.needsArtistName && !input.hasArtistName) missing.push('your artist name');
      if (missing.length === 0) return null;
      // Email only: the Google button beside it needs none of these.
      return `To sign up with email, add ${joinWithAnd(missing)}.`;
    }
    default:
      return null;
  }
}

/** "a", "a and b", "a, b and c": no Oxford comma, per the house copy rules. */
function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
