import { describe, expect, it } from 'vitest';
import { showWallCreditsOffer, type WallOfferInput } from './wall-offer';

// When the plan wall shows "Not ready for a plan? Try the assistant for ₦1,500"
// (#1243). Only for someone who can actually buy a pack right then: the owner
// or an admin of a team with no plan, with buying switched on, outside the iOS
// app, and with no credits already waiting (they get "Open AI" instead).
function input(over: Partial<WallOfferInput> = {}): WallOfferInput {
  return {
    purchasable: true,
    isIOSApp: false,
    isOwnerOrAdmin: true,
    isUpgradeIntent: false,
    teamState: 'walled',
    balance: 0,
    ...over,
  };
}

describe('showWallCreditsOffer', () => {
  it('shows for an owner of a team with no plan and no credits', () => {
    expect(showWallCreditsOffer(input())).toBe(true);
  });

  it('shows for a team whose paid plan ended (read only)', () => {
    expect(showWallCreditsOffer(input({ teamState: 'read_only' }))).toBe(true);
  });

  it('hides when buying credits is switched off', () => {
    expect(showWallCreditsOffer(input({ purchasable: false }))).toBe(false);
  });

  it('hides inside the iOS app, which cannot take payment', () => {
    expect(showWallCreditsOffer(input({ isIOSApp: true }))).toBe(false);
  });

  it('hides for a team member who is not the owner or an admin (the checkout refuses them)', () => {
    expect(showWallCreditsOffer(input({ isOwnerOrAdmin: false }))).toBe(false);
  });

  it('hides when a paying team opens the wall to move up a plan', () => {
    expect(showWallCreditsOffer(input({ isUpgradeIntent: true }))).toBe(false);
    expect(showWallCreditsOffer(input({ teamState: 'paid' }))).toBe(false);
  });

  it('hides for every state that already has access', () => {
    for (const teamState of ['paid', 'comped', 'trial', 'grace'] as const) {
      expect(showWallCreditsOffer(input({ teamState }))).toBe(false);
    }
  });

  it('hides when the team already has credits to spend', () => {
    expect(showWallCreditsOffer(input({ balance: 12 }))).toBe(false);
  });

  it('shows while the balance is still unknown, so the offer is not held back by a slow read', () => {
    expect(showWallCreditsOffer(input({ balance: null }))).toBe(true);
  });

  it('hides when the team state is unknown', () => {
    expect(showWallCreditsOffer(input({ teamState: null }))).toBe(false);
  });
});
