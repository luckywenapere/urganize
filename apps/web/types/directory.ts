import type { DirectoryRole } from '@/lib/directory-roles';

/** How findable a person has chosen to be. Default is `private`: nobody is
 *  listed without opting in. */
export type PersonVisibility = 'private' | 'directory' | 'public';

/** Whether they want work right now. Says nothing about whether they are good
 *  at it, which is what the delivery record is for. */
export type PersonAvailability = 'open' | 'selective' | 'closed';

export type PersonLink = {
  label: string;
  url: string;
};

export type PersonProfile = {
  id: string;
  userId: string;
  displayName: string;
  slug: string | null;
  roles: DirectoryRole[];
  city: string | null;
  country: string | null;
  availability: PersonAvailability;
  bio: string | null;
  links: PersonLink[];
  avatarUrl: string | null;
  visibility: PersonVisibility;
  createdAt: string;
  updatedAt: string;
};

/**
 * One piece of delivered work. Derived, never typed by anyone: there is no
 * write path from the client to the table behind this.
 */
export type DeliveryRecordRow = {
  id: string;
  userId: string;
  role: DirectoryRole;
  releaseId: string | null;
  showId: string | null;
  completedAt: string | null;
};

/**
 * A role on a profile, and whether the product will vouch for it.
 *
 * Claimed and verified must never blur in the UI. A claimed role shows the
 * name; a verified one shows the name and the count, and the count IS the
 * badge — there is no threshold to cross (founder call, 2026-09-05).
 */
export type ProfileRole = {
  role: DirectoryRole;
  /** Releases and shows delivered in this role. Zero means claimed only. */
  delivered: number;
};
