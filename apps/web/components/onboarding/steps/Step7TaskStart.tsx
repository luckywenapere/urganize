'use client';

import type { ReactNode } from 'react';

type Step7TaskStartProps = {
  isBusy: boolean;
  taskTitle: string;
  taskOutcome: string;
  pricingPrompt?: ReactNode;
  onLogout: () => Promise<void>;
  onMarkStarted: () => Promise<void>;
  onGoToDashboard: () => void;
};

export function Step7TaskStart({
  isBusy,
  taskTitle,
  taskOutcome,
  pricingPrompt,
  onLogout,
  onMarkStarted,
  onGoToDashboard,
}: Step7TaskStartProps) {
  return (
    <div className="mx-auto mt-10 w-full max-w-[1080px] space-y-6">
      <section className="saas-panel grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div>
            <p className="saas-eyebrow">First task ready</p>
            <h2 className="mt-3 text-[clamp(2.2rem,5vw,4rem)] font-semibold tracking-tight text-content-primary">{taskTitle}</h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-content-secondary">{taskOutcome}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="saas-panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Focus</p>
              <p className="mt-2 text-sm text-content-secondary">Start with one concrete move instead of trying to run the full campaign at once.</p>
            </div>
            <div className="saas-panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Expected result</p>
              <p className="mt-2 text-sm text-content-secondary">This step is designed to create visible progress before the next AI cycle.</p>
            </div>
            <div className="saas-panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Working style</p>
              <p className="mt-2 text-sm text-content-secondary">Stay lightweight. Use the dashboard if you need to inspect the wider release context first.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isBusy}
              onClick={onMarkStarted}
              className="rounded-xl border border-brand/45 bg-brand-muted px-5 py-3 text-sm font-semibold text-content-primary transition hover:bg-brand/20 disabled:opacity-40"
            >
              {isBusy ? 'Updating...' : 'Mark Started'}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={onGoToDashboard}
              className="rounded-xl border border-stroke-default bg-bg-surface px-5 py-3 text-sm font-medium text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:opacity-40"
            >
              Go to Dashboard
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={onLogout}
              className="text-sm text-content-secondary transition hover:text-content-primary disabled:opacity-40"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="saas-panel-subtle flex min-h-[280px] flex-col justify-between p-5">
          <div>
            <p className="saas-eyebrow">Execution note</p>
            <h3 className="mt-2 text-xl font-semibold text-content-primary">Keep the first move decisive.</h3>
            <p className="mt-3 text-sm leading-7 text-content-secondary">
              Urganize is built to keep release work stress-free. Start the task, document what happens, then let the next cycle refine what comes next.
            </p>
          </div>
          <div className="mt-6 rounded-2xl border border-stroke-default bg-bg-surface/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Workflow pattern</p>
            <ol className="mt-3 space-y-2 text-sm text-content-secondary">
              <li>1. Start the task.</li>
              <li>2. Execute and capture proof.</li>
              <li>3. Submit feedback so the next action stays grounded in reality.</li>
            </ol>
          </div>
        </div>
      </section>

      {pricingPrompt && (
        <div className="animate-in delay-1">
          {pricingPrompt}
        </div>
      )}
    </div>
  );
}
