// The Urganize community — a general group chat for artist managers and
// small labels (retitled from "The Release Room" 2026-07-31; it works
// better as a general group than a named, scoped "room"). Single source of
// truth for the invite link, consumed by /community and the landing page's
// CommunitySection.
//
// The same invite link is ALSO duplicated (no shared package spans both
// repos' runtimes) in apps/web/components/app/HelpMenu.tsx and the
// community.urganize.app host redirect in next.config.ts — keep both in
// sync if it ever changes.
export const WHATSAPP_COMMUNITY_URL =
  "https://chat.whatsapp.com/DGUGyC2GK3d5v6KPGw5aft";
