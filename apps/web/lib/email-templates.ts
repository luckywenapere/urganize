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

export const APP_URL = 'https://app.urganize.app';

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

export type CreditSubmissionEmailInput = {
  /** Who filled the form in, already labelled (legal name plus stage name). */
  collaboratorLabel: string;
  /** The release they answered for, already defaulted. */
  releaseTitle: string;
  /** Label/value pairs, already filtered to the ones they actually gave. */
  rows: Array<{ label: string; value: string }>;
  /** Absolute URL to the Metadata scene for this release. */
  metadataUrl: string;
};

/**
 * "Someone sent their credits" — the detail half of the credit-submission
 * notification (2026-08-27).
 *
 * The push is the ping; THIS is the part that carries what they actually
 * typed, so a manager can check a split or forward the whole thing to a
 * distributor without opening the app. That is the entire reason both channels
 * exist rather than just one, so if this is ever trimmed to a bare "you have a
 * new submission" line, the email stops being worth sending.
 *
 * Card style (like the invite, unlike the founder-note welcome): this IS
 * product mail and reads better as a structured record than as prose.
 */
export function buildCreditSubmissionEmail(input: CreditSubmissionEmailInput): BuiltEmail {
  const who = input.collaboratorLabel.trim() || 'A collaborator';
  const release = input.releaseTitle.trim() || 'your release';
  const url = input.metadataUrl;
  const rows = input.rows.filter((row) => row.label.trim() && row.value.trim());

  const subject = `${who} sent credits for ${release}`;

  const text = [
    `${who} filled in the credits form for ${release}.`,
    '',
    ...rows.map((row) => `${row.label}: ${row.value}`),
    '',
    'See everything they sent, and the running split totals:',
    url,
    '',
    'You are getting this because you created the credits link for this',
    'release. Corrections they make later replace this entry quietly, without',
    'another email.',
  ].join('\n');

  const rowsHtml = rows
    .map(
      (row) => `      <tr>
        <td style="padding:7px 14px 7px 0;color:${MUTED_TEXT};font-size:13px;line-height:1.5;vertical-align:top;white-space:nowrap;">${escapeHtml(row.label)}</td>
        <td style="padding:7px 0;color:${INK};font-size:14px;line-height:1.5;vertical-align:top;">${escapeHtml(row.value)}</td>
      </tr>`
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};">
<div style="display:none;font-size:0;line-height:0;max-height:0;overflow:hidden;">
${escapeHtml(`${who} filled in the credits form for ${release}.`)}
</div>
<div style="background-color:${PAGE_BG};padding:32px 16px;font-family:${FONT_STACK};">
  <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border:1px solid ${HAIRLINE};border-radius:14px;overflow:hidden;">
    <div style="background-color:${INK};padding:22px 28px;">
      <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.2px;">Urganize</span>
    </div>
    <div style="padding:32px 28px;">
      <h1 style="margin:0 0 14px;color:${INK};font-size:21px;line-height:1.35;font-weight:700;">
        ${escapeHtml(who)} sent their credits
      </h1>
      <p style="margin:0 0 22px;color:${BODY_TEXT};font-size:15px;line-height:1.6;">
        For ${escapeHtml(release)}. Here is what they filled in.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid ${HAIRLINE};border-bottom:1px solid ${HAIRLINE};margin:0 0 24px;">
${rowsHtml}
      </table>
      <a href="${escapeHtml(url)}"
         style="display:inline-block;background-color:${SPRING};color:${INK};font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:10px;">
        Open the release
      </a>
      <p style="margin:22px 0 0;color:${MUTED_TEXT};font-size:13px;line-height:1.6;">
        Or paste this link into your browser:<br>
        <a href="${escapeHtml(url)}" style="color:${BODY_TEXT};word-break:break-all;">${escapeHtml(url)}</a>
      </p>
    </div>
    <div style="border-top:1px solid ${HAIRLINE};padding:18px 28px;">
      <p style="margin:0;color:${MUTED_TEXT};font-size:12px;line-height:1.6;">
        You are getting this because you created the credits link for this
        release. If they correct something later it replaces this entry quietly,
        without another email.
      </p>
    </div>
  </div>
</div>
</body>
</html>`;

  return { subject, html, text };
}
export type TaskAssignedEmailInput = {
  /** The assignee's display name as stored on their profile. */
  recipientName: string;
  /** Who assigned it — a name when we have one, otherwise their email. */
  assignerLabel: string;
  taskTitle: string;
  /** The release the activity belongs to; '' when it has none. */
  releaseTitle: string;
  /** Already formatted ("Fri, Sep 4"); '' when the activity has no due date. */
  dueDateLabel: string;
  /** 'Urgent' / 'High priority' for the two loud tiers, '' otherwise. */
  priorityLabel: string;
  /** First stretch of the activity's description; '' when there is none. */
  note: string;
  /** Absolute URL landing on the workspace scoped to the release. */
  taskUrl: string;
};

/** "Fri, Sep 4" from a due_date value, in UTC so a date-only string never
 * shifts a day. '' when absent or unparseable — the template drops it. */
export function formatDueDateForEmail(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

/** Only the two loud tiers earn a word in the email; everything else is
 * noise a colleague would not bother writing down. */
export function priorityLabelForEmail(raw: string | null | undefined): string {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'urgent') return 'Urgent';
  if (value === 'high') return 'High priority';
  return '';
}

/** First stretch of the description for the email card's note line: first
 * non-empty line, capped. '' when there is nothing worth quoting. */
export function noteExcerptForEmail(raw: string | null | undefined, maxLength = 160): string {
  const firstLine =
    String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || '';
  if (!firstLine) return '';
  if (firstLine.length <= maxLength) return firstLine;
  return `${firstLine.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * "You've been handed an activity" — sent to the assignee alongside the
 * in-app + push notification (founder request, 2026-08-29).
 *
 * FOUNDER-NOTE REGISTER, deliberately, with one designed element. The brief
 * was explicit: it must read as if a person wrote it, not as product mail.
 * The welcome email above documents what makes mail read personal here (plain
 * paragraphs, system font, white ground, no banner) and warns "do not brand
 * this up" — this template follows that, in the ASSIGNER's voice, and the
 * one structured piece is a small card carrying the activity itself (spring
 * left border, the same accent the app uses), because the task details are
 * the one part a colleague WOULD write down precisely. Everything around the
 * card stays prose. If this ever grows a logo banner it has crossed back
 * into the register the brief rejected.
 *
 * Pair it with sendEmail's fromLabel ("<assigner> via Urganize") so the inbox
 * row itself reads as coming from the person.
 */
export function buildTaskAssignedEmail(input: TaskAssignedEmailInput): BuiltEmail {
  const assigner = input.assignerLabel.trim() || 'Your teammate';
  const taskTitle = input.taskTitle.trim() || 'An activity';
  const release = input.releaseTitle.trim();
  const due = input.dueDateLabel.trim();
  const priority = input.priorityLabel.trim();
  const note = input.note.trim();
  const url = input.taskUrl;
  const firstName = firstNameFrom(input.recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  const subject = `${assigner} put "${taskTitle}" on your plate`;

  const lead = release
    ? `${assigner} just handed you this one, for ${release}:`
    : `${assigner} just handed you this one:`;

  // "Midnight EP · due Fri, Sep 4 · Urgent" — only the parts that exist.
  const metaParts = [release, due ? `due ${due}` : '', priority].filter(Boolean);
  const metaLine = metaParts.join(' · ');

  const text = [
    greeting,
    '',
    lead,
    '',
    `  ${taskTitle}`,
    ...(metaLine ? [`  ${metaLine}`] : []),
    ...(note ? [`  "${note}"`] : []),
    '',
    'Everything you need is on the activity itself: the details, the files',
    'and where it sits in the plan.',
    '',
    'Open it here:',
    url,
    '',
    `You are getting this because ${assigner} assigned the activity to you`,
    'on Urganize.',
  ].join('\n');

  const p = `margin:0 0 18px;color:#1e2621;font-size:15px;line-height:1.65;`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;font-size:0;line-height:0;max-height:0;overflow:hidden;">
${escapeHtml(`${assigner} assigned you ${taskTitle}${release ? ` for ${release}` : ''}.`)}
</div>
<div style="max-width:560px;margin:0 auto;padding:36px 24px;font-family:${FONT_STACK};">
  <p style="${p}">${escapeHtml(greeting)}</p>
  <p style="${p}">${escapeHtml(lead)}</p>
  <div style="border-left:3px solid ${SPRING};background-color:${PAGE_BG};border-radius:0 12px 12px 0;padding:16px 20px;margin:0 0 22px;">
    <p style="margin:0;color:${INK};font-size:17px;line-height:1.4;font-weight:700;letter-spacing:-0.2px;">${escapeHtml(taskTitle)}</p>${
      metaLine
        ? `\n    <p style="margin:6px 0 0;color:${MUTED_TEXT};font-size:13px;line-height:1.5;">${escapeHtml(metaLine)}</p>`
        : ''
    }${
      note
        ? `\n    <p style="margin:10px 0 0;color:${BODY_TEXT};font-size:14px;line-height:1.55;font-style:italic;">&ldquo;${escapeHtml(note)}&rdquo;</p>`
        : ''
    }
  </div>
  <p style="${p}">Everything you need is on the activity itself: the details, the files and where it sits in the plan.</p>
  <a href="${escapeHtml(url)}"
     style="display:inline-block;background-color:${SPRING};color:${INK};font-size:15px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;">
    Open the activity
  </a>
  <p style="margin:28px 0 0;color:${MUTED_TEXT};font-size:12px;line-height:1.6;">
    You are getting this because ${escapeHtml(assigner)} assigned the activity to you on
    <a href="${APP_URL}" style="color:${MUTED_TEXT};">Urganize</a>.
  </p>
</div>
</body>
</html>`;

  return { subject, html, text };
}
