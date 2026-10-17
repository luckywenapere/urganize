import { Space_Mono, Young_Serif } from "next/font/google";

// The homepage wears the product's own type (2026-10-17, URG-334): Young Serif
// for display and Space Mono for meta, the same pair app.urganize.app uses.
// Loaded here, not in app/layout.tsx, so only the homepage downloads them and
// every other marketing page keeps Cormorant Garamond and IBM Plex Mono. The
// variables are consumed by the `.home-v2` rules in app/globals.css.
export const youngSerif = Young_Serif({
  variable: "--font-home-display",
  subsets: ["latin"],
  weight: "400",
});

export const spaceMono = Space_Mono({
  variable: "--font-home-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const homeFontVariables = `${youngSerif.variable} ${spaceMono.variable}`;
