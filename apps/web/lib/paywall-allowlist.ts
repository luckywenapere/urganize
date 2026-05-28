// Emails that bypass the global access gate entirely.
//
// Single source of truth for the allowlist used by:
//   - apps/web/app/api/_shared/paywall.ts (server-side requireActiveAccount)
//   - apps/web/app/api/subscription-status/route.ts (frontend-visible snapshot)
//   - apps/web/lib/auth-store.ts (post-login redirect)
//   - apps/web/app/locked/page.tsx (defensive bounce off /locked)
//
// To add or remove access, edit this list and ship. Lowercase + trimmed
// comparisons mean casing / accidental whitespace don't break the check.

const RAW_ALLOWLIST = [
  'luckydio10@gmail.com',
  'luckywenapere@gmail.com',
  'aesthetique.toine@gmail.com',
  'adamukabiru772@gmail.com',
  'itsderah@gmail.com',
  'ewaoluwaadenaiye@gmail.com',
];

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

// Frozen set so consumers can't accidentally mutate the allowlist at runtime.
export const PAYWALL_ALLOWLIST: ReadonlySet<string> = new Set(
  RAW_ALLOWLIST.map(normalizeEmail).filter(Boolean)
);

// Also exported as a sorted array for UI rendering / debug surfaces.
export const PAYWALL_ALLOWLIST_EMAILS: readonly string[] = [...PAYWALL_ALLOWLIST].sort();

export const isAllowlistedEmail = (email: string | null | undefined): boolean => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return PAYWALL_ALLOWLIST.has(normalized);
};
