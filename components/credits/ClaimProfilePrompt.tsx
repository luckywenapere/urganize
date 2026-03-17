'use client';

export function ClaimProfilePrompt() {
  return (
    <div className="rounded-[24px] border border-stroke-subtle bg-bg-elevated/70 p-5">
      <p className="text-sm font-semibold text-content-primary">Claim profile</p>
      <p className="mt-2 text-sm text-content-secondary">
        Want to claim this contributor profile later? You can do that after the release team reviews your submission.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
        >
          Claim Profile
        </button>
        <button
          type="button"
          className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
