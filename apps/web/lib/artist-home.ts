// Home for an artist (2026-11-01, founder): someone who IS the artist does not
// need a list of one artist to tap through. Home shows their own artist page.
//
// "Is the artist" is the account's own answer (the solo artist view: "Who are
// you?" = independent artist, or profiles.role = 'artist'), read whether or not
// the role-views menu flag is on, because this is about Home, not the menu.
// With more than one artist on the team the list stays, so nobody loses a way
// to reach an artist.

import { resolveRoleView, type RoleViewViewer } from './role-views';

export function artistHomeId(
  viewer: RoleViewViewer | null | undefined,
  artists: ReadonlyArray<{ id: string }>
): string | null {
  if (!viewer || resolveRoleView(viewer) !== 'solo_artist') return null;
  return artists.length === 1 ? artists[0].id : null;
}
