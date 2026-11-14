// Who an admin email goes to, and whether the count on screen is for them
// (#1274). Pure and client-safe.
//
// The composer asks the server how many people an audience reaches and shows
// "Send to N people". That count is only true for the audience it was made
// for. On 14 Nov 2026 a background sign-in refresh made the page recount the
// STARTING audience (everyone) while "One person" was chosen, so the button
// read "Send to 124 people" over a one-person send. The reverse is the
// dangerous one: a count of one person left on screen while the send goes to
// everyone. So the count carries a key for the audience it was made for, and
// the page shows it only while that key is the one chosen now.

export type AudienceKind = 'everyone' | 'group' | 'person' | 'waitlist';

export type AudienceChoice = {
  kind: AudienceKind;
  group: string;
  days: string;
  personEmail: string;
};

/** The audience the routes take. Fields that do not belong to the kind are left out. */
export function audienceRequest(choice: AudienceChoice): {
  kind: AudienceKind;
  group?: string;
  days?: string;
  email?: string;
} {
  if (choice.kind === 'group') {
    return { kind: 'group', group: choice.group, days: choice.group === 'recent' ? choice.days : undefined };
  }
  if (choice.kind === 'person') return { kind: 'person', email: choice.personEmail };
  return { kind: choice.kind };
}

/** What a choice reaches, as a string: the same key means the same people. */
export function audienceKey(choice: AudienceChoice): string {
  const request = audienceRequest(choice);
  return JSON.stringify([
    request.kind,
    request.group ?? '',
    request.days ?? '',
    (request.email ?? '').trim().toLowerCase(),
  ]);
}

/** A count (or the reason there is none), with the audience it was made for. */
export type Counted<T> = { key: string; info: T | null; error: string | null };

/** The count, only if it was made for the audience chosen now. */
export function countedFor<T>(counted: Counted<T> | null, choice: AudienceChoice): Counted<T> | null {
  return counted && counted.key === audienceKey(choice) ? counted : null;
}
