import { readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';
import { readableCopy } from './copy-scan';
import { BANNED_COPY_CHARS, BANNED_COPY_WORDS, bannedCopyInstruction } from './press-kits';

/**
 * The press kit's house copy rules, enforced rather than reviewed.
 *
 * The brief states these as rules, not preferences, and a rule a person has to
 * remember is one that lasts until somebody is in a hurry. Each one below broke
 * at least once during the eight phases that built this feature and was caught
 * by reading; this is what stops the ninth.
 *
 * Scope is the surfaces NAMED below, which get every rule in this file. The
 * older screens were retrofitted on 2026-09-30 and are held to the em dash,
 * ship, workspace and pronoun rules by lib/house-copy-ratchet.test.ts, which
 * sweeps every component and page so a screen is covered without being listed.
 * What this file adds is the rules that only make sense on these surfaces (the
 * invented-number and job-title rules) and the lib modules a person reads.
 */

const WEB = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const FILES = [
  // The directory joined this guard rather than growing a second one: same
  // house rules, same brief, and two guards would drift the moment one of them
  // gained a rule.
  ...walk(join(WEB, 'lib')).filter((path) => /press-kit|press-photo|directory-|delivery-records|role-gaps|release-epk|activation|distribution|release-spend|featured-shelves/.test(path)),
  ...walk(join(WEB, 'components', 'press-kits')),
  // The Distribute step (2026-10-03): a new surface born under the house rules.
  join(WEB, 'components', 'releases', 'DistributionSection.tsx'),
  // Release spend (2026-10-09): a new surface born under the house rules.
  join(WEB, 'components', 'releases', 'SpendSection.tsx'),
  join(WEB, 'components', 'home', 'SpendCard.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'ReleasePaybackQuestionEmail.tsx'),
  // The settings pop-up (2026-09-29): a new surface born under the house rules.
  // ArtistsBrandSegment is left out: it is all wiring for the `workspace` state
  // object and holds no copy, and the JSX-text reader mistakes that prop name
  // for prose.
  ...walk(join(WEB, 'components', 'settings', 'segments')).filter(
    (path) => !path.endsWith('ArtistsBrandSegment.tsx')
  ),
  'components/settings/SettingsModal.tsx',
  'components/settings/SettingsNav.tsx',
  'lib/settings-nav.ts',
  ...walk(join(WEB, 'app', 'k')),
  ...walk(join(WEB, 'app', 'api', 'press-kits')),
  ...walk(join(WEB, 'app', 'dashboard', 'press-kits')),
  ...walk(join(WEB, 'app', 'api', 'admin', 'directory-backfill')),
  ...walk(join(WEB, 'app', 'api', 'directory')),
  ...walk(join(WEB, 'app', 'p')),
  ...walk(join(WEB, 'app', 'dashboard', 'directory')),
  ...walk(join(WEB, 'app', 'admin', 'directory')),
  ...walk(join(WEB, 'app', 'api', 'admin', 'directory')),
  ...walk(join(WEB, 'components', 'directory')),
  join(WEB, 'components', 'settings', 'DirectoryProfileSection.tsx'),
  // The assistant's tools for these two surfaces, named rather than walked.
  // Every description and refusal below is read by a manager in the
  // conversation, so they are press kit and directory copy like any other.
  // The lib walk above reaches press-kits.ts only because its filename happens
  // to contain the pattern, and cannot reach directory.ts at all; naming both
  // makes the coverage a decision instead of a coincidence.
  join(WEB, 'lib', 'chappi', 'tool-families', 'press-kits.ts'),
  join(WEB, 'lib', 'chappi', 'tool-families', 'directory.ts'),
  // The help pullouts (2026-09-08). Every string in that module is read by a
  // manager, and it is a NEW surface, so it is born under the house rules
  // rather than grandfathered out of them like the older copy this guard's
  // header excludes. Its own guard, lib/help-copy.test.ts, adds the
  // readability caps on top; this one supplies the em dash, the banned words
  // and the "never says workspace" rule so there is one definition of each.
  join(WEB, 'lib', 'help-copy.ts'),
  // Chappi Speaks (2026-09-29): the daily line on a quiet Home. Chappi's voice
  // is the brand's voice, so it is born under the same house rules.
  join(WEB, 'lib', 'home', 'chappi-speaks.ts'),
  join(WEB, 'components', 'home', 'ChappiSpeaksCard.tsx'),
  join(WEB, 'components', 'home', 'ManagerQuietView.tsx'),
  // Share to socials (2026-09-23): the same argument as the pullouts. A new
  // surface, so it is born under the house rules, and it is the one surface
  // in the product whose copy is PUBLISHED by the user as their own words on
  // Instagram and WhatsApp. The outward-copy tests in social-share.test.ts add
  // the rules that only apply there (no "rollout", no Urganize in a caption,
  // no date leaking out of a secret one); this supplies the em dash and the
  // banned words, so there is one definition of each.
  ...walk(join(WEB, 'components', 'share')),
  // basename rather than a path pattern: walk() joins with the platform's
  // separator, so a pattern written for "/" alone matches nothing on Windows.
  ...walk(join(WEB, 'lib')).filter((path) => basename(path).startsWith('social-share')),
  ...walk(join(WEB, 'app', 'api', 'releases', '[releaseId]', 'share-card')),
  // Saved UrgAns chats (2026-09-24), a new surface born under the house rules
  // for the same reason the help pullouts were. ChappiConversation itself is
  // held to the em dash rule by lib/house-copy-ratchet.test.ts, which sweeps
  // every component, so it does not need listing here.
  ...walk(join(WEB, 'app', 'api', 'urgans', 'conversations')),
  join(WEB, 'lib', 'chappi', 'conversation-history.ts'),
  join(WEB, 'lib', 'chappi', 'conversations-server.ts'),
  join(WEB, 'stores', 'useChappiHistoryStore.ts'),
  join(WEB, 'components', 'chappi', 'ChappiHistoryList.tsx'),
  join(WEB, 'components', 'chappi', 'ChappiDeleteChatDialog.tsx'),
  // Brand colors for those images (2026-09-24): the Settings editor and its
  // route are the same new surface, so they are born under the same rules. The
  // lib half is already reached by the social-share prefix above.
  join(WEB, 'components', 'settings', 'BrandColorsSection.tsx'),
  ...walk(join(WEB, 'app', 'api', 'workspace', 'artists', '[artistId]', 'brand-colors')),
  // A curator's public page and the block she copies her link from
  // (2026-09-15). Another NEW outward-facing surface, so it is born under these
  // rules: /pitch/{slug} is read by an artist deciding whether to make an
  // account, and the invented-number rule matters there in particular, because
  // a follower count is self-reported and belongs in a row rather than in a
  // sentence. The lib files are NAMED rather than left to the walk's regex,
  // which would not match either of them — the same reason the two tool
  // families above are named.
  ...walk(join(WEB, 'app', 'pitch')),
  ...walk(join(WEB, 'components', 'curator')),
  ...walk(join(WEB, 'app', 'api', 'curator', 'profile', 'publish')),
  join(WEB, 'lib', 'curator-public.ts'),
  join(WEB, 'lib', 'curator-public-server.ts'),
  join(WEB, 'lib', 'pitch-intent.ts'),
  join(WEB, 'components', 'shared', 'CopyLinkButton.tsx'),
  // Shows (2026-09-25), when it came out of Beta. Every screen was rewritten
  // for that, so the whole surface is born under the house rules: the pages,
  // the DJ's own pack page, the routes whose errors a manager reads, the pure
  // modules that write the sentences, and the assistant's tools for shows.
  ...walk(join(WEB, 'components', 'events')),
  ...walk(join(WEB, 'app', 'dashboard', 'shows')),
  ...walk(join(WEB, 'app', 'pack')),
  ...walk(join(WEB, 'app', 'api', 'events')),
  ...walk(join(WEB, 'app', 'api', 'setlists')),
  ...walk(join(WEB, 'app', 'api', 'songs')),
  ...walk(join(WEB, 'app', 'api', 'packs')),
  ...walk(join(WEB, 'app', 'api', 'pack')),
  ...['events.ts', 'setlist.ts', 'dj-pack.ts', 'dj-pack-server.ts', 'song-versions.ts', 'song-version-upload.ts', 'song-catalog.ts'].map(
    (file) => join(WEB, 'lib', file)
  ),
  join(WEB, 'lib', 'chappi', 'tool-families', 'shows.ts'),
  join(WEB, 'stores', 'useEventsStore.ts'),
  // Curator pitch payments (2026-09-25). Scoped to the sentences a CURATOR or
  // an ARTIST actually reads — the copy module every screen quotes from, the
  // legal terms, and the customer-facing screens themselves — the same line
  // this guard already draws around outward product surfaces rather than
  // internal ones. Deliberately EXCLUDED: /admin/pitch-payments (an internal
  // founder console, the same category as /admin/teams and /admin/urgans,
  // neither of which is walked either), the cron route, and the raw API
  // route handlers — none of this feature's siblings brings its own route
  // error strings into scope, and doing it for this one alone would be an
  // arbitrary line rather than a considered one.
  join(WEB, 'lib', 'pitch-payment-copy.ts'),
  join(WEB, 'lib', 'pitch-payment-terms.ts'),
  join(WEB, 'components', 'pitching', 'PitchCheckoutPanel.tsx'),
  join(WEB, 'components', 'pitching', 'PitchTerms.tsx'),
  join(WEB, 'components', 'pitching', 'PitchPayments.tsx'),
  join(WEB, 'components', 'pitching', 'SentPitchRow.tsx'),
  ...walk(join(WEB, 'app', 'dashboard', 'pitching', 'paid')),
  ...walk(join(WEB, 'app', 'curator', 'earnings')),
  join(WEB, 'app', 'curator', 'CuratorInboxPageClient.tsx'),
  // Voice input for UrgAns (2026-09-25). The composer's mic and its recorder
  // hook, the transcribe route whose errors the person reads, and the pure
  // module that writes the validation and offline copy.
  join(WEB, 'lib', 'urgans-voice.ts'),
  join(WEB, 'components', 'chappi', 'useVoiceInput.ts'),
  ...walk(join(WEB, 'app', 'api', 'urgans', 'transcribe')),
].filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'));

// Reads through `readableCopy`, not the narrower `userFacingStrings` this file
// used until 2026-09-15. That one only sees quoted string literals, and every
// surface this guard covers is majority JSX PROSE — the press kit's own "Press
// kit" heading and the curator page's whole body render as text between tags,
// never a string. So the guard had been checking almost nothing in the pages it
// exists to check. `readableCopy` also catches template literals, which
// `userFacingStrings` never did either. Same extractor the positioning and
// rollout-vocabulary guards use, for the identical reason.

const report = (path: string, value: string) =>
  `${path.replace(`${WEB}/`, '')}: ${value}`;

describe('press kit copy', () => {
  it('finds the files it is meant to be guarding', () => {
    // A walk that silently matched nothing would pass every test below.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('uses no em dash', () => {
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of readableCopy(readFileSync(path, 'utf8'))) {
        if (BANNED_COPY_CHARS.some((char) => value.includes(char))) {
          found.push(report(path, value));
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('never says ship', () => {
    // "Deliver" and "delivered". A release is delivered.
    //
    // The instruction that tells UrgAns this rule necessarily contains the
    // word, so it is exempted by identity rather than by a pattern: the ONE
    // string allowed to name a banned word is the one built from the list the
    // guard itself reads.
    const allowed = bannedCopyInstruction();
    const pattern = new RegExp(`\\b(${BANNED_COPY_WORDS.join('|')})\\b`, 'i');
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of readableCopy(readFileSync(path, 'utf8'))) {
        if (value === allowed) continue;
        if (pattern.test(value)) found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });

  it('never says workspace', () => {
    // The word is for positioning and messaging. It is banned inside product
    // copy, where a manager would have to work out what it means.
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of readableCopy(readFileSync(path, 'utf8'))) {
        if (/\bworkspaces?\b/i.test(value)) found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });

  it('writes no placeholder stat, fake quote or invented number', () => {
    // The brief's hardest line: empty is better than fake. Nothing in this
    // feature may put a figure or a quotation on somebody's kit that nobody
    // gave us. The Numbers section is hand entered and date stamped for the
    // same reason, and autofill deliberately writes nothing into it.
    const suspicious = [
      /\b\d[\d,.]*\s*(monthly listeners|streams|plays|followers|fans)\b/i,
      /\b(rising|acclaimed|breakout|award[- ]winning|chart[- ]topping)\b/i,
      /\blorem ipsum\b/i,
    ];
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of readableCopy(readFileSync(path, 'utf8'))) {
        if (suspicious.some((pattern) => pattern.test(value))) found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });

  it('names a job, never a title borrowed from software', () => {
    // Plain job titles. "Operation heads", not "VP Operations".
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of readableCopy(readFileSync(path, 'utf8'))) {
        if (/\b(VP|SVP|C[ETMOF]O|stakeholder|synerg)/.test(value)) found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });
});
