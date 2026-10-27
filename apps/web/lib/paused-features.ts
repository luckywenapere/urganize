// Paused features (Oct 27, 2026, founder call): Opportunities and Relationships
// are switched off for users. Nothing is deleted: their tables, rows,
// migrations, pages and routes all stay, and each gate's own "off" path does
// the hiding (no nav entry, no search or prefetch, the pages bounce to Home,
// the API answers 404 'Not found.').
//
// Both start OFF with today's Vercel environment and need a NEW env var to come
// back, so pausing needed no Vercel edit:
//  - Opportunities: NEXT_PUBLIC_FEATURE_OPPORTUNITIES=true
//  - Relationships (My People, vouches, contacts in UrgAns): its old flag
//    NEXT_PUBLIC_FEATURE_RELATIONSHIPS=true (still set on Vercel) AND
//    NEXT_PUBLIC_RELATIONSHIPS_UNPAUSED=true
// NEXT_PUBLIC_* vars are inlined at build time, so a change needs a deploy.
//
// The functions read the environment on each call (tests stub it); the
// constants are the same answer read once at module load.

export const isOpportunitiesEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_OPPORTUNITIES === 'true';

export const isRelationshipsFlagOn = (): boolean =>
  process.env.NEXT_PUBLIC_RELATIONSHIPS_UNPAUSED === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_RELATIONSHIPS === 'true';

export const OPPORTUNITIES_ENABLED = isOpportunitiesEnabled();
export const RELATIONSHIPS_ENABLED = isRelationshipsFlagOn();
