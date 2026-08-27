// Release metadata hub + collaborator credit capture (URG-108). The
// owner-facing shapes returned by the /api/releases/[releaseId]/credits
// routes. The public submission form's shape lives in lib/credits-server.ts
// (server-only, never sent to the owner client).

export type ReleaseCreditRole =
  | 'songwriter'
  | 'composer'
  | 'lyricist'
  | 'producer'
  | 'featured_artist'
  | 'vocalist'
  | 'musician'
  | 'engineer'
  | 'mixing_engineer'
  | 'mastering_engineer'
  | 'other';

export const RELEASE_CREDIT_ROLE_OPTIONS: ReleaseCreditRole[] = [
  'songwriter',
  'composer',
  'lyricist',
  'producer',
  'featured_artist',
  'vocalist',
  'musician',
  'engineer',
  'mixing_engineer',
  'mastering_engineer',
  'other',
];

export const RELEASE_CREDIT_ROLE_LABELS: Record<ReleaseCreditRole, string> = {
  songwriter: 'Songwriter',
  composer: 'Composer',
  lyricist: 'Lyricist',
  producer: 'Producer',
  featured_artist: 'Featured artist',
  vocalist: 'Vocalist',
  musician: 'Musician',
  engineer: 'Engineer',
  mixing_engineer: 'Mixing engineer',
  mastering_engineer: 'Mastering engineer',
  other: 'Other',
};

export interface ReleaseCreditLink {
  id: string;
  releaseId: string;
  shareToken: string;
  /** When the owner closed the link, or null while it is open and accepting
   * answers. A closed link still resolves: the public page shows a "this
   * request is closed" message instead of the form. */
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseCreditSubmission {
  id: string;
  releaseId: string;
  legalName: string;
  stageName: string;
  roles: ReleaseCreditRole[];
  contribution: string;
  email: string;
  phone: string;
  country: string;
  songwriterSplit: number | null;
  proAffiliation: string;
  ipiNumber: string;
  publisherName: string;
  publisherIpi: string;
  masterSplit: number | null;
  instagramHandle: string;
  xHandle: string;
  bio: string;
  confirmedAccurate: boolean;
  createdAt: string;
  updatedAt: string;
}

// Payload the public form POSTs to /api/credits/[token]. A client-side
// contract only — app/api/credits/[token]/route.ts re-validates every field
// server-side since this endpoint has no auth boundary.
export type CreditSubmissionInput = {
  legalName: string;
  stageName?: string;
  roles: ReleaseCreditRole[];
  contribution?: string;
  email: string;
  phone?: string;
  country?: string;
  songwriterSplit?: number | null;
  proAffiliation?: string;
  ipiNumber?: string;
  publisherName?: string;
  publisherIpi?: string;
  masterSplit?: number | null;
  instagramHandle?: string;
  xHandle?: string;
  bio?: string;
  confirmedAccurate: boolean;
};
