import type {
  PressKitSection,
  PressKitSectionContent,
  PressKitSectionKey,
} from '@/types/press-kits';

/**
 * Turning what Urganize already knows into press kit sections.
 *
 * Pure: no IO, no env, no React. The reads live in
 * lib/press-kit-autofill-server.ts, which hands the result here — the same
 * split lib/chappi/workspace-summary.ts makes, and for the same reason, so the
 * shaping is testable without a database.
 *
 * THE ONE RULE THIS MODULE EXISTS TO KEEP: a section is only ever written while
 * its source is still 'autofill'. The moment a person types into a section the
 * PATCH route flips it to 'user', and the moment UrgAns drafts one it becomes
 * 'ai'. Either way autofill must never return to it. That is what stops a fill
 * quietly replacing somebody's own words, and it is what makes running this
 * again safe by construction rather than by care.
 */

export type AutofillRelease = {
  id: string;
  title: string;
  releaseType: string;
  releaseDate: string | null;
  description: string;
};

export type AutofillSong = {
  id: string;
  title: string;
  releaseId: string | null;
  durationSeconds: number | null;
};

/**
 * A credit, already narrowed to what may be shown in public.
 *
 * The submissions table also holds an email, a phone number, a PRO
 * affiliation, an IPI number and both splits. None of that belongs on a page
 * anyone with the link can read, so the builder below reconstructs each entry
 * field by field rather than spreading the input — a narrow select upstream is
 * the first guard, and this is the second.
 */
export type AutofillCredit = {
  legalName: string;
  stageName: string | null;
  roles: string[];
  contribution: string | null;
};

export type AutofillShow = {
  title: string;
  venueName: string | null;
  startAt: string | null;
  timezone: string;
};

export type AutofillMember = {
  name: string;
  email: string;
};

export type AutofillSources = {
  /** Every release for this artist. Order does not matter: the newest is
   *  picked here, by date, rather than trusted from the query. */
  releases: AutofillRelease[];
  /** Metadata for the newest release, when there is one. */
  metadata: { genre: string | null; subgenre: string | null } | null;
  songs: AutofillSong[];
  credits: AutofillCredit[];
  shows: AutofillShow[];
  members: AutofillMember[];
};

export type AutofillPatch = {
  section: PressKitSectionKey;
  content: PressKitSectionContent;
};

/**
 * The only sections autofill may ever write.
 *
 * The six that are absent are absent for three different reasons, all of them
 * decisions rather than gaps:
 *
 *  - `bios` — the artist row holds a name and a slug and nothing else. There is
 *    no bio anywhere in the product to copy, so the interview asks.
 *  - `numbers` — there is no analytics data in this product at all, and
 *    inventing a figure is the one thing the brief bans outright.
 *  - `press` — previous coverage has never been recorded anywhere.
 *  - `links` — the only social handles in the schema belong to a COLLABORATOR
 *    who submitted credits, not to the artist. Filling the artist's links from
 *    them would publish the wrong person's account.
 *  - `assets` and `video` — files arrive in a later phase.
 */
export const AUTOFILLABLE_SECTIONS: readonly PressKitSectionKey[] = [
  'header',
  'latest_release',
  'music',
  'credits',
  'live',
  'contact',
];

const clean = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * The release a press kit is about right now.
 *
 * A dated release always wins over an undated one, however the rows arrived: a
 * release with no date has not been scheduled yet, so it cannot be the one
 * press are being pointed at.
 */
const newestRelease = (releases: AutofillRelease[]): AutofillRelease | null => {
  const dated = releases.filter((release) => clean(release.releaseDate));
  if (dated.length > 0) {
    return dated.reduce((best, candidate) =>
      String(candidate.releaseDate) > String(best.releaseDate) ? candidate : best
    );
  }
  return releases[0] || null;
};

