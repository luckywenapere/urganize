/**
 * The one floor both chrome columns respect.
 *
 * WHY THIS IS ITS OWN MODULE. The UrgAns rail and the workspace side menu are
 * both flex SIBLINGS of `<main>`, both draggable, and each one's maximum is
 * computed against whatever the other is currently taking — so the number that
 * says "and this much is left for the work" has to be ONE number. It lived
 * privately inside lib/rail-width.ts while the rail was the only draggable
 * column; a second copy in lib/sidebar-width.ts is exactly the drift this repo
 * keeps having to correct (four copies of getAccessToken, four of the
 * four-flag scene expression, two of isRecapEligible).
 */

/**
 * What `<main>` keeps no matter what.
 *
 * Below this the workspace stops being a workspace, which is not a trade a
 * width control should be able to make: two release scenes swap layout on
 * CONTAINER queries of that centre column (the content calendar at 45rem, the
 * timeline at 34rem), so a column dragged too wide silently degrades a week
 * grid into the phone list on a desktop.
 */
export const MAIN_MINIMUM = 560;
