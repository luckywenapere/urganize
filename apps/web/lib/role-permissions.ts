// 'curator' is the playlist-pitching account type. It is not a team role at
// all: a curator owns no releases and belongs to no team, so it gets every
// permission below turned off rather than being folded into 'viewer' (a viewer
// is a team member with read access; a curator is outside the team entirely).
export type AppRole = 'manager' | 'artist' | 'team-member' | 'viewer' | 'curator';

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
  if (role === 'curator') return 'curator';
  if (role === 'viewer') return 'viewer';
  return 'viewer';
};

/** True for the playlist-pitching account type. Curators see no team data. */
export const isCuratorRole = (roleValue: string | null | undefined): boolean =>
  normalizeAppRole(roleValue) === 'curator';

export const getRolePermissions = (roleValue: string | null | undefined): RolePermissions => {
  const role = normalizeAppRole(roleValue);
  const isManager = role === 'manager';
  const canEditWorkspace = role !== 'viewer' && role !== 'curator';

  return {
    role,
    canManagePlans: isManager,
    canCreatePlans: isManager,
    canManageArtists: isManager,
    canEditWorkspace,
  };
};
