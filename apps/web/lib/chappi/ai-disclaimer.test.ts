import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_DISCLAIMER } from './ai-disclaimer';

const root = path.resolve(__dirname, '..', '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('the AI disclaimer (#1342)', () => {
  it('says the AI can be wrong, in house words', () => {
    expect(AI_DISCLAIMER).toMatch(/^AI /);
    expect(AI_DISCLAIMER).toMatch(/wrong/);
    expect(AI_DISCLAIMER).not.toMatch(/—|UrgAns|Chappi/);
  });

  it('sits under both boxes that talk to the AI', () => {
    expect(read('components/chappi/ChappiConversation.tsx')).toContain('{AI_DISCLAIMER}');
    expect(read('components/home/HomeAskBar.tsx')).toContain('{AI_DISCLAIMER}');
  });

  it('fades the transcript instead of painting a band over it', () => {
    const chat = read('components/chappi/ChappiConversation.tsx');
    expect(chat).toContain('chat-fade-bottom');
    expect(chat).not.toContain('from-bg-base via-bg-base/90 to-transparent');
    expect(read('app/globals.css')).toMatch(/\.chat-fade-bottom\s*\{[^}]*mask-image/);
  });
});
