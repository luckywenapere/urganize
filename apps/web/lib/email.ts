// Transactional email transport.
//
// Hand-rolled against Resend's REST API rather than the `resend` SDK — the
// same call lib/fcm-server.ts made against firebase-admin and lib/mcp made
// against @modelcontextprotocol/sdk. Sending an email is one authenticated
// POST; a dependency buys nothing and costs bundle weight on every cold
// start. It also keeps the provider swap cheap: moving to Postmark is this
// one function's body (URL, auth header, field names), nothing else.
//
// Env (see .env.example):
//   RESEND_API_KEY  — server-only API key (re_…). Presence of this AND
//     EMAIL_FROM is the feature switch; unset, every send is a silent no-op.
//   EMAIL_FROM      — verified sender, e.g. "Urganize <team@send.urganize.app>".
//     Must be on a domain verified in Resend or the API rejects the send.
//   EMAIL_REPLY_TO  — optional. Point this at a real, human-read mailbox
//     (the Namecheap Private Email box on urganize.app) so a confused
//     recipient's reply lands somewhere rather than bouncing off a
//     send-only subdomain.
//
// Deliberately NOT in turbo.json's env allowlist: server-only runtime vars
// never reach the client bundle and so can't affect the build hash — the
// CRON_SECRET / CHAPPI_API_KEY / FCM_SERVICE_ACCOUNT_JSON precedent.
//
// NOTHING IN THIS MODULE THROWS. Email is a courtesy layer on top of flows
// that have already committed their real work (an invite row and its token
// are in the database before we ever get here), so a provider outage must
// never fail the caller. Every failure returns { ok: false } and is logged.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** 10s. A transactional send is either fast or broken; holding an invite
 *  request open longer than this to wait on a courtesy email is worse than
 *  handing the user the copyable link the route returns anyway. */
const SEND_TIMEOUT_MS = 10_000;

export type EmailMessage = {
  to: string;
  subject: string;
  /** Both parts are required. A text/plain alternative measurably lowers
   *  spam scoring and is what plain-text clients render. */
  html: string;
  text: string;
  /** Optional display name overriding EMAIL_FROM's, e.g. "Lucky via Urganize".
   *  Only the NAME half changes — the sending address always stays the
   *  verified EMAIL_FROM one, so deliverability and DMARC are untouched.
   *  The "X via Y" shape is the established way personal-feeling product
   *  mail signals who acted (Docs, Notion); see composeFromHeader. */
  fromLabel?: string;
};

export type EmailSendResult = {
  ok: boolean;
  /** True when email simply isn't configured — distinct from a real failure,
   *  so callers can tell "sending is off" from "sending broke" and word
   *  their user-facing copy honestly. */
  skipped?: boolean;
  error?: string;
};

type EmailConfig = { apiKey: string; from: string; replyTo: string | null };

function readConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim() || '';
  const from = process.env.EMAIL_FROM?.trim() || '';
  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo: process.env.EMAIL_REPLY_TO?.trim() || null };
}

/** Whether transactional email can be sent. Callers use this to word copy
 *  BEFORE attempting a send (e.g. an assistant's confirmation card that must
 *  not promise an email the deployment can't deliver). */
export function isEmailConfigured(): boolean {
  return readConfig() !== null;
}

/** Builds the From header. Pure and exported for tests.
 *
 *  configuredFrom is EMAIL_FROM verbatim — either `Name <addr@domain>` or a
 *  bare address. With a label, the ADDRESS is kept and only the display name
 *  is replaced; the label is sanitised (no angle brackets, quotes or line
 *  breaks — header-injection characters) and capped so a hostile profile
 *  name cannot forge headers or overflow the field. A label that sanitises
 *  to nothing falls back to the configured value unchanged. */
export function composeFromHeader(configuredFrom: string, label?: string): string {
  const cleanLabel = String(label || '')
    .replace(/[<>"\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  if (!cleanLabel) return configuredFrom;
  const match = configuredFrom.match(/<([^<>]+)>\s*$/);
  const address = (match ? match[1] : configuredFrom).trim();
  if (!address) return configuredFrom;
  return `${cleanLabel} <${address}>`;
}

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const config = readConfig();
  if (!config) {
    // Not an error: an environment without a key is expected (local dev, and
    // production before the key is set). Logged at info so the invite link
    // handoff stays visible in server logs.
    console.info('[email] not configured — skipping send to', message.to);
    return { ok: false, skipped: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: composeFromHeader(config.from, message.fromLabel),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Body is capped: provider errors are usually a short JSON object, but
      // an HTML error page from a proxy would otherwise flood the logs.
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      const error = `Resend responded ${response.status}${detail ? `: ${detail}` : ''}`;
      console.error('[email] send failed', error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (error) {
    const message_ =
      error instanceof Error && error.name === 'AbortError'
        ? `Timed out after ${SEND_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    console.error('[email] send failed', message_);
    return { ok: false, error: message_ };
  } finally {
    clearTimeout(timeout);
  }
}
