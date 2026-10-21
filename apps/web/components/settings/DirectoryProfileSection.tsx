'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Sparkles } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  DIRECTORY_SETTINGS_ANCHOR,
  PERSON_BIO_MAX_CHARS,
  PERSON_ROLES_MAX,
  PERSON_VISIBILITIES,
  PERSON_VISIBILITY_COPY,
} from '@/lib/person-profile';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import {
  PROFILE_TYPES,
  PROFILE_TYPE_LABELS,
  isProfileType,
  openToChoices,
  openToLabel,
  type ProfileType,
} from '@/lib/directory-profile-type';
import type { PersonProfile, ProfileRole } from '@/types/directory';
import { kitFieldNames, type ResolvedProfileView } from '@/lib/profile-kit';
import { BioDraftCard } from '@/components/directory/BioDraftCard';
import { UrgansLockedSheet } from '@/components/urgans-actions/UrgansLockedSheet';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { applyRunAction, discardRunAction, runDraftDirectoryBio } from '@/lib/urgans-actions/client';
import { panelClass } from './panelClass';
import { SentRequestsList } from '@/components/directory/SentRequestsList';
import { WorkRequestsInbox } from './WorkRequestsInbox';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { HelpTip } from '@/components/shared/HelpTip';
import { useReportDirty } from './useReportDirty';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { PERSON_PHOTO_SIGN_URL } from '@/lib/profile-photo-client';

const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';
const REQUESTS_ENABLED =
  DIRECTORY_ENABLED && process.env.NEXT_PUBLIC_FEATURE_DIRECTORY_REQUESTS === 'true';


/**
 * Your record in the directory, and who is allowed to see it.
 *
 * Opting in is the whole first decision, so the section leads with it rather
 * than burying it under a form: somebody who does not want to be found should
 * be able to read one line, do nothing, and be right.
 *
 * WHAT YOU TYPE AND WHAT YOU HAVE DELIVERED ARE SHOWN APART, and that
 * separation is the feature rather than a layout choice. The roles you tick are
 * a claim; the counts underneath come from releases that actually came out and
 * cannot be edited from here or anywhere else. Blurring them would put the
 * whole record back at the mercy of self-reporting.
 *
 * Lives in Account rather than Workspace because a profile belongs to the
 * person: it follows them if they leave the team, which is exactly the point of
 * a record that outlives a job. It is also, like Report an issue and Admin
 * above it, only reachable on a phone from this tab.
 */
