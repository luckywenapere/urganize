// The Release Room — Urganize's WhatsApp community for artist managers and
// small labels. Single source of truth for the invite link and member
// count, consumed by /community and the landing page's ReleaseRoomSection.
//
// The same invite link is ALSO duplicated (no shared package spans both
// repos' runtimes) in apps/web/components/app/HelpMenu.tsx and the
// community.urganize.app host redirect in next.config.ts — keep all three
// in sync if it ever changes.
export const WHATSAPP_COMMUNITY_URL =
  "https://chat.whatsapp.com/DGUGyC2GK3d5v6KPGw5aft";

// Hand-counted in the group. WhatsApp exposes no API for group size, so
// this is a manually verified number, not a live metric:
//   - re-count in the group before changing this value
//   - never round up, never add a "+"
//   - if you can't re-verify it, set this to `null` — every surface that
//     reads it (ReleaseRoomSection, /community) renders correctly with no
//     count shown rather than risk a stale or inflated figure
export const RELEASE_ROOM_MEMBER_COUNT: number | null = 35;
export const RELEASE_ROOM_COUNT_VERIFIED_ON = "2026-07-31";
