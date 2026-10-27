import { HOME_PATH } from './home-path';

/**
 * Where "Ask UrgAns" in the search bar puts the question (2026-10-07). On a
 * phone, Home carries UrgAns itself (the pinned box), so on Home the question
 * goes into that box. On a computer Home has no chat (2026-10-27, founder
 * call), so Home sends the question to the UrgAns page; any other desktop page
 * opens the drawer, and a phone opens the full chat. Pure so it can be tested;
 * components/shell/CommandBar.tsx acts on the answer.
 */
export type AskUrgansTarget = 'home-composer' | 'drawer' | 'chat-page';

export function askUrgansTarget(pathname: string, isDesktop: boolean): AskUrgansTarget {
  if (pathname === '/dashboard/urgans') return 'chat-page';
  if (pathname === HOME_PATH) return isDesktop ? 'chat-page' : 'home-composer';
  return isDesktop ? 'drawer' : 'chat-page';
}
