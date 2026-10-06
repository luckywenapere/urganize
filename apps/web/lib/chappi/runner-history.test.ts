import { describe, expect, it } from 'vitest';
import { toModelHistory } from './runner';
import type { ChappiMessage } from './types';

function message(role: 'user' | 'assistant', content: string): ChappiMessage {
  return { id: `${role}-${content.slice(0, 8)}`, role, content };
}

describe('toModelHistory', () => {
  it('leaves a user turn verbatim and strips markup off an assistant turn', () => {
    const messages: ChappiMessage[] = [
      message('user', '**keep** me exactly as typed'),
      message('assistant', '- **Setup:** 26 tasks'),
    ];
    expect(toModelHistory(messages)).toEqual([
      { role: 'user', content: '**keep** me exactly as typed' },
      { role: 'assistant', content: '- Setup: 26 tasks' },
    ]);
  });

  it('drops a message that strips to blank, and drops a whitespace-only user turn, keeping order', () => {
    const messages: ChappiMessage[] = [
      message('user', 'What is the plan?'),
      message('assistant', '---'), // pure horizontal-rule markup, strips to ''
      message('user', '   '),
      message('assistant', 'Here it is.'),
    ];
    expect(toModelHistory(messages)).toEqual([
      { role: 'user', content: 'What is the plan?' },
      { role: 'assistant', content: 'Here it is.' },
    ]);
  });

  it('sends a photo as an image part and a text file inside the words', () => {
    const url = 'data:image/jpeg;base64,/9j/4AAQ';
    const messages: ChappiMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'What do you make of these?',
        attachments: [
          { id: 'a', kind: 'image', name: 'cover.jpg', mime: 'image/jpeg', size: 10, dataUrl: url },
          { id: 'b', kind: 'text', name: 'splits.csv', mime: 'text/csv', size: 10, text: 'Ada,50' },
        ],
      },
    ];
    const [turn] = toModelHistory(messages);
    expect(turn.role).toBe('user');
    expect(Array.isArray(turn.content)).toBe(true);
    const parts = turn.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(parts[0].text).toContain('What do you make of these?');
    expect(parts[0].text).toContain('Attached file: splits.csv');
    expect(parts[1].image_url?.url).toBe(url);
  });

  it('keeps a message that is only an attachment, and never makes an assistant turn an array', () => {
    const messages: ChappiMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'Attached: notes.txt',
        attachments: [{ id: 'b', kind: 'text', name: 'notes.txt', mime: 'text/plain', size: 4, text: 'hi' }],
      },
      message('assistant', 'Got it.'),
    ];
    const history = toModelHistory(messages);
    expect(history).toHaveLength(2);
    expect(typeof history[1].content).toBe('string');
    expect(history[0].content).toContain('hi');
    expect(history[0].content).not.toContain('Attached: notes.txt\n');
  });
});
