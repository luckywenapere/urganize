// Email configuration — env reads and the sender allowlist. React-free and
// I/O-free, so anything (including the admin dashboard) can import it cheaply.
//
// Env (see .env.example):
//   RESEND_API_KEY  — server-only API key (re_…). Presence of this AND
//     EMAIL_FROM is the feature switch; unset, every send is a silent no-op.
//   EMAIL_FROM      — the default verified sender, e.g.
//     "Urganize <hello@urganize.app>". Must be on a domain verified in Resend.
//   EMAIL_REPLY_TO  — optional. A real, human-read mailbox so a confused
//     recipient's reply lands somewhere.
//
// Deliberately NOT in turbo.json's env allowlist: server-only runtime vars never
// reach the client bundle and so can't affect the build hash — the CRON_SECRET /
// CHAPPI_API_KEY / FCM_SERVICE_ACCOUNT_JSON precedent.

export type EmailConfig = { apiKey: string; from: string; replyTo: string | null };

export function readEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim() || '';
  const from = process.env.EMAIL_FROM?.trim() || '';
  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo: process.env.EMAIL_REPLY_TO?.trim() || null };
}

/** Whether transactional email can be sent. Callers use this to word copy BEFORE
 *  attempting a send (an assistant card that must not promise mail the
 *  deployment can't deliver; an invite route that says "link created" vs
 *  "emailed"). */
export function isEmailConfigured(): boolean {
  return readEmailConfig() !== null;
}

/** The only addresses the dashboard may send FROM (PR 3), and the only addresses
 *  a per-template `from` override may resolve to. The address in EMAIL_FROM is
 *  the default and is expected to be one of these. */
export const SENDER_ALLOWLIST = [
  'hello@urganize.app',
  'lucky@urganize.app',
  'team@urganize.app',
] as const;

export type AllowedSender = (typeof SENDER_ALLOWLIST)[number];

export function isAllowedSender(address: string): address is AllowedSender {
  return (SENDER_ALLOWLIST as readonly string[]).includes(address.trim().toLowerCase());
}
