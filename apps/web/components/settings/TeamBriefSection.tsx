'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { panelClass } from './panelClass';
import { feedbackErrorClass } from './feedback';
import {
  TEAM_BRIEF_COUNTER_WARN_RATIO,
  briefCompletion,
  listInjectedBriefSections,
  TEAM_BRIEF_SECTIONS,
  TEAM_BRIEF_SECTION_MAX_CHARS,
  TEAM_BRIEF_SECTION_META,
  type TeamBrief,
  type TeamBriefSection as SectionKey,
} from '@/lib/team-brief';
import { HelpTip } from '@/components/shared/HelpTip';
import { saveButtonVisible } from '@/lib/settings-dirty';
import { useReportDirty } from './useReportDirty';

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
  // The Phase 5 guided flow: null = the ordinary all-sections editor, a number
  // = walking one section at a time. Not a route and not a modal — the same
  // component, the same save path, so a section filled on a call is saved by
  // exactly the code a section filled later is.
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // The brief is the longest thing anyone types into Settings, and the pop-up
  // closes on Escape or a tap outside — so a section edited and not saved has
  // to make it ask first. A read-only viewer has no draft to lose.
  const hasUnsavedBrief =
    brief !== null &&
    brief.canEdit &&
    TEAM_BRIEF_SECTIONS.some((section) => {
      const draft = drafts[section];
      if (draft === undefined) return false;
      const saved = brief.entries.find((entry) => entry.section === section)?.content ?? '';
      return draft !== saved;
    });
  useReportDirty('team-brief', hasUnsavedBrief);

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
    async (section: SectionKey, content: string): Promise<boolean> => {
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
          return false;
        }
        setBrief(payload as TeamBrief);
        // Drop the draft so the field falls back to the saved value — keeping
        // it would leave the section looking permanently unsaved.
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[section];
          return next;
        });
        return true;
      } catch {
        setError('Could not save. Check your connection and try again.');
        return false;
      } finally {
        setSavingSection(null);
      }
    },
    []
  );

  if (isLoading) {
    return (
      <section id="team-brief" className={`${panelClass} scroll-mt-4`}>
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
      <section id="team-brief" className={`${panelClass} scroll-mt-4`}>
        <Heading />
        <p role="alert" className={`mt-4 ${feedbackErrorClass}`}>{loadError || 'Could not load the brief.'}</p>
      </section>
    );
  }

  const canEdit = brief.canEdit;
  const completion = briefCompletion(brief.entries);
  const inGuide = guideStep !== null;
  const isLastGuideStep = guideStep === TEAM_BRIEF_SECTIONS.length - 1;
  /** Leaving the guide at the end rather than looping: it is a finishable
   *  fifteen-minute pass, not a carousel. */
  const advanceGuide = () => {
    setGuideStep((step) =>
      step === null || step >= TEAM_BRIEF_SECTIONS.length - 1 ? null : step + 1
    );
  };
  const advanceGuideIfGuiding = () => {
    if (guideStep !== null) advanceGuide();
  };
  // Only the sections being walked through, when guiding.
  const visibleSections = inGuide
    ? [TEAM_BRIEF_SECTIONS[Math.min(guideStep, TEAM_BRIEF_SECTIONS.length - 1)]]
    : TEAM_BRIEF_SECTIONS;

  return (
    <section id="team-brief" className={`${panelClass} scroll-mt-4`}>
      <Heading />
      {/* Five sentences until 2026-09-08, and the longest intro in Settings.
          The rest moved into the pullout, which also drops the em dash the old
          sentence carried. The read-only branch was already two short
          sentences and is left alone. */}
      <p className="mt-2 max-w-prose text-sm text-content-secondary">
        {canEdit
          ? 'Tell AI about your team once, and it stops asking.'
          : 'Your team lead keeps this up to date. AI reads it on every question you ask.'}{' '}
        {canEdit ? <HelpTip helpKey="settings.teamBrief" className="align-text-bottom" /> : null}
      </p>

      {/* Progress, always visible. The guided flow's own value is that it is
          finishable, so how much is left has to be legible without entering
          it. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
          {completion.filled} of {completion.total} filled
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stroke-strong">
          <div className="h-full bg-brand" style={{ width: `${completion.percent}%` }} />
        </div>
        {canEdit && !inGuide ? (
          <button
            type="button"
            onClick={() => setGuideStep(firstUnfilledStep(brief.entries))}
            className="motion-focus rounded-lg border border-stroke-default px-3 py-1.5 text-sm text-content-primary transition-colors hover:bg-bg-hover"
          >
            {completion.filled === 0 ? 'Walk me through it' : 'Pick up where we left off'}
          </button>
        ) : null}
      </div>

      {inGuide ? (
        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
            Step {(guideStep ?? 0) + 1} of {TEAM_BRIEF_SECTIONS.length}
          </p>
          <button
            type="button"
            onClick={() => setGuideStep(null)}
            className="motion-focus rounded-md px-2 py-1 text-xs text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
          >
            Show all sections
          </button>
        </div>
      ) : null}

      {error ? <p role="alert" className={`mt-4 ${feedbackErrorClass}`}>{error}</p> : null}

      <div className="mt-6 space-y-8">
        {visibleSections.map((section) => {
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
                className="motion-focus mt-2 w-full resize-y rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary read-only:opacity-70"
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-content-tertiary">
                  {entry?.updatedByName && entry.updatedAt
                    ? `Last edited by ${entry.updatedByName}`
                    : 'Not written yet'}
                </p>
                {canEdit ? (
                  <div className="flex items-center gap-2">
                    {/* In the guide, Skip is a first-class answer: a team that
                        does not have a Vocabulary should reach the end anyway,
                        and forcing content into a section to get past it is how
                        a brief acquires filler the model then believes. */}
                    {inGuide ? (
                      <button
                        type="button"
                        onClick={advanceGuide}
                        className="motion-focus rounded-md px-2 py-1.5 text-xs text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
                      >
                        Skip
                      </button>
                    ) : null}
                    {inGuide || saveButtonVisible({ dirty, saving: savingSection === section }) ? (
                    <button
                      type="button"
                      disabled={(!dirty && !inGuide) || over || savingSection === section}
                      onClick={() => {
                        if (dirty) {
                          // Advance ONLY on a successful save. Advancing
                          // regardless would carry someone past a section whose
                          // text never landed, with only a banner to say so.
                          void save(section, value).then((saved) => {
                            if (saved) advanceGuideIfGuiding();
                          });
                          return;
                        }
                        advanceGuide();
                      }}
                      className="motion-focus rounded-lg border border-stroke-default px-3 py-1.5 text-sm text-content-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingSection === section
                        ? 'Saving...'
                        : inGuide
                          ? isLastGuideStep
                            ? 'Save and finish'
                            : 'Save and next'
                          : 'Save'}
                    </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Where "pick up where we left off" starts: the first section with nothing in
 *  it, or the beginning when the brief is complete (re-walking a finished brief
 *  is a legitimate thing to want on a later call). */
function firstUnfilledStep(entries: TeamBrief['entries']): number {
  const filled = new Set(listInjectedBriefSections(entries));
  const index = TEAM_BRIEF_SECTIONS.findIndex((section) => !filled.has(section));
  return index === -1 ? 0 : index;
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
