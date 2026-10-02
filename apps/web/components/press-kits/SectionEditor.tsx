'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy, Plus, Trash2 } from '@/components/icons';
import { PRESS_KIT_SECTION_HINTS } from '@/lib/press-kits';
import type { PressKitSectionContent, PressKitSectionKey } from '@/types/press-kits';

type Props = {
  section: PressKitSectionKey;
  draft: PressKitSectionContent;
  readOnly: boolean;
  setField: (key: string, value: unknown) => void;
  onBlur: () => void;
  /** The photo grid, for the Assets section only. Handed in rather than built
   *  here because photos are their own table, with their own upload flow and
   *  their own loading state, none of which the autosave draft knows about. */
  photos?: ReactNode;
};

const inputClass =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-content-primary ' +
  'placeholder:text-content-tertiary focus:border-brand focus:outline-none disabled:opacity-60';

const labelClass =
  'block text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <p className="text-xs text-content-tertiary">{hint}</p> : null}
    </div>
  );
}

/** Press take the bio that fits their column, so each one is one tap to lift. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
      className="motion-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-content-secondary hover:bg-bg-hover hover:text-content-primary"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-brand" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function BioField({
  label,
  hint,
  words,
  value,
  onChange,
  onBlur,
  readOnly,
}: {
  label: string;
  hint: string;
  words: number;
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  readOnly: boolean;
}) {
  const count = value.trim() ? value.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={labelClass}>{label}</span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[11px] text-content-tertiary">
            {count} / {words}
          </span>
          <CopyButton value={value} />
        </div>
      </div>
      <textarea
        rows={label === 'Long' ? 8 : label === 'Medium' ? 5 : 3}
        value={value}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={inputClass}
        placeholder="Write it in the third person, the way press will run it."
      />
      <p className="text-xs text-content-tertiary">{hint}</p>
    </div>
  );
}

/**
 * A list a person adds rows to: contacts, numbers, coverage, links.
 *
 * One component rather than four, because they differ only in their columns.
 * Every field is a plain input and every change goes through the same autosave
 * as the rest of the section.
 */
