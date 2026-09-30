import { loadEmailTemplate } from './templates/loaders';
import type { EmailTemplateId, EmailTemplateProps } from './templates/props';

// Render an email for the admin dashboard to look at, without sending it. The
// same loader and renderer a real send uses, so the preview is the email. The
// heavy renderer is reached through a dynamic import, as in sendEmail, so this
// module stays light to import.
//
// The unsubscribe link is a placeholder (a real one is signed per recipient at
// send time), so the footer shows exactly where it will sit.

export async function renderEmailPreview<Id extends EmailTemplateId>(
  templateId: Id,
  props: EmailTemplateProps[Id]
): Promise<{ subject: string; html: string; text: string } | { error: string }> {
  try {
    const loaded = await loadEmailTemplate(templateId);
    const withFooter = { ...props, unsubscribeUrl: '#unsubscribe' } as EmailTemplateProps[Id];
    const { renderEmail } = await import('./render');
    const { html, text } = await renderEmail(loaded.element(withFooter));
    return { subject: loaded.subject(withFooter), html, text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not render the preview.' };
  }
}
