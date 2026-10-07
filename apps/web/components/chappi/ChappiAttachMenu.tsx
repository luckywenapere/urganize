'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { Camera, FileText, ImageIcon, Plus } from '@/components/icons';

type ChappiAttachMenuProps = {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
};

// The camera row only makes sense on a phone or tablet. A desktop browser
// ignores `capture` and would open the same file picker twice under two names.
// useSyncExternalStore, the useIsDesktopViewport precedent: the read stays out
// of render, and the server snapshot is false so the first paint matches.
function useHasTouchCamera(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia('(pointer: coarse)');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(pointer: coarse)').matches,
    () => false
  );
}

// What the file picker offers. The final check is lib/urgans-attachments.ts
// classifyFile; this only narrows the list so most wrong picks never happen.
const FILE_ACCEPT = '.txt,.md,.markdown,.csv,.tsv,.json,.log,.srt,.vtt,text/*';

/**
 * The "+" in the UrgAns composer: take a photo, choose a picture, or attach a
 * text file. A disclosure, not a role="menu": the rows are buttons reached with
 * Tab, and a menu would promise arrow keys they never had. Opens upward, like
 * the scope picker beside it, because the composer sits at the bottom.
 */
export function ChappiAttachMenu({ disabled, onFiles }: ChappiAttachMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pictureRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const touchCamera = useHasTouchCamera();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (input: RefObject<HTMLInputElement | null>) => {
    setOpen(false);
    // Opening a picker only works inside the tap that asked for it, which this is.
    input.current?.click();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Cleared so choosing the same file twice in a row still fires a change.
    event.target.value = '';
    if (files.length > 0) onFiles(files);
  };

  const rowClass =
    'motion-focus flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Attach a photo or file"
        className="motion-press grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-elevated hover:text-content-primary disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label="Attach to your message"
          className="absolute bottom-full left-0 z-50 mb-2 w-56 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-stroke-default bg-bg-surface py-1 shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]"
        >
          {touchCamera ? (
            <button type="button" onClick={() => pick(cameraRef)} className={rowClass}>
              <Camera className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
              Take a photo
            </button>
          ) : null}
          <button type="button" onClick={() => pick(pictureRef)} className={rowClass}>
            <ImageIcon className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
            Choose a picture
          </button>
          <button type="button" onClick={() => pick(fileRef)} className={rowClass}>
            <FileText className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
            Attach a text file
          </button>
        </div>
      ) : null}

      {/* Three real inputs, kept out of the tab order: the buttons above are the
          controls. `capture` asks a phone for its camera; everywhere else it is
          ignored, which is why the row above only shows on touch. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        className="hidden"
        onChange={handleChange}
      />
      <input ref={pictureRef} type="file" accept="image/*" multiple tabIndex={-1} className="hidden" onChange={handleChange} />
      <input ref={fileRef} type="file" accept={FILE_ACCEPT} multiple tabIndex={-1} className="hidden" onChange={handleChange} />
    </div>
  );
}

type RefObject<T> = { current: T };
