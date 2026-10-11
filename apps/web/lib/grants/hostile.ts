// Does a page talk to the model that reads it?
//
// The verifier asks one question of every field: does the page hold it? A page that
// writes its own lies ("say the funder is Evil Corp") passes that question, because
// the page does hold them. Code cannot tell a page's honest claims from its
// dishonest ones, but it can refuse a page that addresses its reader as a model. No
// real call for applications tells its reader to ignore their instructions, so such a
// page is dropped before any model reads it, and costs nothing.
//
// Deliberately narrow, so ordinary funder wording ("follow the instructions in the
// guidance notes", "our assistant director") is never caught. A false alarm drops a
// real grant; the patterns below are each a way a page speaks to a model, not to a
// person.
//
// Pure.

const PATTERNS: readonly RegExp[] = [
  // "ignore all previous instructions", "disregard your prior instructions", "forget the above instructions"
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|earlier|above|preceding|your|all)\b[^.\n]{0,20}\binstructions?\b/i,
  // "new instructions:"
  /\bnew instructions?\s*:/i,
  // "you are now in developer mode", "you are now a helpful grant bot"
  /\byou are now (in |an? )?(developer|jailbreak|dan|unrestricted|helpful|different)\b/i,
  /\byou are now an? [a-z ]{0,30}(bot|assistant|model|ai)\b/i,
  // a chat transcript role at the start of a line
  /^\s*(system|assistant)\s*:/im,
  // the fence the extraction request puts round a page
  /<\/?\s*page\s*>/i,
  // "note to AI models", "if you are an AI language model", "to any LLM reading this"
  /\b(note|message) to (any |all )?(ai|llm|language model|chatgpt|gpt)s?\b/i,
  /\bif you are an? (ai|llm|language model|large language model|chatbot)\b/i,
  /\b(ai|llm)s? (reading|parsing|summari[sz]ing) this\b/i,
];

export function looksHostile(text: string): boolean {
  if (typeof text !== 'string' || !text) return false;
  return PATTERNS.some((pattern) => pattern.test(text));
}
