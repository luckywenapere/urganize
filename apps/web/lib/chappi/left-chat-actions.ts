import type { ChappiClientAction } from './types';

/**
 * What a reply may still do once the chat it was asked from has left the
 * screen: "New chat", sign-out, or (with chat history on) another saved chat
 * opened while the answer was on its way. ChappiConversation delivers the
 * reply's TEXT to its own chat or drops it; these two decide what happens to
 * the client actions that came with it. Pure, so they can be tested, which a
 * component cannot be here.
 */

/**
 * The actions to run for a reply whose chat has left the screen: at most one
 * catalog refresh, and nothing else.
 *
 * The refresh stays because whatever the reply's tools did DID happen, so the
 * catalog should show it. A navigation counts as asking for one, because
 * create_release answers with a navigation to the new rollout rather than a
 * refresh; dropping it outright would leave that rollout out of the catalog
 * until something else reloaded it. The navigation itself, and every opened
 * card or sheet, belong to a conversation the user has left, so running them
 * would take them somewhere they did not ask to go.
 */
export function actionsForLeftChat(actions: readonly ChappiClientAction[]): ChappiClientAction[] {
  return actions.some((action) => action.type === 'refresh' || action.type === 'navigate')
    ? [{ type: 'refresh' }]
    : [];
}

/**
 * The rollouts a left chat's reply wanted to offer the first-rollout share
 * sheet for (share to socials). That offer happens once, so a reply that lands
 * late must not simply drop it: the caller saves each one for the next visit
 * (deferFirstShareOffer), exactly as every create path now does, and the sheet
 * offers itself once on Home then instead of over the chat the user moved to.
 *
 * Only the once-only offer. An explicit `open_share` is the user asking to
 * share, which is a screen question like any other card: a late one is dropped.
 */
export function firstShareOffersIn(actions: readonly ChappiClientAction[]): string[] {
  const ids: string[] = [];
  for (const action of actions) {
    if (action.type === 'navigate' && action.offerFirstShareFor) {
      ids.push(action.offerFirstShareFor);
    }
  }
  return ids;
}
