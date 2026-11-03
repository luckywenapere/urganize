import { describe, expect, it } from 'vitest';
import { describeTranscriptAnnouncement } from './transcript-announcement';

const idle = { isThinking: false, pendingConfirmation: null, lastAssistantContent: null };

describe('describeTranscriptAnnouncement', () => {
  it('reads the last reply as plain text, without markup', () => {
    expect(
      describeTranscriptAnnouncement({ ...idle, lastAssistantContent: '**Setup:** 26 tasks' })
    ).toBe('Setup: 26 tasks');
  });

  it('says it is thinking while a request is in flight', () => {
    expect(
      describeTranscriptAnnouncement({ ...idle, isThinking: true, lastAssistantContent: 'Earlier reply' })
    ).toBe('AI is thinking.');
  });

  it('puts a question waiting on the person ahead of the reply that raised it', () => {
    expect(
      describeTranscriptAnnouncement({
        ...idle,
        lastAssistantContent: 'I can do that.',
        pendingConfirmation: { title: 'Delete "Midnight EP"?', detail: 'This removes 42 activities.' },
      })
    ).toBe('Delete "Midnight EP"? This removes 42 activities. Approve or cancel below.');
  });

  it('does not announce a confirmation while the request that resolves it is running', () => {
    expect(
      describeTranscriptAnnouncement({
        ...idle,
        isThinking: true,
        pendingConfirmation: { title: 'Delete it?' },
      })
    ).toBe('AI is thinking.');
  });

  it('says nothing for an empty conversation', () => {
    expect(describeTranscriptAnnouncement(idle)).toBe('');
  });
});
