'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import {
  ROLE_VIEWS,
  ROLE_VIEW_LABELS,
  automaticRoleView,
  describeRoleView,
  isRoleView,
  readRoleViewsFlag,
  resolveRoleView,
  type RoleView,
} from '@/lib/role-views';
import { InfoTip } from '@/components/shared/HelpTip';
import { panelClass } from './panelClass';

// Role-based views (URG-260). The menu leads with what the account's "Who are
// you?" answer needs; this is where a person picks a different view. Saved on
// their own profile (profiles.role_view), so it follows them to every device.
// "Automatic" clears the override. Hidden when the flag is off, so it never
// offers a choice the menu would ignore.

const AUTOMATIC = 'automatic';

export function RoleViewSection() {
  const user = useAuthStore((state) => state.user);
  const updateRoleView = useAuthStore((state) => state.updateRoleView);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  if (!readRoleViewsFlag() || !user || user.role === 'curator') return null;

  const override = isRoleView(user.role_view) ? user.role_view : null;
  const automatic = automaticRoleView(user);
  const current = resolveRoleView(user);

  const handleChange = async (value: string) => {
    const next: RoleView | null = isRoleView(value) ? value : null;
    if (next === override) return;
    setIsWorking(true);
    setError('');
    try {
      await updateRoleView(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your view.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <section id="view" className={`${panelClass} scroll-mt-4`}>
      <h2 className="mb-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        View
        <InfoTip
          label="View"
          text="Pick what the menu leads with. Anything not in the menu is under More, and search still finds it."
        />
      </h2>
      <label htmlFor="role-view-select" className="mb-2 block text-sm font-semibold text-content-primary">
        Show the app for
      </label>
      <select
        id="role-view-select"
        value={override ?? AUTOMATIC}
        disabled={isWorking}
        onChange={(event) => void handleChange(event.target.value)}
        className="h-11 w-full max-w-sm rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none disabled:opacity-60"
      >
        <option value={AUTOMATIC}>Automatic ({ROLE_VIEW_LABELS[automatic]})</option>
        {ROLE_VIEWS.map((view) => (
          <option key={view} value={view}>
            {ROLE_VIEW_LABELS[view]}
          </option>
        ))}
      </select>
      <p className="mt-2 text-sm text-content-secondary">{describeRoleView(current)}</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
