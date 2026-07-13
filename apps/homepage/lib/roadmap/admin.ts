// Client-side mirror of the roadmap admin allowlist. This is a UI-gating
// convenience ONLY (show/hide the approve/promote/decline controls) -- it is
// NOT a security boundary. The real enforcement is the is_roadmap_admin() SQL
// function + RLS policies in
// supabase/migrations/20260713_add_roadmap_feature_voting.sql. Keep this list
// in sync with that migration whenever an admin is added or removed.
//
// Mirrors the shape of apps/web/lib/paywall-allowlist.ts.

const RAW_ROADMAP_ADMINS = ['luckydio10@gmail.com'];

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const ROADMAP_ADMINS: ReadonlySet<string> = new Set(
  RAW_ROADMAP_ADMINS.map(normalizeEmail).filter(Boolean)
);

export const isRoadmapAdmin = (email: string | null | undefined): boolean => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return ROADMAP_ADMINS.has(normalized);
};
