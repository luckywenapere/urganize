// Suggested grants and the grant profile ship behind this flag, off by default
// (CLAUDE.md: every new surface starts flag-off). Read in one place so the route
// and the page cannot disagree.
export function grantSuggestionsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_GRANT_SUGGESTIONS === 'true';
}
