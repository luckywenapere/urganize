'use client';

import { FileText, Loader2, X } from '@/components/icons';
import type { ChappiAttachment } from '@/lib/chappi/types';

/** The tray above the field while a message is being written: what is attached,
 * a way to take each one off, and a spinner for any still being prepared. */
export function ChappiAttachmentTray({
  attachments,
  pending,
  onRemove,
}: {
  attachments: ChappiAttachment[];
  pending: number;
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0 && pending === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-2 px-1" aria-label="Attached to this message">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="flex max-w-full items-center gap-2 rounded-xl border border-stroke-default bg-bg-surface py-1 pl-1 pr-1.5"
        >
          {attachment.kind === 'image' && attachment.dataUrl ? (
            // A plain img: this is a data URL made in the browser a moment ago,
            // which next/image has nothing to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.dataUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-elevated text-content-tertiary">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <span className="max-w-[9rem] truncate text-xs text-content-secondary sm:max-w-[12rem]">
            {attachment.name}
          </span>
          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remove ${attachment.name}`}
            className="motion-press grid h-6 w-6 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-elevated hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
      {pending > 0 ? (
        <li
          role="status"
          className="flex items-center gap-2 rounded-xl border border-stroke-default bg-bg-surface px-3 py-2 text-xs text-content-tertiary"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Getting it ready
        </li>
      ) : null}
    </ul>
  );
}

/** What a sent message shows above its words. Pictures are shown small; a file is
 * a labelled chip. Only the session that sent it has the picture: a reopened chat
 * keeps the name and nothing else, so a missing picture shows as a chip. */
export function ChappiMessageAttachments({ attachments }: { attachments: ChappiAttachment[] }) {
  return (
    <div className="mb-1 flex flex-wrap justify-end gap-1.5">
      {attachments.map((attachment) =>
        attachment.kind === 'image' && attachment.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={attachment.id}
            src={attachment.dataUrl}
            alt={attachment.name}
            className="max-h-40 max-w-[12rem] rounded-xl border border-stroke-default object-cover"
          />
        ) : (
          <span
            key={attachment.id}
            className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-xl bg-bg-elevated px-2.5 py-1.5 text-xs text-content-secondary"
          >
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{attachment.name}</span>
          </span>
        )
      )}
    </div>
  );
}
