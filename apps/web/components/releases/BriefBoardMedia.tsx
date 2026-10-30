'use client';

import { useRef, useState } from 'react';
import { Loader2, Pencil, X } from '@/components/icons';
import { prepareAvatarImage } from '@/lib/downscale-image';
import {
  BRIEF_CAPTION_MAX,
  BRIEF_IMAGE_EDGE_PX,
  BRIEF_NOTE_MAX,
  pickPalette,
  validateBriefImage,
} from '@/lib/brief-media';
import type { BriefPayload, BriefReference, BriefSticky } from '@/lib/release-brief';
import { briefCall } from './brief-shared';

// Photos, captions, sticky notes and cover colours on the brief board (#897
// phase 2). The board file arranges cards; this file is what goes in them.

type Toast = (message: string, tone: 'success' | 'error' | 'warning') => void;

const briefPath = (releaseId: string, rest = '') => `/api/releases/${encodeURIComponent(releaseId)}/brief${rest}`;

// ── Photos ───────────────────────────────────────────────────────────────────

/**
 * Shrink a photo to 2000px in the browser, send it straight to storage, then
 * add it to the brief. Returns the new reference, or an error a person can act on.
 */
export async function uploadBriefImage(
  releaseId: string,
  picked: File
): Promise<{ ok: true; reference: BriefReference } | { ok: false; error: string }> {
  if (!picked.type.startsWith('image/')) return { ok: false, error: `${picked.name} is not a photo.` };
  const prepared = await prepareAvatarImage(picked, BRIEF_IMAGE_EDGE_PX);
  if (!prepared) return { ok: false, error: `Could not read ${picked.name}. Try a JPEG or PNG.` };
  const file = prepared.file;
  const checked = validateBriefImage({ mimeType: file.type, size: file.size });
  if (!checked.ok) return checked;

  const slot = await briefCall<{ upload_url: string; storage_path: string }>(briefPath(releaseId, '/references/upload-url'), {
    method: 'POST',
    body: JSON.stringify({ mime_type: file.type, file_size: file.size }),
  });
  if (!slot.ok) return slot;
  try {
    const put = await fetch(slot.data.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) return { ok: false, error: 'The photo did not upload. Try again.' };
  } catch {
    return { ok: false, error: 'Could not reach storage. Check your connection.' };
  }
  const added = await briefCall<{ reference: BriefReference }>(briefPath(releaseId, '/references'), {
    method: 'POST',
    body: JSON.stringify({ storagePath: slot.data.storage_path, caption: '' }),
  });
  if (!added.ok) return added;
  return { ok: true, reference: added.data.reference };
}

/** Upload several photos one after another; says how many made it. */
export function useBriefImageUploads(brief: BriefPayload, onAdded: (reference: BriefReference) => void, onToast: Toast) {
  const [uploading, setUploading] = useState(0);
  const upload = async (files: File[]) => {
    const photos = files.filter((file) => file.type.startsWith('image/'));
    if (photos.length === 0) {
      onToast('Drop photos here: JPEG, PNG or WebP.', 'warning');
      return;
    }
    setUploading(photos.length);
    let failed = '';
    for (const file of photos) {
      const result = await uploadBriefImage(brief.releaseId, file);
      if (result.ok) onAdded(result.reference);
      else failed = result.error;
      setUploading((count) => Math.max(0, count - 1));
    }
    if (failed) onToast(failed, 'error');
  };
  return { uploading, upload };
}

/** True while a file is dragged over the element, and the files on drop. */
export function useFileDrop(enabled: boolean, onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes('Files');
  return {
    over,
    handlers: enabled
      ? {
          // Each handler stops at this element, so a drop area inside another
          // (Look inside the board) takes the drop and the highlight alone.
          onDragEnter: (event: React.DragEvent) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            event.stopPropagation();
            depth.current += 1;
            setOver(true);
          },
          onDragOver: (event: React.DragEvent) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            event.stopPropagation();
          },
          onDragLeave: (event: React.DragEvent) => {
            event.stopPropagation();
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setOver(false);
          },
          onDrop: (event: React.DragEvent) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            event.stopPropagation();
            depth.current = 0;
            setOver(false);
            onFiles(Array.from(event.dataTransfer.files));
          },
        }
      : {},
  };
}

/** The line under a picture, edited in place by whoever added it or a lead. */
export function CaptionEditor({
  brief,
  reference,
  onSaved,
  onToast,
  onClose,
}: {
  brief: BriefPayload;
  reference: BriefReference;
  onSaved: (title: string | null) => void;
  onToast: Toast;
  onClose: () => void;
}) {
  const [value, setValue] = useState(reference.title ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const result = await briefCall<{ title: string | null }>(
      briefPath(brief.releaseId, `/references/${encodeURIComponent(reference.id)}`),
      { method: 'PATCH', body: JSON.stringify({ caption: value }) }
    );
    setSaving(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onSaved(result.data.title);
    onClose();
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-1.5 rounded-lg bg-bg-surface p-1 shadow-md"
    >
      <input
        autoFocus
        value={value}
        maxLength={BRIEF_CAPTION_MAX}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Esc closes the caption, not the brief.
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="A caption"
        aria-label="Caption"
        className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-[16px] text-content-primary placeholder:text-content-tertiary focus:outline-none lg:text-[13px]"
      />
      <button type="submit" disabled={saving} className="motion-focus h-7 rounded-md bg-brand px-2.5 text-[12px] font-semibold text-content-inverse disabled:opacity-60">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : 'Save'}
      </button>
    </form>
  );
}

