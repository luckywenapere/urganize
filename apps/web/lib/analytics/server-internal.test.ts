import { describe, expect, it, vi } from 'vitest';
import type { PostHog } from 'posthog-node';
import { captureServerAnalyticsEvent, shutdownServerAnalytics } from './server';

describe('server capture', () => {
  it('lands before shutdown flushes', async () => {
    const order: string[] = [];
    const client = {
      capture: vi.fn(() => order.push('capture')),
      shutdown: vi.fn(async () => {
        order.push('shutdown');
      }),
    } as unknown as PostHog;
    captureServerAnalyticsEvent(client, 'user-1', { name: 'release_created', properties: {} } as never);
    await shutdownServerAnalytics(client);
    expect(order).toEqual(['capture', 'shutdown']);
  });
});
