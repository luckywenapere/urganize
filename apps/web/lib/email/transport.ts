// The ONLY module that talks to api.resend.com.
//
// Hand-rolled against Resend's REST API rather than the `resend` SDK — the same
// call lib/fcm-server.ts made against firebase-admin and lib/mcp against the MCP
// SDK. Sending an email is one authenticated POST; a dependency buys nothing and
// costs bundle weight on every cold start, and Turbopack mis-resolves the SDK's
// optional render import anyway (resend-node#625). It also keeps a provider swap
// to this one file.
//
// A source-scan guard test fails the build if any other file references
// api.resend.com, so keep every Resend HTTP detail here.
//
// NOTHING IN THIS MODULE THROWS. Email is a courtesy on top of flows that have
// already committed their real work, so a provider outage must never fail the
// caller. Every failure returns { ok: false } with an error string.

import { composeFromHeader, composeReplyTo } from './headers';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** 10s. A transactional send is either fast or broken; holding a request open
 *  longer to wait on a courtesy email is worse than the copyable link the invite
 *  route returns anyway. */
const SEND_TIMEOUT_MS = 10_000;

export type ResendSendInput = {
  /** Full From header, already composed and validated by the caller
   *  (config address + optional display label). */
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo: string | null;
  /** Extra headers, e.g. List-Unsubscribe (PR 2). */
  headers?: Record<string, string>;
  /** Resend's own idempotency key (24h window). Distinct from the log's
   *  dedupe_key: this guards a duplicate HTTP send, that guards a duplicate row. */
  idempotencyKey?: string;
};

export type ResendSendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export async function sendViaResend(
  apiKey: string,
  input: ResendSendInput
): Promise<ResendSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.headers && Object.keys(input.headers).length ? { headers: input.headers } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Body is capped: provider errors are a short JSON object, but an HTML
      // error page from a proxy would otherwise flood the logs.
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      return { ok: false, error: `Resend responded ${response.status}${detail ? `: ${detail}` : ''}` };
    }

    // Resend returns { id }. Missing is not a failure — the send succeeded.
    const payload = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: typeof payload?.id === 'string' ? payload.id : null };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Timed out after ${SEND_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export { composeFromHeader, composeReplyTo };
