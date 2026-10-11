'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DialogPanel } from './DialogPanel';
import { MAX_CROP_ZOOM, MIN_CROP_ZOOM, clampCrop, cropScale, cropSourceRect, type CropState } from '@/lib/photo-crop';

/**
 * Frame the photo before it uploads (2026-10-11). Drag to move, slide or
 * scroll to zoom, and the circle shows exactly what every avatar will show.
 * Output is a square JPEG, at most 1024px, drawn from the source pixels.
 */

const VIEW = 280;
const OUTPUT_MAX = 1024;

type Props = {
  file: File;
  name: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

export function PhotoCropDialog({ file, name, onCancel, onConfirm }: Props) {
  const [src, setSrc] = useState('');
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState('');
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; from: CropState } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const update = (next: CropState) => {
    if (!natural) return;
    setCrop(clampCrop(natural.width, natural.height, VIEW, next));
  };

  const confirm = () => {
    const image = imageRef.current;
    if (!image || !natural) return;
    const rect = cropSourceRect(natural.width, natural.height, VIEW, crop);
    const out = Math.max(1, Math.round(Math.min(OUTPUT_MAX, rect.size)));
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('This browser could not crop the photo.');
      return;
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, out, out);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('This browser could not crop the photo.');
          return;
        }
        const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
        onConfirm(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9
    );
  };

  const scale = natural ? cropScale(natural.width, natural.height, VIEW, crop.zoom) : 1;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Cancel" tabIndex={-1} onClick={onCancel} className="absolute inset-0 bg-black/60" />
      <DialogPanel
        label={`Frame ${name}'s photo`}
        onClose={onCancel}
        className="relative w-full max-w-sm rounded-t-3xl border border-stroke-default bg-bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <h2 className="font-display text-lg font-semibold text-content-primary">Frame the photo</h2>
        <p className="mt-1 text-sm text-content-secondary">Drag to move it. Zoom to get closer.</p>

        <div
          className="relative mx-auto mt-4 touch-none select-none overflow-hidden rounded-2xl bg-bg-elevated"
          style={{ width: VIEW, height: VIEW, cursor: drag.current ? 'grabbing' : 'grab' }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, from: crop };
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.id !== event.pointerId) return;
            update({
              zoom: active.from.zoom,
              x: active.from.x + (event.clientX - active.startX),
              y: active.from.y + (event.clientY - active.startY),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onWheel={(event) => update({ ...crop, zoom: crop.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08) })}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL
            <img
              ref={imageRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const target = event.currentTarget;
                setNatural({ width: target.naturalWidth, height: target.naturalHeight });
              }}
              onError={() => setError('Could not read that image. Try a JPEG.')}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={
                natural
                  ? {
                      width: natural.width * scale,
                      height: natural.height * scale,
                      transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))`,
                    }
                  : { opacity: 0 }
              }
            />
          ) : null}
          {/* The circle every avatar shows; outside it is dimmed. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
          />
        </div>

        <label className="mt-4 block">
          <span className="sr-only">Zoom</span>
          <input
            type="range"
            min={MIN_CROP_ZOOM}
            max={MAX_CROP_ZOOM}
            step={0.01}
            value={crop.zoom}
            onChange={(event) => update({ ...crop, zoom: Number(event.target.value) })}
            className="w-full accent-brand"
          />
        </label>

        {error ? (
          <p role="alert" className="mt-2 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="motion-focus h-11 flex-1 rounded-lg border border-stroke-default text-sm font-medium text-content-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!natural}
            className="motion-focus h-11 flex-1 rounded-lg bg-brand text-sm font-semibold text-content-inverse disabled:opacity-60"
          >
            Use photo
          </button>
        </div>
      </DialogPanel>
    </div>,
    document.body
  );
}
