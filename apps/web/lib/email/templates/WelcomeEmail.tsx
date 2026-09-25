import { EmailLayout } from './Layout';
import { AccentLink, Paragraph } from './components';
import { Text } from 'react-email';
import { MUTED_TEXT } from './theme';
import { firstNameFrom } from '../format';
import { APP_URL, FOUNDER_WHATSAPP_URL } from '../links';

export type WelcomeEmailProps = {
  /** The recipient's stored display name — may be a full name, an email handle,
   *  or blank. Only the first word is used, and only when it reads like a name. */
  recipientName: string;
};

// The founder-note welcome, sent once when a self-signup finishes onboarding.
//
// FOUNDER-NOTE REGISTER: plain paragraphs, no card, no button, signed by a
// person — it reads as a personal email, not product mail, which also scores
// better with spam filters on a young domain. The one branded element is the
// small "Urganize" wordmark the shared Layout puts at the top (the brief asked
// for the name at the top); do not add a heavy banner or a CTA button. Copy is
// kept verbatim from the original lib/email-templates.ts buildWelcomeEmail.
export function WelcomeEmail({ recipientName }: WelcomeEmailProps) {
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  return (
    <EmailLayout preview="A note from Lucky, the founder of Urganize.">
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>
        Lucky here &mdash; I&rsquo;m the founder of Urganize. Thanks for signing up.
      </Paragraph>
      <Paragraph>
        I built this because running a rollout across group chats and spreadsheets kept breaking my
        own team. In Urganize you create a rollout and get a full rollout plan &mdash; every task,
        in order, with dates. You just work the plan.
      </Paragraph>
      <Paragraph>
        If anything feels confusing or missing,{' '}
        <AccentLink href={FOUNDER_WHATSAPP_URL}>message me on WhatsApp</AccentLink>. I read every
        message.
      </Paragraph>
      <Paragraph>
        When you&rsquo;re ready, <AccentLink href={APP_URL}>set up your first rollout</AccentLink>.
      </Paragraph>
      <Text style={{ margin: '24px 0 0', color: '#1e2621', fontSize: '15px', lineHeight: '1.65' }}>
        &mdash; Lucky
        <br />
        <span style={{ color: MUTED_TEXT, fontSize: '13px' }}>Founder, Urganize</span>
      </Text>
    </EmailLayout>
  );
}

export const WELCOME_SUBJECT = 'Welcome to Urganize — a note from Lucky';
