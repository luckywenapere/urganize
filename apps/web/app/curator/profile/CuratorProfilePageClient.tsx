'use client';

// The curator's profile. Short on purpose: the display name is what artist
// teams see beside every playlist, the bio gives them a reason to pitch well,
// and the photo is optional.

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Check } from 'lucide-react';
import { CuratorShell } from '@/components/curator/CuratorShell';
import { CuratorProfileSkeleton } from '@/components/loading/CuratorSkeleton';
import { useCuratorStore } from '@/stores/useCuratorStore';
import { supabase } from '@/lib/supabase/client';
import { MAX_CURATOR_BIO_LENGTH, MAX_CURATOR_DISPLAY_NAME_LENGTH } from '@/lib/pitching';

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
  const loadProfile = useCuratorStore((state) => state.loadProfile);
  const saveProfile = useCuratorStore((state) => state.saveProfile);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks whether the form has been seeded, so a background refresh cannot
  // overwrite what the curator is currently typing.
  const seededRef = useRef(false);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!profile || seededRef.current) return;
    seededRef.current = true;
    setDisplayName(profile.displayName);
    setBio(profile.bio);
  }, [profile]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await saveProfile({ displayName: displayName.trim(), bio: bio.trim() });
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
    try {
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
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
        }),
      });
      const signPayload = (await signResponse.json().catch(() => null)) as {
        upload_url?: string;
        storage_path?: string;
        error?: string;
      } | null;
      if (!signResponse.ok || !signPayload?.upload_url || !signPayload.storage_path) {
        throw new Error(signPayload?.error || 'Could not start the upload.');
      }

      const uploadResponse = await fetch(signPayload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error('The upload did not finish.');

      await saveProfile({ photoPath: signPayload.storage_path });
      setSavedAt(Date.now());
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not save the photo.');
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
      {isLoading && !profile ? (
        <CuratorProfileSkeleton />
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
                    {initialsOf(displayName || profile?.displayName || '')}
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
                onChange={(event) => setDisplayName(event.target.value)}
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
                onChange={(event) => setBio(event.target.value)}
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
                disabled={busy || !displayName.trim()}
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
