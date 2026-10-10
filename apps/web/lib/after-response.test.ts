import { beforeEach, describe, expect, it, vi } from 'vitest';

const afterMock = vi.fn();
vi.mock('next/server', () => ({
  after: (...args: unknown[]) => afterMock(...args),
}));

import { afterResponse } from '@/lib/after-response';

/**
 * Work after the reply goes out (2026-10-09, v1.92.12).
 *
 * A bare `void promise()` at the end of a route is not tied to the request, so
 * on a serverless host it can be cut off. These hold the helper that replaces
 * it: the work is handed to Next's after(), failures are logged and never
 * thrown, and outside a request it still runs.
 */

beforeEach(() => {
  afterMock.mockReset();
  vi.restoreAllMocks();
});

describe('inside a request', () => {
  it('hands the work to after() and does not start it before the reply', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    afterMock.mockImplementation(() => {});
    afterResponse('a thing', task);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(task).not.toHaveBeenCalled();
  });

  it('runs the work when Next runs the callback', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    let callback: (() => Promise<void>) | null = null;
    afterMock.mockImplementation((fn: () => Promise<void>) => {
      callback = fn;
    });
    afterResponse('a thing', task);
    await callback!();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('logs a failure with its label and never rethrows it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callback: (() => Promise<void>) | null = null;
    afterMock.mockImplementation((fn: () => Promise<void>) => {
      callback = fn;
    });
    afterResponse('founder alert', async () => {
      throw new Error('mail service down');
    });
    await expect(callback!()).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain('founder alert');
  });

  it('survives a task that throws before it returns a promise', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let callback: (() => Promise<void>) | null = null;
    afterMock.mockImplementation((fn: () => Promise<void>) => {
      callback = fn;
    });
    afterResponse('sync throw', () => {
      throw new Error('boom');
    });
    await expect(callback!()).resolves.toBeUndefined();
  });
});

describe('outside a request', () => {
  beforeEach(() => {
    afterMock.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });
  });

  it('starts the work straight away instead of dropping it', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    afterResponse('a thing', task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the work, and does not throw', () => {
    let finished = false;
    expect(() =>
      afterResponse('slow thing', () => new Promise((resolve) => setTimeout(() => { finished = true; resolve(undefined); }, 10)))
    ).not.toThrow();
    expect(finished).toBe(false);
  });

  it('logs a failure and leaves no unhandled rejection', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    afterResponse('broken thing', async () => {
      throw new Error('nope');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain('broken thing');
  });
});
