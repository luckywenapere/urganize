/**
 * Types for the standing per-artist press kit.
 *
 * The section list is fixed: the kit follows the standard format press,
 * editors and bookers already expect, so sections can be reordered and hidden
 * but never renamed or invented. That is enforced in the database too, by the
 * CHECK on press_kit_sections.section, so adding a thirteenth is a migration.
 */

export const PRESS_KIT_SECTIONS = [
  'header',
  'bios',
  'latest_release',
  'music',
  'assets',
  'video',
  'credits',
  'numbers',
  'press',
  'live',
  'contact',
  'links',
] as const;

export type PressKitSectionKey = (typeof PRESS_KIT_SECTIONS)[number];

export type PressKitSectionStatus = 'empty' | 'draft' | 'ready';

export type PressKitState = 'incomplete' | 'ready' | 'published';

export type PressKitVisibility = 'link_only' | 'public' | 'public_listed';

/** Where a section's current content came from. 'user' is what protects a hand
 *  edit from autofill and from a release being rolled in. */
export type PressKitSectionSource = 'autofill' | 'ai' | 'user';

export type PressKitSectionContent = Record<string, unknown>;

export interface PressKitSection {
  id: string;
  section: PressKitSectionKey;
  content: PressKitSectionContent;
  /** Null until the section has been published at least once. */
  publishedContent: PressKitSectionContent | null;
  status: PressKitSectionStatus;
  source: PressKitSectionSource;
  position: number;
  hidden: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PressKit {
  id: string;
  artistId: string;
  artistName: string;
  slug: string;
  state: PressKitState;
  visibility: PressKitVisibility;
  embargoDate: string | null;
  availableForInterview: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PressKitDetail extends PressKit {
  sections: PressKitSection[];
}

export interface PressKitSectionVersion {
  id: string;
  sectionId: string;
  content: PressKitSectionContent;
  savedBy: string | null;
  createdAt: string;
}

/** A person on the kit's contact block. Name, role and email, per the brief. */
export interface PressKitContact {
  name: string;
  role: string;
  email: string;
}

/** One figure in the Numbers section, with the date it was true. A number
 *  without that date is worse than no number at all. */
export interface PressKitStat {
  label: string;
  value: string;
  asOf: string;
}

/** A previous piece of coverage: where it ran, when, and the link. */
export interface PressKitCoverage {
  outlet: string;
  title: string;
  url: string;
  publishedOn: string;
}

/**
 * A file on the kit. Today always a press photo; `kind` exists because the
 * database already allows a logo and the brief's Assets section names both.
 *
 * `downloadUrl` is deliberately absent: a download URL is minted on click with
 * a five minute life, so a page left open overnight is not a wallet of live
 * URLs. `url` is the one hour signed URL the thumbnail renders from.
 */
export interface PressKitAsset {
  id: string;
  kind: 'press_photo' | 'logo';
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  /** Signed, one hour, for display only. Null when signing failed, in which
   *  case the grid shows the photo as unavailable rather than dropping it. */
  url: string | null;
  width: number | null;
  height: number | null;
  photographerCredit: string;
  usageRights: string;
  position: number;
  createdAt: string;
}
