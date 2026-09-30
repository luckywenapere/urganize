// How loud a confirmation card should look.
//
// Every confirmation-gated tool used to get the red "danger" treatment,
// including the ones that are not destructive at all: publishing a press kit,
// sending a DJ pack, pitching a song, inviting a teammate. Those are gated
// because they cannot be TAKEN BACK, not because they destroy anything, and
// painting them red teaches people that red is normal, which dulls the one
// warning that matters (a delete). Removal tools keep the danger look; the
// rest get a neutral card and a primary Approve.
//
// The rule is the tool-naming rule tool-registry.test.ts already enforces:
// every `delete_*` tool is gated, and `remove_*` is the honest name for taking
// one thing out of a list (see remove_setlist_item, remove_artist).
export type ConfirmationTone = 'danger' | 'neutral';

export function confirmationTone(toolName: string): ConfirmationTone {
  return /^(delete|remove)_/.test(toolName) ? 'danger' : 'neutral';
}
