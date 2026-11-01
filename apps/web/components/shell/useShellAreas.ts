'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { buildShellAreas, readShellFlags, type ShellArea } from '@/lib/shell-nav';
import { applyRoleView, effectiveRoleView, readRoleViewsFlag, type RoleView, type RoleViewViewer } from '@/lib/role-views';

/** The signed-in account's view (URG-260): 'other' (the full app) when the
 *  flag is off or nobody is signed in. The view comes from the account (its
 *  "Who are you?" answer, then its role). Only admins can override it (founder,
 *  2026-10-14), so a saved role_view on anyone else's profile is ignored. */
export function useRoleView(): RoleView {
  return effectiveRoleView(useRoleViewViewer(), readRoleViewsFlag());
}

/** The answers the view is read from, with the Settings override kept only
 *  for admins. Home's artist check (lib/artist-home.ts) reads this too. */
export function useRoleViewViewer(): RoleViewViewer {
  const role = useAuthStore((state) => state.user?.role ?? null);
  const persona = useAuthStore((state) => state.user?.onboarding_persona ?? null);
  const savedOverride = useAuthStore((state) => state.user?.role_view ?? null);
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);
  const override = isAdmin ? savedOverride : null;
  return useMemo(
    () => ({ role, onboarding_persona: persona, role_view: override }),
    [role, persona, override]
  );
}

/**
 * The menu's areas for the signed-in account: lib/shell-nav's areas run through
 * the role-view filter (lib/role-views.ts). Every menu (top bar, tab row, side
 * menu, phone bar) reads this one hook so they cannot disagree. With the flag
 * off it is exactly buildShellAreas(readShellFlags()).
 */
export function useShellAreas(): ShellArea[] {
  const view = useRoleView();
  return useMemo(() => applyRoleView(buildShellAreas(readShellFlags()), view), [view]);
}
