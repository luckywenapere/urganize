'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@urganize/ui';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { errorMessage } from '@/lib/errors';
import { ShareLoginActions } from '@/components/team/ShareLoginActions';

type ReleaseAccessStepProps = {
  releaseId: string;
  releaseTitle: string | null;
  /** Continue into whatever the create flow was going to do next. */
  onDone: () => void;
};

type StepState =
  | { kind: 'generating' }
  | { kind: 'ready'; url: string }
  | { kind: 'failed'; message: string };

/**
 * The compulsory step immediately after a release is created (founder
 * request, 2026-08-16): the app generates a login link for this release
 * itself — the manager doesn't ask for it — and shows it before anything
 * else, so getting the team in is the first thing that happens rather than a
 * Settings page nobody opens.
 *
 * "Compulsory" here means it is ALWAYS shown and cannot be dismissed by
 * backdrop click or Escape; it has one way out, an explicit button. It does
 * NOT mean the manager has to send anything — a release with a team of one is
 * legitimate, and forcing a share they don't need would just teach them to
 * click through the screen without reading it. What is compulsory is the
 * decision, not the outcome.
 *
 * Generation is automatic and runs once on mount. The link is minted against
 * this release so the Settings list can later say which release produced it.
 *
 * NO ESCAPE HANDLER, deliberately — the repo-wide rule (ChappiDock, the
 * outcome sheet, the release scenes): a second window listener means one
 * keypress closes two things. Here it also happens to be what keeps the step
 * compulsory.
 */
export function ReleaseAccessStep({ releaseId, releaseTitle, onDone }: ReleaseAccessStepProps) {
  const user = useAuthStore((state) => state.user);
  const workspaceName = useWorkspaceIdentityStore((state) => state.name);
  const [state, setState] = useState<StepState>({ kind: 'generating' });

  useEffect(() => lockBodyScroll(), []);

  // Does NOT set 'generating' itself — the initial state already is, and a
  // synchronous setState in the mount effect below would be a cascading
  // render. The retry button sets it before calling in.
  const generate = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace/invite-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          releaseId,
          label: releaseTitle ? `${releaseTitle} team` : undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        inviteUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.inviteUrl) {
        throw new Error(payload.error || 'Could not create a login.');
      }
      setState({ kind: 'ready', url: payload.inviteUrl });
    } catch (error) {
      setState({ kind: 'failed', message: errorMessage(error, 'Could not create a login.') });
    }
  }, [releaseId, releaseTitle]);

  useEffect(() => {
    void generate();
  }, [generate]);

  const overlay = (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-access-step-title"
    >
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-stroke-default bg-bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/15 text-brand"
            aria-hidden="true"
          >
            <KeyRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2
              id="release-access-step-title"
              className="text-lg font-semibold text-content-primary"
            >
              Get your team in
            </h2>
            <p className="mt-1 text-sm leading-6 text-content-secondary">
              {releaseTitle ? (
                <>
                  <span className="text-content-primary">{releaseTitle}</span> is set up. Here
                  is a login you can send to anyone who needs to work on it.
                </>
              ) : (
                'Your release is set up. Here is a login you can send to anyone who needs to work on it.'
              )}
            </p>
          </div>
        </div>

        <div className="mt-5">
          {state.kind === 'generating' ? (
            <div className="flex items-center gap-2 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-4 text-sm text-content-secondary">
              <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
              Generating a login…
            </div>
          ) : null}

          {state.kind === 'ready' ? (
            <>
              <ShareLoginActions
                url={state.url}
                workspaceName={workspaceName}
                releaseTitle={releaseTitle}
                inviterName={user?.name || null}
                variant="full"
              />
              <p className="mt-3 text-xs leading-5 text-content-tertiary">
                Whoever opens this link picks their own password — you never have to send one.
                You can create more logins any time in Settings → Team.
              </p>
            </>
          ) : null}

          {state.kind === 'failed' ? (
            <div className="rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-3">
              <p className="flex items-start gap-2 text-sm text-status-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {state.message}
              </p>
              <button
                type="button"
                onClick={() => {
                  setState({ kind: 'generating' });
                  void generate();
                }}
                className="motion-focus mt-2 text-xs font-semibold text-status-error underline"
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>

        {/* One way out, always enabled. A compulsory step that can trap a user
            when the network drops is a bug, not discipline — so a failed mint
            still lets them through, and Settings → Team is where they finish
            the job. */}
        <Button type="button" className="mt-6 w-full" onClick={onDone}>
          {state.kind === 'failed' ? 'Continue without a login' : 'Done — go to the release'}
        </Button>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlay, document.body);
}
