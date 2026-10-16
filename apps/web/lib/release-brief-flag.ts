/**
 * NEXT_PUBLIC_FEATURE_RELEASE_BRIEF (URG-281). Ships ON: unset reads as on, and
 * only the literal string "false" switches the brief off (the cancel flow's and
 * invite gate's pattern), because new features go live enabled (founder rule,
 * 2026-10-11). With it off, the menu row is gone, `?scene=brief` reads as no
 * scene, every brief route 404s and the view link reads as unavailable. The
 * data is kept either way.
 *
 * A literal `process.env.NEXT_PUBLIC_…` read, so Next inlines it at build time.
 */
export const RELEASE_BRIEF_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_BRIEF !== 'false';
