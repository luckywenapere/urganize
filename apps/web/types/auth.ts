export type UserRole = 'artist' | 'manager' | 'artist-team' | 'artist-manager' | 'team-member' | 'viewer';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  artistName?: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceMemberRole = 'owner' | 'admin' | 'member' | 'guest';
export type WorkspaceMemberStatus = 'active' | 'invited' | 'removed';

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string | null;
  email: string;
  name: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
  invitedAt: string;
  joinedAt: string | null;
  isCurrentUser: boolean;
  initials: string;
  avatarUrl: string | null;
}
