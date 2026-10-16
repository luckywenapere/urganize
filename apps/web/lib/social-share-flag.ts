/**
 * Share to socials switch (NEXT_PUBLIC_FEATURE_SOCIAL_SHARE). Its own tiny
 * module (URG-314 batch 6) so the app shell can read it without pulling the
 * caption builder in lib/social-share.ts into every route's first load.
 * lib/social-share.ts re-exports it.
 */
export const isSocialShareEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_SOCIAL_SHARE === 'true';
