/**
 * Linear transport (SERVER-ONLY) — one GraphQL mutation, hand-rolled.
 *
 * Deliberately not `@linear/sdk`: this is the third external API this repo has
 * declined a vendor SDK for, after `firebase-admin` (lib/fcm-server.ts) and
 * `resend` (lib/email.ts), and for the same reason — one endpoint, one
 * mutation, no session machinery. The MCP JSON-RPC layer made the same call.
 *
 * Env, all read at call time and all SERVER-ONLY, so deliberately NOT in
 * turbo.json (the CHAPPI_API_KEY / RESEND_API_KEY / GENRE_PREDICTION_URL
 * precedent — a key must never reach a client bundle):
 *   LINEAR_API_KEY          a personal `lin_api_…` key
 *   LINEAR_TEAM_ID          the UUID of the team issues land in
 *   LINEAR_BUG_LABEL_ID     optional
 *   LINEAR_REQUEST_LABEL_ID optional
 *
 * NOTHING IN THIS MODULE THROWS. A report is already saved by the time we get
 * here, so a Linear failure is a retry job rather than the reporter's problem.
 * Every failure returns { ok: false } with a retryable flag and is logged.
 */

import type { IssueKind } from './issue-reports';

const LINEAR_ENDPOINT = 'https://api.linear.app/graphql';

const SEND_TIMEOUT_MS = 10_000;

const CREATE_ISSUE_MUTATION = `mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier url }
  }
}`;

type LinearConfig = {
  apiKey: string;
  teamId: string;
  labelIdByKind: Partial<Record<IssueKind, string>>;
};

function readConfig(): LinearConfig | null {
  const apiKey = process.env.LINEAR_API_KEY?.trim() || '';
  const teamId = process.env.LINEAR_TEAM_ID?.trim() || '';
  if (!apiKey || !teamId) return null;

  const bug = process.env.LINEAR_BUG_LABEL_ID?.trim() || '';
  const request = process.env.LINEAR_REQUEST_LABEL_ID?.trim() || '';

  return {
    apiKey,
    teamId,
    labelIdByKind: {
      ...(bug ? { bug } : {}),
      ...(request ? { request } : {}),
    },
  };
}

/** Presence of BOTH the key and the team id is the feature switch. */
export function isLinearConfigured(): boolean {
  return readConfig() !== null;
}

export type LinearIssue = {
  id: string;
  identifier: string;
  url: string;
};

export type CreateLinearIssueResult =
  | { ok: true; issue: LinearIssue }
  | { ok: false; error: string; retryable: boolean };

/**
 * Retryable means "the same request could succeed later": the network, a
 * timeout, a rate limit, or Linear being unwell. A 4xx or a GraphQL error is
 * something about the request itself — retrying it just burns attempts.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function readIssue(payload: unknown): LinearIssue | null {
  const issue = (payload as { data?: { issueCreate?: { issue?: unknown } } })?.data?.issueCreate
    ?.issue as Record<string, unknown> | undefined;
  if (!issue) return null;

  const id = typeof issue.id === 'string' ? issue.id : '';
  const identifier = typeof issue.identifier === 'string' ? issue.identifier : '';
  const url = typeof issue.url === 'string' ? issue.url : '';
  if (!id || !identifier || !url) return null;

  return { id, identifier, url };
}

function readGraphqlErrors(payload: unknown): string | null {
  const errors = (payload as { errors?: unknown })?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const messages = errors
    .map((entry) => (entry as { message?: unknown })?.message)
    .filter((message): message is string => typeof message === 'string' && message.length > 0);
  return messages.join('; ') || 'Linear rejected the request.';
}

export async function createLinearIssue(input: {
  kind: IssueKind;
  title: string;
  description: string;
}): Promise<CreateLinearIssueResult> {
  const config = readConfig();
  if (!config) {
    // Not retryable in the sense that matters: retrying changes nothing until
    // somebody sets the env vars. The stored report is the durable copy.
    return { ok: false, error: 'Linear is not configured on this environment.', retryable: false };
  }

  const labelId = config.labelIdByKind[input.kind];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(LINEAR_ENDPOINT, {
      method: 'POST',
      headers: {
        // NO Bearer prefix. A personal `lin_api_…` key is passed raw; prefixing
        // it fails auth with a 401 indistinguishable from a bad key. (OAuth
        // access tokens are the ones that take Bearer — we do not use those.)
        Authorization: config.apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        query: CREATE_ISSUE_MUTATION,
        variables: {
          input: {
            teamId: config.teamId,
            title: input.title,
            description: input.description,
            ...(labelId ? { labelIds: [labelId] } : {}),
          },
        },
      }),
    });

    // Read the body before judging the status: GraphQL answers 200 for a
    // rejected mutation, and a non-2xx still carries a useful message.
    let payload: unknown = null;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail = readGraphqlErrors(payload);
      const error = `Linear responded ${response.status}${detail ? `: ${detail}` : ''}`;
      console.error('[linear] create failed', error);
      return { ok: false, error, retryable: isRetryableStatus(response.status) };
    }

    const graphqlError = readGraphqlErrors(payload);
    if (graphqlError) {
      console.error('[linear] create rejected', graphqlError);
      return { ok: false, error: graphqlError, retryable: false };
    }

    const issue = readIssue(payload);
    if (!issue) {
      const error = 'Linear accepted the request but returned no issue.';
      console.error('[linear] create returned no issue');
      return { ok: false, error, retryable: false };
    }

    return { ok: true, issue };
  } catch (error) {
    const isAbort = (error as { name?: string } | null)?.name === 'AbortError';
    const message = isAbort
      ? `Linear timed out after ${SEND_TIMEOUT_MS}ms`
      : `Could not reach Linear: ${(error as Error)?.message || 'unknown error'}`;
    console.error('[linear] create failed', message);
    return { ok: false, error: message, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}
