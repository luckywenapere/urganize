import { describe, expect, it } from 'vitest';
import {
  MAX_VOICE_CLIP_BYTES,
  buildTranscriptionPrompt,
  mergeTranscript,
  parseTranscription,
  pickRecordingMimeType,
  validateVoiceClip,
} from './urgans-voice';

describe('pickRecordingMimeType', () => {
  it('prefers webm+opus when the browser supports it', () => {
    expect(pickRecordingMimeType(() => true)).toBe('audio/webm;codecs=opus');
  });

  it('falls back to mp4 on Safari/iOS, which only supports mp4', () => {
    const safari = (type: string) => type === 'audio/mp4';
    expect(pickRecordingMimeType(safari)).toBe('audio/mp4');
  });

  it('returns null when nothing is supported, which hides the mic', () => {
    expect(pickRecordingMimeType(() => false)).toBeNull();
  });

  it('treats a thrown isTypeSupported as unsupported rather than crashing', () => {
    const throwsOnFirst = (type: string) => {
      if (type === 'audio/webm;codecs=opus') throw new Error('nope');
      return type === 'audio/webm';
    };
    expect(pickRecordingMimeType(throwsOnFirst)).toBe('audio/webm');
  });
});

describe('validateVoiceClip', () => {
  it('accepts a normal webm clip', () => {
    expect(validateVoiceClip({ mimeType: 'audio/webm;codecs=opus', size: 50_000 })).toEqual({
      ok: true,
    });
  });

  it('accepts mp4 with the base type after stripping codecs', () => {
    expect(validateVoiceClip({ mimeType: 'audio/mp4;codecs=mp4a.40.2', size: 50_000 }).ok).toBe(
      true
    );
  });

  it('rejects an empty recording', () => {
    const result = validateVoiceClip({ mimeType: 'audio/webm', size: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.tooLarge).toBe(false);
  });

  it('rejects an oversized clip and flags it as too large (413 on the server)', () => {
    const result = validateVoiceClip({ mimeType: 'audio/webm', size: MAX_VOICE_CLIP_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.tooLarge).toBe(true);
  });

  it('accepts a clip exactly at the byte ceiling', () => {
    expect(validateVoiceClip({ mimeType: 'audio/webm', size: MAX_VOICE_CLIP_BYTES }).ok).toBe(true);
  });

  it('rejects an unsupported format as a type error, not a size error', () => {
    const result = validateVoiceClip({ mimeType: 'video/mp4', size: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.tooLarge).toBe(false);
  });
});

describe('parseTranscription', () => {
  it('reads the OpenAI { text } shape', () => {
    expect(parseTranscription({ text: '  add a task for Dorian  ' })).toBe('add a task for Dorian');
  });

  it('reads a bare string', () => {
    expect(parseTranscription('hello there')).toBe('hello there');
  });

  it('returns null for whitespace-only text so silence is distinguishable', () => {
    expect(parseTranscription({ text: '   ' })).toBeNull();
  });

  it('returns null for an unrecognized shape', () => {
    expect(parseTranscription({ result: 'nope' })).toBeNull();
    expect(parseTranscription(null)).toBeNull();
  });
});

describe('buildTranscriptionPrompt', () => {
  it('names the artist and title so they get spelled right', () => {
    expect(buildTranscriptionPrompt({ artistName: 'Tems', releaseTitle: 'Born in the Wild' })).toBe(
      'Names that may come up: Tems, Born in the Wild.'
    );
  });

  it('returns an empty string when there is nothing to hint', () => {
    expect(buildTranscriptionPrompt({ artistName: '', releaseTitle: null })).toBe('');
  });

  it('strips control characters that would corrupt the form field', () => {
    expect(buildTranscriptionPrompt({ artistName: 'Bad\nName', releaseTitle: null })).toBe(
      'Names that may come up: Bad Name.'
    );
  });

  it('caps a very long hint', () => {
    const long = 'x'.repeat(500);
    expect(buildTranscriptionPrompt({ artistName: long, releaseTitle: null }).length).toBeLessThanOrEqual(
      200
    );
  });
});

describe('mergeTranscript', () => {
  it('appends to what is already typed with one space', () => {
    expect(mergeTranscript('remind me to', 'call the label')).toBe('remind me to call the label');
  });

  it('never replaces existing text', () => {
    expect(mergeTranscript('keep this', 'and this')).toContain('keep this');
  });

  it('uses the transcript alone when the box was empty', () => {
    expect(mergeTranscript('', 'just this')).toBe('just this');
    expect(mergeTranscript('   ', 'just this')).toBe('just this');
  });

  it('leaves the box unchanged when nothing was transcribed', () => {
    expect(mergeTranscript('typed already', '   ')).toBe('typed already');
  });
});
