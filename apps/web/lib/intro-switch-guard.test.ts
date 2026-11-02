import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Emerging's starting price is one payment (2026-11-02). Its Plan never renews,
// so the switch to the full-price Plan must run on the first charge, and a
// late subscription.create for the starting-price Plan must not undo it
// (Codex review on #1049). Read from the source: there are no route tests.
const route = readFileSync(join(__dirname, '..', 'app', 'api', 'webhooks', 'paystack', 'route.ts'), 'utf8');

describe('the one-payment starting price', () => {
  it('switches to the full-price Plan on the initial charge', () => {
    const initial = route.slice(route.indexOf("source: 'initial'"), route.indexOf("matched: 'initial_recurring'"));
    expect(initial).toContain('switchToFullPrice(admin, {');
    expect(initial).toContain('(await loadIntroMonthsLeft(admin, userId)) === 0');
  });

  it('keeps a starting-price subscription.create from overwriting the switched code', () => {
    const create = route.slice(route.indexOf('async function handleSubscriptionCreate'), route.indexOf('async function handleSubscriptionDisable'));
    expect(create).toContain('isIntroPlanCode(planRef(payload.data)?.plan_code)');
    expect(create).toContain("reason: 'intro_already_switched'");
    // One conditional write, not a read and then an update.
    expect(create).toContain('.or(`paystack_subscription_code.is.null,paystack_subscription_code.eq.${subscriptionCode}`)');
  });

  it('switches once: a redelivered first charge cannot start a second subscription', () => {
    const initial = route.slice(route.indexOf("source: 'initial'"), route.indexOf("matched: 'initial_recurring'"));
    expect(initial).toContain(".is('paystack_response->>intro_switch', null)");
    expect(initial.indexOf("intro_switch: 'started'")).toBeLessThan(initial.indexOf('switchToFullPrice(admin, {'));
    expect(initial).toContain('await stampFullPrice(admin, userId, planString, prior);');
  });
});
