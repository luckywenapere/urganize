'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Loader2, Mail, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { evaluateCapturePage } from '@/lib/capture-playbook';
import {
  EMPTY_CAPTURE_DRAFT,
  type CapturePageDraft,
  type ReleaseCaptureLead,
  type ReleaseCapturePage,
} from '@/types/capture';
import { ShareLinkCardSkeleton } from '@/components/loading/ReleaseSectionSkeletons';
import { useSceneData } from './useSceneData';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { useCaptureAutosave } from './useCaptureAutosave';
import { CaptureEditor } from './CaptureEditor';
import { CaptureChecklist } from './CaptureChecklist';

/**
 * The fan-capture manager (2026-08-14). Self-contained: takes releaseId,
 * fetches its own data, renders its own loading/empty/error states — the
 * EpkSection shape. Hosted by ReleaseScenePanel as an inline scene in the
 * workspace's activity slot.
 *
 * Three surfaces stacked: the share link, the editor (with the playbook
 * checklist beside it), and the sign-ups collected so far. The public page
 * itself is /capture/[token].
 *
 * NEXT_PUBLIC_ prefix so the value is inlined at build time for this client
 * component. The API routes guard the same flag server-side (404 when off).
 */
const CAPTURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

const toDraft = (page: ReleaseCapturePage | null): CapturePageDraft =>
  page
    ? {
        headline: page.headline,
        incentive: page.incentive,
        destinationUrl: page.destinationUrl,
        destinationLabel: page.destinationLabel,
        buttonLabel: page.buttonLabel,
        graphicAssetId: page.graphicAssetId,
        collectName: page.collectName,
        consentNote: page.consentNote,
        isPaused: page.isPaused,
      }
    : EMPTY_CAPTURE_DRAFT;

/** RFC 4180 escaping. A stage name with a comma in it is not exotic, and a
 * CSV that breaks on one is worse than no export at all. */
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

function buildLeadsCsv(leads: ReleaseCaptureLead[]): string {
  const rows = [
    ['Email', 'Name', 'Signed up'].map(csvCell).join(','),
    ...leads.map((lead) =>
      [lead.email, lead.name, lead.createdAt].map((value) => csvCell(value || '')).join(',')
    ),
  ];
  return rows.join('\r\n');
}

