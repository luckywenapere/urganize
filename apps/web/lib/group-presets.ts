// Hand-picked group tag presets for the lightweight per-task tag feature.
//
// Schema lives on `tasks.group_name` + `tasks.group_color`. Picking a preset
// in the drawer writes BOTH columns (name + the pinned color below). Custom
// names get DEFAULT_GROUP_COLOR. Customs may duplicate by name — there's no
// dedupe layer for v1.

export type GroupPreset = {
  name: string;
  color: string;
};

export const GROUP_PRESETS: readonly GroupPreset[] = [
  { name: 'Marketing & Promo', color: '#F0B95C' },
  { name: 'Distribution', color: '#5B9DF0' },
  { name: 'Creative & Assets', color: '#A78BFA' },
  { name: 'Release Admin', color: '#9CA3AF' },
  { name: 'Press & PR', color: '#EC4899' },
] as const;

export const DEFAULT_GROUP_COLOR = '#64748B';

export function findPresetByName(name: string): GroupPreset | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return (
    GROUP_PRESETS.find((preset) => preset.name.toLowerCase() === trimmed.toLowerCase()) || null
  );
}
