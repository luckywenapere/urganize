import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { ChatMentionEmail, chatMentionSubject } from './ChatMentionEmail';
import { getEmailTemplateMeta, isUnsubscribableCategory } from '../registry';
import { UNSUBSCRIBE_SCOPE_LABELS, unsubscribeScopeFor } from '../unsubscribe';

const base = {
  recipientName: 'Ada Obi',
  authorLabel: 'Oyin',
  releaseTitle: 'Ohema',
  everyone: false,
  message: '@Ada Obi can you check the cover?\n\nThe label wants it by Friday.',
  chatUrl: 'https://app.urganize.app/dashboard?release=r1&scene=chat',
};

describe('ChatMentionEmail', () => {
  it('carries the whole message, the chat link and the unsubscribe link', async () => {
    const { html, text } = await renderEmail(
      ChatMentionEmail({ ...base, unsubscribeUrl: 'https://app.urganize.app/unsubscribe?t=x' })
    );
    expect(text).toContain('Hey Ada,');
    expect(text).toContain('Oyin tagged you in the chat on Ohema');
    expect(text).toContain('can you check the cover?');
    expect(text).toContain('The label wants it by Friday.');
    expect(html).toContain('scene=chat');
    expect(html).toContain('/unsubscribe?t=x');
    expect(html).not.toContain('var(--');
  });

  it('says the whole team was messaged for @everyone', async () => {
    const { text } = await renderEmail(ChatMentionEmail({ ...base, everyone: true }));
    expect(text).toContain('Oyin sent this to everyone on Ohema');
  });

  it('has subjects for both kinds', () => {
    expect(chatMentionSubject('Oyin', 'Ohema', false)).toBe('Oyin tagged you on Ohema');
    expect(chatMentionSubject('', '', true)).toBe('Your teammate messaged everyone on your rollout');
  });

  it('is its own unsubscribable category, so turning it off stops chat mail only', () => {
    const meta = getEmailTemplateMeta('chat_mention');
    expect(meta.category).toBe('chat');
    expect(isUnsubscribableCategory('chat')).toBe(true);
    expect(unsubscribeScopeFor('chat')).toBe('chat');
    expect(UNSUBSCRIBE_SCOPE_LABELS.chat).toBe('rollout chat emails');
  });
});