type CaptureSectionProps = {
  releaseId: string;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function CaptureSection({ releaseId, onToast }: CaptureSectionProps) {
  const {
    data,
    isLoading,
    error: loadError,
    reload,
  } = useSceneData(releaseId, 'capture', { enabled: CAPTURE_ENABLED });
  const setScene = useSceneDataStore((state) => state.setScene);

  const page = data?.page ?? null;
  const leads = useMemo(() => data?.leads ?? [], [data]);
  const leadCount = data?.leadCount ?? 0;
  const hasGraphic = data?.hasGraphic ?? false;

  const [isMutating, setIsMutating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const shareUrl = page
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/capture/${page.shareToken}`
    : '';

  // Server truth for the autosave hook to seed from. Memoized on the fields it
  // reads rather than on `page` itself, so a background refetch that returns an
  // identical row doesn't hand the hook a new object and reseed a live edit.
  const persisted = useMemo(
    () => toDraft(page),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      page?.id,
      page?.headline,
      page?.incentive,
      page?.destinationUrl,
      page?.destinationLabel,
      page?.buttonLabel,
      page?.graphicAssetId,
      page?.collectName,
      page?.consentNote,
      page?.isPaused,
    ]
  );

  const saveDraft = useCallback(
    async (draft: CapturePageDraft) => {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired.');
      const res = await fetch(`/api/releases/${releaseId}/capture`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        page?: ReleaseCapturePage;
        error?: string;
      };
      if (!res.ok || !payload.page) {
        throw new Error(payload.error || 'Could not save.');
      }
      // Write-through: the PATCH response IS the new state, so the cache is
      // updated directly rather than re-fetching what we just received. Leads
      // are carried over untouched — this endpoint never returns them.
      setScene(releaseId, 'capture', { page: payload.page, leads, leadCount, hasGraphic });
    },
    [hasGraphic, leadCount, leads, releaseId, setScene]
  );

  const { draft, saveState, setField, flush } = useCaptureAutosave({
    pageId: page?.id ?? null,
    persisted,
    onSave: saveDraft,
  });

  const readiness = useMemo(
    // A page with no graphic asset chosen still shows the release cover art,
    // which the checklist has to know about — otherwise it would nag about a
    // missing image that is in fact on screen. The public resolver applies the
    // same precedence.
    () => evaluateCapturePage(draft, { hasGraphic }),
    [draft, hasGraphic]
  );

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCreate = async () => {
    if (isMutating) return;
    setIsMutating(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/capture`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await res.json().catch(() => ({}))) as {
        page?: ReleaseCapturePage;
        error?: string;
      };
      if (!res.ok || !payload.page) {
        onToast?.(payload.error || 'Could not create the capture page.', 'error');
        return;
      }
      setScene(releaseId, 'capture', { page: payload.page, leads: [], leadCount: 0, hasGraphic });
      onToast?.('Capture page created. Add your link and headline.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not create the page.', 'error');
    } finally {
      setIsMutating(false);
    }
  };

  const handleRotate = async () => {
    if (isMutating) return;
    setIsMutating(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/capture/rotate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await res.json().catch(() => ({}))) as {
        page?: ReleaseCapturePage;
        error?: string;
      };
      if (!res.ok || !payload.page) {
        onToast?.(payload.error || 'Could not create a new link.', 'error');
        return;
      }
      setScene(releaseId, 'capture', { page: payload.page, leads, leadCount, hasGraphic });
      onToast?.('New link created. The old one stops working now.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not create a new link.', 'error');
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (isMutating) return;
    setIsMutating(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/capture`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        onToast?.(payload.error || 'Could not delete the page.', 'error');
        return;
      }
      setScene(releaseId, 'capture', { page: null, leads: [], leadCount: 0, hasGraphic });
      setConfirmingDelete(false);
      onToast?.('Capture page deleted.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not delete the page.', 'error');
    } finally {
      setIsMutating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      onToast?.('Could not copy — select the link and copy it manually.', 'warning');
    }
  };

  const handleExport = async () => {
    if (leads.length === 0) return;
    try {
      await navigator.clipboard.writeText(buildLeadsCsv(leads));
      onToast?.(
        `${leads.length} sign-up${leads.length === 1 ? '' : 's'} copied as CSV. Paste into a spreadsheet.`,
        'success'
      );
    } catch {
      // Clipboard rather than a file download on purpose: the Capacitor shell
      // blocks script-started downloads outright, and a button that silently
      // does nothing on the mobile app is worse than one that pastes.
      onToast?.('Could not copy the list. Try again from a desktop browser.', 'warning');
    }
  };

  if (!CAPTURE_ENABLED) return null;

  return (
    <section className="mt-8">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Fan capture
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          One page that trades a link for an email address. Share it from a bio, a story, or a DM —
          fans get the link the second they sign up.
        </p>
      </div>

      {isLoading ? (
        <ShareLinkCardSkeleton />
      ) : loadError ? (
        <div className="mt-4 flex flex-col gap-3 border border-status-error/30 bg-status-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-status-error">Couldn&rsquo;t load the capture page.</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex h-9 shrink-0 items-center self-start border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover sm:self-auto"
          >
            Retry
          </button>
        </div>
      ) : !page ? (
        <div className="mt-4 border border-stroke-default bg-bg-surface p-6 text-center">
          <p className="text-sm text-content-secondary">
            Build a page that collects emails from the fans already tapping your link.
          </p>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isMutating}
            className="mt-3 inline-flex items-center gap-2 border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMutating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Mail className="h-3.5 w-3.5" />
                Create capture page
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          {/* The link comes first: it is the thing the manager came here to
              get, and it exists from the moment the page is created. The
              checklist below is what tells them whether it is worth sending
              yet — a not-ready page is still copyable, because a manager
              testing their own link is a legitimate thing to do. */}
          <div className="mt-4 border border-stroke-default bg-bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p
                className="min-w-0 flex-1 truncate font-mono text-xs text-content-secondary"
                title={shareUrl}
              >
                {shareUrl}
              </p>
              <div className="flex flex-wrap gap-2 sm:shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-brand" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy link
                    </>
                  )}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Preview
                </a>
                <button
                  type="button"
                  onClick={() => void handleRotate()}
                  disabled={isMutating}
                  className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  New link
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-content-tertiary">
              {readiness.isSendReady
                ? 'Ready to send. Anyone with this link can sign up.'
                : 'Not ready to send yet — see what’s missing below.'}{' '}
              A new link kills the old one instantly; your sign-ups stay.
            </p>
          </div>

          {/* Editor and checklist side by side from lg, stacked below it. The
              checklist has to be visible WHILE editing — a score you only see
              after saving is a report card, and the point of it is to be
              advice you act on in the moment. */}
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <CaptureEditor
              draft={draft}
              saveState={saveState}
              hasGraphic={hasGraphic}
              onChange={setField}
              onBlur={flush}
            />
            <CaptureChecklist readiness={readiness} />
          </div>

          <div className="mt-8 border-t border-stroke-subtle pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-content-primary">
                  Sign-ups
                  <span className="ml-2 font-normal text-content-tertiary">{leadCount}</span>
                </h3>
                <p className="mt-0.5 text-xs text-content-tertiary">
                  Emails collected by this page. Yours to export and send from wherever you send
                  email.
                </p>
              </div>
              {leads.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover"
                >
                  <Download className="h-3.5 w-3.5" />
                  Copy as CSV
                </button>
              ) : null}
            </div>

            {leads.length === 0 ? (
              <p className="mt-4 border border-stroke-default bg-bg-surface p-6 text-center text-sm text-content-secondary">
                No sign-ups yet. Share the link and they land here.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-stroke-subtle border border-stroke-default bg-bg-surface">
                {leads.map((lead) => (
                  <li
                    key={lead.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm text-content-primary">
                      {lead.email}
                    </span>
                    <span className="text-xs text-content-tertiary">
                      {lead.name ? `${lead.name} · ` : ''}
                      {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {leadCount > leads.length ? (
              <p className="mt-2 text-xs text-content-tertiary">
                Showing the {leads.length} most recent of {leadCount}.
              </p>
            ) : null}
          </div>

          {/* Delete last, behind a confirm, and phrased so the destructive part
              (the emails go too) is the sentence rather than a footnote —
              pausing in the editor above is the reversible way to take a page
              out of circulation. */}
          <div className="mt-8 border-t border-stroke-subtle pt-6">
            {confirmingDelete ? (
              <div className="border border-status-error/30 bg-status-error/10 p-4">
                <p className="text-sm text-content-primary">
                  Delete this capture page and all {leadCount} sign-up
                  {leadCount === 1 ? '' : 's'}? The emails cannot be recovered.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={isMutating}
                    className="inline-flex h-9 items-center gap-2 border border-status-error/40 bg-status-error/20 px-3 text-sm font-semibold text-status-error hover:bg-status-error/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isMutating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Delete everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="inline-flex h-9 items-center border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-2 text-xs text-content-tertiary hover:text-status-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete this capture page
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
