/**
 * Rolling a new release into a kit that already exists.
 *
 * Autofill runs once, when the kit is created, and refuses any section
 * somebody has touched. That is the right rule for a first fill and the wrong
 * one six months later, when a release has landed and the kit still points at
 * the last one. This module is the answer to that, and it differs from
 * autofill in exactly two ways:
 *
 *   1. IT NEVER WRITES. It returns proposals. A person accepts each one.
 *   2. It proposes over hand written sections too, and says so, because
 *      refusing to mention a stale release would be worse than offering to
 *      replace a sentence somebody wrote.
 *
 * The content it proposes comes from `buildSectionContent`, the same builders
 * autofill uses. One set, so the two can never disagree about what a release
 * puts on a kit.
 *
 * Pure. The loading half is lib/press-kit-autofill-server.ts, which this
 * reuses wholesale.
 */

import { AUTOFILLABLE_SECTIONS, buildSectionContent, type AutofillSources } from './press-kit-autofill';
import { PRESS_KIT_SECTION_LABELS, sameContent } from './press-kits';
import type {
  PressKitSection,
  PressKitSectionContent,
  PressKitSectionKey,
} from '@/types/press-kits';

/**
 * The sections a release can be rolled into.
 *
 * Everything autofill can write EXCEPT contacts. Autofill fills a contact with
 * a blank role deliberately, since the only role the product holds for a
 * teammate is a permission level rather than a job title. Re-proposing that
 * would offer to replace a contact somebody completed in the interview with an
 * incomplete one, which is the opposite of what this module is for. Contacts
 * are owned by the interview and by hand.
 */
export const ROLLABLE_SECTIONS: readonly PressKitSectionKey[] = AUTOFILLABLE_SECTIONS.filter(
  (section) => section !== 'contact'
);

export type RolloutProposal = {
  section: PressKitSectionKey;
  /** What the kit says now. */
  current: PressKitSectionContent;
  /** What it would say. Already merged, so this is exactly what gets saved. */
  proposed: PressKitSectionContent;
  /** True when somebody has written in this section by hand. The card says so
   *  rather than quietly offering to overwrite their words. */
  handWritten: boolean;
  /** How many entries a list section would gain. Zero for a field section. */
  added: number;
};

const asRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[])
    : [];

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Which list a section keeps its entries under, and how an entry is
 *  recognised as one we already have. */
/**
 * Joined for a composite key, and EMPTY when every part is empty.
 *
 * The empty case is load-bearing rather than tidy: a naive join gives "|" for
 * two blank fields, which is a truthy string, so a nameless row would read as
 * having an identity and be added again on every roll in.
 */
const composite = (...parts: string[]): string =>
  parts.some((part) => part) ? parts.join('|') : '';

const LIST_SPEC: Record<
  string,
  { key: string; identity: (item: Record<string, unknown>) => string }
> = {
  music: { key: 'tracks', identity: (item) => str(item.songId) },
  credits: {
    key: 'credits',
    identity: (item) =>
      composite(str(item.legalName).toLowerCase(), str(item.stageName).toLowerCase()),
  },
  live: {
    key: 'shows',
    identity: (item) => composite(str(item.title).toLowerCase(), str(item.startAt)),
  },
};

/**
 * Add incoming entries to a list without disturbing the ones already there.
 *
 * Two rules, and they pull in opposite directions on purpose:
 *
 *   - EXISTING entries are never filtered, whatever they look like. A row
 *     somebody typed by hand carries no song id, and dropping it would be the
 *     exact data loss this file exists to prevent. That is guaranteed by the
 *     spread rather than by a check.
 *   - An INCOMING entry that matches one already listed is skipped, so a track
 *     title corrected by hand stays corrected. An incoming entry with no
 *     identity at all is also skipped, because there is nothing to match it on:
 *     keeping it would re-add the same nameless row on every roll in until the
 *     list filled with copies. A credit with no legal name or a show with no
 *     title and no date is not worth that.
 */
function mergeList(
  current: unknown,
  incoming: unknown,
  identity: (item: Record<string, unknown>) => string
): { merged: Record<string, unknown>[]; added: number } {
  const existing = asRows(current);
  const seen = new Set(existing.map(identity).filter(Boolean));
  const additions = asRows(incoming).filter((item) => {
    const id = identity(item);
    if (!id) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { merged: [...existing, ...additions], added: additions.length };
}

/**
 * What a section would say after the roll in.
 *
 * THE RULE: a roll in never deletes a field because the incoming content had
 * nothing to put there. So this merges rather than replaces, and the builders
 * only emit fields they have data for.
 *
 * ONE exception, and it is the reason this function exists rather than a spread
 * at the call site: the `hook` on the latest release. That is a sentence
 * somebody wrote about ONE record, so when the release itself changes the hook
 * is cleared. Carrying it forward would put a line about last year's single
 * under this year's EP, which is worse than an empty field. It is cleared to an
 * empty string rather than deleted, so the proposal shows a person that the
 * field is going blank.
 */
export function mergeProposedContent(
  section: PressKitSectionKey,
  current: PressKitSectionContent,
  incoming: PressKitSectionContent
): PressKitSectionContent {
  const spec = LIST_SPEC[section];
  if (spec) {
    const { merged } = mergeList(current[spec.key], incoming[spec.key], spec.identity);
    return { ...current, ...incoming, [spec.key]: merged };
  }

  const next: PressKitSectionContent = { ...current, ...incoming };

  if (section === 'latest_release') {
    const wasAbout = str(current.releaseId);
    const isAbout = str(incoming.releaseId);
    if (wasAbout && isAbout && wasAbout !== isAbout) {
      next.hook = '';
    }
  }

  return next;
}

/**
 * Every change a roll in would make, as proposals nobody has accepted yet.
 *
 * A section is proposed only when there is something to say AND it differs
 * from what is already there, so a kit that is already up to date offers
 * nothing and the banner stays away.
 */
export function buildRolloutProposals(
  sources: AutofillSources,
  sections: readonly PressKitSection[]
): RolloutProposal[] {
  const proposals: RolloutProposal[] = [];

  for (const key of ROLLABLE_SECTIONS) {
    const existing = sections.find((section) => section.section === key);
    if (!existing) continue;

    const incoming = buildSectionContent(key, sources);
    if (!incoming) continue;

    const current = existing.content || {};
    const proposed = mergeProposedContent(key, current, incoming);
    if (sameContent(current, proposed)) continue;

    const spec = LIST_SPEC[key];
    const added = spec
      ? mergeList(current[spec.key], incoming[spec.key], spec.identity).added
      : 0;

    proposals.push({
      section: key,
      current,
      proposed,
      handWritten: existing.source === 'user',
      added,
    });
  }

  return proposals;
}

/**
 * One line saying what would change, for the card.
 *
 * Names the thing rather than counting sections, the same reasoning the
 * publish panel lists its changed sections by name: a count makes somebody
 * hunt, a name lets one glance decide.
 */
export function describeProposal(proposal: RolloutProposal): string {
  const label = PRESS_KIT_SECTION_LABELS[proposal.section];

  if (proposal.added > 0) {
    const noun = proposal.added === 1 ? 'entry' : 'entries';
    return `${label}: ${proposal.added} new ${noun}.`;
  }

  if (proposal.section === 'latest_release') {
    const title = str(proposal.proposed.title);
    return title ? `${label}: point it at ${title}.` : `${label}: update the details.`;
  }

  return `${label}: update the details.`;
}
