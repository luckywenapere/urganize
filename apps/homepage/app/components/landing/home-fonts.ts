import { Space_Mono, Young_Serif } from "next/font/google";

// The homepage wears the product's own type (2026-10-17, URG-334): Young Serif
// for display and Space Mono for meta, the same pair app.urganize.app uses.
// Since 2026-10-18 (URG-383) every marketing page wears it: app/layout.tsx
// puts these variables on <html> and globals.css points --font-display and
// --font-mono at them. The homepage still adds them on `.home-v2` too; it is
// the same next/font instance, so the files are requested once.
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
