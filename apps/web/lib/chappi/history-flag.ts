/**
 * UrgAns chat history feature switch. Both flags, read at call time so tests
 * can stub them; client modules read it at module scope, where Next inlines
 * both values.
 *
 * Its own tiny module (URG-314) so AppShell and the workspace frame can read
 * it without pulling the history rules (lib/chappi/conversation-history.ts,
 * lib/notes) into every route's first load: Turbopack keeps a module whole
 * once anything on the root chain imports it. conversation-history re-exports it.
 */
export function isChappiHistoryEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true' &&
    process.env.NEXT_PUBLIC_FEATURE_URGANS_HISTORY === 'true'
  );
}