export function DirectoryProfileSection() {
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [roles, setRoles] = useState<ProfileRole[]>([]);
  // What the directory actually SHOWS: the artist's published press kit laid
  // over the stored profile. `profile` stays the person's own record.
  const [view, setView] = useState<ResolvedProfileView | null>(null);
  const [canDraftBio, setCanDraftBio] = useState(false);
  const [draft, setDraft] = useState<{ actionId: string; bio: string } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [lockedMessage, setLockedMessage] = useState('');
  const { balance, refresh: refreshBalance } = useCreditBalance();
  const [loaded, setLoaded] = useState(false);
  // The type this profile reads as (the override, or what the roles say) and
  // the line it leads with, both worked out on the server.
  const [effectiveType, setEffectiveType] = useState<ProfileType | null>(null);
  const [lead, setLead] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  // The three free-text fields. Each still saves when you leave it, exactly as
  // before; they are held here (not left uncontrolled) so the pop-up can tell
  // that one was typed into and never left, which is what pressing Escape
  // while the cursor is in the bio does. `undefined` means "not edited yet".
  const [drafts, setDrafts] = useState<{ bio?: string; city?: string; country?: string }>({});

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
  }, []);

  const apply = useCallback(
    (body: {
      profile: PersonProfile | null;
      roles: ProfileRole[];
      view?: ResolvedProfileView | null;
      canDraftBio?: boolean;
      effectiveType?: unknown;
      lead?: unknown;
    }) => {
      setProfile(body.profile);
      setEffectiveType(isProfileType(body.effectiveType) ? body.effectiveType : null);
      setLead(typeof body.lead === 'string' ? body.lead : '');
      setRoles(Array.isArray(body.roles) ? body.roles : []);
      setView(body.view ?? null);
      setCanDraftBio(body.canDraftBio === true);
      if (body.profile) setName(body.profile.displayName);
    },
    []
  );

  useEffect(() => {
    if (!DIRECTORY_ENABLED) return;
    let cancelled = false;

    const load = async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const response = await fetch('/api/directory/profile', { headers, cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) apply(body);
      } catch {
        // Silent: an unreadable profile is not worth an error box on a settings
        // page somebody opened to do something else. The save path reports.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [apply, authHeaders]);

  const save = async (patch: Record<string, unknown>) => {
    const headers = await authHeaders();
    if (!headers) return;
    // Read before the write: opting in is the supply side of the directory and
    // the only moment on this page worth counting. Every later edit is somebody
    // already listed tidying their own record.
    const wasListed = Boolean(profile && profile.visibility !== 'private');
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/directory/profile', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not save that.');
        return;
      }
      apply(body);

      const saved = body?.profile as PersonProfile | null | undefined;
      if (saved && !wasListed && saved.visibility !== 'private') {
        captureAnalyticsEvent({
          name: 'directory_profile_listed',
          properties: {
            visibility: saved.visibility,
            claimed_roles: saved.roles?.length ?? 0,
            has_city: Boolean(saved.city),
          },
        });
      }
    } catch {
      setError('Could not save that. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  // The photo's own save: same PATCH, but it answers with the signed URL the
  // picker shows, and throws so the picker can say what went wrong.
  const savePhoto = async (photoPath: string | null): Promise<string | null> => {
    const headers = await authHeaders();
    if (!headers) throw new Error('Sign in again to change your photo.');
    const response = await fetch('/api/directory/profile', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ photoPath }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body.error === 'string' ? body.error : 'Could not save your photo.');
    }
    apply(body);
    const saved = body?.profile as PersonProfile | null | undefined;
    return saved?.avatarUrl ?? null;
  };

  const draftBio = async (notes = '') => {
    if (!profile) return;
    setDrafting(true);
    setDraftError('');
    const result = await runDraftDirectoryBio({ profileId: profile.id, notes });
    setDrafting(false);
    // The run has settled, so the balance has moved (a failed run costs nothing).
    void refreshBalance();
    if (!result.ok) {
      if (result.planRequired) {
        setLockedMessage(result.error);
        return;
      }
      setDraftError(result.error);
      return;
    }
    setDraft({ actionId: result.actionId, bio: result.bio });
  };

  const acceptDraft = async () => {
    if (!draft) return;
    const headers = await authHeaders();
    if (!headers) return;
    setAccepting(true);
    setDraftError('');
    const result = await applyRunAction(draft.actionId, headers.Authorization.replace('Bearer ', ''));
    if (!result.ok) {
      setAccepting(false);
      setDraftError(result.error);
      return;
    }
    // Read it back rather than trusting the draft on screen: what is shown is
    // what the directory now holds.
    try {
      const response = await fetch('/api/directory/profile', { headers, cache: 'no-store' });
      if (response.ok) apply(await response.json());
    } catch {
      // The bio is saved either way; the next load shows it.
    }
    setDrafts((current) => ({ ...current, bio: undefined }));
    setDraft(null);
    setAccepting(false);
  };

  const discardDraft = () => {
    const current = draft;
    setDraft(null);
    setDraftError('');
    if (!current) return;
    void (async () => {
      const headers = await authHeaders();
      // Best effort: nothing was written, so a failed discard costs nothing.
      if (headers) await discardRunAction(current.actionId, headers.Authorization.replace('Bearer ', ''));
    })();
  };

  const hasUnsavedText =
    profile !== null &&
    ((drafts.bio !== undefined && drafts.bio.trim() !== (profile.bio ?? '')) ||
      (drafts.city !== undefined && drafts.city.trim() !== (profile.city ?? '')) ||
      (drafts.country !== undefined && drafts.country.trim() !== (profile.country ?? '')));
  useReportDirty('directory.text', hasUnsavedText);

  if (!DIRECTORY_ENABLED) return null;

  const claimed = new Set(profile?.roles ?? []);
  const delivered = roles.filter((entry) => entry.delivered > 0);

  const toggleRole = (role: DirectoryRole) => {
    const next = new Set(claimed);
    if (next.has(role)) next.delete(role);
    else if (next.size >= PERSON_ROLES_MAX) return;
    else next.add(role);
    void save({ roles: [...next] });
  };

  return (
    // `id` is the deep-link target. The directory's "Add yourself" used to push
    // a bare /settings, which lands at the TOP of a twelve-section tab with
    // this one fifth down — on a phone that reads as a button that did
    // nothing, which is exactly how it was reported (2026-09-06).
    <section id={DIRECTORY_SETTINGS_ANCHOR} className={`${panelClass} scroll-mt-4`}>
      <h2 className="mb-4 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Your directory record
        <HelpTip helpKey="settings.directory" className="align-text-bottom" />
      </h2>
      {/* OPTING IN OPENS THE PAGE (founder call, 2026-09-06). "List me" used to
          save `directory` — findable, page closed — and the in-app card only
          links to /p/{slug} for a PUBLIC profile, so the default opt-in state
          produced somebody a manager could find and had no way to reach. A
          directory whose people cannot be contacted is a lookup table.
          Closing the page again is one control below. */}
      {/* Three sentences until 2026-09-08. The one that stays is the one a
          person needs before deciding anything: nothing is public yet. */}
      {!loaded ? (
        <div className="h-24 animate-pulse rounded-lg bg-bg-elevated" aria-hidden />
      ) : !profile ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-content-tertiary">Your name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ada Obi"
              className="h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void save({ displayName: name.trim(), visibility: 'public' })}
            className="motion-focus inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            List me
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Your face on your card and your page. Your own photo wins over a
              press kit photo (lib/profile-kit.ts), so this is never overridden. */}
          <div className="flex items-center gap-4">
            <ProfilePhotoPicker
              name={profile.displayName}
              photoUrl={profile.avatarUrl}
              size={64}
              signUrl={PERSON_PHOTO_SIGN_URL}
              save={savePhoto}
              onChange={(url) => setProfile((current) => (current ? { ...current, avatarUrl: url } : current))}
              surface="person_photo"
              showActions
            />
            <p className="text-xs text-content-tertiary">
              {profile.avatarUrl
                ? 'This is the face on your card and your page.'
                : 'Add a photo so people know who they are asking.'}
            </p>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">Who can find you</span>
            <select
              value={profile.visibility}
              disabled={busy}
              onChange={(event) => void save({ visibility: event.target.value })}
              className="h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none disabled:opacity-60"
            >
              {PERSON_VISIBILITIES.map((value) => (
                <option key={value} value={value}>
                  {PERSON_VISIBILITY_COPY[value].label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-content-tertiary">
              {PERSON_VISIBILITY_COPY[profile.visibility].hint}
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">Profile type</span>
            <select
              value={profile.profileType ?? ''}
              disabled={busy}
              onChange={(event) => void save({ profileType: event.target.value || null })}
              className="h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none disabled:opacity-60"
            >
              <option value="">
                {effectiveType
                  ? `Work it out from what I do (${PROFILE_TYPE_LABELS[effectiveType]})`
                  : 'Work it out from what I do'}
              </option>
              {PROFILE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROFILE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            {/* What readers see first on your card and page. Empty for a
                creative, whose first thing is the delivered credits. */}
            {lead ? (
              <span className="mt-1 block text-xs text-content-tertiary">
                Your card leads with: {lead}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">Open to</span>
            <select
              value={profile.availability}
              disabled={busy}
              onChange={(event) => void save({ availability: event.target.value })}
              className="h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none disabled:opacity-60"
            >
              {openToChoices(effectiveType, profile.availability).map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-content-tertiary">
              {openToChoices(effectiveType, profile.availability).find(
                (choice) => choice.value === profile.availability
              )?.hint ?? openToLabel(effectiveType, profile.availability)}
            </span>
          </label>

          <div>
            <span className="mb-2 block text-xs text-content-tertiary">
              What you do. Pick up to {PERSON_ROLES_MAX}.
            </span>
            <div className="flex flex-wrap gap-2">
              {DIRECTORY_ROLES.map((role) => {
                const on = claimed.has(role);
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    onClick={() => toggleRole(role)}
                    className={`motion-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm disabled:opacity-60 ${
                      on
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-stroke-default text-content-secondary hover:border-brand'
                    }`}
                  >
                    {on ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                    {DIRECTORY_ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deliberately apart from the picker above. These are not a claim
              and nothing on this page can change them. */}
          <div>
            <span className="mb-2 block text-xs text-content-tertiary">What you have delivered</span>
            {delivered.length === 0 ? (
              <p className="text-sm text-content-secondary">
                Nothing yet. This fills in on its own once a rollout you worked on comes out.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {delivered.map((entry) => (
                  <li
                    key={entry.role}
                    className="rounded-full border border-stroke-default px-3 py-1.5 text-sm text-content-primary"
                  >
                    {DIRECTORY_ROLE_LABELS[entry.role]}
                    <span className="ml-1.5 text-content-tertiary">{entry.delivered} delivered</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ONE RECORD, SEEN TWO WAYS. For an artist whose press kit is
              published, the bio, place, links and photo the directory shows
              come from that kit, so they are edited there once and never
              twice. A field the kit leaves empty still falls back to the one
              typed here. Since Oct 17, 2026 the standalone kit editor is
              hidden, so the link opens a rollout of that artist in Pitch
              this!, where the bio is edited (About the artist). */}
          {view?.kit && kitFieldNames(view).length > 0 ? (
            <div className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-3">
              <p className="text-sm text-content-primary">
                Your page uses {view.kit.artistName}&apos;s kit for {kitFieldNames(view).join(', ')}.
              </p>
              <Link
                href={`/dashboard/pitching?artist=${encodeURIComponent(view.kit.artistId)}`}
                className="motion-focus mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-4"
              >
                Edit it in Pitch this!
              </Link>
              {view.fromKit.bio && view.bio ? (
                <p className="line-clamp-4 whitespace-pre-line text-sm text-content-secondary">{view.bio}</p>
              ) : null}
            </div>
          ) : null}

          {!view?.fromKit.bio ? (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor="directory-bio" className="block text-xs text-content-tertiary">
                  A line about you. Optional.
                </label>
                {canDraftBio && !draft ? (
                  <button
                    type="button"
                    onClick={() => void draftBio()}
                    disabled={drafting || busy}
                    className="motion-focus inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand disabled:opacity-60"
                  >
                    {drafting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden />
                    )}
                    Draft my bio
                  </button>
                ) : null}
              </div>
              {draft ? (
                <div className="mb-3">
                  <BioDraftCard
                    bio={draft.bio}
                    balance={balance}
                    isBusy={drafting || accepting}
                    error={draftError}
                    onAccept={() => void acceptDraft()}
                    onRetry={(notes) => void draftBio(notes)}
                    onDiscard={discardDraft}
                  />
                </div>
              ) : null}
              {!draft && draftError ? (
                <p role="alert" className="mb-2 text-sm text-status-error">
                  {draftError}
                </p>
              ) : null}
              <textarea
                id="directory-bio"
                value={drafts.bio ?? profile.bio ?? ''}
                onChange={(event) => setDrafts((current) => ({ ...current, bio: event.target.value }))}
                disabled={busy}
                rows={3}
                maxLength={PERSON_BIO_MAX_CHARS}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next !== (profile.bio ?? '')) void save({ bio: next || null });
                }}
                className="w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary hover:border-content-secondary focus:border-brand focus:outline-none disabled:opacity-60"
              />
            </div>
          ) : null}

          {!view?.fromKit.location ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(['city', 'country'] as const).map((field) => (
                <label key={field} className="block">
                  <span className="mb-1 block text-xs capitalize text-content-tertiary">{field}</span>
                  <input
                    value={drafts[field] ?? profile[field] ?? ''}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [field]: event.target.value }))
                    }
                    disabled={busy}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next !== (profile[field] ?? '')) void save({ [field]: next || null });
                    }}
                    className="h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary hover:border-content-secondary focus:border-brand focus:outline-none disabled:opacity-60"
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {error ? <p role="alert" className="mt-3 text-sm text-status-error">{error}</p> : null}

      <UrgansLockedSheet
        open={Boolean(lockedMessage)}
        message={lockedMessage}
        actionType="directory.draft_bio"
        onClose={() => setLockedMessage('')}
      />

      {/* Requests waiting for you. Rendered only once you have a record —
          nobody can ask somebody who is not listed — and the inbox itself
          renders nothing until there is something in it. */}
      {REQUESTS_ENABLED && profile ? <WorkRequestsInbox /> : null}

      {/* What came back from the people YOU asked. Deliberately not gated on
          `profile` the way the inbox above is: nobody can ask somebody who is
          not listed, but a manager who does the asking need never have opted
          in themselves. Renders nothing until they have sent one. */}
      {REQUESTS_ENABLED ? <SentRequestsList /> : null}
    </section>
  );
}
