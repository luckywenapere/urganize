import { DM_Mono, DM_Sans } from "next/font/google";

// The marketing site wears the Urganize logo's own lettering (2026-11-15,
// founder: "that should be our official font for everything"; #1312). The
// wordmark is set in DM Sans Bold, and the app moved to the same family the
// same day (#1309). DM Sans is the body face and, bold with slightly tight
// tracking, the display face; DM Mono carries the catalog voice (dates,
// counts, small labels). Young Serif, Space Mono and Instrument Sans are
// retired here.
//
// The variable names are kept from the Young Serif era so every rule in
// globals.css that reads them follows without edits: --font-home-display and
// --font-home-sans both point at DM Sans. app/layout.tsx puts these on <html>;
// the homepage adds them on `.home-v2` too, which is the same next/font
// instance, so the files are requested once.
export const dmSans = DM_Sans({
  variable: "--font-home-display",
  subsets: ["latin"],
  display: "swap",
});

export const dmMono = DM_Mono({
  variable: "--font-home-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const homeFontVariables = `${dmSans.variable} ${dmMono.variable}`;
