'use client';

// New project (#854, spec S4): "Nothing here yet." with three cards. The New
// project card is open when the team has nothing: stage first, then artist,
// kind, an optional name and only what that stage needs, with a live preview.
// Plus Bring in released music (the artist import, as a sheet) and Invite
// your team. The page owns saving; this owns the form, the sheets and copy.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_MUSIC_FORM,
  MUSIC_KIND_LABELS,
  MUSIC_OUT_WHEN_OPTIONS,
  MUSIC_STAGES,
  describeMusicBlocker,
  isEarlyStage,
  kindsForStage,
  musicPromise,
  type MusicForm,
  type TeamSummary,
  type TeamWhoFor,
} from '@/lib/onboarding-flow';
import { lagosToday } from '@/lib/next-records';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { clearPendingImports, readPendingImports } from '@/lib/artist-import/pending';
import { OnboardingArtistImportStep } from './OnboardingArtistImportStep';
import {
  AccountChip,
  ActionCard,
  BackLink,
  Heading,
  Lede,
  Sheet,
  Split,
  chipClass,
  errorTextClass,
  hintClass,
  icons,
  initialsOf,
  inputClass,
  labelClass,
  primaryButtonClass,
  surfaceClass,
  textLinkClass,
} from './OnboardingFrame';

const FORM_KEY_PREFIX = 'urganize.onboarding.music.';

function loadForm(userId: string): MusicForm {
  try {
    const raw = window.sessionStorage.getItem(FORM_KEY_PREFIX + userId);
    if (!raw) return DEFAULT_MUSIC_FORM;
    return { ...DEFAULT_MUSIC_FORM, ...(JSON.parse(raw) as Partial<MusicForm>) };
  } catch {
    return DEFAULT_MUSIC_FORM;
  }
}

function saveForm(userId: string, form: MusicForm): void {
  try {
    window.sessionStorage.setItem(FORM_KEY_PREFIX + userId, JSON.stringify(form));
  } catch {
    // Answers just are not kept across a reload.
  }
}

export function clearSavedMusicForm(userId: string): void {
  try {
    window.sessionStorage.removeItem(FORM_KEY_PREFIX + userId);
  } catch {
    // Nothing to clear.
  }
}

const formatDay = (ymd: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export type NewProjectSubmitState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'offline' }
  | { kind: 'error'; message: string; artistLimit?: boolean };

