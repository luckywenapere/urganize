'use client';

import Link from 'next/link';

type ClaimProfilePromptProps = {
  onSkip: () => void;
};

export function ClaimProfilePrompt({ onSkip }: ClaimProfilePromptProps) {
  return (
    <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/70 p-5 sm:p-6">
      <p className="text-sm font-semibold text-content-primary">Save your details for future releases</p>
      <p className="mt-2 text-sm text-content-secondary">
        Create an account if you want to reuse these details the next time a release team requests your credits.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/auth"
          className="flex min-h-11 items-center justify-center rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
        >
          Claim Profile
        </Link>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-11 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
