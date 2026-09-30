import { describe, expect, it } from 'vitest';
import { describeNextBlocker, type NextBlockerInput } from './onboarding-next-hint';

function input(over: Partial<NextBlockerInput>): NextBlockerInput {
  return {
    step: 0,
    releaseTypeAvailable: true,
    whereStuckCount: 1,
    hasStage: true,
    hasTitle: true,
    dateValid: true,
    hasName: true,
    hasEmail: true,
    passwordLongEnough: true,
    needsArtistName: false,
    hasArtistName: false,
    ...over,
  };
}

// The sentence opens "To sign up with email, add ...", so the field list is
// what follows; asserting on the whole sentence would find "email" in the
// prefix and prove nothing about which fields are named.
const fieldsOf = (text: string | null) => (text ?? '').replace(/^To sign up with email, add /, '');

describe('describeNextBlocker', () => {
  it('says nothing when nothing is in the way', () => {
    for (const step of [0, 1, 2, 3, 4, 5, 6] as const) {
      expect(describeNextBlocker(input({ step }))).toBeNull();
    }
  });

  it('names the one thing missing on each question step', () => {
    expect(describeNextBlocker(input({ step: 0, releaseTypeAvailable: false }))).toMatch(/kind of rollout/i);
    expect(describeNextBlocker(input({ step: 1, whereStuckCount: 0 }))).toMatch(/at least one/i);
    expect(describeNextBlocker(input({ step: 2, hasStage: false }))).toMatch(/choose one/i);
  });

  it('asks for the title and the date separately, and both when both are missing', () => {
    expect(describeNextBlocker(input({ step: 3, hasTitle: false }))).toMatch(/title/i);
    expect(describeNextBlocker(input({ step: 3, hasTitle: false }))).not.toMatch(/date/i);
    expect(describeNextBlocker(input({ step: 3, dateValid: false }))).toMatch(/date/i);
    expect(describeNextBlocker(input({ step: 3, dateValid: false }))).not.toMatch(/title/i);
    const both = describeNextBlocker(input({ step: 3, hasTitle: false, dateValid: false }));
    expect(both).toMatch(/title/i);
    expect(both).toMatch(/date/i);
  });

  it('lists exactly the account fields still missing', () => {
    const onlyPassword = describeNextBlocker(input({ step: 5, passwordLongEnough: false }));
    expect(fieldsOf(onlyPassword)).toMatch(/password/i);
    expect(fieldsOf(onlyPassword)).not.toMatch(/name|email/i);

    const nameAndEmail = describeNextBlocker(input({ step: 5, hasName: false, hasEmail: false }));
    expect(fieldsOf(nameAndEmail)).toMatch(/name/i);
    expect(fieldsOf(nameAndEmail)).toMatch(/email/i);
    expect(fieldsOf(nameAndEmail)).not.toMatch(/password/i);
  });

  it('asks for the artist name only when the role needs one', () => {
    expect(describeNextBlocker(input({ step: 5, needsArtistName: true, hasArtistName: false }))).toMatch(
      /artist name/i
    );
    expect(describeNextBlocker(input({ step: 5, needsArtistName: false, hasArtistName: false }))).toBeNull();
    expect(describeNextBlocker(input({ step: 5, needsArtistName: true, hasArtistName: true }))).toBeNull();
  });

  it('never blames a field on a step that does not ask for it', () => {
    // A bad password count must not block the question steps.
    expect(describeNextBlocker(input({ step: 2, passwordLongEnough: false, hasName: false }))).toBeNull();
    // And a missing title must not block the account step.
    expect(describeNextBlocker(input({ step: 5, hasTitle: false, dateValid: false }))).toBeNull();
  });

  it('the invite step and the last question never block', () => {
    expect(describeNextBlocker(input({ step: 4, hasName: false, hasTitle: false }))).toBeNull();
    expect(describeNextBlocker(input({ step: 6, hasName: false, hasTitle: false }))).toBeNull();
  });

  it('is written for someone reading a phone, with no jargon and no em dashes', () => {
    const all = [
      describeNextBlocker(input({ step: 0, releaseTypeAvailable: false })),
      describeNextBlocker(input({ step: 1, whereStuckCount: 0 })),
      describeNextBlocker(input({ step: 2, hasStage: false })),
      describeNextBlocker(input({ step: 3, hasTitle: false, dateValid: false })),
      describeNextBlocker(
        input({ step: 5, hasName: false, hasEmail: false, passwordLongEnough: false, needsArtistName: true })
      ),
    ];
    for (const text of all) {
      expect(text).not.toBeNull();
      expect(text).not.toMatch(/—|–/);
      expect(text).not.toMatch(/workspace/i);
      expect(text!.length).toBeLessThan(120);
    }
  });
});
