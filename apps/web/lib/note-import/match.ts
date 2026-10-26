// Bring your notes: which release does a piece of text talk about?
//
// A note filed under the wrong release is worse than one filed under none
// (the create_note rule), so this only answers when exactly one release
// matches. Two matches come back as candidates for the person to choose.

export type MatchableRelease = { id: string; title: string };

export type ReleaseMatch =
  | { kind: 'none' }
  | { kind: 'one'; release: MatchableRelease }
  | { kind: 'many'; candidates: MatchableRelease[] };

const GENERIC_TITLES = new Set(['untitled', 'untitled release', 'new release', 'single', 'ep', 'album']);

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchRelease(text: string, releases: MatchableRelease[]): ReleaseMatch {
  const haystack = ` ${normalizeTitle(text)} `;
  if (haystack.trim().length === 0) return { kind: 'none' };

  const hits = releases
    .map((release) => ({ release, title: normalizeTitle(release.title) }))
    .filter(({ title }) => title.length >= 3 && !GENERIC_TITLES.has(title))
    .filter(({ title }) => new RegExp(`\\s${escapeRegExp(title)}\\s`).test(haystack));

  // "Detty" inside "Detty Season EP" is the same mention, not a second release.
  const longest = hits.filter(
    (hit) => !hits.some((other) => other !== hit && other.title.length > hit.title.length && other.title.includes(hit.title))
  );

  if (longest.length === 0) return { kind: 'none' };
  if (longest.length === 1) return { kind: 'one', release: longest[0].release };
  return { kind: 'many', candidates: longest.map((hit) => hit.release) };
}
