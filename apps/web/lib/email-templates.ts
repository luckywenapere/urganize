// Transactional email bodies. Pure functions — no I/O, no env, no React —
// so they're unit-testable and can't fail a send by throwing.
//
// Three constraints email imposes that the app's own UI doesn't:
//
//  1. INLINE STYLES ONLY. No CSS custom properties and no external
//     stylesheet: Outlook and several webmail clients strip <style> blocks
//     and none of them resolve var(). Every colour below is a hard-coded
//     literal for the same reason .epk-island is hard-coded — a message
//     must render identically for every recipient, in a client we don't
//     control. Do NOT refactor these to theme tokens.
//  2. NO WEB FONTS. @font-face is unreliable-to-blocked in mail clients, so
//     these use a system stack. Space Grotesk / Fraunces are deliberately
//     absent.
//  3. A LIGHT GROUND, unlike the app's dark default. Gmail and Outlook apply
//     their own dark-mode colour inversion to email, which mangles a
//     dark-designed message far worse than it does a light one.
//
// The brand shows up as the ink/spring accent pair rather than as the whole
// canvas, which survives inversion intact.

const INK = '#0d120e';
const SPRING = '#7fd99a';
const BODY_TEXT = '#33403a';
const MUTED_TEXT = '#6b7a72';
const HAIRLINE = '#e4e9e5';
const PAGE_BG = '#f6f8f6';

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type WorkspaceInviteEmailInput = {
  /** Display name of the workspace the invitee is joining. */
  workspaceName: string;
  /** Who sent it — a name when we have one, otherwise their email. */
  inviterLabel: string;
  /** The /invite/accept URL carrying the single-use token. */
  inviteUrl: string;
  /** Plain-English access description, already mapped from the role. */
  accessLabel: string;
};

export type BuiltEmail = { subject: string; html: string; text: string };

/** Escapes user-controlled values before interpolation. A workspace name is
 *  free text the inviter typed, so it reaches this template unsanitised;
 *  without this, an apostrophe breaks the markup and a '<' could inject it. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildWorkspaceInviteEmail(input: WorkspaceInviteEmailInput): BuiltEmail {
  const workspace = input.workspaceName.trim() || 'a workspace';
  const inviter = input.inviterLabel.trim() || 'A teammate';
  const access = input.accessLabel.trim() || 'access';
  const url = input.inviteUrl;

  const subject = `${inviter} invited you to ${workspace} on Urganize`;

  const text = [
    `${inviter} invited you to join ${workspace} on Urganize.`,
    '',
    'Urganize is where the team runs a release — the plan, the work, and who',
    'is doing what, in one place.',
    '',
    `You'll have ${access}.`,
    '',
    'Accept the invite:',
    url,
    '',
    "This link works once and expires in 30 days. If you weren't expecting it,",
    'you can ignore this email.',
  ].join('\n');

  // Widths are fixed in px and the layout is a single centred column: mail
  // clients' flexbox and grid support is not dependable.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};">
<div style="display:none;font-size:0;line-height:0;max-height:0;overflow:hidden;">
${escapeHtml(`${inviter} invited you to join ${workspace} on Urganize.`)}
</div>
<div style="background-color:${PAGE_BG};padding:32px 16px;font-family:${FONT_STACK};">
  <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border:1px solid ${HAIRLINE};border-radius:14px;overflow:hidden;">
    <div style="background-color:${INK};padding:22px 28px;">
      <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.2px;">Urganize</span>
    </div>
    <div style="padding:32px 28px;">
      <h1 style="margin:0 0 14px;color:${INK};font-size:21px;line-height:1.35;font-weight:700;">
        ${escapeHtml(inviter)} invited you to ${escapeHtml(workspace)}
      </h1>
      <p style="margin:0 0 22px;color:${BODY_TEXT};font-size:15px;line-height:1.6;">
        Urganize is where the team runs a release &mdash; the plan, the work, and who
        is doing what, in one place. You&rsquo;ll have ${escapeHtml(access)}.
      </p>
      <a href="${escapeHtml(url)}"
         style="display:inline-block;background-color:${SPRING};color:${INK};font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:10px;">
        Accept the invite
      </a>
      <p style="margin:22px 0 0;color:${MUTED_TEXT};font-size:13px;line-height:1.6;">
        Or paste this link into your browser:<br>
        <a href="${escapeHtml(url)}" style="color:${BODY_TEXT};word-break:break-all;">${escapeHtml(url)}</a>
      </p>
    </div>
    <div style="border-top:1px solid ${HAIRLINE};padding:18px 28px;">
      <p style="margin:0;color:${MUTED_TEXT};font-size:12px;line-height:1.6;">
        This link works once and expires in 30 days. If you weren&rsquo;t expecting
        it, you can ignore this email.
      </p>
    </div>
  </div>
</div>
</body>
</html>`;

  return { subject, html, text };
}

export type WelcomeEmailInput = {
  /** The recipient's display name as stored on their profile — may be a full
   *  name, an email handle, or blank. Only the first word is used. */
  recipientName: string;
};

