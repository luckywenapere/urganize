'use client';

import { AlertTriangle, Check, Info } from '@/components/icons';
import type { CaptureReadiness } from '@/lib/capture-playbook';
import { useHiddenNudgeSet } from '@/lib/hidden-nudges';

/**
 * The capture playbook's verdict on the page being edited (2026-08-14).
 *
 * This is the documented knowledge made visible: every line is a rule from
 * lib/capture-playbook/capture-v0.1.md, graded deterministically, updating as
 * the manager types. It is advice, not a gate — the API saves whatever is
 * written and only the public page refuses to collect an email it cannot pay
 * for.
 *
 * Failing rules sort to the top, because a checklist whose actionable items
 * are scattered among ten green ticks is a checklist nobody reads. Within each
 * group the playbook's own order of consequence is preserved.
 *
 * A suggestion can be skipped (founder, Oct 31, 2026, #919): it drops off the
 * list for this rollout in this browser. Blockers cannot be skipped.
 */

type CaptureChecklistProps = {
  releaseId: string;
  readiness: CaptureReadiness;
};

export function CaptureChecklist({ releaseId, readiness }: CaptureChecklistProps) {
  const { results, passedCount, totalCount, blockers, isSendReady } = readiness;
  const [skipped, skip] = useHiddenNudgeSet(
    `capture-suggestion:${releaseId}:`,
    results.filter((rule) => rule.severity === 'suggestion').map((rule) => rule.id)
  );
  const outstanding = results.filter((rule) => !rule.passed && !skipped.has(rule.id));
  const done = results.filter((rule) => rule.passed);

  return (
    <aside
      className="border border-stroke-default bg-bg-surface p-4"
      aria-label="Capture page checklist"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          What converts
        </h3>
        <span className="font-mono text-xs text-content-tertiary">
          {passedCount}/{totalCount}
        </span>
      </div>

      {/* The headline verdict is binary and honest: blockers stop a send,
          suggestions never do. A page at 8/11 with no blockers says "ready",
          because the playbook's position is that the manager decides which of
          its suggestions their release can ignore. */}
      <p
        className={`mt-2 text-sm font-medium ${
          isSendReady ? 'text-brand' : 'text-status-warning'
        }`}
      >
        {isSendReady
          ? 'Ready to send'
          : `${blockers.length} thing${blockers.length === 1 ? '' : 's'} to fix first`}
      </p>

      {outstanding.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {outstanding.map((rule) => (
            <li key={rule.id} className="flex gap-2.5">
              {rule.severity === 'blocker' ? (
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning"
                  aria-hidden="true"
                />
              ) : (
                <Info
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <p className="text-xs leading-relaxed text-content-secondary">{rule.fix}</p>
                {rule.severity === 'suggestion' ? (
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-content-tertiary">Optional</span>
                    <button
                      type="button"
                      onClick={() => skip(rule.id)}
                      aria-label={`Skip: ${rule.fix}`}
                      className="motion-focus -my-2 inline-flex h-8 items-center rounded px-1.5 text-[11px] font-semibold text-content-secondary hover:text-content-primary"
                    >
                      Skip
                    </button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {done.length > 0 ? (
        <ul className={`space-y-2 ${outstanding.length > 0 ? 'mt-5 border-t border-stroke-subtle pt-4' : 'mt-4'}`}>
          {done.map((rule) => (
            <li key={rule.id} className="flex gap-2.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
              <p className="min-w-0 text-xs leading-relaxed text-content-tertiary">{rule.pass}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
