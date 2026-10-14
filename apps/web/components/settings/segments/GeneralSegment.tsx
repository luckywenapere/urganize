'use client';

import { memo } from 'react';
import { ProfileSection } from '../ProfileSection';
import { ArtistProfileSection } from '../ArtistProfileSection';
import { AppearanceSection } from '../AppearanceSection';
import { RoleViewSection } from '../RoleViewSection';
import { ReportIssueSection } from '../ReportIssueSection';
import { GuidedToursSection } from '../GuidedToursSection';

// Read here as well as in the two sections, only to know whether the Help group
// has anything in it. Rendering its wrapper around two sections that both
// return null would leave an empty element for the column's dividers to draw a
// stray line above.
const HELP_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_REPORT_ISSUE === 'true' ||
  process.env.NEXT_PUBLIC_FEATURE_TOURS === 'true';

/**
 * The everyday settings: who you are, how it looks, and where to get help.
 *
 * Report an issue and Replay tours live here as a Help group. They used to sit
 * in the middle of the Account tab because the `?` help menu is hidden on a
 * phone, so this was their only way in; the pop-up is reachable on a phone, and
 * this is where a person looks for help, so that reason still holds and the
 * placement is now deliberate rather than inherited.
 *
 * `ArtistProfileSection` is here and not under Artists & brand, and that is
 * load-bearing: it writes `profiles.artist_name` on the signed-in user's OWN
 * row, while the roster edits the team's `artists` rows. Keep them in different
 * segments, each stating its own scope (CLAUDE.md records this as the deliberate
 * writer for that column until its legacy readers retire).
 */
function GeneralSegmentView() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <ProfileSection />
      <ArtistProfileSection />
      <AppearanceSection />
      <RoleViewSection />
      {HELP_ENABLED ? (
        <div id="help" className="scroll-mt-4 divide-y divide-stroke-subtle">
          <ReportIssueSection />
          <GuidedToursSection />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Memoised (2026-10-11): every segment opened in this visit stays mounted, and
 * the dialog re-renders on each keystroke in its search box and each dirty or
 * URL change, which used to re-render every one of them. Measured as a 304ms
 * INP on the Team segment. With stable props it now re-renders only when its
 * own inputs change.
 */
export const GeneralSegment = memo(GeneralSegmentView);