export function NewProjectScreen({
  userId,
  account,
  teams,
  selectedTeamId,
  onSelectTeam,
  joined,
  whoFor,
  submit,
  onSubmit,
  onSkip,
  onBackToTeam,
  onAskInvite,
  onOpenRollout,
  getToken,
  onTeamChanged,
}: {
  userId: string;
  account: { name: string; email: string; onLogout: () => void };
  teams: TeamSummary[];
  selectedTeamId: string | null;
  onSelectTeam: (workspaceId: string) => void;
  /** They joined this team as a Manager: show the team's work first. */
  joined: boolean;
  whoFor: TeamWhoFor | null;
  submit: NewProjectSubmitState;
  onSubmit: (form: MusicForm) => void;
  onSkip: () => void;
  onBackToTeam: (() => void) | null;
  onAskInvite: () => void;
  onOpenRollout: (releaseId: string) => void;
  getToken: () => Promise<string>;
  /** Something changed in the team (artists brought in). */
  onTeamChanged: () => void;
}) {
  const [form, setForm] = useState<MusicForm>(DEFAULT_MUSIC_FORM);
  const [formOpen, setFormOpen] = useState(true);
  const [sheet, setSheet] = useState<'import' | 'invite' | null>(null);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [imported, setImported] = useState('');
  const [invited, setInvited] = useState('');
  const hydrated = useRef(false);
  const today = useMemo(() => lagosToday(), []);

  const team = teams.find((item) => item.workspaceId === selectedTeamId) ?? teams[0] ?? null;
  const writableTeams = teams.filter((item) => item.canAdd);

  useEffect(() => {
    setForm(loadForm(userId));
    hydrated.current = true;
  }, [userId]);

  useEffect(() => {
    if (hydrated.current) saveForm(userId, form);
  }, [form, userId]);

  // A Manager who joined sees the team's work first, with the form closed.
  useEffect(() => {
    setFormOpen(!(joined && (team?.rolloutCount ?? 0) > 0));
  }, [joined, team?.workspaceId, team?.rolloutCount]);

  useEffect(() => {
    captureAnalyticsEvent({ name: 'onboarding_music_viewed', properties: { teams: teams.length, joined } });
    // Once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<MusicForm>) => setForm((current) => ({ ...current, ...patch }));
  const blocker = describeMusicBlocker(form, today);
  const busy = submit.kind === 'busy';
  const stage = MUSIC_STAGES.find((item) => item.value === form.stage) ?? null;
  const kinds = kindsForStage(form.stage);
  const suggestions = (team?.artists ?? []).filter(
    (artist) => artist.name.toLowerCase() !== form.artist.trim().toLowerCase()
  );
  const teamName = team?.name || 'your team';
  const showTeamMenu = writableTeams.length >= 2;
  const isOwnTeam = Boolean(team?.isOwn);

  const pickStage = (value: MusicForm['stage']) => {
    setForm((current) => ({
      ...current,
      stage: value,
      kind: value && !isEarlyStage(value) && current.kind === 'unsure' ? 'single' : current.kind,
    }));
  };

  const previewTitle = form.name.trim() || 'Untitled';
  let previewStatus = '';
  if (form.stage) {
    if (isEarlyStage(form.stage)) previewStatus = `${stage?.stamp} · in the making`;
    else if (form.stage === 'ready') previewStatus = `Ready · ${form.noDate || !form.date ? 'no date yet' : `out ${formatDay(form.date)}`}`;
    else {
      const when =
        form.outWhen === 'day' && form.outDay
          ? formatDay(form.outDay)
          : (MUSIC_OUT_WHEN_OPTIONS.find((option) => option.value === form.outWhen)?.label ?? 'when?').toLowerCase();
      previewStatus = `Out · ${when}`;
    }
  }

  const buttonLabel =
    submit.kind === 'busy' ? submit.label : submit.kind === 'offline' ? 'Try again' : 'Add it';

  const teamPicker = showTeamMenu ? (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setTeamMenuOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={teamMenuOpen}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-stroke-control bg-bg-hover px-2.5 font-semibold text-content-primary"
      >
        {teamName}
        {icons.chevronDown}
      </button>
      {teamMenuOpen ? (
        <span
          role="listbox"
          aria-label="Team"
          className="absolute left-0 top-full z-20 mt-1.5 block min-w-[220px] rounded-xl border border-stroke-control bg-bg-surface p-1 shadow-lg"
        >
          {writableTeams.map((item) => (
            <button
              key={item.workspaceId}
              type="button"
              role="option"
              aria-selected={item.workspaceId === team?.workspaceId}
              onClick={() => {
                onSelectTeam(item.workspaceId);
                setTeamMenuOpen(false);
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-content-primary hover:bg-bg-hover"
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.workspaceId === team?.workspaceId ? <span className="text-brand">{icons.check}</span> : null}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  ) : (
    <b className="font-semibold text-content-primary">{teamName}</b>
  );

  const left = joined && (team?.rolloutCount ?? 0) > 0 ? (
    <>
      <Heading>
        {teamName} has {team?.rolloutCount} {team?.rolloutCount === 1 ? 'rollout' : 'rollouts'}.
      </Heading>
      <Lede>
        Add what you&apos;re working on in {teamPicker}, or open one of the team&apos;s rollouts.
      </Lede>
      <AccountChip place="top" name={account.name} email={account.email} onLogout={account.onLogout} logoutLabel="Log out" />
    </>
  ) : (
    <>
      {onBackToTeam ? <BackLink onClick={onBackToTeam}>Team</BackLink> : null}
      <Heading>Nothing here yet.</Heading>
      <Lede>
        Add what you&apos;re working on in {teamPicker}, or{' '}
        <button type="button" onClick={onAskInvite} className={textLinkClass}>
          ask someone to invite you
        </button>
        .
      </Lede>
      <AccountChip place="top" name={account.name} email={account.email} onLogout={account.onLogout} logoutLabel="Log out" />
    </>
  );

  const stageField = (
    <div className="mt-3.5">
      <span className={labelClass} id="music-stage-label">
        Where is it now?
      </span>
      {stage ? (
        <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-brand bg-bg-base py-2 pl-3.5 pr-2">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-content-inverse" />
          </span>
          <span className="flex-1 font-semibold">{stage.label}</span>
          <button
            type="button"
            onClick={() => pickStage(null)}
            className="min-h-10 px-2.5 text-sm text-content-secondary underline underline-offset-[3px]"
          >
            Change
          </button>
        </div>
      ) : (
        <div role="radiogroup" aria-labelledby="music-stage-label" className="relative grid gap-1.5">
          <span aria-hidden="true" className="absolute bottom-6 left-[23px] top-6 w-[1.5px] bg-stroke-control" />
          {MUSIC_STAGES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={false}
              onClick={() => pickStage(item.value)}
              className="relative flex min-h-12 w-full items-center gap-3 rounded-xl py-2 pl-3.5 pr-3 text-left transition-colors duration-fast hover:bg-bg-hover"
            >
              <span aria-hidden="true" className="relative z-[1] h-5 w-5 shrink-0 rounded-full border-[1.5px] border-stroke-control bg-bg-surface" />
              <span className="flex-1 text-[15px] font-medium">
                {item.label}
                <small className="block text-[12.5px] font-normal text-content-secondary">{item.line}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const pastDay = form.stage === 'ready' && !form.noDate && /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.date < today;

  const rest = form.stage ? (
    <div className="animate-fade-in">
      <label className="mt-4 block">
        <span className={labelClass}>Artist</span>
        <input
          type="text"
          value={form.artist}
          onChange={(event) => set({ artist: event.target.value.slice(0, 120) })}
          placeholder="Artist name"
          autoComplete="off"
          className={inputClass}
        />
        <span className={hintClass}>{whoFor === 'artist' ? 'Your artist name.' : 'You, or the artist you manage.'}</span>
      </label>
      {suggestions.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.slice(0, 6).map((artist) => (
            <button key={artist.id} type="button" onClick={() => set({ artist: artist.name })} className={chipClass(false)}>
              {artist.name}
            </button>
          ))}
        </div>
      ) : null}
      <div role="radiogroup" aria-label="What is it?" className="mt-4">
        <span className={labelClass}>What is it?</span>
        <div className="flex flex-wrap gap-2">
          {kinds.map((kind) => (
            <button key={kind} type="button" role="radio" aria-checked={form.kind === kind} onClick={() => set({ kind })} className={chipClass(form.kind === kind)}>
              {MUSIC_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>
      <label className="mt-4 block">
        <span className={labelClass}>
          Name <span className="font-normal text-content-tertiary">(optional)</span>
        </span>
        <input
          type="text"
          value={form.name}
          onChange={(event) => set({ name: event.target.value.slice(0, 140) })}
          placeholder="Untitled"
          autoComplete="off"
          className={inputClass}
        />
        <span className={hintClass}>A working title is fine.</span>
      </label>
      {form.stage === 'ready' ? (
        <div role="radiogroup" aria-label="Release day" className="mt-4">
          <span className={labelClass}>Release day</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={form.noDate} onClick={() => set({ noDate: true })} className={chipClass(form.noDate)}>
              No date yet
            </button>
            <button type="button" role="radio" aria-checked={!form.noDate} onClick={() => set({ noDate: false })} className={chipClass(!form.noDate)}>
              Pick a day
            </button>
          </div>
          {form.noDate ? null : (
            <input
              type="date"
              aria-label="Release day"
              min={today}
              value={form.date}
              onChange={(event) => set({ date: event.target.value })}
              className={`${inputClass} mt-2.5 animate-fade-in`}
            />
          )}
          {pastDay ? (
            <p className="mt-1.5 text-[13px] text-status-warning">
              That day has passed.{' '}
              <button type="button" onClick={() => pickStage('out')} className="underline underline-offset-[3px]">
                Pick Already out instead?
              </button>
            </p>
          ) : null}
        </div>
      ) : null}
      {form.stage === 'out' ? (
        <div role="radiogroup" aria-label="When did it come out?" className="mt-4">
          <span className={labelClass}>When did it come out?</span>
          <div className="flex flex-wrap gap-2">
            {MUSIC_OUT_WHEN_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={form.outWhen === option.value}
                onClick={() => set({ outWhen: option.value })}
                className={chipClass(form.outWhen === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {form.outWhen === 'day' ? (
            <input
              type="date"
              aria-label="Day it came out"
              max={today}
              value={form.outDay}
              onChange={(event) => set({ outDay: event.target.value })}
              className={`${inputClass} mt-2.5 animate-fade-in`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  const preview = form.stage ? (
    <div className="mt-[18px] rounded-xl border border-dashed border-stroke-control p-3">
      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-content-tertiary">Preview</p>
      <div className="flex items-center gap-3 rounded-xl border border-stroke-control bg-bg-surface p-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-bg-hover text-base font-semibold text-content-secondary">
          {initialsOf(form.artist || '?')}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-[19px] font-normal leading-tight">{previewTitle}</p>
          <p className="mt-0.5 truncate text-[13px] text-content-secondary">
            {form.artist.trim() || 'Artist'} · {form.kind === 'unsure' ? 'Kind not set' : MUSIC_KIND_LABELS[form.kind]}
          </p>
          <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-content-tertiary">{previewStatus}</p>
        </div>
      </div>
    </div>
  ) : null;

  const musicForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocker && !busy) onSubmit(form);
      }}
      className="px-4 pb-4"
    >
      {stageField}
      {rest}
      {preview}
      {/* On a phone, Add it stays pinned to the bottom once the form is long. */}
      <div className="sticky bottom-0 z-[5] -mx-4 -mb-4 mt-4 bg-gradient-to-b from-transparent to-bg-surface to-[14px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 md:static md:m-0 md:mt-4 md:bg-none md:p-0">
        <button type="submit" disabled={Boolean(blocker) || busy} aria-describedby="music-blocker" className={primaryButtonClass}>
          {buttonLabel}
        </button>
        {submit.kind === 'offline' ? (
          <p role="alert" className="mt-2 text-center text-[13px] text-status-error">
            No connection. Your answers are saved. Tap Try again.
          </p>
        ) : null}
        {submit.kind === 'error' ? (
          <p role="alert" className="mt-2 text-center text-[13px] text-status-error">
            {submit.message}
          </p>
        ) : null}
        <p id="music-blocker" className="mt-2 min-h-5 text-center text-[13px] text-content-secondary">
          {blocker}
        </p>
        <p className="text-center text-[13px] text-content-tertiary">{musicPromise(form)}</p>
      </div>
    </form>
  );

  const rollouts =
    joined && team && team.rollouts.length ? (
      <div className={`${surfaceClass} mb-2.5 overflow-clip`}>
        {team.rollouts.map((rollout) => (
          <button
            key={rollout.id}
            type="button"
            onClick={() => onOpenRollout(rollout.id)}
            className="flex min-h-16 w-full items-center gap-3 border-b border-stroke-control px-3.5 py-3 text-left last:border-b-0 hover:bg-bg-hover"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{rollout.title}</span>
              <span className="block truncate text-[13px] text-content-secondary">
                {[
                  rollout.artistName,
                  MUSIC_KIND_LABELS[(rollout.releaseType as keyof typeof MUSIC_KIND_LABELS) || 'single'] ?? rollout.releaseType,
                  rollout.releaseDate ? `out ${formatDay(rollout.releaseDate)}` : 'no date yet',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            {icons.chevron}
          </button>
        ))}
      </div>
    ) : null;

  const right = (
    <>
      {rollouts}
      <div className={`${surfaceClass} overflow-clip`}>
        {formOpen ? (
          <>
            <div className="flex min-h-16 items-center gap-3 px-3.5 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-content-inverse">{icons.plus}</span>
              <span>
                <span className="block text-[15px] font-semibold">New project</span>
                <span className="block text-[13px] text-content-secondary">Any stage, even just an idea.</span>
              </span>
            </div>
            {musicForm}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-bg-hover"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-content-inverse">{icons.plus}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">New project</span>
              <span className="block text-[13px] text-content-secondary">Any stage, even just an idea.</span>
            </span>
            {icons.chevron}
          </button>
        )}
      </div>
      {/* The artist import saves into your own team, so it shows there only. */}
      {isOwnTeam ? (
        <div className="mt-2.5">
          <ActionCard
            tile={icons.disc}
            title="Bring in released music"
            line={imported ? <span className="text-brand">{imported}</span> : "Type an artist's name. We pull in their releases."}
            onClick={() => {
              captureAnalyticsEvent({ name: 'onboarding_import_opened', properties: {} });
              setSheet('import');
            }}
          />
        </div>
      ) : null}
      {team && (team.role === 'owner' || team.role === 'admin') ? (
        <div className="mt-2.5">
          <ActionCard
            tile={icons.people}
            title="Invite your team"
            line={invited ? <span className="text-brand">Invite sent to {invited}</span> : "They see what's theirs to do."}
            onClick={() => {
              captureAnalyticsEvent({ name: 'onboarding_invite_opened', properties: {} });
              setSheet('invite');
            }}
          />
        </div>
      ) : null}
      <p className="mt-5 text-center text-sm">
        <button type="button" onClick={onSkip} className={`${textLinkClass} text-content-secondary`}>
          {joined ? 'Go to Home' : 'Skip for now'}
        </button>
      </p>
      <AccountChip place="bottom" name={account.name} email={account.email} onLogout={account.onLogout} logoutLabel="Log out" />
    </>
  );

  return (
    <>
      <Split left={left} right={right} />
      <Sheet open={sheet === 'import'} onClose={() => setSheet(null)} labelledBy="import-sheet-title">
        <h2 id="import-sheet-title" className="pr-9 font-display text-2xl font-normal">
          Bring in released music
        </h2>
        <p className="mt-2 text-[15px] text-content-secondary">Type an artist&apos;s name. We pull in their releases.</p>
        <ImportSheetBody
          getToken={getToken}
          onClose={() => setSheet(null)}
          onImported={(summary) => {
            setImported(summary);
            onTeamChanged();
          }}
        />
      </Sheet>
      <Sheet open={sheet === 'invite'} onClose={() => setSheet(null)} labelledBy="invite-sheet-title">
        <InviteSheetBody
          getToken={getToken}
          onSent={(email) => {
            setInvited(email);
            setSheet(null);
          }}
        />
      </Sheet>
    </>
  );
}

// ── Bring in released music ──────────────────────────────────────────────────

function ImportSheetBody({
  getToken,
  onClose,
  onImported,
}: {
  getToken: () => Promise<string>;
  onClose: () => void;
  onImported: (summary: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The import step keeps its picks in localStorage (it ran before the
  // account in the old flow); here the account exists, so they save at once.
  const save = async () => {
    const pending = readPendingImports();
    if (pending.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const results = await Promise.allSettled(
        pending.map((artist) =>
          fetch('/api/artist-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ provider: artist.provider, id: artist.id, name: artist.name }),
          }).then((response) => {
            if (!response.ok) throw new Error('import failed');
          })
        )
      );
      if (results.every((result) => result.status === 'rejected')) {
        setError('Could not bring them in. Try again.');
        setSaving(false);
        return;
      }
      clearPendingImports();
      const names = pending.map((artist) => artist.name);
      onImported(names.length === 1 ? `${names[0]}'s releases added` : `Releases from ${names.length} artists added`);
      onClose();
    } catch {
      setError('Could not bring them in. Try again.');
    }
    setSaving(false);
  };

  return (
    <div className="mt-2">
      <OnboardingArtistImportStep canPlanNext={false} onBack={onClose} onDone={() => void save()} onPlanNext={() => void save()} />
      {saving ? <p className="mt-3 text-center text-sm text-content-secondary">Adding them to your team…</p> : null}
      {error ? (
        <p role="alert" className={errorTextClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── Invite your team ─────────────────────────────────────────────────────────

const INVITE_ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'team-member', label: 'Team member' },
  { value: 'artist', label: 'Artist' },
  { value: 'viewer', label: 'Viewer' },
] as const;

function InviteSheetBody({ getToken, onSent }: { getToken: () => Promise<string>; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]['value']>('team-member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const valid = /\S+@\S+\.\S+/.test(email.trim());

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const token = await getToken();
      const response = await fetch('/api/workspace/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not send the invite.');
      onSent(email.trim().toLowerCase());
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send the invite.');
    }
    setBusy(false);
  };

  const copyLink = async () => {
    setLinkNote('');
    try {
      const token = await getToken();
      const response = await fetch('/api/workspace/invite-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as { inviteUrl?: string; error?: string };
      if (!response.ok || !payload.inviteUrl) throw new Error(payload.error || 'Could not make an invite link.');
      await navigator.clipboard.writeText(payload.inviteUrl);
      setLinkNote('Invite link copied.');
    } catch (linkError) {
      setLinkNote(linkError instanceof Error ? linkError.message : 'Could not make an invite link.');
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <h2 id="invite-sheet-title" className="pr-9 font-display text-2xl font-normal">
        Invite your team
      </h2>
      <p className="mt-2 text-[15px] text-content-secondary">They see what&apos;s theirs to do.</p>
      <label className="mt-4 block">
        <span className={labelClass}>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@email.com"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={inputClass}
        />
      </label>
      <div role="radiogroup" aria-label="Role" className="mt-4">
        <span className={labelClass}>Role</span>
        <div className="flex flex-wrap gap-2">
          {INVITE_ROLES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={role === option.value}
              onClick={() => setRole(option.value)}
              className={chipClass(role === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <p className={hintClass}>They see everything in your team. You can limit them to chosen rollouts later, in Team.</p>
      <button type="submit" disabled={!valid || busy} className={`${primaryButtonClass} mt-[18px]`}>
        {busy ? 'Sending…' : 'Send invite'}
      </button>
      {error ? (
        <p role="alert" className={errorTextClass}>
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-center text-sm">
        <button type="button" onClick={() => void copyLink()} className={textLinkClass}>
          Or copy an invite link
        </button>
      </p>
      {linkNote ? (
        <p role="status" className="mt-1.5 text-center text-[13px] text-content-secondary">
          {linkNote}
        </p>
      ) : null}
    </form>
  );
}
