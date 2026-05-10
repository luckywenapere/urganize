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

export const WORKSPACE_MEMBER_ROLE_OPTIONS = ['owner', 'admin', 'member', 'guest'] as const;
export const WORKSPACE_MEMBER_STATUS_OPTIONS = ['active', 'invited', 'removed'] as const;

export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLE_OPTIONS)[number];
export type WorkspaceMemberStatus = (typeof WORKSPACE_MEMBER_STATUS_OPTIONS)[number];

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
