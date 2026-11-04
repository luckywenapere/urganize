'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { ArrowLeft } from '@/components/icons';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { RECORD_CAPTURE_PLACEHOLDER } from '@/lib/chappi/record-scope';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { useProjectChatStore } from '@/stores/useProjectChatStore';
import { useShellStore } from '@/stores/useShellStore';

// The chat is heavy and only needed once the box has sent, so it is its own chunk.
const ChappiConversation = dynamic(
  () => import('@/components/chappi/ChappiConversation').then((m) => m.ChappiConversation),
  { ssr: false }
);

/**
 * The AI on a project, on a phone (2026-11-04, #1074, mock screen 6). The
 * project page's box sends here instead of moving to the AI tab, so the
 * conversation stays over the project it is about. The chat is the project's
 * own thread (showProjectSession) and is scoped to it by the page's address.
 * Phone only: on a computer the AI drawer already sits beside the page.
 */
export function ProjectChatSheet({ recordId, title }: { recordId: string; title: string }) {
  const openRecordId = useProjectChatStore((state) => state.openRecordId);
  const close = useProjectChatStore((state) => state.close);
  const openCreate = useShellStore((state) => state.openCreate);
  const open = openRecordId === recordId;

  useEffect(() => (open ? lockBodyScroll() : undefined), [open]);
  // Leaving the page closes it, so another page never opens on top of a sheet.
  useEffect(() => close, [close]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[160] flex flex-col justify-end bg-black/40 lg:hidden" role="presentation">
      <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0" onClick={close} />
      <DialogPanel
        label={`AI on ${title}`}
        onClose={close}
        className="relative flex h-[88dvh] w-full flex-col rounded-t-[20px] border border-stroke-default bg-bg-base pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-stroke-default px-2 py-1.5">
          <button
            type="button"
            onClick={close}
            aria-label={`Back to ${title}`}
            className="motion-focus inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-content-primary hover:bg-bg-hover"
          >
            <ArrowLeft aria-hidden className="size-4" />
            <span className="max-w-[60vw] truncate">{title}</span>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
          <ErrorBoundary name="project-chat" onError={reportBoundaryError}>
            <ChappiConversation
              variant="panel"
              headingLevel="h2"
              onNewRelease={openCreate}
              placeholder={RECORD_CAPTURE_PLACEHOLDER}
              takeHandedInput
            />
          </ErrorBoundary>
        </div>
      </DialogPanel>
    </div>,
    document.body
  );
}
