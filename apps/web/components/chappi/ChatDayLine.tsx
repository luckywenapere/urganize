'use client';

/** A quiet line across the chat with the day's name in it (#1207). */
export function ChatDayLine({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 text-[11px] uppercase tracking-[0.08em] text-content-tertiary">
      <span aria-hidden="true" className="h-px flex-1 bg-stroke-subtle" />
      <span aria-hidden="true">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-stroke-subtle" />
    </div>
  );
}
