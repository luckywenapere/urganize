// The content calendar's Brand Bible (URG 001) faces: Young Serif for the
// release title (a large display moment), Space Mono for metadata (day
// numbers, month label, status stamps).
//
// 2026-10-15 (perf pass URG-314): these were their own next/font/google calls,
// a duplicate of the two faces app/layout.tsx already self-hosts, so the
// calendar downloaded both again under different file names. The
// --font-cc-display / --font-cc-mono variables are now defined in globals.css
// on :root from the layout's --font-young-serif / --font-space-mono, so they
// resolve everywhere, portals included. This class is kept as a harmless
// marker so existing call sites need no change.

/** Apply to any element whose subtree consumes --font-cc-display / --font-cc-mono. */
export const calendarFontVariables = 'cc-fonts';