/** The founder's WhatsApp deep link — the app's real support channel (see
 *  CLAUDE.md, External services). The welcome note points here rather than at
 *  a support@ address because this is where the founder actually answers. */
const FOUNDER_WHATSAPP_URL = 'https://wa.me/2347067367057';

const APP_URL = 'https://app.urganize.app';

/** First word of the stored name, if it plausibly reads as a name. An email
 *  handle like "lucky.wenapere" or a blank falls back to '' so the greeting
 *  degrades to "Hey," rather than "Hey lucky.wenapere,". */
function firstNameFrom(value: string): string {
  const first = value.trim().split(/\s+/)[0] || '';
  if (!first || first.includes('@') || first.includes('.') || first.length > 20) return '';
  return first;
}

/**
 * The founder-note welcome, sent once when a user completes onboarding.
 *
 * Deliberately UNLIKE the invite template: no banner, no button, no card —
 * plain paragraphs in a system font on a white ground, so it reads as a
 * personal email from a person rather than product mail. That is the point
 * of the founder-note style, and it also scores better with spam filters,
 * which treat heavily-designed mail from young domains with suspicion.
 * Do not "brand this up".
 */
export function buildWelcomeEmail(input: WelcomeEmailInput): BuiltEmail {
  const firstName = firstNameFrom(input.recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  const subject = 'Welcome to Urganize — a note from Lucky';

  const text = [
    greeting,
    '',
    "Lucky here — I'm the founder of Urganize. Thanks for signing up.",
    '',
    'I built this because running a release across group chats and',
    'spreadsheets kept breaking my own team. In Urganize you create a',
    'release and get a full rollout plan — every task, in order, with',
    'dates. You just work the plan.',
    '',
    'If anything feels confusing or missing, message me on WhatsApp:',
    FOUNDER_WHATSAPP_URL,
    'I read every message.',
    '',
    'When you are ready, set up your first release:',
    APP_URL,
    '',
    '— Lucky',
    'Founder, Urganize',
  ].join('\n');

  const p = `margin:0 0 16px;color:#1e2621;font-size:15px;line-height:1.65;`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:36px 24px;font-family:${FONT_STACK};">
  <p style="${p}">${escapeHtml(greeting)}</p>
  <p style="${p}">Lucky here &mdash; I&rsquo;m the founder of Urganize. Thanks for signing up.</p>
  <p style="${p}">I built this because running a release across group chats and spreadsheets kept breaking my own team. In Urganize you create a release and get a full rollout plan &mdash; every task, in order, with dates. You just work the plan.</p>
  <p style="${p}">If anything feels confusing or missing, <a href="${FOUNDER_WHATSAPP_URL}" style="color:#1e5c38;">message me on WhatsApp</a>. I read every message.</p>
  <p style="${p}">When you&rsquo;re ready, <a href="${APP_URL}" style="color:#1e5c38;">set up your first release</a>.</p>
  <p style="margin:24px 0 0;color:#1e2621;font-size:15px;line-height:1.65;">&mdash; Lucky<br>
  <span style="color:${MUTED_TEXT};font-size:13px;">Founder, Urganize</span></p>
</div>
</body>
</html>`;

  return { subject, html, text };
}
