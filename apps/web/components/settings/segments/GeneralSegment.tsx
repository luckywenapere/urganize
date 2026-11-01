'use client';

import { memo } from 'react';
import { ProfileSection } from '../ProfileSection';
import { ArtistProfileSection } from '../ArtistProfileSection';
import { AppearanceSection } from '../AppearanceSection';

/**
 * The everyday settings: who you are and how it looks.
 *
 * Nov 1, 2026 (founder): Guided tours and Role view left this page, and Report
 * an issue became "Send feedback" in the account page. The section files stay.
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
