import { Fraunces, Space_Mono } from 'next/font/google';

// The content calendar's Brand Bible (URG 001) faces, split into their own
// module 2026-08-04 when the calendar stopped being a route and became an
// overlay window: next/font/google calls must sit at module scope, and both the
// scene and its grid skeleton need the same variables without one importing the
// other's whole module. Fraunces for the release title (a large display
// moment); Space Mono for metadata (day numbers, month label, status stamps).
const fraunces = Fraunces({ subsets: ['latin'], weight: '500', variable: '--font-cc-display' });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-cc-mono' });

/** Apply to any element whose subtree consumes --font-cc-display / --font-cc-mono. */
export const calendarFontVariables = `${fraunces.variable} ${spaceMono.variable}`;
