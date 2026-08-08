import { describe, expect, it } from 'vitest';
import {
  MAX_GENRE_PREDICTION_FILE_BYTES,
  normalizeGenreLabel,
  parseGenrePrediction,
  validateGenrePredictionUpload,
} from './genre-prediction';

describe('parseGenrePrediction', () => {
  it('parses a flat { genre } object', () => {
    expect(parseGenrePrediction({ genre: 'rock' })).toEqual({ genre: 'Rock', confidence: null });
  });

  it('parses { predicted_genre }', () => {
    expect(parseGenrePrediction({ predicted_genre: 'jazz' })).toEqual({
      genre: 'Jazz',
      confidence: null,
    });
  });

  it('parses { prediction } as a string field', () => {
    expect(parseGenrePrediction({ prediction: 'reggae' })).toEqual({
      genre: 'Reggae',
      confidence: null,
    });
  });

  it('parses { label, score }', () => {
    expect(parseGenrePrediction({ label: 'metal', score: 0.75 })).toEqual({
      genre: 'Metal',
      confidence: 0.75,
    });
  });

  it('parses { genre, confidence } in 0-1 range', () => {
    expect(parseGenrePrediction({ genre: 'pop', confidence: 0.93 })).toEqual({
      genre: 'Pop',
      confidence: 0.93,
    });
  });

  it('normalizes percent confidence (0-100) to 0-1', () => {
    expect(parseGenrePrediction({ genre: 'disco', probability: 87 })).toEqual({
      genre: 'Disco',
      confidence: 0.87,
    });
  });

  it('treats out-of-range confidence as unknown', () => {
    expect(parseGenrePrediction({ genre: 'blues', confidence: -1 })).toEqual({
      genre: 'Blues',
      confidence: null,
    });
    expect(parseGenrePrediction({ genre: 'blues', confidence: 250 })).toEqual({
      genre: 'Blues',
      confidence: null,
    });
  });

  it('parses nested { prediction: { genre, confidence } }', () => {
    expect(parseGenrePrediction({ prediction: { genre: 'country', confidence: 0.6 } })).toEqual({
      genre: 'Country',
      confidence: 0.6,
    });
  });

  it('parses nested { result: {...} }', () => {
    expect(parseGenrePrediction({ result: { label: 'classical' } })).toEqual({
      genre: 'Classical',
      confidence: null,
    });
  });

  it('parses the first entry of { predictions: [...] }', () => {
    expect(
      parseGenrePrediction({ predictions: [{ label: 'hiphop', probability: 0.9 }, { label: 'pop' }] })
    ).toEqual({ genre: 'Hiphop', confidence: 0.9 });
  });

  it('parses a bare string body', () => {
    expect(parseGenrePrediction('jazz')).toEqual({ genre: 'Jazz', confidence: null });
  });

  it('normalizes snake_case labels', () => {
    expect(parseGenrePrediction({ genre: 'hip_hop' })).toEqual({
      genre: 'Hip hop',
      confidence: null,
    });
  });

  it('returns null for empty or unusable payloads', () => {
    expect(parseGenrePrediction('')).toBeNull();
    expect(parseGenrePrediction('   ')).toBeNull();
    expect(parseGenrePrediction({})).toBeNull();
    expect(parseGenrePrediction(null)).toBeNull();
    expect(parseGenrePrediction(undefined)).toBeNull();
    expect(parseGenrePrediction(42)).toBeNull();
    expect(parseGenrePrediction([{ genre: 'rock' }])).toBeNull();
    expect(parseGenrePrediction({ predictions: [] })).toBeNull();
    expect(parseGenrePrediction({ genre: '   ' })).toBeNull();
    expect(parseGenrePrediction({ prediction: { nothing: true } })).toBeNull();
  });
});

describe('normalizeGenreLabel', () => {
  it('converts snake_case and kebab-case to spaced words', () => {
    expect(normalizeGenreLabel('hip_hop')).toBe('Hip hop');
    expect(normalizeGenreLabel('drum-and-bass')).toBe('Drum and bass');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeGenreLabel('  afro   beats  ')).toBe('Afro beats');
  });

  it('caps length at 80 characters', () => {
    expect(normalizeGenreLabel('x'.repeat(200))).toHaveLength(80);
  });
});

describe('validateGenrePredictionUpload', () => {
  it('rejects files over the size limit with MP3 guidance', () => {
    const result = validateGenrePredictionUpload({
      fileName: 'master.wav',
      mimeType: 'audio/wav',
      fileSize: MAX_GENRE_PREDICTION_FILE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('MP3');
  });

  it('accepts an allowed MIME type', () => {
    expect(
      validateGenrePredictionUpload({ fileName: 'song.mp3', mimeType: 'audio/mpeg', fileSize: 1024 })
    ).toEqual({ ok: true });
  });

  it('strips MIME parameters before matching', () => {
    expect(
      validateGenrePredictionUpload({
        fileName: 'song.mp3',
        mimeType: 'audio/mpeg;codecs=mp3',
        fileSize: 1024,
      })
    ).toEqual({ ok: true });
  });

  it('falls back to the extension when the browser reports no MIME type', () => {
    expect(
      validateGenrePredictionUpload({ fileName: 'song.FLAC', mimeType: '', fileSize: 1024 })
    ).toEqual({ ok: true });
  });

  it('rejects non-audio files', () => {
    const result = validateGenrePredictionUpload({
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
    });
    expect(result.ok).toBe(false);
  });
});
