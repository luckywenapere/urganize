'use client';

import { Plus, Trash2 } from '@/components/icons';
import type { InterviewQuestion } from '@/lib/press-kit-interview';
import type { PressKitSectionContent } from '@/types/press-kits';

/**
 * The question bodies.
 *
 * Presentational, following components/planner/intake-steps.tsx: each one reads
 * the answer and calls `patch`, and knows nothing about navigation, saving or
 * which question comes next.
 */

const inputClass =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-content-primary ' +
  'placeholder:text-content-tertiary focus:border-brand focus:outline-none';

const labelClass =
  'block text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

type Props = {
  question: InterviewQuestion;
  /** The answer so far for this question's section, merged over what the kit
   *  already holds, so a body can read a sibling field it did not ask for. */
  answer: PressKitSectionContent;
  patch: (changes: PressKitSectionContent) => void;
};

export function InterviewStepBody({ question, answer, patch }: Props) {
  if (question.kind === 'text') {
    return (
      <input
        type="text"
        autoFocus
        value={str(answer[question.id === 'hook' ? 'hook' : 'descriptor'])}
        placeholder={question.placeholder}
        onChange={(event) =>
          patch({ [question.id === 'hook' ? 'hook' : 'descriptor']: event.target.value })
        }
        className={`${inputClass} text-lg`}
      />
    );
  }

  if (question.kind === 'place') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className={labelClass}>City</span>
          <input
            type="text"
            autoFocus
            value={str(answer.homeCity)}
            placeholder="Lagos"
            onChange={(event) => patch({ homeCity: event.target.value })}
            className={`${inputClass} text-lg`}
          />
        </div>
        <div className="space-y-1.5">
          <span className={labelClass}>Country</span>
          <input
            type="text"
            value={str(answer.homeCountry)}
            placeholder="Nigeria"
            onChange={(event) => patch({ homeCountry: event.target.value })}
            className={`${inputClass} text-lg`}
          />
        </div>
      </div>
    );
  }

  if (question.kind === 'bio') {
    const field = question.id === 'bio-short' ? 'short' : question.id === 'bio-medium' ? 'medium' : 'long';
    const value = str(answer[field]);
    const count = value.trim() ? value.trim().split(/\s+/).length : 0;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-end">
          <span className="font-mono text-[11px] text-content-tertiary">
            {count} / {question.words}
          </span>
        </div>
        <textarea
          autoFocus
          rows={question.words === 300 ? 9 : question.words === 150 ? 6 : 4}
          value={value}
          placeholder="Write it in the third person, the way press will run it."
          onChange={(event) => patch({ [field]: event.target.value })}
          className={`${inputClass} text-lg`}
        />
      </div>
    );
  }

  if (question.kind === 'contact-roles') {
    const contacts = rows(answer.contacts);
    return (
      <div className="space-y-3">
        {contacts.map((contact, index) => (
          <div
            key={index}
            className="rounded-lg border border-stroke-default bg-bg-base p-3"
          >
            <p className="text-sm font-semibold text-content-primary">
              {str(contact.name) || 'This person'}
            </p>
            <p className="mt-0.5 font-mono text-xs text-content-secondary">
              {str(contact.email)}
            </p>
            <input
              type="text"
              value={str(contact.role)}
              placeholder="Manager"
              onChange={(event) =>
                patch({
                  contacts: contacts.map((entry, position) =>
                    position === index ? { ...entry, role: event.target.value } : entry
                  ),
                })
              }
              className={`${inputClass} mt-2 text-lg`}
            />
          </div>
        ))}
      </div>
    );
  }

  const links = rows(answer.links);
  return (
    <div className="space-y-3">
      {links.map((link, index) => (
        <div key={index} className="flex items-start gap-2">
          <input
            type="text"
            value={str(link.label)}
            placeholder="Spotify"
            onChange={(event) =>
              patch({
                links: links.map((entry, position) =>
                  position === index ? { ...entry, label: event.target.value } : entry
                ),
              })
            }
            className={`${inputClass} w-32 shrink-0 text-lg`}
          />
          <input
            type="url"
            value={str(link.url)}
            placeholder="https://"
            onChange={(event) =>
              patch({
                links: links.map((entry, position) =>
                  position === index ? { ...entry, url: event.target.value } : entry
                ),
              })
            }
            className={`${inputClass} min-w-0 flex-1 text-lg`}
          />
          <button
            type="button"
            aria-label="Remove"
            onClick={() =>
              patch({ links: links.filter((_, position) => position !== index) })
            }
            className="motion-focus mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-content-tertiary hover:bg-bg-hover hover:text-status-error"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => patch({ links: [...links, {}] })}
        className="motion-focus inline-flex items-center gap-1.5 rounded-lg border border-dashed border-stroke-default px-3 py-2 text-sm text-content-secondary hover:border-brand hover:text-content-primary"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add a link
      </button>
    </div>
  );
}
