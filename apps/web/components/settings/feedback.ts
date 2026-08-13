// Save-result feedback for settings form sections (2026-08-13).
//
// These strings existed inline in six sections and had drifted three ways: the
// workspace editors used a bordered box, Profile / Security / Artist profile
// used a bare colored <p>, and WorkspaceLogoSection used the box but with
// `rounded-none` — sitting in the same two-column row as WorkspaceIdentitySection,
// which used `rounded-lg`. The boxed rounded-lg form wins as the most
// deliberate of the three and is now the only one.
//
// Compact toggle ROWS deliberately do not use these — see the note in
// SettingRow.tsx.
export const feedbackSuccessClass =
  'rounded-lg border border-brand/35 bg-brand-muted px-3 py-2 text-sm text-brand';

export const feedbackErrorClass =
  'rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error';
