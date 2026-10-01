import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// The model router is only worth having if nothing can quietly go round it.
// Every rule here is a way that has happened, or nearly happened, elsewhere in
// this codebase: a model id typed into a call site so it never moves when the
// ladder does, an env var read in two places so they drift, a feature that
// calls the provider directly and so is invisible to the router.
//
// This scans the real source rather than asserting a fixed list, so a NEW file
// that breaks a rule fails too. Modelled on lib/release-access-guard.test.ts.
//
//   1. A gateway model id is written in exactly four files: the ladder (the
//      point of it), provider.ts (the gateway default with the router off),
//      planner-model.ts (the planner's default with the router off) and
//      credits/model-prices.ts (what each model costs, which is knowledge about
//      a specific model; model-prices.test.ts fails if a ladder model has no
//      price, so the two cannot drift).
//   2. The provider's two generators are called from one place: routed.ts. A
//      call site that reaches for them directly is a request the router cannot
//      see, route or record.
//   3. The env vars that name a model are read by the router (and the two files
//      that already owned them), nowhere else.
//   4. The chat-completions endpoint is spoken to by two files, provider.ts and
//      the UrgAns runner. A third would be a third transport to route.

const APP_ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = ['lib', 'app', 'components', 'stores'];

const rel = (file: string): string => relative(APP_ROOT, file).split(sep).join('/');

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The lines of a source file that are code, not commentary. Deliberately blunt:
 * a line that starts a comment, or is inside a block comment written the usual
 * way (each line starting `*`), is dropped, and a trailing `// ...` is cut. A
 * `//` with no whitespace before it (a URL) is left alone, so it cannot hide
 * code after it. The cost of being blunt is a false alarm on an unusual comment,
 * which is visible and fixable; the alternative, a false pass, is not.
 */
export function codeLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*'))
    .map((line) => line.replace(/\s\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''));
}

const MODEL_ID_LITERAL =
  /(['"`])(openai|anthropic|google|meta|mistral|deepseek|qwen|xai|x-ai|cohere|amazon|nvidia)\/(gpt-|o\d|claude|llama|gemini|gemma|qwen|mistral|mixtral|deepseek|grok|command|nova)[A-Za-z0-9._:-]*\1/;

const files = SCAN_ROOTS.flatMap((root) => collect(join(APP_ROOT, root)));
const sources = new Map(files.map((file) => [rel(file), codeLines(readFileSync(file, 'utf8'))]));

/** Files (relative to apps/web) whose code matches `pattern`, minus `allowed`. */
function offenders(pattern: RegExp, allowed: string[]): string[] {
  const found: string[] = [];
  for (const [file, lines] of sources) {
    if (allowed.includes(file)) continue;
    if (lines.some((line) => pattern.test(line))) found.push(file);
  }
  return found;
}

describe('the scanner itself', () => {
  it('walks the real source tree (guards against a walker that finds nothing)', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(sources.has('lib/ai/routed.ts')).toBe(true);
    expect(sources.has('lib/chappi/runner.ts')).toBe(true);
  });

  it('reads a model id written into code', () => {
    expect(codeLines("const m = 'openai/gpt-4o-mini';").some((l) => MODEL_ID_LITERAL.test(l))).toBe(true);
    expect(codeLines('const m = "anthropic/claude-3-haiku";').some((l) => MODEL_ID_LITERAL.test(l))).toBe(true);
  });

  it('does not read a path or a bare word as a model id', () => {
    for (const line of ["import x from 'lib/ai/provider';", "const p = 'openai';", "const u = 'openai/';"]) {
      expect(MODEL_ID_LITERAL.test(line)).toBe(false);
    }
  });

  it('ignores commentary that names a model', () => {
    const source = [
      '/**',
      " * Defaults to 'openai/gpt-4o-mini' on rodiumai.io.",
      ' */',
      "// was 'openai/gpt-5.4'",
      "const x = 1; // once 'openai/gpt-5.5'",
    ].join('\n');
    expect(codeLines(source).some((l) => MODEL_ID_LITERAL.test(l))).toBe(false);
  });

  it('is not fooled by a URL: a // inside a string does not hide the code after it', () => {
    const line = "const a = 'https://api.rodiumai.io'; const m = 'openai/gpt-5.4';";
    expect(codeLines(line).some((l) => MODEL_ID_LITERAL.test(l))).toBe(true);
  });
});

const MODEL_ID_FILES = [
  'lib/ai/model-ladder.ts',
  'lib/ai/provider.ts',
  'lib/ai/planner-model.ts',
  'lib/credits/model-prices.ts',
];

describe('a gateway model id is written in exactly four files', () => {
  it('finds it nowhere else', () => {
    expect(offenders(MODEL_ID_LITERAL, MODEL_ID_FILES)).toEqual([]);
  });

  it('still finds it in each of the four (so this rule is checking something)', () => {
    for (const file of MODEL_ID_FILES) {
      expect(sources.get(file)?.some((line) => MODEL_ID_LITERAL.test(line))).toBe(true);
    }
  });
});

describe('every single-shot AI call goes through the router', () => {
  it('calls the provider\'s generators from routed.ts and nowhere else', () => {
    expect(offenders(/\bgenerate(Structured|PlainText)AiOutput\b/, ['lib/ai/provider.ts', 'lib/ai/routed.ts'])).toEqual(
      []
    );
  });

  it('routed.ts really does call both', () => {
    const routed = (sources.get('lib/ai/routed.ts') ?? []).join('\n');
    expect(routed).toMatch(/generateStructuredAiOutput/);
    expect(routed).toMatch(/generatePlainTextAiOutput/);
  });
});

describe('the env vars that name a model are read in one place', () => {
  it('reads the per-feature model vars only in the router and planner-model.ts', () => {
    expect(
      offenders(/\bAI_(PLANNER|STATUS|OUTCOME|PRESSKIT)_MODEL\b/, ['lib/ai/model-router.ts', 'lib/ai/planner-model.ts'])
    ).toEqual([]);
  });

  it('reads CHAPPI_MODEL only in the router and the UrgAns config', () => {
    expect(offenders(/\bCHAPPI_MODEL\b/, ['lib/ai/model-router.ts', 'lib/chappi/config.ts'])).toEqual([]);
  });

  it('reads the router\'s own switches only in the router and the ladder', () => {
    expect(offenders(/\bAI_(ROUTER|LADDER_[A-Z_]+|ROUTER_CEILING_[A-Z]+)\b/, ['lib/ai/model-router.ts', 'lib/ai/model-ladder.ts'])).toEqual(
      []
    );
  });
});

describe('the chat-completions endpoint is spoken to by two files', () => {
  it('finds it in the provider and the UrgAns runner only', () => {
    expect(offenders(/chat\/completions/, ['lib/ai/provider.ts', 'lib/chappi/runner.ts'])).toEqual([]);
  });
});
