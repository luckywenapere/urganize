import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_DISTRIBUTE_COPY, HOME_DISTRIBUTE_HREF, decideDistributeCard } from './distribute-card';

describe('decideDistributeCard', () => {
  it('sends Pro, Label and Group teams to Distribute, never to an upgrade', () => {
    expect(decideDistributeCard({ state: 'paid', tier: 'pro' })).toBe('distribute');
    expect(decideDistributeCard({ state: 'paid', tier: 'label' })).toBe('distribute');
    expect(decideDistributeCard({ state: 'paid', tier: 'enterprise' })).toBe('distribute');
    expect(decideDistributeCard({ state: 'comped', tier: 'label' })).toBe('distribute');
  });

  it('offers Pro to Solo, Manager and trial teams', () => {
    expect(decideDistributeCard({ state: 'paid', tier: 'solo', isOwnerOrAdmin: true })).toBe('upgrade');
    expect(decideDistributeCard({ state: 'paid', tier: 'manager', isOwnerOrAdmin: true })).toBe('upgrade');
    // A trial resolves to the flagship tier on the server; it has not bought it.
    expect(decideDistributeCard({ state: 'trial', tier: 'label', isOwnerOrAdmin: true })).toBe('upgrade');
    expect(decideDistributeCard({ state: 'grace', tier: 'label', isOwnerOrAdmin: true })).toBe('upgrade');
  });

  it('never sends a teammate who is not an owner or admin to checkout', () => {
    expect(decideDistributeCard({ state: 'paid', tier: 'solo', isOwnerOrAdmin: false })).toBe('ask_admin');
    expect(decideDistributeCard({ state: 'trial', tier: 'label', isOwnerOrAdmin: false })).toBe('ask_admin');
    expect(decideDistributeCard({ state: 'grace', tier: 'label' })).toBe('ask_admin');
  });

  it('still gives every teammate Distribute on a plan that has it', () => {
    expect(decideDistributeCard({ state: 'paid', tier: 'pro', isOwnerOrAdmin: false })).toBe('distribute');
    expect(decideDistributeCard({ state: 'comped', tier: 'label', isOwnerOrAdmin: false })).toBe('distribute');
  });

  it('draws nothing until the plan is known', () => {
    expect(decideDistributeCard(null)).toBe('hidden');
    expect(decideDistributeCard(undefined)).toBe('hidden');
    expect(decideDistributeCard({ state: 'paid' })).toBe('hidden');
  });

  it('draws nothing for a read-only or walled team', () => {
    expect(decideDistributeCard({ state: 'read_only', tier: 'label' })).toBe('hidden');
    expect(decideDistributeCard({ state: 'walled', tier: 'label' })).toBe('hidden');
  });
});

describe('copy', () => {
  it('has no em dashes and no sign-up words', () => {
    for (const text of Object.values(HOME_DISTRIBUTE_COPY)) {
      expect(text).not.toMatch(/—/);
      expect(text.toLowerCase()).not.toMatch(/start free|sign up|get started/);
    }
  });

  it('points at the existing Distribute tab', () => {
    expect(HOME_DISTRIBUTE_HREF).toBe('/dashboard/distribute');
  });
});

describe('wiring', () => {
  const read = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

  it('shows the card in every Home state, fenced', () => {
    const four = read('components/home/v2/HomeFour.tsx');
    expect(four.match(/<HomeDistributeCard \/>/g)?.length).toBe(2);
    expect(four).toMatch(/name="distribute"/);
    expect(read('components/home/ManagerNewView.tsx')).toMatch(/<HomeDistributeCard \/>/);
  });
});
