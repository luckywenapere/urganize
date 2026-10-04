import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SPEECH_CHARS,
  MAX_SPEECH_CHUNK,
  chunkForSpeech,
  pickVoice,
  speakChunks,
  speechChunksForReply,
  speechTextFromReply,
  stopSpeaking,
} from './speech';

describe('speechTextFromReply', () => {
  it('removes markup so the voice never says asterisks', () => {
    expect(speechTextFromReply('- **Setup:** 26 tasks')).not.toContain('*');
    expect(speechTextFromReply('**Setup:** 26 tasks')).toContain('Setup');
  });
  it('reduces links to the word link', () => {
    expect(speechTextFromReply('See https://example.com/a?b=1 now')).toBe('See link now');
  });
  it('turns line breaks into pauses and collapses spaces', () => {
    expect(speechTextFromReply('One\n\nTwo   three')).toBe('One. Two three');
  });
  it('is empty for blank input', () => {
    expect(speechTextFromReply('   \n ')).toBe('');
  });
});

describe('chunkForSpeech', () => {
  it('returns nothing for empty text', () => {
    expect(chunkForSpeech('  ')).toEqual([]);
  });
  it('keeps a short reply as one piece', () => {
    expect(chunkForSpeech('Hello there. How are you?')).toEqual(['Hello there. How are you?']);
  });
  it('never exceeds the max and never loses a word', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const chunks = chunkForSpeech(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_SPEECH_CHUNK);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text);
  });
  it('splits one very long sentence without losing words', () => {
    const text = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkForSpeech(text);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(MAX_SPEECH_CHUNK);
      expect(c.length).toBeGreaterThan(0);
    }
    expect(chunks.join(' ')).toBe(text);
  });
  it('splits an unbroken string with no spaces at the limit', () => {
    const chunks = chunkForSpeech('x'.repeat(500));
    expect(chunks.every((c) => c.length <= MAX_SPEECH_CHUNK)).toBe(true);
    expect(chunks.join('')).toBe('x'.repeat(500));
  });
});

describe('speechChunksForReply', () => {
  it('skips a reply too long to listen to', () => {
    expect(speechChunksForReply('word '.repeat(MAX_SPEECH_CHARS))).toEqual([]);
  });
  it('skips an empty reply', () => {
    expect(speechChunksForReply('')).toEqual([]);
  });
  it('speaks a normal reply', () => {
    expect(speechChunksForReply('**Done.** Your plan is ready.')).toEqual(['Done. Your plan is ready.']);
  });
});

describe('pickVoice', () => {
  const voices = [
    { lang: 'fr-FR', localService: true },
    { lang: 'en-GB', localService: false },
    { lang: 'en-US', localService: true },
    { lang: 'en-US', localService: false },
  ];
  it('prefers an exact match, local first', () => {
    expect(pickVoice(voices, 'en-US')).toEqual({ lang: 'en-US', localService: true });
  });
  it('falls back to the same language', () => {
    expect(pickVoice(voices, 'en-NG')?.lang.startsWith('en')).toBe(true);
  });
  it('returns null when nothing matches', () => {
    expect(pickVoice(voices, 'ja-JP')).toBeNull();
    expect(pickVoice([], 'en-US')).toBeNull();
  });
});

describe('speakChunks', () => {
  type Utt = { text: string; lang: string; voice?: unknown; onend?: () => void; onerror?: (e: unknown) => void };
  function install() {
    const spoken: Utt[] = [];
    const synth = {
      speak: vi.fn((u: Utt) => spoken.push(u)),
      cancel: vi.fn(),
      getVoices: () => [{ lang: 'en-US', localService: true }],
    };
    vi.stubGlobal('window', {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: function (this: Utt, text: string) {
        this.text = text;
        this.lang = '';
      },
    });
    return { spoken, synth };
  }
  afterEach(() => {
    stopSpeaking();
    vi.unstubAllGlobals();
  });

  it('speaks chunks in order and ends once', () => {
    const { spoken } = install();
    const onEnd = vi.fn();
    speakChunks(['one', 'two'], 'en-US', onEnd);
    expect(spoken.map((u) => u.text)).toEqual(['one']);
    spoken[0].onend?.();
    expect(spoken.map((u) => u.text)).toEqual(['one', 'two']);
    spoken[1].onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
  it('stop cancels, ends once, and speaks no further chunk', () => {
    const { spoken, synth } = install();
    const onEnd = vi.fn();
    const stop = speakChunks(['one', 'two'], 'en-US', onEnd);
    stop();
    spoken[0].onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
    expect(synth.cancel).toHaveBeenCalled();
  });
  it('starting a second reply stops the first', () => {
    install();
    const first = vi.fn();
    speakChunks(['a'], 'en-US', first);
    speakChunks(['b'], 'en-US', vi.fn());
    expect(first).toHaveBeenCalledTimes(1);
  });
  it('an error ends it', () => {
    const { spoken } = install();
    const onEnd = vi.fn();
    speakChunks(['one', 'two'], 'en-US', onEnd);
    spoken[0].onerror?.({});
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
  });
  it('ends at once where speech is unsupported', () => {
    vi.stubGlobal('window', {});
    const onEnd = vi.fn();
    speakChunks(['one'], 'en-US', onEnd);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
