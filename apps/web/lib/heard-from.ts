// "How did you hear about Urganize?" (2026-10-25): one optional question on
// the account step, so acquisition cost can be read per channel. Never blocks
// sign-up. Stored in Supabase auth user metadata (user_metadata.heard_from),
// not a profiles column, so it needs no migration; the admin onboarding page
// reads it back from there.

export type HeardFromSource =
  | 'instagram'
  | 'x'
  | 'tiktok'
  | 'friend_or_artist'
  | 'manager_or_label'
  | 'whatsapp'
  | 'event'
  | 'google'
  | 'other';

export const HEARD_FROM_OPTIONS: Array<{ value: HeardFromSource; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'friend_or_artist', label: 'A friend or artist' },
  { value: 'manager_or_label', label: 'A manager or label' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'event', label: 'Event' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Other' },
];

export const HEARD_FROM_LABELS = new Map<string, string>(
  HEARD_FROM_OPTIONS.map((option) => [option.value, option.label])
);

/** The user_metadata key the answer is saved under. */
export const HEARD_FROM_METADATA_KEY = 'heard_from';

export const isHeardFromSource = (value: unknown): value is HeardFromSource =>
  typeof value === 'string' && HEARD_FROM_LABELS.has(value);