// ── Sticky notes ─────────────────────────────────────────────────────────────

// A sticky stays yellow in light and dark, like paper on a wall; its ink is fixed to match.
const STICKY = 'bg-[#F4E3A1] text-[#1A1611]';

export function StickyCard({
  brief,
  sticky,
  onSaved,
  onRemoved,
  onToast,
}: {
  brief: BriefPayload;
  sticky: BriefSticky;
  onSaved: (text: string) => void;
  onRemoved: () => void;
  onToast: Toast;
}) {
  const mine = sticky.createdBy === brief.viewer.id;
  const canChange = mine || brief.board.canArrange;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(sticky.text);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const text = value.trim();
    if (!text || text === sticky.text) {
      setValue(sticky.text);
      setEditing(false);
      return;
    }
    setBusy(true);
    const result = await briefCall<{ text: string }>(briefPath(brief.releaseId, `/notes/${encodeURIComponent(sticky.id)}`), {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    });
    setBusy(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onSaved(result.data.text);
    setEditing(false);
  };
  const remove = async () => {
    setBusy(true);
    const result = await briefCall<{ id: string }>(briefPath(brief.releaseId, `/notes/${encodeURIComponent(sticky.id)}`), {
      method: 'DELETE',
    });
    setBusy(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onRemoved();
  };

  return (
    <section
      aria-label="Note"
      className={`group relative flex min-h-[120px] min-w-0 flex-col rounded-[4px] p-4 shadow-[0_6px_14px_-8px_rgb(0_0_0/0.35)] ${STICKY}`}
    >
      {editing ? (
        <textarea
          autoFocus
          value={value}
          maxLength={BRIEF_NOTE_MAX}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setValue(sticky.text);
              setEditing(false);
            }
          }}
          aria-label="Note"
          rows={4}
          className="min-h-[80px] w-full flex-1 resize-none bg-transparent text-[16px] leading-snug focus:outline-none lg:text-[14.5px]"
        />
      ) : (
        <p className="flex-1 whitespace-pre-wrap break-words text-[15px] leading-snug">{sticky.text}</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] uppercase tracking-[0.08em] opacity-60">
          {mine ? 'You' : sticky.authorName}
        </span>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60" aria-hidden="true" /> : null}
        {canChange && !editing ? (
          <span className="flex gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit note" className="motion-focus grid h-7 w-7 place-items-center rounded-full hover:bg-black/10">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => void remove()} aria-label="Remove note" className="motion-focus grid h-7 w-7 place-items-center rounded-full hover:bg-black/10">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** A blank sticky to write on; it is added to the board on Add. */
export function NoteComposer({
  brief,
  onAdded,
  onCancel,
  onToast,
}: {
  brief: BriefPayload;
  onAdded: (sticky: BriefSticky) => void;
  onCancel: () => void;
  onToast: Toast;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const add = async () => {
    const text = value.trim();
    if (!text || saving) return;
    setSaving(true);
    const result = await briefCall<{ sticky: Omit<BriefSticky, 'authorName'> }>(briefPath(brief.releaseId, '/notes'), {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    setSaving(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onAdded({ ...result.data.sticky, authorName: 'You' });
  };
  return (
    <div className={`w-full max-w-[320px] rounded-[4px] p-3 shadow-lg ${STICKY}`}>
      <textarea
        autoFocus
        value={value}
        maxLength={BRIEF_NOTE_MAX}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void add();
        }}
        placeholder="A thought, a question, a shot idea…"
        aria-label="New note"
        rows={3}
        className="w-full resize-none bg-transparent text-[16px] leading-snug placeholder:text-[#1A1611]/50 focus:outline-none lg:text-[14.5px]"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="motion-focus h-8 rounded-full px-3 text-[13px] hover:bg-black/10">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void add()}
          disabled={!value.trim() || saving}
          className="motion-focus inline-flex h-8 items-center rounded-full bg-[#1A1611] px-3.5 text-[13px] font-semibold text-[#F4E3A1] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : 'Add note'}
        </button>
      </div>
    </div>
  );
}

// ── Colours from the cover ───────────────────────────────────────────────────

/**
 * The cover's main colours, read in the browser from a 64px copy. Null when
 * the image cannot be read (it fails to load, or the browser will not let the
 * page read its pixels).
 */
export function readCoverPalette(url: string, count = 5): Promise<string[] | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, size, size);
        const picked = pickPalette(context.getImageData(0, 0, size, size).data, count);
        resolve(picked.length ? picked : null);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
