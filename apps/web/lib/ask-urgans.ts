/**
 * Where "Ask UrgAns" in the search bar puts the question (2026-10-07). A
 * desktop page opens the drawer, and a phone opens the full chat. Home and its
 * own box left on 2026-10-29 (#876), so 'home-composer' is no longer returned. Pure so it can be tested;
 * components/shell/CommandBar.tsx acts on the answer.
 */
export type AskUrgansTarget = 'home-composer' | 'drawer' | 'chat-page';

export function askUrgansTarget(pathname: string, isDesktop: boolean): AskUrgansTarget {
  if (pathname === '/dashboard/urgans') return 'chat-page';
  return isDesktop ? 'drawer' : 'chat-page';
}
