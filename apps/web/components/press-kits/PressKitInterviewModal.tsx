'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@urganize/ui';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import {
  applyAnswerToContent,
  buildInterviewQuestions,
  getStepKicker,
} from '@/lib/press-kit-interview';
import type { PressKitSection, PressKitSectionContent } from '@/types/press-kits';
import { InterviewStepBody } from './interview-steps';

/**
 * The gap interview: one question per screen, eight at most, every one
 * skippable and captioned with what press use it for.
 *
 * Mechanics follow components/planner/PlannerIntakeModal.tsx: a step index, a
 * canAdvance guard, a computed kicker so the count cannot desync from the
 * questions actually being asked, and presentational bodies that know nothing
 * about navigation. It portals to document.body, because AppShell's lazy-fade
 * transform makes it a containing block for fixed descendants (the
 * DeleteReleaseDialog trap), and unlike the bottom sheets it OWNS Escape.
 *
 * ONE DELIBERATE DEVIATION FROM THE PLANNER, and it is the important one. That
 * modal holds every answer in sessionStorage and writes nothing until submit,
 * for the reason its own draft module gives: until the manager finishes, the
 * answers are worth nothing server-side. That is not true here. The kit and its
 * twelve section rows already exist, and a bio is worth something the moment it
 * is written, so every answer is saved as it is given. Leaving halfway then
 * loses nothing on ANY device, not just in the tab it was typed in.
 */

type Props = {
  sections: PressKitSection[];
  /** Saves one section. Rejects on failure. */
  onSave: (section: PressKitSection['section'], content: PressKitSectionContent) => Promise<void>;
  onClose: () => void;
};

export function PressKitInterviewModal({ sections, onSave, onClose }: Props) {
  // Computed ONCE on open. Recomputing as answers land would shorten the list
  // under the person walking it, which is the one thing a progress count must
  // never do.
  const [questions] = useState(() => buildInterviewQuestions(sections));
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, PressKitSectionContent>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Focus the question itself on every step, so a screen reader announces the
  // new question rather than leaving focus on a button that just moved on.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const question = questions[step];

  /** What this question's section will hold once the answer lands: the kit's
   *  current content with the answer merged over it, never replacing it. */
  const answerFor = useCallback(
    (sectionKey: PressKitSection['section']) => {
      const current = sections.find((entry) => entry.section === sectionKey)?.content || {};
      return applyAnswerToContent(current, answers[sectionKey] || {});
    },
    [sections, answers]
  );

  const patch = useCallback(
    (changes: PressKitSectionContent) => {
      if (!question) return;
      setAnswers((current) => ({
        ...current,
        [question.section]: { ...(current[question.section] || {}), ...changes },
      }));
    },
    [question]
  );

  /**
   * Save this question's section, then move on.
   *
   * Skip does the same thing minus the save, so skipping is genuinely free and
   * never leaves a half-written answer behind.
   */
  const advance = useCallback(
    async (save: boolean) => {
      if (!question || isSaving) return;
      setError('');

      if (save && answers[question.section]) {
        setIsSaving(true);
        try {
          await onSave(question.section, answerFor(question.section));
        } catch {
          setError('Could not save that answer. Try again.');
          setIsSaving(false);
          return;
        }
        setIsSaving(false);
      }

      if (step < questions.length - 1) {
        setStep(step + 1);
        return;
      }
      onClose();
    },
    [question, isSaving, answers, onSave, answerFor, step, questions.length, onClose]
  );

  if (!mounted || !question) return null;

  const isLast = step === questions.length - 1;

  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center px-4 py-4 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="press-kit-interview-heading"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      <div className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
              {getStepKicker(step, questions.length)}
            </p>
            <h2
              id="press-kit-interview-heading"
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 font-display text-xl font-semibold text-content-primary outline-none"
            >
              {question.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="motion-focus -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* A one-pixel progress strip, the planner's shape. */}
        <div className="mt-4 flex gap-1 px-5" aria-hidden>
          {questions.map((entry, index) => (
            <span
              key={entry.id}
              className={`h-px flex-1 rounded-full ${
                index <= step ? 'bg-brand' : 'bg-stroke-default'
              }`}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <p className="mb-4 text-sm text-content-secondary">{question.caption}</p>
          <InterviewStepBody
            question={question}
            answer={answerFor(question.section)}
            patch={patch}
          />
          {error ? <p className="mt-3 text-sm text-status-error">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-stroke-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => void advance(false)}
            disabled={isSaving}
            className="motion-focus rounded-lg px-2 py-2 text-sm text-content-secondary hover:text-content-primary disabled:opacity-60"
          >
            Skip for now
          </button>
          <Button onClick={() => void advance(true)} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isLast ? 'Done' : 'Save and continue'}
          </Button>
        </div>

        <p className="px-5 pb-4 text-xs text-content-tertiary">
          Every answer saves as you give it. You can stop here and come back.
        </p>
      </div>
    </div>,
    document.body
  );
}
