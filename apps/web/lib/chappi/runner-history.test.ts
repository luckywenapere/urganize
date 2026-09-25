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
});