const buildHeader = (sources: AutofillSources): PressKitSectionContent | null => {
  const tags = [clean(sources.metadata?.genre), clean(sources.metadata?.subgenre)].filter(Boolean);
  if (tags.length === 0) return null;
  // Genres only. The one line about the artist and where they are from are
  // both human answers, so they stay for the interview and this section lands
  // at draft rather than ready.
  return { genreTags: tags.join(', ') };
};

const buildLatestRelease = (sources: AutofillSources): PressKitSectionContent | null => {
  const release = newestRelease(sources.releases);
  if (!release) return null;
  return {
    releaseId: release.id,
    title: clean(release.title),
    releaseType: clean(release.releaseType),
    releaseDate: clean(release.releaseDate),
    description: clean(release.description),
  };
};

const buildMusic = (sources: AutofillSources): PressKitSectionContent | null => {
  if (sources.songs.length === 0) return null;
  return {
    tracks: sources.songs.map((song) => ({
      songId: song.id,
      title: clean(song.title),
      releaseId: song.releaseId || null,
      durationSeconds: song.durationSeconds ?? null,
    })),
  };
};

const buildCredits = (sources: AutofillSources): PressKitSectionContent | null => {
  if (sources.credits.length === 0) return null;
  return {
    credits: sources.credits.map((credit) => ({
      // Reconstructed field by field, never spread. See AutofillCredit.
      legalName: clean(credit.legalName),
      stageName: clean(credit.stageName),
      roles: Array.isArray(credit.roles) ? credit.roles : [],
      contribution: clean(credit.contribution),
    })),
  };
};

const buildLive = (sources: AutofillSources): PressKitSectionContent | null => {
  if (sources.shows.length === 0) return null;
  return {
    shows: sources.shows.map((show) => ({
      title: clean(show.title),
      venueName: clean(show.venueName),
      startAt: clean(show.startAt),
      timezone: clean(show.timezone),
    })),
  };
};

const buildContact = (sources: AutofillSources): PressKitSectionContent | null => {
  // A contact with no email is a dead end, which is the one thing this block
  // exists to prevent.
  const contacts = sources.members
    .filter((member) => clean(member.email))
    .map((member) => ({
      name: clean(member.name),
      // Left blank deliberately (founder call). The only role the product holds
      // for a teammate is a permission level — owner, admin, member — and that
      // is not the job title press read. A person types it in the interview,
      // and until they do this section stays at draft, so an incomplete contact
      // cannot reach a published kit.
      role: '',
      email: clean(member.email),
    }));
  if (contacts.length === 0) return null;
  return { contacts };
};

const BUILDERS: Record<
  string,
  (sources: AutofillSources) => PressKitSectionContent | null
> = {
  header: buildHeader,
  latest_release: buildLatestRelease,
  music: buildMusic,
  credits: buildCredits,
  live: buildLive,
  contact: buildContact,
};

/**
 * What autofill may write, given what was found and what the kit already holds.
 *
 * Returns only sections that are still untouched AND have something to say. A
 * section with no content to offer is left alone rather than written as an
 * empty object, so its status stays honest.
 */
export function buildAutofillPatch(
  sources: AutofillSources,
  sections: readonly PressKitSection[]
): AutofillPatch[] {
  const patches: AutofillPatch[] = [];

  for (const key of AUTOFILLABLE_SECTIONS) {
    const existing = sections.find((section) => section.section === key);
    if (!existing) continue;
    if (existing.source !== 'autofill') continue;

    const content = BUILDERS[key]?.(sources) ?? null;
    if (!content) continue;

    patches.push({ section: key, content });
  }

  return patches;
}

export type AutofillSummary = {
  releases: number;
  songs: number;
  shows: number;
  credits: number;
  members: number;
};

/** Plain counts for the card that tells a person what was found for them. */
export function summarizeSources(sources: AutofillSources): AutofillSummary {
  return {
    releases: sources.releases.length,
    songs: sources.songs.length,
    shows: sources.shows.length,
    credits: sources.credits.length,
    members: sources.members.length,
  };
}
