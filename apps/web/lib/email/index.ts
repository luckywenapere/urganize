// The one entry point every email send goes through. Callers import from
// '@/lib/email' and nothing else.
//
// LIGHT BY DESIGN. This module and everything it statically imports is React-free
// and Resend-free: config, registry, log, header helpers, and the loader map
// (whose template imports are dynamic thunks). The heavy parts — the react-email
// renderer (render.ts, which pulls react-dom/server) and the template components
// — are reached only through `await import()` inside sendEmail, so they never
// land in the ~55-file graph that imports tasks-server. A guard test enforces
// that only transport.ts references api.resend.com and that nothing outside
// lib/email imports the transport.

import type { ReactElement } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAllowedSender, readEmailConfig } from './config';
import { composeFromHeader, composeReplyTo, extractAddress } from './headers';
import { getEmailTemplateMeta } from './registry';
import { insertPendingEmailLog, insertTerminalEmailLog, markEmailLogFailed, markEmailLogSent } from './log-server';
import { loadEmailTemplate } from './templates/loaders';
import { sendViaResend } from './transport';
import { APP_URL } from './links';
import { isSuppressed } from './suppression-server';
import {
  buildUnsubscribeHeaders,
  buildUnsubscribeUrl,
  readUnsubscribeSecret,
  signUnsubscribeToken,
  unsubscribeScopeFor,
} from './unsubscribe';
import type { EmailTemplateId, EmailTemplateProps } from './templates/props';

export { isEmailConfigured } from './config';

export type SendEmailParams<Id extends EmailTemplateId> = {
  templateId: Id;
  to: string;
  props: EmailTemplateProps[Id];
  /** What caused the send (goes on the log), e.g. 'teammate_invited'. */
  trigger: string;
  /** The recipient's Urganize user id, when known. */
  recipientUserId?: string | null;
  /** Who caused it; null/undefined for a cron-driven send. */
  actorUserId?: string | null;
  /** Display-name override, e.g. "Lucky via Urganize". The sending ADDRESS is
   *  unchanged (the verified sender), so deliverability is untouched. */
  fromLabel?: string;
  /** Reply-To address override for this one message (validated; falls back). */
  replyTo?: string;
  /** Extra headers, e.g. List-Unsubscribe (PR 2). */
  headers?: Record<string, string>;
  /** Row-level dedupe key (PR-2 jobs); Resend's own idempotency header. */
  dedupeKey?: string | null;
  idempotencyKey?: string;
};

export type EmailSendResult = {
  ok: boolean;
  /** True when email simply isn't configured — distinct from a real failure, so
   *  callers can word copy honestly ("link created" vs "emailed"). */
  skipped?: boolean;
  error?: string;
};

export async function sendEmail<Id extends EmailTemplateId>(
  admin: SupabaseClient,
  params: SendEmailParams<Id>
): Promise<EmailSendResult> {
  const meta = getEmailTemplateMeta(params.templateId);
  const config = readEmailConfig();

  // Optional categories (onboarding, reminders, announcements) carry an
  // unsubscribe link and the one-click headers. Without a signing secret no link
  // can be made; the send degrades to going out without one rather than a
  // welcome email silently stopping.
  const scope = unsubscribeScopeFor(meta.category);
  const secret = scope ? readUnsubscribeSecret() : null;
  const token = scope && secret ? signUnsubscribeToken(secret, params.to, scope) : null;
  if (scope && !token) console.warn('[email] no unsubscribe secret; sending without a link', params.templateId);
  const unsubscribeUrl = token ? buildUnsubscribeUrl(APP_URL, token) : null;
  const unsubscribeHeaders = token ? buildUnsubscribeHeaders(APP_URL, token) : {};

  // Subject building is pure and cheap (the loader's dynamic import only pulls
  // react-email's declarative components; the heavy render.ts stays out until we
  // actually send). Wrapped so a subject builder can never throw a send.
  let subject = '';
  let element: ReactElement | null = null;
  try {
    const loaded = await loadEmailTemplate(params.templateId);
    const props = (unsubscribeUrl ? { ...params.props, unsubscribeUrl } : params.props) as typeof params.props;
    subject = loaded.subject(props);
    element = loaded.element(props);
  } catch (error) {
    console.error('[email] template load failed', params.templateId, error instanceof Error ? error.message : error);
    return { ok: false, error: 'template_load_failed' };
  }
  // The catch above returns, so element is set here; this narrows it for TS.
  if (!element) return { ok: false, error: 'template_load_failed' };

  const senderAddress =
    meta.fromAddress && isAllowedSender(meta.fromAddress) ? meta.fromAddress : null;
  const baseFrom = senderAddress ? `Urganize <${senderAddress}>` : config?.from || '';
  const fromAddressForLog = senderAddress || (baseFrom ? extractAddress(baseFrom) : '(unset)');
  const replyToResolved = composeReplyTo(config?.replyTo ?? null, params.replyTo);

  const logBase = {
    recipient: params.to,
    recipientUserId: params.recipientUserId ?? null,
    fromAddress: fromAddressForLog,
    replyTo: replyToResolved,
    subject,
    template: params.templateId,
    category: meta.category,
    trigger: params.trigger,
    actorUserId: params.actorUserId ?? null,
    dedupeKey: params.dedupeKey ?? null,
  } as const;

  // Not configured: an environment without a key is expected (local dev, and
  // production before the key is set). Record it as skipped and no-op.
  if (!config) {
    console.info('[email] not configured — skipping', params.templateId, '->', params.to);
    await insertTerminalEmailLog(admin, logBase, 'skipped', 'not_configured');
    return { ok: false, skipped: true };
  }

  // An address that unsubscribed from this category, bounced or complained is
  // not sent optional mail. Transactional and internal mail never reaches here.
  if (scope && (await isSuppressed(admin, params.to, scope))) {
    console.info('[email] suppressed — skipping', params.templateId, '->', params.to);
    await insertTerminalEmailLog(admin, logBase, 'unsubscribed', 'suppressed');
    return { ok: false, skipped: true };
  }

  // Render (heavy) — react-dom/server is pulled in only here, only when a send
  // is actually happening.
  let html: string;
  let text: string;
  try {
    const { renderEmail } = await import('./render');
    const rendered = await renderEmail(element);
    html = rendered.html;
    text = rendered.text;
  } catch (error) {
    const message = `render: ${error instanceof Error ? error.message : 'unknown'}`;
    console.error('[email] render failed', params.templateId, message);
    await insertTerminalEmailLog(admin, logBase, 'failed', message);
    return { ok: false, error: message };
  }

  const from = composeFromHeader(baseFrom, params.fromLabel);

  const logId = await insertPendingEmailLog(admin, logBase);

  const result = await sendViaResend(config.apiKey, {
    from,
    to: params.to,
    subject,
    html,
    text,
    replyTo: replyToResolved,
    headers: { ...unsubscribeHeaders, ...params.headers },
    idempotencyKey: params.idempotencyKey,
  });

  if (logId) {
    if (result.ok) await markEmailLogSent(admin, logId, result.id);
    else await markEmailLogFailed(admin, logId, result.error);
  } else if (!result.ok) {
    console.error('[email] send failed (no log row)', params.templateId, result.error);
  }

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
