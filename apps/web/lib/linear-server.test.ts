import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The transport reads its config from process.env at CALL time, but the module
// is re-imported per case anyway so a future memoization cannot make these
// tests lie to us (the lib/email.test.ts shape).
async function loadLinear() {
  vi.resetModules();
  return import('./linear-server');
}

function graphqlResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SUCCESS_BODY = {
  data: {
    issueCreate: {
      success: true,
      issue: { id: 'iss_1', identifier: 'URG-501', url: 'https://linear.app/urg/issue/URG-501' },
    },
  },
};

function configure() {
  vi.stubEnv('LINEAR_API_KEY', 'lin_api_secret');
  vi.stubEnv('LINEAR_TEAM_ID', 'team-uuid');
}

const INPUT = { kind: 'bug' as const, title: '[Bug] It broke', description: 'Details.' };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isLinearConfigured', () => {
  it('needs BOTH the key and the team id', async () => {
    const { isLinearConfigured } = await loadLinear();
    expect(isLinearConfigured()).toBe(false);

    vi.stubEnv('LINEAR_API_KEY', 'lin_api_secret');
    expect((await loadLinear()).isLinearConfigured()).toBe(false);

    vi.stubEnv('LINEAR_TEAM_ID', 'team-uuid');
    expect((await loadLinear()).isLinearConfigured()).toBe(true);
  });

  it('treats whitespace as unset', async () => {
    vi.stubEnv('LINEAR_API_KEY', '   ');
    vi.stubEnv('LINEAR_TEAM_ID', 'team-uuid');
    expect((await loadLinear()).isLinearConfigured()).toBe(false);
  });
});

describe('createLinearIssue — the request', () => {
  beforeEach(configure);

  it('posts to Linear’s single GraphQL endpoint', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(graphqlResponse(SUCCESS_BODY));

    const { createLinearIssue } = await loadLinear();
    await createLinearIssue(INPUT);

    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.linear.app/graphql');
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('sends the personal key RAW, with NO Bearer prefix', async () => {
    // The single easiest thing to get wrong here. A personal `lin_api_…` key is
    // passed straight in Authorization; prefixing it with "Bearer " fails auth
    // with a 401 that looks exactly like a bad key.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(graphqlResponse(SUCCESS_BODY));

    const { createLinearIssue } = await loadLinear();
    await createLinearIssue(INPUT);

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('lin_api_secret');
    expect(headers.Authorization).not.toMatch(/^Bearer/i);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends the configured team id and the issue fields', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(graphqlResponse(SUCCESS_BODY));

    const { createLinearIssue } = await loadLinear();
    await createLinearIssue(INPUT);

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toContain('issueCreate');
    expect(body.variables.input.teamId).toBe('team-uuid');
    expect(body.variables.input.title).toBe('[Bug] It broke');
    expect(body.variables.input.description).toBe('Details.');
  });

  it('attaches the kind’s label when one is configured, and omits labelIds otherwise', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(graphqlResponse(SUCCESS_BODY));

    let { createLinearIssue } = await loadLinear();
    await createLinearIssue(INPUT);
    expect(
      JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).variables.input
    ).not.toHaveProperty('labelIds');

    vi.stubEnv('LINEAR_BUG_LABEL_ID', 'label-bug');
    ({ createLinearIssue } = await loadLinear());
    await createLinearIssue(INPUT);
    expect(
      JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string).variables.input.labelIds
    ).toEqual(['label-bug']);

    // A request must not borrow the bug label.
    await createLinearIssue({ ...INPUT, kind: 'request' });
    expect(
      JSON.parse((fetchSpy.mock.calls[2][1] as RequestInit).body as string).variables.input
    ).not.toHaveProperty('labelIds');
  });
});

describe('createLinearIssue — outcomes', () => {
  it('returns the created issue on success', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(graphqlResponse(SUCCESS_BODY));

    const { createLinearIssue } = await loadLinear();
    const result = await createLinearIssue(INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issue).toEqual({
      id: 'iss_1',
      identifier: 'URG-501',
      url: 'https://linear.app/urg/issue/URG-501',
    });
  });

  it('makes NO network call when unconfigured, and says it is not retryable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { createLinearIssue } = await loadLinear();
    const result = await createLinearIssue(INPUT);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.retryable).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('treats a 200 carrying a GraphQL errors array as a FAILURE', async () => {
    // GraphQL answers 200 for a rejected mutation. Reading `response.ok` alone
    // would record a synced report that does not exist in Linear.
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      graphqlResponse({ errors: [{ message: 'Team not found' }] })
    );

    const { createLinearIssue } = await loadLinear();
    const result = await createLinearIssue(INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Team not found');
    expect(result.retryable).toBe(false);
  });

  it('treats success:false as a failure even with no errors array', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      graphqlResponse({ data: { issueCreate: { success: false } } })
    );

    const { createLinearIssue } = await loadLinear();
    expect((await createLinearIssue(INPUT)).ok).toBe(false);
  });

  it('treats a 200 with a missing issue as a failure rather than inventing one', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      graphqlResponse({ data: { issueCreate: { success: true } } })
    );

    const { createLinearIssue } = await loadLinear();
    expect((await createLinearIssue(INPUT)).ok).toBe(false);
  });

  it('marks 429 and 5xx retryable, and 4xx not', async () => {
    configure();
    const cases: Array<[number, boolean]> = [
      [429, true],
      [500, true],
      [502, true],
      [503, true],
      [400, false],
      [401, false],
      [403, false],
    ];

    for (const [status, retryable] of cases) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(graphqlResponse({}, status));
      const { createLinearIssue } = await loadLinear();
      const result = await createLinearIssue(INPUT);
      expect(result.ok, String(status)).toBe(false);
      if (result.ok) continue;
      expect(result.retryable, String(status)).toBe(retryable);
    }
  });

  it('marks a network failure retryable and never throws', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const { createLinearIssue } = await loadLinear();
    const result = await createLinearIssue(INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.retryable).toBe(true);
  });

  it('marks a timeout retryable', async () => {
    configure();
    const abort = new Error('The operation was aborted.');
    abort.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abort);

    const { createLinearIssue } = await loadLinear();
    const result = await createLinearIssue(INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.retryable).toBe(true);
    expect(result.error.toLowerCase()).toContain('timed out');
  });

  it('survives an unparseable body instead of throwing', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>502</html>', { status: 200 }));

    const { createLinearIssue } = await loadLinear();
    expect((await createLinearIssue(INPUT)).ok).toBe(false);
  });
});
