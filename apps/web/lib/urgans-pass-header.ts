/**
 * The header a UrgAns pass travels in (see urgans-pass.ts). Its own tiny module,
 * with no imports, so code that only needs the NAME (the tools' internal fetch)
 * never pulls the signing code, and node:crypto with it, into a bundle.
 */
export const URGANS_PASS_HEADER = 'x-urganize-urgans-pass';
