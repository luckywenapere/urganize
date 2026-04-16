'use client';

type InvalidTokenStateProps = {
  title?: string;
  description?: string;
  hint?: string;
};

export function InvalidTokenState({
  title = 'This link is no longer valid',
  description = 'This link is no longer available.',
  hint = '',
}: InvalidTokenStateProps) {
  return (
    <div className="relative overflow-hidden rounded-[30px] border border-stroke-default bg-bg-surface/95 p-6 text-center shadow-[0_18px_48px_-28px_rgba(0,0,0,0.35)] sm:p-8">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-content-primary/4 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stroke-default to-transparent" />

      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-stroke-subtle bg-bg-elevated text-xl font-semibold text-content-primary">
        !
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-content-tertiary">Link unavailable</p>
      <h2 className="mt-3 text-[clamp(1.9rem,5vw,2.4rem)] tracking-tight text-content-primary">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-content-secondary">{description}</p>
      {hint ? (
        <div className="mt-6 rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4 text-sm text-content-secondary">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
