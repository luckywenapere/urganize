'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { panelClass } from './panelClass';
import { feedbackErrorClass } from './feedback';
import {
  TEAM_BRIEF_COUNTER_WARN_RATIO,
  TEAM_BRIEF_SECTIONS,
  TEAM_BRIEF_SECTION_MAX_CHARS,
  TEAM_BRIEF_SECTION_META,
  type TeamBrief,
  type TeamBriefSection as SectionKey,
} from '@/lib/team-brief';

/**
 * The team brief editor.
 *
 * NOT a fifth settings tab, deliberately: the tab row fits a 375px phone with
 * ~42px spare and a fifth needs ~66px, which would put it back to scrolling.
 * It lives inside the Workspace tab instead.
 *
 * Unlike its neighbours in this tab it owns its own fetch rather than reading
 * `useWorkspaceSettings`. That hook is called at page level for every account
 * on every settings visit; this feature is flag-gated and its payload is
 * bigger, so making everyone pay for it on the Account tab would be the wrong
 * trade. Precedent: ReleasesSection and the push-status probe already fetch on
 * their own tab's first open.
 *
 * Saving is explicit and per section, not autosave. Any teammate may edit the
 * same document, and an 800ms autosave (the notes editor's model) would let
 * one person's in-flight copy of a section land on top of what someone else
 * just wrote in it. A Save button per section keeps each write intentional.
 */

const MAX = TEAM_BRIEF_SECTION_MAX_CHARS;

async function token(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function TeamBriefSection() {
  const [brief, setBrief] = useState<TeamBrief | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<SectionKey, string>>>({});
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/workspace/brief', {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          setLoadError('Could not load the brief.');
          return;
        }
        setBrief((await res.json()) as TeamBrief);
      } catch {
        if (!cancelled) setLoadError('Could not load the brief.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (section: SectionKey, content: string) => {
      setSavingSection(section);
      setError('');
      try {
        const res = await fetch('/api/workspace/brief', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await token()}`,
          },
          body: JSON.stringify({ section, content }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          setError((payload as { error?: string } | null)?.error || 'Could not save. Try again.');
          return;
        }
        setBrief(payload as TeamBrief);
        // Drop the draft so the field falls back to the saved value — keeping
        // it would leave the section looking permanently unsaved.
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[section];
          return next;
        });
      } catch {
        setError('Could not save. Check your connection and try again.');
      } finally {
        setSavingSection(null);
      }
    },
    []
  );

  if (isLoading) {
    return (
      <section className={panelClass}>
        <Heading />
        <div className="mt-4 space-y-4">
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </div>
      </section>
    );
  }

  if (loadError || !brief) {
    return (
      <section className={panelClass}>
        <Heading />
        <p className={`mt-4 ${feedbackErrorClass}`}>{loadError || 'Could not load the brief.'}</p>
      </section>
    );
  }

  const canEdit = brief.canEdit;

  return (
    <section className={panelClass}>
      <Heading />
      <p className="mt-2 max-w-prose text-sm text-content-secondary">
        {canEdit
          ? 'Tell UrgAns about your team once, and it stops asking. None of this shows up in your Catalog — it only gives UrgAns a head start. Anyone here can fill this in, and everyone gets the benefit.'
          : 'Your team lead keeps this up to date. UrgAns reads it on every question you ask.'}
      </p>

      {error ? <p className={`mt-4 ${feedbackErrorClass}`}>{error}</p> : null}

      <div className="mt-6 space-y-8">
        {TEAM_BRIEF_SECTIONS.map((section) => {
          const entry = brief.entries.find((e) => e.section === section);
          const saved = entry?.content ?? '';
          const value = drafts[section] ?? saved;
          const meta = TEAM_BRIEF_SECTION_META[section];
          const dirty = value !== saved;
          const over = value.length > MAX;
          const warn = value.length >= MAX * TEAM_BRIEF_COUNTER_WARN_RATIO;

          return (
            <div key={section}>
              <div className="flex items-baseline justify-between gap-3">
                <label
                  htmlFor={`brief-${section}`}
                  className="text-sm font-medium text-content-primary"
                >
                  {meta.label}
                </label>
                <span
                  className={`font-mono text-[11px] ${
                    over ? 'text-status-error' : warn ? 'text-status-warning' : 'text-content-tertiary'
                  }`}
                >
                  {value.length}/{MAX}
                </span>
              </div>

              <textarea
                id={`brief-${section}`}
                value={value}
                readOnly={!canEdit}
                rows={4}
                maxLength={MAX}
                placeholder={meta.placeholder}
                onChange={(event) =>
                  setDrafts((prev) => ({ ...prev, [section]: event.target.value }))
                }
                className="motion-focus mt-2 w-full resize-y rounded-lg border border-stroke-default bg-bg-surface px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary read-only:opacity-70"
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-content-tertiary">
                  {entry?.updatedByName && entry.updatedAt
                    ? `Last edited by ${entry.updatedByName}`
                    : 'Not written yet'}
                </p>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={!dirty || over || savingSection === section}
                    onClick={() => save(section, value)}
                    className="motion-focus rounded-lg border border-stroke-default px-3 py-1.5 text-sm text-content-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {savingSection === section ? 'Saving...' : 'Save'}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Heading() {
  // "Team brief", never "workspace" — the spec's copy rule, and the app calls
  // the release surface Catalog anyway.
  return (
    <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
      Team brief
    </h2>
  );
}
