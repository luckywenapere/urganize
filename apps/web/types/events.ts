import type { EventStatus } from '@/lib/events';

/**
 * A show. The sibling object to a release (see the header of
 * supabase/migrations/20260830120000_events.sql): both hang off an artist,
 * and the Song is the join between them.
 *
 * camelCase here, snake_case in the database — the repo-wide convention.
 */
export type ShowEvent = {
  id: string;
  artistId: string;
  /** Denormalized for display so a list does not need a join. */
  artistName: string;
  title: string;
  venueName: string | null;
  city: string | null;
  country: string | null;
  /** IANA name. Every set time is displayed in THIS zone, never the viewer's. */
  timezone: string;
  /** ISO instant, or null while the promoter has not confirmed a time. */
  setStartAt: string | null;
  /** The number a setlist is measured against. */
  setLengthMinutes: number;
  stage: string | null;
  promoterName: string | null;
  promoterPhone: string | null;
  status: EventStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Call time, soundcheck, doors, load out. Times are optional because the
 *  list is seeded before any of them are known. */
export type RunOfShowItem = {
  id: string;
  eventId: string;
  label: string;
  at: string | null;
  position: number;
};

export type Setlist = {
  id: string;
  eventId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type SetlistItemType = 'song' | 'talk' | 'interlude' | 'break';

export type SetlistItem = {
  id: string;
  setlistId: string;
  itemType: SetlistItemType;
  /** Null for everything except a song item. */
  songId: string | null;
  songVersionId: string | null;
  position: number;
  /** An override typed on the item. Null means resolve from the version, then
   *  the song — and null everywhere means the item still needs a length. */
  durationSeconds: number | null;
  cueNote: string | null;
  /** Free text for non-song items ("Introduce the band"). */
  label: string | null;
};
