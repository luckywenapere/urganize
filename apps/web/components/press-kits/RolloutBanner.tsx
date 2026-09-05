'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from '@/components/icons';
import { describeProposal, type RolloutProposal } from '@/lib/press-kit-rollout';
import { authHeaders, readError } from './press-kit-client';
import type { PressKitSectionKey } from '@/types/press-kits';

/**
 * What a release that has landed would change on this kit.
 *
 * Offered, never applied. Each proposal is accepted on its own, because a
 * manager who wants the new release pointed at may well not want their bio
 * section touched, and one Accept All button would make that impossible to
 * express.
 *
 * A proposal over a section somebody wrote by hand says so, in the card,
 * before the button rather than after it. That warning is the whole difference
 * between this and autofill, which simply refuses to touch such a section.
 */
export function RolloutBanner({
  kitId,
  onAccepted,
}: {
  kitId: string;
  /** Reload the kit. An accepted proposal changes a section's content, its
   *  status and its source, none of which this component owns. */
  onAccepted: () => void | Promise<void>;
}) {
  const [proposals, setProposals] = useState<RolloutProposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<PressKitSectionKey | null>(null);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<PressKitSectionKey[]>([]);

  useEffect(() => {
    let cancelled = false;

    // Defined inside the effect rather than hoisted into a useCallback: it is
    // called from nowhere else, and a hoisted async loader trips the
    // set-state-in-effect rule this repo runs at warn during the React 19
    // migration. Inline, there is nothing to trip.
    const load = async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const response = await fetch(`/api/press-kits/${kitId}/rollout`, {
          headers,
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) {
          setProposals(Array.isArray(body.proposals) ? body.proposals : []);
        }
      } catch {
        // A roll in nobody was offered is not worth an error on the page. The
        // kit is entirely usable without it.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [kitId]);

  const accept = async (proposal: RolloutProposal) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(proposal.section);
    setError('');
    try {
      // An ordinary section save. That is the point: it sets the source to
      // 'user' and writes a history row, so an accepted roll in can be undone
      // from the section's own version list like any other edit.
      const response = await fetch(`/api/press-kits/${kitId}/sections/${proposal.section}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ content: proposal.proposed }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not apply that change.'));
        return;
      }
      setProposals((current) =>
        current.filter((entry) => entry.section !== proposal.section)
      );
      await onAccepted();
    } catch {
      setError('Could not apply that change.');
    } finally {
      setBusy(null);
    }
  };

  const visible = proposals.filter((entry) => !dismissed.includes(entry.section));
  if (!loaded || visible.length === 0) return null;

  return (
    <section className="mb-6 rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-content-primary">
            Newer work is not on this kit yet
          </h2>
          <p className="mt-1 text-sm text-content-secondary">
            Nothing changes until you say so. Take the parts you want.
          </p>

          <ul className="mt-3 space-y-2">
            {visible.map((proposal) => (
              <li
                key={proposal.section}
                className="rounded-lg border border-stroke-default bg-bg-base p-3"
              >
                <p className="text-sm text-content-primary">{describeProposal(proposal)}</p>
                {proposal.handWritten ? (
                  <p className="mt-1 text-xs text-status-warning">
                    You wrote this section. Check it before you take the update.
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void accept(proposal)}
                    disabled={busy !== null}
                    className="motion-focus inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-content-inverse disabled:opacity-60"
                  >
                    {busy === proposal.section ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    Take this update
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDismissed((current) => [...current, proposal.section])
                    }
                    disabled={busy !== null}
                    className="motion-focus inline-flex items-center rounded-md px-3 py-1.5 text-xs text-content-secondary hover:bg-bg-hover disabled:opacity-60"
                  >
                    Not this one
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Dismissing is deliberately for this visit only, and not stored.
              The proposal describes a real difference between the kit and the
              product, so it comes back next time rather than being buried by a
              tap somebody does not remember making. */}
          {error ? <p className="mt-3 text-sm text-status-error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