function RepeatableList({
  itemKey,
  columns,
  addLabel,
  draft,
  setField,
  onBlur,
  readOnly,
}: {
  itemKey: string;
  columns: { key: string; label: string; placeholder?: string; type?: string }[];
  addLabel: string;
  draft: PressKitSectionContent;
  setField: (key: string, value: unknown) => void;
  onBlur: () => void;
  readOnly: boolean;
}) {
  const items = rows(draft[itemKey]);

  const update = (index: number, key: string, value: string) => {
    const next = items.map((item, position) =>
      position === index ? { ...item, [key]: value } : item
    );
    setField(itemKey, next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-stroke-default bg-bg-base p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {columns.map((column) => (
              <Field key={column.key} label={column.label}>
                <input
                  type={column.type || 'text'}
                  value={str(item[column.key])}
                  disabled={readOnly}
                  placeholder={column.placeholder}
                  onChange={(event) => update(index, column.key, event.target.value)}
                  onBlur={onBlur}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
          {readOnly ? null : (
            <button
              type="button"
              onClick={() =>
                setField(
                  itemKey,
                  items.filter((_, position) => position !== index)
                )
              }
              className="motion-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-content-secondary hover:bg-bg-hover hover:text-status-error"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove
            </button>
          )}
        </div>
      ))}

      {readOnly ? null : (
        <button
          type="button"
          onClick={() => setField(itemKey, [...items, {}])}
          className="motion-focus inline-flex items-center gap-1.5 rounded-lg border border-dashed border-stroke-default px-3 py-2 text-sm text-content-secondary hover:border-brand hover:text-content-primary"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {addLabel}
        </button>
      )}
    </div>
  );
}

/** A section whose content arrives from elsewhere in the product. Says where
 *  it comes from rather than showing an editor that would fight the autofill. */
function FedFromElsewhere({ source }: { source: string }) {
  return (
    <div className="rounded-lg border border-dashed border-stroke-default bg-bg-base p-4">
      <p className="text-sm text-content-secondary">{source}</p>
    </div>
  );
}

export function SectionEditor({ section, draft, readOnly, setField, onBlur, photos }: Props) {
  const text = (key: string, label: string, placeholder?: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        type="text"
        value={str(draft[key])}
        disabled={readOnly}
        placeholder={placeholder}
        onChange={(event) => setField(key, event.target.value)}
        onBlur={onBlur}
        className={inputClass}
      />
    </Field>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-content-secondary">{PRESS_KIT_SECTION_HINTS[section]}</p>

      {section === 'header' ? (
        <div className="space-y-4">
          {text(
            'descriptor',
            'One line',
            'Afrobeats singer and songwriter',
            'The sentence a journalist will reuse in their intro.'
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {text('homeCity', 'Home city', 'Lagos')}
            {text('homeCountry', 'Country', 'Nigeria')}
          </div>
          {text('genreTags', 'Genres', 'Afrobeats, alte', 'Separate them with commas.')}
        </div>
      ) : null}

      {section === 'bios' ? (
        <div className="space-y-5">
          <BioField
            label="Short"
            words={50}
            hint="For a listing or a caption."
            value={str(draft.short)}
            readOnly={readOnly}
            onBlur={onBlur}
            onChange={(next) => setField('short', next)}
          />
          <BioField
            label="Medium"
            words={150}
            hint="The one most editors will use."
            value={str(draft.medium)}
            readOnly={readOnly}
            onBlur={onBlur}
            onChange={(next) => setField('medium', next)}
          />
          <BioField
            label="Long"
            words={300}
            hint="For a feature, or a programme note."
            value={str(draft.long)}
            readOnly={readOnly}
            onBlur={onBlur}
            onChange={(next) => setField('long', next)}
          />
        </div>
      ) : null}

      {section === 'latest_release' ? (
        <div className="space-y-4">
          {text('hook', 'The hook', 'What makes this one worth writing about?')}
          {text('quote', 'A line from the artist', 'In their own words.')}
          {str(draft.story) ? (
            <div className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-3">
              <p className="text-sm font-medium text-content-primary">The story</p>
              <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-content-secondary">
                {str(draft.story)}
              </p>
              <p className="mt-2 text-xs text-content-tertiary">
                This comes from the rollout&apos;s Pitch kit. Change it there, then accept the update here.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {section === 'contact' ? (
        <RepeatableList
          itemKey="contacts"
          addLabel="Add a contact"
          columns={[
            { key: 'name', label: 'Name', placeholder: 'Ada Obi' },
            { key: 'role', label: 'Role', placeholder: 'Manager' },
            { key: 'email', label: 'Email', placeholder: 'ada@example.com', type: 'email' },
          ]}
          draft={draft}
          setField={setField}
          onBlur={onBlur}
          readOnly={readOnly}
        />
      ) : null}

      {section === 'numbers' ? (
        <RepeatableList
          itemKey="stats"
          addLabel="Add a number"
          columns={[
            { key: 'label', label: 'What it is', placeholder: 'Monthly listeners' },
            { key: 'value', label: 'The figure', placeholder: '42,000' },
            { key: 'asOf', label: 'True on', type: 'date' },
          ]}
          draft={draft}
          setField={setField}
          onBlur={onBlur}
          readOnly={readOnly}
        />
      ) : null}

      {section === 'press' ? (
        <RepeatableList
          itemKey="coverage"
          addLabel="Add coverage"
          columns={[
            { key: 'outlet', label: 'Outlet', placeholder: 'The Native' },
            { key: 'title', label: 'Headline' },
            { key: 'url', label: 'Link', placeholder: 'https://', type: 'url' },
            { key: 'publishedOn', label: 'Published', type: 'date' },
          ]}
          draft={draft}
          setField={setField}
          onBlur={onBlur}
          readOnly={readOnly}
        />
      ) : null}

      {section === 'links' ? (
        <RepeatableList
          itemKey="links"
          addLabel="Add a link"
          columns={[
            { key: 'label', label: 'Where', placeholder: 'Spotify' },
            { key: 'url', label: 'Link', placeholder: 'https://', type: 'url' },
          ]}
          draft={draft}
          setField={setField}
          onBlur={onBlur}
          readOnly={readOnly}
        />
      ) : null}

      {section === 'music' ? (
        <FedFromElsewhere source="This fills in from the rollout you are working on, once the kit can read it." />
      ) : null}

      {section === 'credits' ? (
        <FedFromElsewhere source="This fills in from the credits your collaborators already submitted, so nobody types them twice." />
      ) : null}

      {section === 'live' ? (
        <FedFromElsewhere source="This fills in from your shows." />
      ) : null}

      {section === 'assets' ? (
        // Photos live in their own table rather than in this section's
        // content, so the grid is handed in by the page rather than driven by
        // the autosave draft every other section uses.
        photos || (
          <FedFromElsewhere source="Photos land here once the kit has been saved." />
        )
      ) : null}

      {section === 'video' ? (
        // Links, not uploads. A music video does not fit under the per file
        // storage ceiling, and it already lives on a platform: a journalist
        // wants to watch it, not hold the master.
        <RepeatableList
          itemKey="videos"
          columns={[
            { key: 'title', label: 'What it is', placeholder: 'Official video' },
            { key: 'url', label: 'Link', placeholder: 'https://', type: 'url' },
          ]}
          addLabel="Add a video"
          draft={draft}
          setField={setField}
          onBlur={onBlur}
          readOnly={readOnly}
        />
      ) : null}
    </div>
  );
}
