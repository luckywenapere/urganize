'use client';

import { BillingSection } from '../BillingSection';
import { ProfileSection } from '../ProfileSection';
import { ArtistProfileSection } from '../ArtistProfileSection';
import { AppearanceSection } from '../AppearanceSection';
import { SecuritySection } from '../SecuritySection';
import { SessionSection } from '../SessionSection';
import { DeleteAccountSection } from '../DeleteAccountSection';

/**
 * "You" — the settings that belong to the person, not the workspace.
 *
 * The default tab, and where every plain `/settings` link lands. Ordered by
 * frequency with the high-consequence, rarely-used account plumbing last
 * (password, sign out, delete) — the same rationale the old flat page used for
 * its bottom third, now with nothing else interleaved above it.
 *
 * ArtistProfileSection lives HERE, not in Workspace, and that placement is
 * load-bearing rather than arbitrary: it writes `profiles.artist_name` on the
 * user's own profile row, while WorkspaceArtistSection edits the workspace's
 * `artists` row. Splitting them across tabs also fixes a real confusion — an
 * artist-role account used to see two inputs both labelled "Artist name" with
 * the same "e.g. Tems" placeholder, stacked, with nothing saying which was
 * which. Do not merge or delete it: CLAUDE.md records it as the deliberate
 * writer for that column until its four legacy readers retire.
 *
 * BillingSection leads the tab (2026-08-13). It is the one section here with
 * time-sensitive content (a trial counting down, a plan lapsing), and the
 * payment callback's "Billing" button pushes a plain `/settings` — which lands
 * on this tab, so first position is what makes that button honest without the
 * callback needing to know about tabs at all.
 */
export function AccountTab() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <BillingSection />
      <ProfileSection />
      <ArtistProfileSection />
      <AppearanceSection />
      <SecuritySection />
      <SessionSection />
      <DeleteAccountSection />
    </div>
  );
}
