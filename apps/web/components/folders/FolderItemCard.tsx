/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { formatReleaseDate } from '@/lib/pre-save';
import {
  formatContractTypeLabel,
  formatFolderItemTypeLabel,
  type ContractFolderItem,
  type FileFolderItem,
  type Folder,
  type FolderItem,
} from '@/lib/folders';

type FolderItemCardProps = {
  item: FolderItem;
  folders: Folder[];
  isMenuOpen: boolean;
  isBusy: boolean;
  onToggleMenu: () => void;
  onEdit: (item: FolderItem) => void;
  onDelete: (item: FolderItem) => void;
  onMove: (item: FolderItem, targetFolderId: string) => void;
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently updated';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatFileMeta(item: FileFolderItem | ContractFolderItem): string {
  const parts: string[] = [];
  if (item.metadata.fileName) {
    parts.push(item.metadata.fileName);
  }
  if (item.metadata.fileSize > 0) {
    parts.push(`${Math.round(item.metadata.fileSize / 1024)} KB`);
  }
  return parts.join(' • ') || 'File attached';
}

function renderBody(item: FolderItem) {
  switch (item.type) {
    case 'note':
      return (
        <p className="text-sm leading-7 text-content-secondary" data-ph-no-capture>
          {item.content || 'No note yet.'}
        </p>
      );
    case 'link':
      return (
        <>
          <p className="text-sm leading-7 text-content-secondary">
            {item.content || 'Saved link.'}
          </p>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-brand/20 bg-brand px-4 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover"
            >
              Open link
            </a>
          ) : null}
        </>
      );
    case 'file':
      return (
        <>
          <p className="text-sm leading-7 text-content-secondary">
            {item.content || formatFileMeta(item)}
          </p>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-brand/20 bg-brand px-4 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover"
            >
              Open file
            </a>
          ) : null}
        </>
      );
    case 'contact':
      return (
        <div className="space-y-2 text-sm text-content-secondary" data-ph-no-capture>
          {item.metadata.role ? <p>Role: {item.metadata.role}</p> : null}
          {item.metadata.email ? <p>Email: {item.metadata.email}</p> : null}
          {item.metadata.phone ? <p>Phone: {item.metadata.phone}</p> : null}
          {item.content ? <p className="leading-7">{item.content}</p> : null}
        </div>
      );
    case 'release':
      return (
        <>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[18px] border border-stroke-default bg-bg-overlay">
              {item.linkedRelease?.coverArtUrl ? (
                <img
                  src={item.linkedRelease.coverArtUrl}
                  alt={`${item.title} cover`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.22),transparent_46%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] text-xl">
                  🎵
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-content-primary">
                {item.linkedRelease?.artistName || 'Linked release'}
              </p>
              <p className="mt-1 text-sm text-content-secondary">
                {formatReleaseDate(item.linkedRelease?.releaseDate || null)}
              </p>
            </div>
          </div>

          <Link
            href={`/dashboard/releases/${item.metadata.releaseId}`}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-brand/20 bg-brand px-4 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover"
          >
            Open release
          </Link>
        </>
      );
    case 'contract':
      return (
        <>
          <div className="space-y-2 text-sm text-content-secondary" data-ph-no-capture>
            <p>{formatFileMeta(item)}</p>
            <p>Type: {formatContractTypeLabel(item.metadata.contractType)}</p>
            {item.metadata.counterpartyName ? <p>Counterparty: {item.metadata.counterpartyName}</p> : null}
            {item.metadata.signedDate ? <p>Signed: {formatReleaseDate(item.metadata.signedDate)}</p> : null}
          </div>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-brand/20 bg-brand px-4 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover"
            >
              Open contract
            </a>
          ) : null}
        </>
      );
    default:
      return null;
  }
}

export function FolderItemCard({
  item,
  folders,
  isMenuOpen,
  isBusy,
  onToggleMenu,
  onEdit,
  onDelete,
  onMove,
}: FolderItemCardProps) {
  const moveTargets = folders.filter((folder) => folder.id !== item.folderId);

  return (
    <article className="panel-shell-subtle relative overflow-hidden p-5 transition hover:border-stroke-default hover:bg-bg-hover">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            {formatFolderItemTypeLabel(item.type)}
          </p>
          <h3
            className="mt-3 truncate text-xl text-content-primary sm:text-2xl"
            {...(
              item.type === 'contract' || item.type === 'note' || item.type === 'contact'
                ? { 'data-ph-no-capture': '' }
                : {}
            )}
          >
            {item.title}
          </h3>
          <p className="mt-2 text-sm text-content-secondary">
            Updated {formatTimestamp(item.updatedAt)}
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            disabled={isBusy}
            aria-label={`Open actions for ${item.title}`}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={(event) => {
              event.stopPropagation();
              onToggleMenu();
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
          >
            <span aria-hidden="true" className="text-lg leading-none">⋯</span>
          </button>

          {isMenuOpen ? (
            <div
              onClick={(event) => event.stopPropagation()}
              className="menu-shell absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[220px] p-2"
            >
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="block w-full rounded-[12px] px-3 py-2 text-left text-sm text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
              >
                Edit item
              </button>

              {moveTargets.length > 0 ? (
                <div className="mt-2 border-t border-stroke-default pt-2">
                  <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                    Move to
                  </p>
                  <div className="max-h-40 overflow-y-auto">
                    {moveTargets.map((folder) => (
                      <button
                        key={`${item.id}-${folder.id}`}
                        type="button"
                        onClick={() => onMove(item, folder.id)}
                        className="mt-1 block w-full rounded-[12px] px-3 py-2 text-left text-sm text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
                      >
                        {folder.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => onDelete(item)}
                className="mt-2 block w-full rounded-[12px] px-3 py-2 text-left text-sm text-status-error transition hover:bg-status-error/10"
              >
                Delete item
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5">{renderBody(item)}</div>
    </article>
  );
}
