import { HOME_PATH } from './home-path';

/**
 * Where "Ask UrgAns" in the search bar puts the question (2026-10-07). Home
 * carries UrgAns itself now (the pinned box on a phone, the conversation on a
 * desktop), so on Home the question goes into that box. Elsewhere a desktop
 * opens the drawer and a phone opens the full chat. Pure so it can be tested;
 * components/shell/CommandBar.tsx acts on the answer.
 */
export type AskUrgansTarget = 'home-composer' | 'drawer' | 'chat-page';

export function askUrgansTarget(pathname: string, isDesktop: boolean): AskUrgansTarget {
  if (pathname === HOME_PATH) return 'home-composer';
  if (pathname === '/dashboard/urgans') return 'chat-page';
  return isDesktop ? 'drawer' : 'chat-page';
}
