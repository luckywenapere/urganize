export type AppRole = 'manager' | 'artist' | 'team-member' | 'viewer';

export type RolePermissions = {
  role: AppRole;
  canManagePlans: boolean;
  canCreatePlans: boolean;
  canManageArtists: boolean;
  canEditWorkspace: boolean;
};

export const normalizeAppRole = (roleValue: string | null | undefined): AppRole => {
  const role = String(roleValue || '')
    .trim()
    .toLowerCase();
  if (role === 'manager' || role === 'artist-manager') return 'manager';
  if (role === 'team-member' || role === 'artist-team') return 'team-member';
  if (role === 'artist') return 'artist';
  if (role === 'viewer') return 'viewer';
  return 'viewer';
};

export const getRolePermissions = (roleValue: string | null | undefined): RolePermissions => {
  const role = normalizeAppRole(roleValue);
  const isManager = role === 'manager';
  const canEditWorkspace = role !== 'viewer';

  return {
    role,
    canManagePlans: isManager,
    canCreatePlans: isManager,
    canManageArtists: isManager,
    canEditWorkspace,
  };
};
