// When the "invite your team" strip on the UrgAns home is worth showing.
//
// It used to look only at whether it had been dismissed in this browser, so a
// manager who had already invited their whole team saw "Get more out of
// Urganize by inviting your team" again on every new phone, laptop or cleared
// browser. A nudge that tells somebody to do what they have already done reads
// as the app not knowing them, so it now only shows to a manager whose team is
// still just themselves.

export type InviteBannerInput = {
  /** Only managers can invite, and the strip links to the section that lets them. */
  isManager: boolean;
  /** Dismissed in this browser. */
  dismissed: boolean;
  /** True once the team size has been read (from the cache or the server). Until
   *  then `memberCount` is a placeholder, so the strip waits rather than flashing
   *  on for a team that turns out to be full. */
  teamKnown: boolean;
  /** Active people on the team, the manager included. */
  memberCount: number;
};

export function shouldShowInviteBanner({
  isManager,
  dismissed,
  teamKnown,
  memberCount,
}: InviteBannerInput): boolean {
  if (!isManager || dismissed || !teamKnown) return false;
  return memberCount <= 1;
}
