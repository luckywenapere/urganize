/**
 * Home's lower band (2026-10-18, golden layout B, founder approved): numbers in
 * rows, not cards. Each row is 56px, label left, value right in mono, a quiet
 * chevron, hairlines between rows (HOME_ROWS on the wrapper). Empty rows never
 * render: each caller returns null instead.
 */
export const HOME_ROWS = 'divide-y divide-stroke-subtle';

export const HOME_ROW =
  'motion-focus flex h-14 w-full items-center gap-3 px-1 text-left text-base text-content-primary hover:text-brand';

export const HOME_ROW_VALUE = 'shrink-0 font-mono text-[15px] tabular-nums text-content-primary';

export const HOME_ROW_CHEVRON = 'h-4 w-4 shrink-0 text-content-primary/40';
