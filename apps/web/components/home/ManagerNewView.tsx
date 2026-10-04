'use client';

import { Chappi, Button } from '@urganize/ui';
import { HomeHeaderRow } from './HomeHeaderRow';
import { useStartTestRelease } from '@/components/releases/useStartTestRelease';
import { isTestReleaseEnabled } from '@/lib/test-release';
import {
  WELCOME_EYEBROW,
  WELCOME_LINE,
  WELCOME_PRIMARY,
  WELCOME_REASSURANCE,
  WELCOME_SECONDARY,
} from '@/lib/home/welcome';
import type { HomePayload } from '@/lib/home/types';

/**
 * Home for a manager with no rollouts yet. Calm on purpose: Chappi, one line,
 * one button. Everything else on Home (counts, focus task, lists) only appears
 * once there is something to count, so a first look is never a wall of zeros.
 */
export function ManagerNewView({
  home,
  onNewRollout,
}: {
  home: HomePayload;
  onNewRollout: () => void;
}) {
  const { startTestRelease, isStarting, error } = useStartTestRelease();

  return (
    <div className="space-y-8">
      <HomeHeaderRow header={home.header} />
      <section
        aria-label="Get started"
        className="mx-auto flex max-w-xl flex-col items-center gap-5 py-6 text-center sm:py-10"
      >
        <Chappi pose="idle" size={132} />
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {WELCOME_EYEBROW}
          </p>
          <p className="font-display text-2xl leading-snug text-content-primary sm:text-3xl">
            {WELCOME_LINE}
          </p>
          <p className="text-sm text-content-secondary">{WELCOME_REASSURANCE}</p>
        </div>
        <Button onClick={onNewRollout}>{WELCOME_PRIMARY}</Button>
        {isTestReleaseEnabled() ? (
          <button
            type="button"
            onClick={startTestRelease}
            disabled={isStarting}
            className="motion-focus text-sm font-medium text-content-secondary underline underline-offset-4 hover:text-content-primary disabled:opacity-60"
          >
            {WELCOME_SECONDARY}
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-status-error">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
