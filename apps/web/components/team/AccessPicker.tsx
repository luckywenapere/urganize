'use client';

import { Check } from '@/components/icons';
import { PICKABLE_ROLES, TEAM_ROLE_LABEL, type TeamPicker, type TeamRole } from '@/lib/team-page';

export type AccessKind = 'all' | 'artist' | 'rollouts';

export type AccessChoice = {
  role: Exclude<TeamRole, 'owner'>;
  kind: AccessKind;
  artistId: string;
  releaseIds: string[];
};

/** True when the choice can be saved: an artist needs their artist, a pick of rollouts needs one. */
export function isAccessChoiceReady(choice: AccessChoice): boolean {
  if (choice.role === 'manager') return true;
  if (choice.kind === 'artist') return Boolean(choice.artistId);
  if (choice.kind === 'rollouts') return choice.releaseIds.length > 0;
  return true;
}

/** The API body for an access choice. Managers always see everything. */
export function accessBody(choice: AccessChoice) {
  if (choice.role === 'manager' || choice.kind === 'all') return { kind: 'all' as const };
  if (choice.kind === 'artist') return { kind: 'artist' as const, artistId: choice.artistId };
  return { kind: 'rollouts' as const, releaseIds: choice.releaseIds };
}

const chip = (on: boolean) =>
  `motion-focus motion-press inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] ${
    on ? 'border-brand bg-brand-subtle font-semibold text-brand' : 'border-stroke-control text-content-secondary hover:text-content-primary'
  }`;

/**
 * Role, then "What can they see?" (issue #853). An artist always sees one
 * artist, a manager always sees everything, so those two hide the choice they
 * do not have.
 */
export function AccessPicker({
  value,
  onChange,
  picker,
}: {
  value: AccessChoice;
  onChange: (next: AccessChoice) => void;
  picker: TeamPicker;
}) {
  const setRole = (role: AccessChoice['role']) => {
    if (role === 'artist') onChange({ ...value, role, kind: 'artist', artistId: value.artistId || picker.artists[0]?.id || '' });
    else if (role === 'manager') onChange({ ...value, role, kind: 'all' });
    else onChange({ ...value, role, kind: value.kind === 'artist' && value.role === 'artist' ? 'all' : value.kind });
  };
  const toggleRollout = (id: string) =>
    onChange({
      ...value,
      releaseIds: value.releaseIds.includes(id) ? value.releaseIds.filter((rid) => rid !== id) : [...value.releaseIds, id],
    });

  const kinds: { kind: AccessKind; label: string }[] =
    value.role === 'artist'
      ? [{ kind: 'artist', label: 'One artist' }]
      : [
          { kind: 'all', label: 'All rollouts' },
          { kind: 'artist', label: 'One artist' },
          { kind: 'rollouts', label: 'Chosen rollouts' },
        ];

  return (
    <div>
      <p className="mb-2 text-[13px] text-content-secondary">Role</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Role">
        {PICKABLE_ROLES.map((role) => (
          <button key={role} type="button" role="radio" aria-checked={value.role === role} onClick={() => setRole(role)} className={chip(value.role === role)}>
            {TEAM_ROLE_LABEL[role]}
          </button>
        ))}
      </div>

      {value.role === 'manager' ? (
        <p className="mt-4 text-[13px] text-content-secondary">Managers see every rollout.</p>
      ) : (
        <>
          <p className="mb-2 mt-4 text-[13px] text-content-secondary">What can they see?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What can they see?">
            {kinds.map((option) => (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={value.kind === option.kind}
                onClick={() =>
                  onChange({
                    ...value,
                    kind: option.kind,
                    artistId: option.kind === 'artist' ? value.artistId || picker.artists[0]?.id || '' : value.artistId,
                  })
                }
                className={chip(value.kind === option.kind)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {value.kind === 'artist' ? (
            picker.artists.length ? (
              <select
                aria-label="Artist"
                value={value.artistId}
                onChange={(event) => onChange({ ...value, artistId: event.target.value })}
                className="motion-focus mt-3 h-11 w-full rounded-xl border border-stroke-control bg-bg-base px-3 text-sm text-content-primary"
              >
                {picker.artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-3 text-[13px] text-content-secondary">Add an artist to your roster first.</p>
            )
          ) : null}

          {value.kind === 'rollouts' ? (
            picker.rollouts.length ? (
              <ul className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-stroke-control bg-bg-base px-3" aria-label="Rollouts they can see">
                {picker.rollouts.map((rollout) => {
                  const on = value.releaseIds.includes(rollout.id);
                  return (
                    <li key={rollout.id} className="border-t border-stroke-default first:border-t-0">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggleRollout(rollout.id)}
                        className="motion-focus flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm"
                      >
                        <span className={`min-w-0 truncate ${on ? 'text-content-primary' : 'text-content-secondary'}`}>
                          {rollout.artistName ? `${rollout.artistName} · ` : ''}&ldquo;{rollout.title}&rdquo;
                        </span>
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                            on ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-control'
                          }`}
                          aria-hidden="true"
                        >
                          {on ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] text-content-secondary">There are no rollouts to pick yet.</p>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
