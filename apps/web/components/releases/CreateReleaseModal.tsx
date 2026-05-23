'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CalendarDays, Loader2, X } from 'lucide-react';
import { Button, IconButton } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';

type CreateReleaseModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (releaseId: string) => void;
};

type CreateReleaseResponse = {
  releaseId?: string;
  id?: string;
  release?: {
    id?: string;
  };
  redirectTo?: string;
  error?: string;
};

type FieldErrors = Partial<Record<'title' | 'releaseDate' | 'description', string>>;

const MAX_DESCRIPTION_LENGTH = 500;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

function validateReleaseDate(value: string): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Use a valid release date.';
  }

  return '';
}

export function CreateReleaseModal({ open, onClose, onCreated }: CreateReleaseModalProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => titleInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onClose, open]);

  const characterCount = description.length;
  const canSubmit = useMemo(() => title.trim().length > 0 && !isSubmitting, [isSubmitting, title]);

  if (!open) {
    return null;
  }

  const validateForm = () => {
    const nextErrors: FieldErrors = {};

    if (!title.trim()) {
      nextErrors.title = 'Release title is required.';
    } else if (title.trim().length > 140) {
      nextErrors.title = 'Release title must be 140 characters or fewer.';
    }

    const dateError = validateReleaseDate(releaseDate);
    if (dateError) {
      nextErrors.releaseDate = dateError;
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      nextErrors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/releases', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          releaseDate: releaseDate || undefined,
          description: description.trim(),
          source: 'dashboard',
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CreateReleaseResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not create release.');
      }

      const releaseId = payload.release?.id || payload.releaseId || payload.id || '';
      if (!releaseId) {
        throw new Error('Release created, but no release id was returned.');
      }

      setTitle('');
      setReleaseDate('');
      setDescription('');
      setErrors({});
      onCreated(releaseId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create release.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] overflow-y-auto bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8" role="presentation">
      <button
        type="button"
        aria-label="Close create release modal"
        className="fixed inset-0 cursor-default"
        onClick={() => {
          if (!isSubmitting) {
            onClose();
          }
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-release-title"
        className="relative mx-auto flex min-h-full w-full max-w-3xl items-center"
      >
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="relative w-full border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgba(0,0,0,0.76)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-stroke-subtle p-4 sm:p-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                Create release
              </p>
              <h2 id="create-release-title" className="mt-2 font-display text-2xl font-semibold text-content-primary">
                Start a release workspace
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-content-secondary">
                Add the release basics. Urganize will create the workspace and seed the default task plan automatically.
              </p>
            </div>
            <IconButton
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close modal"
              className="shrink-0 border-stroke-default bg-white/[0.02]"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-content-primary">Release title</span>
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="input rounded-none border-stroke-default bg-bg-elevated"
                  placeholder="Midnight Drive"
                  maxLength={140}
                  aria-invalid={Boolean(errors.title)}
                />
                {errors.title ? <p className="mt-2 text-xs text-status-error">{errors.title}</p> : null}
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-content-primary">
                  <CalendarDays className="h-4 w-4 text-content-tertiary" />
                  Release date
                </span>
                <input
                  type="date"
                  value={releaseDate}
                  onChange={(event) => setReleaseDate(event.target.value)}
                  className="input rounded-none border-stroke-default bg-bg-elevated"
                  aria-invalid={Boolean(errors.releaseDate)}
                />
                {errors.releaseDate ? <p className="mt-2 text-xs text-status-error">{errors.releaseDate}</p> : null}
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-content-primary">Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  className="input min-h-32 resize-none rounded-none border-stroke-default bg-bg-elevated"
                  placeholder="Release context, campaign notes, or internal goals"
                  aria-invalid={Boolean(errors.description)}
                />
                <span className="mt-2 flex justify-between gap-3 text-xs">
                  <span className="text-status-error">{errors.description || ''}</span>
                  <span className={characterCount > MAX_DESCRIPTION_LENGTH ? 'text-status-error' : 'text-content-tertiary'}>
                    {characterCount}/{MAX_DESCRIPTION_LENGTH}
                  </span>
                </span>
              </label>
          </div>

          {submitError ? (
            <div className="mx-4 mb-4 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{submitError}</p>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-stroke-subtle p-4 sm:flex-row sm:justify-end sm:p-5">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              isLoading={isSubmitting}
              leftIcon={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              Create release
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
