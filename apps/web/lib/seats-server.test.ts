import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countHireMembers, countTeamSeats } from './seats-server';

type Result =
  | { count?: number | null; error?: { message: string; code?: string } }
  | 'throw';

type Filter = ['eq' | 'neq', string, unknown];

/**
 * A stub of the two query shapes this module builds: the seat count (every
 * non-removed member) and the hire count (the same, narrowed to `is_hire`). The
 * answer depends on which of the two it was asked, so a test can give each its
 * own result and watch what the arithmetic does with the pair.
 */
function stubClient(seats: Result, hires: Result = { count: 0 }) {
  const asked: Filter[][] = [];
  const selects: unknown[][] = [];
  const from = vi.fn(() => {
    const filters: Filter[] = [];
    const builder = {
      select: vi.fn((...args: unknown[]) => {
        selects.push(args);
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push(['eq', column, value]);
        return builder;
      }),
      neq: vi.fn((column: string, value: unknown) => {
        filters.push(['neq', column, value]);
        return builder;
      }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        asked.push(filters);
        const wantsHires = filters.some(([, column]) => column === 'is_hire');
        const result = wantsHires ? hires : seats;
        const settled =
          result === 'throw' ? Promise.reject(new Error('boom')) : Promise.resolve(result);
        return settled.then(resolve, reject);
      },
    };
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, from, asked, selects };
}

describe('countTeamSeats', () => {
  it('counts the rows the team list shows', async () => {
    const { client } = stubClient({ count: 3 });
    expect(await countTeamSeats(client, 'ws-1')).toBe(3);
  });

  it('counts invited and active, excluding only removed', async () => {
    // The filter is the contract: it must match loadWorkspaceMembers, or the
    // count disagrees with the list the manager is looking at.
    const stub = stubClient({ count: 0 });
    await countTeamSeats(stub.client, 'ws-1');
    expect(stub.from).toHaveBeenCalledWith('workspace_members');
    const seatQuery = stub.asked.find((filters) => !filters.some(([, column]) => column === 'is_hire'));
    expect(seatQuery).toContainEqual(['eq', 'workspace_id', 'ws-1']);
    expect(seatQuery).toContainEqual(['neq', 'status', 'removed']);
  });

  it('asks for a head-only exact count, not the rows', async () => {
    const stub = stubClient({ count: 1 });
    await countTeamSeats(stub.client, 'ws-1');
    expect(stub.selects.every((args) => args[0] === 'id')).toBe(true);
    expect(stub.selects.every((args) => JSON.stringify(args[1]) === JSON.stringify({ count: 'exact', head: true }))).toBe(true);
  });

  it('treats a null count as zero', async () => {
    const { client } = stubClient({ count: null });
    expect(await countTeamSeats(client, 'ws-1')).toBe(0);
  });

  // FAIL OPEN. A null here means "do not enforce" at every call site, because
  // turning a transient database blip into a team that cannot grow is a far
  // worse failure than briefly allowing one seat too many.
  it('returns null on a query error rather than guessing a count', async () => {
    const { client } = stubClient({ error: { message: 'connection reset' } });
    expect(await countTeamSeats(client, 'ws-1')).toBeNull();
  });

  it('returns null when the query throws', async () => {
    const { client } = stubClient('throw');
    expect(await countTeamSeats(client, 'ws-1')).toBeNull();
  });

  it('returns null for a missing workspace id without querying', async () => {
    const stub = stubClient({ count: 5 });
    expect(await countTeamSeats(stub.client, '')).toBeNull();
    expect(stub.from).not.toHaveBeenCalled();
  });

  // A HIRE IS NOT A SEAT (lib/work-request-start.ts says why). Seats are what a
  // plan sells, so somebody who joined because they said yes to a request must
  // not use one up, or a Solo manager could never hire anybody.
  describe('hires', () => {
    it('leaves a hire out of the seat count', async () => {
      const { client } = stubClient({ count: 5 }, { count: 2 });
      expect(await countTeamSeats(client, 'ws-1')).toBe(3);
    });

    it('never goes below zero, whatever the two reads disagree about', async () => {
      const { client } = stubClient({ count: 1 }, { count: 4 });
      expect(await countTeamSeats(client, 'ws-1')).toBe(0);
    });

    it('counts everybody when the hire column does not exist yet', async () => {
      // The migration is applied by hand. Before it lands nobody can be a hire,
      // so nothing is subtracted, and a Postgres "undefined column" is not an
      // error worth failing a seat check over.
      const { client } = stubClient({ count: 4 }, { error: { message: 'no column', code: '42703' } });
      expect(await countTeamSeats(client, 'ws-1')).toBe(4);
    });

    it('counts everybody when the hire count cannot be read, the strict direction', async () => {
      // A blip on this read can refuse one invite that would have fit. It can
      // never hand out a free seat, which is the mistake that costs money.
      const { client } = stubClient({ count: 4 }, { error: { message: 'connection reset' } });
      expect(await countTeamSeats(client, 'ws-1')).toBe(4);
      const thrown = stubClient({ count: 4 }, 'throw');
      expect(await countTeamSeats(thrown.client, 'ws-1')).toBe(4);
    });
  });
});

describe('countHireMembers', () => {
  it('counts non-removed hires by default', async () => {
    const stub = stubClient({ count: 0 }, { count: 3 });
    expect(await countHireMembers(stub.client, 'ws-1')).toBe(3);
    const query = stub.asked[0];
    expect(query).toContainEqual(['eq', 'workspace_id', 'ws-1']);
    expect(query).toContainEqual(['eq', 'is_hire', true]);
    expect(query).toContainEqual(['neq', 'status', 'removed']);
  });

  it('counts only ACTIVE hires when asked, which is what the hire ceiling reads', async () => {
    // A pending invite is not somebody on the team yet, and the ceiling is about
    // people who are.
    const stub = stubClient({ count: 0 }, { count: 2 });
    await countHireMembers(stub.client, 'ws-1', { activeOnly: true });
    const query = stub.asked[0];
    expect(query).toContainEqual(['eq', 'status', 'active']);
    expect(query.some(([kind, column]) => kind === 'neq' && column === 'status')).toBe(false);
  });

  it('answers zero for no workspace, and null when the read fails', async () => {
    expect(await countHireMembers(stubClient({ count: 1 }).client, '')).toBe(0);
    expect(
      await countHireMembers(stubClient({ count: 0 }, { error: { message: 'x' } }).client, 'ws-1')
    ).toBeNull();
  });

  it('answers zero when the column does not exist yet', async () => {
    const { client } = stubClient({ count: 0 }, { error: { message: 'x', code: '42703' } });
    expect(await countHireMembers(client, 'ws-1')).toBe(0);
  });
});
