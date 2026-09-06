import type { PersonVisibility } from '@/types/directory';

/**
 * What a stranger is allowed to load at /p/{slug}.
 *
 * Pure and separate from the server resolver so the rule can be tested without
 * a database, and so the one decision that matters here is a single expression
 * somebody has to change on purpose.
 */

/**
 * ONLY `public` opens the page.
 *
 * `directory` means signed-in users can find you IN THE DIRECTORY. It does not
 * put your page on the open web, and the copy in PERSON_VISIBILITY_COPY
 * promises exactly that split. Widening this to `isListed` would quietly
 * publish every listed profile to anyone with the link, which is the change
 * somebody would make by mistake while tidying — hence its own test.
 */
export function isPubliclyReadable(visibility: PersonVisibility): boolean {
  return visibility === 'public';
}

/** Under the name, when there is anything to say. Never invented: a profile
 *  with no city and no availability line gets no subtitle at all. */
export function personSubtitle(input: {
  city: string | null;
  country: string | null;
}): string {
  return [input.city, input.country].map((part) => part?.trim()).filter(Boolean).join(', ');
}
