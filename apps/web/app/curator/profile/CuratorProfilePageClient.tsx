'use client';

// The curator's profile. Short on purpose: the display name is what artist
// teams see beside every playlist, the bio gives them a reason to pitch well,
// and the photo is optional.

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Check } from 'lucide-react';
import { CuratorShell } from '@/components/curator/CuratorShell';
import { CuratorLoadError } from '@/components/curator/CuratorLoadError';
import { useCuratorStore } from '@/stores/useCuratorStore';
import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent, createPostHogEvent } from '@/lib/analytics';
import {
  buildUploadFailureReport,
  formatUploadFailureCode,
  type UploadStep,
} from '@/lib/upload-failure-report';
import { MAX_CURATOR_BIO_LENGTH, MAX_CURATOR_DISPLAY_NAME_LENGTH } from '@/lib/pitching';
import { prepareAvatarImage } from '@/lib/downscale-image';

const inputClass =
  'h-11 w-full rounded-xl border border-stroke-default bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';
const labelClass = 'block text-[11px] uppercase tracking-[0.16em] text-content-tertiary';

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'P';

export function CuratorProfilePageClient() {
  const profile = useCuratorStore((state) => state.profile);
  const isLoading = useCuratorStore((state) => state.isLoadingProfile);
  const loadError = useCuratorStore((state) => state.profileError);
  const loadProfile = useCuratorStore((state) => state.loadProfile);
  const saveProfile = useCuratorStore((state) => state.saveProfile);

  /**
   * Edits, as DRAFTS over the loaded profile: null means "not edited", so the
   * field shows whatever the server has.
   *
   * Deliberately derived rather than seeded by an effect, which is what this
   * used to do. Two problems that removes by construction:
   *
   *  - the form now renders BEFORE the profile arrives (so the page is readable
   *    on a weak connection), and a seeding effect would overwrite whatever the
   *    curator had already typed when the load finally landed;
   *  - the save can send ONLY edited fields. Sending both unconditionally would
   *    wipe an existing bio with '' whenever someone edits just their name
   *    before the load lands. The PATCH route reads `'bio' in payload`, so an
   *    omitted field is genuinely left alone.
   *
   * It also drops an effect that the react-hooks/set-state-in-effect rule flags,
   * rather than suppressing it.
   */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [bioDraft, setBioDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = nameDraft ?? profile?.displayName ?? '';
  const bio = bioDraft ?? profile?.bio ?? '';
  const hasEdits = nameDraft !== null || bioDraft !== null;

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    // Enter in a text input submits the form even while the Save button is
    // disabled, so the no-edits case has to be refused here too — otherwise it
    // sends an empty patch and the route answers "Nothing to save.", which
    // reads like a failure for someone who changed nothing.
    if (!hasEdits) return;
    setError('');
    setIsSaving(true);
    try {
      await saveProfile({
        ...(nameDraft !== null ? { displayName: nameDraft.trim() } : {}),
        ...(bioDraft !== null ? { bio: bioDraft.trim() } : {}),
      });
      // Clear the drafts so both fields track the saved profile from here.
      setNameDraft(null);
      setBioDraft(null);
      setSavedAt(Date.now());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  // Three steps, the same flow the workspace logo uses: ask for a signed URL,
  // PUT the bytes straight to storage, then point the profile at the path.
  const handlePhoto = async (file: File) => {
    setError('');
    setIsUploading(true);
    // Tracks how far the three-step upload got, so a failure reports its step
    // rather than just "it didn't work" — see lib/upload-failure-report.ts.
    let step: UploadStep = 1;
    let status: number | undefined;
    try {
      // Shrink before uploading — a photo straight off a phone or a print-res
      // export can be far past what any browser will decode, and that failure
      // paints a broken avatar without firing an error event. See
      // lib/downscale-image.ts for the file that proved it.
      const prepared = await prepareAvatarImage(file);
      if (!prepared) {
        setError('Could not read that image. Try a JPEG, or export the photo again.');
        return;
      }
      // The prepared file is the upload from here: name, type and size travel
      // together so the signed path, the bytes and the validated size agree.
      const upload = prepared.file;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Sign in again to change your photo.');

      const signResponse = await fetch('/api/curator/profile/photo', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: upload.name,
          mime_type: upload.type,
          file_size: upload.size,
        }),
      });
      const signPayload = (await signResponse.json().catch(() => null)) as {
        upload_url?: string;
        storage_path?: string;
        error?: string;
      } | null;
      if (!signResponse.ok || !signPayload?.upload_url || !signPayload.storage_path) {
        status = signResponse.status;
        throw new Error(signPayload?.error || 'Could not start the upload.');
      }

      step = 2;
      const uploadResponse = await fetch(signPayload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': upload.type },
        body: upload,
      });
      if (!uploadResponse.ok) {
        status = uploadResponse.status;
        throw new Error('The upload did not finish.');
      }

      step = 3;
      await saveProfile({ photoPath: signPayload.storage_path });
      setSavedAt(Date.now());
    } catch (uploadError) {
      // On screen, not just in analytics — see formatUploadFailureCode.
      const code = formatUploadFailureCode({ surface: 'curator_photo', step, status });
      const detail =
        uploadError instanceof Error ? uploadError.message : 'Could not save the photo.';
      setError(`${detail} If you report this, quote ${code}.`);
      captureAnalyticsEvent(
        createPostHogEvent(
          'asset_upload_failed',
          buildUploadFailureReport({
            surface: 'curator_photo',
            step,
            status,
            message: uploadError instanceof Error ? uploadError.message : null,
          })
        )
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setError('');
    setIsSaving(true);
    try {
      await saveProfile({ photoPath: null });
      setSavedAt(Date.now());
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove the photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const busy = isSaving || isUploading;

  return (
    <CuratorShell>
      {loadError && !profile ? (
        // Nothing loaded, so there is nothing to edit: saving from a blank form
        // here would either fail again or overwrite a real name with an empty
        // one. Show the reason and a retry instead.
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
              Your profile
            </p>
            <h1 className="font-display text-2xl text-content-primary">Profile</h1>
          </header>
          <CuratorLoadError
            message={loadError}
            isRetrying={isLoading}
            onRetry={() => void loadProfile({ force: true })}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
              Your profile
            </p>
            <h1 className="font-display text-2xl text-content-primary">Profile</h1>
            <p className="text-sm text-content-secondary">
              Artist teams see this beside every playlist you own.
            </p>
          </header>

          {/* A line, not a full-page skeleton.
              This page deliberately has NO `isLoading` gate around the form, so
              its real markup — labels, inputs, the save control — is in the
              server HTML and readable before any JavaScript arrives. That is
              the /auth precedent (see CLAUDE.md, "The front door is
              server-rendered"): a curator on weak mobile data used to get a
              skeleton and nothing else. Re-adding a skeleton gate here would
              silently undo it.
              Safe because the form no longer depends on the load having
              finished: the seed effect leaves edited fields alone, and the save
              sends only edited fields, so nothing gets clobbered either way. */}
          {isLoading && !profile ? (
            <p className="text-xs text-content-tertiary" role="status">
              Loading your details…
            </p>
          ) : null}

          {loadError ? (
            <CuratorLoadError
              message={loadError}
              variant="banner"
              isRetrying={isLoading}
              onRetry={() => void loadProfile({ force: true })}
            />
          ) : null}

          <form
            onSubmit={handleSave}
            className="space-y-5 rounded-xl border border-stroke-default bg-bg-surface p-4"
          >
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-stroke-default bg-bg-elevated">
                {profile?.photoUrl ? (
                  <Image
                    src={profile.photoUrl}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-display text-lg text-content-tertiary">
                    {initialsOf(displayName)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-default px-3 text-xs font-semibold text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {isUploading ? 'Uploading…' : profile?.photoPath ? 'Change photo' : 'Add photo'}
                </button>
                {profile?.photoPath ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRemovePhoto()}
                    className="inline-flex h-9 items-center rounded-full border border-stroke-default px-3 text-xs font-semibold text-content-secondary disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handlePhoto(file);
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="curator-name">
                Display name
              </label>
              <input
                id="curator-name"
                className={inputClass}
                value={displayName}
                maxLength={MAX_CURATOR_DISPLAY_NAME_LENGTH}
                onChange={(event) => setNameDraft(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="curator-bio">
                Short bio
              </label>
              <textarea
                id="curator-bio"
                rows={4}
                value={bio}
                maxLength={MAX_CURATOR_BIO_LENGTH}
                onChange={(event) => setBioDraft(event.target.value)}
                placeholder="What you look for. How often you refresh your playlists."
                className="w-full rounded-xl border border-stroke-default bg-bg-base p-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
              />
              <p className="text-right font-mono text-[11px] text-content-tertiary">
                {bio.length}/{MAX_CURATOR_BIO_LENGTH}
              </p>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-status-error">
                {error}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !hasEdits || !displayName.trim()}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save profile'}
              </button>
              {savedAt && !busy ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-brand">
                  <Check className="h-4 w-4" />
                  Saved
                </span>
              ) : null}
            </div>
          </form>
        </div>
      )}
    </CuratorShell>
  );
}
