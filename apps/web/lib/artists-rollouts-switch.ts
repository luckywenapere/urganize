import { ARTISTS_HREF, CATALOGUE_HREF } from './shell-nav';

/**
 * The two-way switch on the phone's Artists tab: the Artists list and the
 * Rollouts list are different pages that share one tab (swipe-nav maps both to
 * Artists), so each carries this switch to say which one you are on and to move
 * between them. No fourth tab and no nav change (founder call, 2026-10-21).
 */
export type ArtistsRolloutsKey = 'artists' | 'rollouts';

export const ARTISTS_ROLLOUTS_SEGMENTS: readonly { key: ArtistsRolloutsKey; label: string; href: string }[] = [
  { key: 'artists', label: 'Artists', href: ARTISTS_HREF },
  { key: 'rollouts', label: 'Rollouts', href: CATALOGUE_HREF },
];
