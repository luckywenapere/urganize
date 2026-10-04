// Read-aloud for UrgAns replies (NEXT_PUBLIC_FEATURE_URGANS_SPEAK).
//
// Uses the browser's own speech synthesis: no vendor, no server route, no cost
// per reply, and nothing leaves the device (the founder's "RodiumAi or nothing"
// rule for voice input holds). The decisions live here, pure, so vitest can
// reach them; the component only wires a button to them.
//
// What is read is the CLEAN reply (`stripModelMarkup`), never the raw text, or
// the voice would say "asterisk asterisk Setup".

import { stripModelMarkup } from '@/lib/model-markup';

/** Chrome silently stops an utterance after roughly 15 seconds, so a long reply
 * is spoken as several short ones in a row. ~180 characters is well under it. */
export const MAX_SPEECH_CHUNK = 180;

/** A reply longer than this is not read aloud at all: it would run for minutes
 * and the person can read it faster. Matches the model's own output ceiling. */
export const MAX_SPEECH_CHARS = 6000;

export function isSpeechEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_URGANS_SPEAK === 'true';
}

/** Plain text for the voice: markup removed, URLs reduced to "link", line
 * breaks turned into pauses, whitespace collapsed. */
export function speechTextFromReply(content: string): string {
  return stripModelMarkup(content)
    .trim()
    .replace(/https?:\/\/\S+/gi, 'link')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/([.!?:;])\s*\.\s+/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Splits text into pieces no longer than `max`, preferring sentence ends, then
 * commas, then spaces. A piece is never empty and never loses a word. */
export function chunkForSpeech(text: string, max: number = MAX_SPEECH_CHUNK): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [clean];

  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    const piece = current.trim();
    if (piece) chunks.push(piece);
    current = '';
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > max) {
      flush();
      for (const piece of splitLong(sentence, max)) chunks.push(piece);
      continue;
    }
    if (current && current.length + 1 + sentence.length > max) flush();
    current = current ? `${current} ${sentence}` : sentence;
  }
  flush();
  return chunks;
}

function splitLong(sentence: string, max: number): string[] {
  const out: string[] = [];
  let rest = sentence.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
    if (cut < max / 2) cut = window.lastIndexOf(' ');
    // No break point at all: cut hard at the limit, losing nothing.
    const take = cut > 0 ? cut + 1 : max;
    out.push(rest.slice(0, take).trim());
    rest = rest.slice(take).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** The pieces to speak for a reply, or [] when it should not be read aloud
 * (empty after cleaning, or longer than `MAX_SPEECH_CHARS`). */
export function speechChunksForReply(content: string): string[] {
  const text = speechTextFromReply(content);
  if (!text || text.length > MAX_SPEECH_CHARS) return [];
  return chunkForSpeech(text);
}

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

/** Picks the best installed voice for the page language: an exact match first,
 * then the same base language, else null (the browser default). */
export function pickVoice(
  voices: ReadonlyArray<{ lang: string; localService?: boolean }>,
  lang: string,
): { lang: string; localService?: boolean } | null {
  const want = lang.toLowerCase();
  const base = want.split('-')[0];
  const byQuality = (a: { localService?: boolean }, b: { localService?: boolean }) =>
    Number(Boolean(b.localService)) - Number(Boolean(a.localService));
  const exact = voices.filter((v) => v.lang.toLowerCase() === want).sort(byQuality);
  if (exact[0]) return exact[0];
  const same = voices.filter((v) => v.lang.toLowerCase().split('-')[0] === base).sort(byQuality);
  return same[0] ?? null;
}

let activeStop: (() => void) | null = null;

/** Stops whatever is being read aloud right now, anywhere in the app. */
export function stopSpeaking(): void {
  if (activeStop) {
    const stop = activeStop;
    activeStop = null;
    stop();
  }
}

/**
 * Reads the chunks aloud in order. Only one reply speaks at a time: starting a
 * new one stops the last. Returns a stop function. `onEnd` runs once, whether
 * the reading finished, failed or was stopped.
 */
export function speakChunks(chunks: string[], lang: string, onEnd: () => void): () => void {
  if (!isSpeechSupported() || chunks.length === 0) {
    onEnd();
    return () => {};
  }
  stopSpeaking();

  const synth = window.speechSynthesis;
  let done = false;
  let index = 0;

  const finish = () => {
    if (done) return;
    done = true;
    if (activeStop === stop) activeStop = null;
    onEnd();
  };
  const stop = () => {
    if (done) return;
    done = true;
    if (activeStop === stop) activeStop = null;
    try {
      synth.cancel();
    } catch {
      // Nothing to cancel.
    }
    onEnd();
  };
  activeStop = stop;

  const voice = pickVoice(synth.getVoices(), lang);
  const next = () => {
    if (done) return;
    if (index >= chunks.length) {
      finish();
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance(chunks[index]);
    index += 1;
    utterance.lang = lang;
    if (voice) utterance.voice = voice as SpeechSynthesisVoice;
    utterance.onend = next;
    utterance.onerror = (event) => {
      // "canceled" / "interrupted" is our own stop; anything else ends it too.
      void event;
      finish();
    };
    try {
      synth.speak(utterance);
    } catch {
      finish();
    }
  };

  try {
    synth.cancel();
  } catch {
    // Fresh start either way.
  }
  next();
  return stop;
}
