import { getTeamAccessForUser } from '@/lib/team-billing-server';

/**
 * The workspace a release's AI usage belongs to: the OWNER's team, which is also
 * whose credits and entitlements a release draws on. For the AI features that
 * are not metered (the status update), where no charge has resolved it already.
 *
 * Never throws: a usage row without a workspace is still a usable row (it is
 * summed by release), and it must never stop a status update being written.
 */
export async function usageWorkspaceForOwner(ownerUserId: string | null | undefined): Promise<string | null> {
  if (!ownerUserId) return null;
  try {
    const team = await getTeamAccessForUser(ownerUserId, null);
    return team.primaryWorkspaceId ?? null;
  } catch {
    return null;
  }
}
