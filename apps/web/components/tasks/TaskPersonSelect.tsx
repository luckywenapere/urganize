'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Users } from '@/components/icons';
import { isVouchesEnabled } from '@/lib/vouches';
import { useRelationshipsStore } from '@/stores/useRelationshipsStore';

// "Who's doing it" on an activity (Vouch, slice 1): one person from the team's
// My People, or nobody. Separate from the assignee above it, which is the team
// member who owns the activity; this is who actually did the work, and it is
// what "Worked together" and the vouch prompt read.
//
// Hidden when the feature is off, when the team has nobody in My People yet,
// or when the people list cannot be read (a teammate limited to one artist).

const VOUCHES_ENABLED = isVouchesEnabled();

export function TaskPersonSelect({
  taskId,
  rowClassName,
  iconClassName,
  fieldClassName,
  controlClassName,
}: {
  taskId: string;
  rowClassName: string;
  iconClassName: string;
  fieldClassName: string;
  controlClassName: string;
}) {
  const relationships = useRelationshipsStore((state) => state.relationships);
  const listError = useRelationshipsStore((state) => state.error);
  const assigned = useRelationshipsStore((state) => state.assignments[taskId] ?? '');
  const load = useRelationshipsStore((state) => state.load);
  const loadAssignments = useRelationshipsStore((state) => state.loadAssignments);
  const assignPerson = useRelationshipsStore((state) => state.assignPerson);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!VOUCHES_ENABLED) return;
    void load();
    void loadAssignments();
  }, [load, loadAssignments]);

  const people = useMemo(
    () => [...relationships].sort((a, b) => a.label.localeCompare(b.label)),
    [relationships]
  );

  if (!VOUCHES_ENABLED || listError || (people.length === 0 && !assigned)) return null;

  return (
    <>
      <label className={rowClassName}>
        <Users className={iconClassName} aria-hidden="true" />
        <span className="sr-only">Who&apos;s doing it</span>
        <span className={`relative ${fieldClassName}`}>
          <select
            value={assigned}
            onChange={async (event) => {
              setError(null);
              const failure = await assignPerson(taskId, event.target.value || null);
              if (failure) setError(failure.error);
            }}
            className={`${controlClassName} pr-8 ${assigned ? '' : 'text-content-tertiary'}`}
          >
            <option value="" className="bg-bg-elevated text-content-primary">
              Who&apos;s doing it
            </option>
            {people.map((person) => (
              <option key={person.personId} value={person.personId} className="bg-bg-elevated text-content-primary">
                {person.role ? `${person.label} · ${person.role}` : person.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary opacity-0 transition-opacity [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100"
            aria-hidden="true"
          />
        </span>
      </label>
      {error ? (
        <p role="alert" className="ml-7 text-xs text-status-error">
          {error}
        </p>
      ) : null}
    </>
  );
}
