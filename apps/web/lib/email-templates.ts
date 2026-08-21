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
