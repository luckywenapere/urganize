'use client';

import Link from 'next/link';
import { X } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';

/**
 * What a signed-out person sees when they reach for the Artist dashboard. It
 * says what the dashboard is and offers the two ways in. It never asks a
 * listener to sign up to listen: the last line says they do not need to.
 *
 * Deliberately says nothing about plans, prices or a trial: what a new team is
 * offered changes (pay first, a card abroad), and this sheet should not be the
 * place that goes stale.
 */
export function SignInSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[170] flex flex-col bg-black/50"
      onClick={onClose}
    >
      <DialogPanel
        label="Artist dashboard"
        onClose={onClose}
        className="mt-auto rounded-t-3xl border-t border-stroke-default bg-bg-surface px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 lg:mx-auto lg:my-auto lg:w-full lg:max-w-md lg:rounded-3xl lg:border"
      >
        <div onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-stroke-strong lg:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-content-primary">Run your music from here</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="motion-focus -mr-2 -mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-content-secondary hover:bg-bg-hover"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-1.5 text-sm text-content-secondary">
            The Artist dashboard is where artists, managers and labels plan rollouts and put their songs on Urganize.
          </p>
          <div className="mt-5 space-y-2.5">
            <Link
              href="/onboarding"
              data-autofocus
              className="motion-focus motion-press flex h-12 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
            >
              Create my account
            </Link>
            <Link
              href="/auth?next=/dashboard"
              className="motion-focus motion-press flex h-12 items-center justify-center rounded-xl border border-stroke-control px-5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover"
            >
              I have an account. Sign in
            </Link>
          </div>
          <p className="mt-4 text-center text-xs text-content-secondary">
            Just listening? You don&apos;t need an account.
          </p>
        </div>
      </DialogPanel>
    </div>
  );
}
