import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELEASE_TOOLS } from './releases';
import type { ChappiToolContext } from './shared';

// Pins the fix for the reported bug: asking UrgAns to rename a rollout wiped
// its release date, because update_release GET-then-merged onto a PATCH route
// that wrote every column on every call. The route is a true partial update
// now (lib/release-edit.ts); what matters here is that this TOOL sends only
// the fields the model actually mentioned, and never touches releaseDate at
// all — the schema doesn't even offer that field to the model.
//
// The tool is exercised directly, not through the runner: everything under
// test lives in its execute(), which now makes exactly one HTTP call rather
// than a GET followed by a PATCH.

const updateRelease = RELEASE_TOOLS.find((tool) => tool.name === 'update_release');
if (!updateRelease) throw new Error('update_release is not registered');

const ctx = {
  user: { id: 'user-1', email: 'manager@example.com' },
  adminClient: {} as never,
  workspaceIds: ['ws-1'],
  releaseOwnerIds: ['user-1'],
  artistScopeByOwnerId: {},
  artistScopeByWorkspaceId: {},
  origin: 'https://app.test',
  authToken: 'jwt',
} satisfies ChappiToolContext;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('update_release — the reported bug', () => {
  it('a rename sends ONLY the title, in exactly one request', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'saved', changed: ['title'], release: { id: 'rel-1', title: 'Trust' } })
    );

    const result = await updateRelease.execute(ctx, { releaseId: 'rel-1', title: 'Trust' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.test/api/releases/rel-1');
    expect(init.method).toBe('PATCH');
    const sentBody = JSON.parse(init.body as string);
    // The whole bug: releaseDate must never be a key here, present or absent-
    // -as-null. It is simply not in the object.
    expect(sentBody).toEqual({ title: 'Trust' });
    expect(sentBody).not.toHaveProperty('releaseDate');
    expect(sentBody).not.toHaveProperty('description');
    expect(sentBody).not.toHaveProperty('status');

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Trust');
  });

  it('never performs a GET — the route does its own read-then-merge now', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'saved', changed: ['description'], release: { id: 'rel-1', title: 'Trust' } })
    );
    await updateRelease.execute(ctx, { releaseId: 'rel-1', description: 'New words.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });
});

describe('update_release — field presence', () => {
  it('sends each field only when the model actually mentioned it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'saved', changed: ['status'], release: { id: 'rel-1', title: 'Trust' } })
    );
    await updateRelease.execute(ctx, { releaseId: 'rel-1', status: 'ready' });
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody).toEqual({ status: 'ready' });
  });

  it('an explicit empty description IS sent — that means "clear it"', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'saved', changed: ['description'], release: { id: 'rel-1', title: 'Trust' } })
    );
    await updateRelease.execute(ctx, { releaseId: 'rel-1', description: '' });
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody).toEqual({ description: '' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses with no HTTP call when nothing was actually asked for', async () => {
    const result = await updateRelease.execute(ctx, { releaseId: 'rel-1' });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires releaseId', async () => {
    const result = await updateRelease.execute(ctx, { title: 'Trust' });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('update_release — response handling', () => {
  it('reports the route error verbatim on failure, including a refused date change', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'Change the release date through the schedule endpoint, so the plan moves with it. This edit left the date alone.', code: 'date_via_schedule' },
        400
      )
    );
    const result = await updateRelease.execute(ctx, { releaseId: 'rel-1', title: 'Trust' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.summary).toContain('schedule endpoint');
  });

  it('says plainly when nothing changed, without claiming a refresh happened', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'saved', changed: [], release: { id: 'rel-1', title: 'Trust' } })
    );
    const result = await updateRelease.execute(ctx, { releaseId: 'rel-1', title: 'Trust' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.toLowerCase()).toContain('nothing');
    expect(result.clientAction).toBeUndefined();
  });
});
