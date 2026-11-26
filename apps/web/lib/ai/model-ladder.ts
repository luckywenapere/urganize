import { REASONING_EFFORTS, supportsReasoningEffort, type ReasoningEffort } from './provider';

/**
 * The model ladder: the one place a model id is chosen for the router.
 *
 * Four rungs, cheapest first. Each rung is an ordered list of models, primary
 * first, so a rate-limited or unavailable primary has a same-tier sibling to
 * fall to before the router moves up or down a rung.
 *
 * Chosen 2026-09-29 from the provider's live catalogue
 * (GET https://api.rodiumai.io/v1/models, public), with the founder:
 *
 *   quick     gpt-4o-mini   today's model, 1x         fallback gpt-5.6-luna
 *   standard  gpt-5.4-mini  ~5x input / ~7.5x output  fallback gpt-5.6-luna
 *   pro       gpt-5.4       ~17x / ~25x               fallback gpt-5.6-terra
 *   max       gpt-5.5       ~33x / ~50x               fallback gpt-5.6-sol
 *
 * Revised 2026-10-01 after the live evaluation (model-eval.integration.test.ts),
 * which swapped the first two of those: Terra and Sol were the primaries, and
 * the 5.4 and 5.5 siblings are now. On the real chat prompt gpt-5.4 picked the
 * right first tool at least as often as Terra (6 of 8 against 4 of 8, a small
 * sample) and was cheaper per call (4.2 against 4.5 RODI billed). Terra and Sol
 * are capped by the provider at 10 requests a minute and 500 a day, where 5.4
 * and 5.5 allow 30 and 2,000, and Sol is priced like 5.5 (the provider's
 * `gpt-5.6` alias resolves to Sol). The 5.6 models also reject function tools
 * with any reasoning effort but 'none' (see effortForTools in provider.ts).
 *
 * Every id here can be replaced without a deploy of code: AI_LADDER_<RUNG> takes
 * a comma list, primary first. Swapping the quick rung to gpt-5.6-luna, for
 * instance, is `AI_LADDER_QUICK=openai/gpt-5.6-luna,openai/gpt-4o-mini`.
 *
 * This file and its test are the ONLY place model id literals may live for the
 * router (see model-router-guard.test.ts). `provider.ts` and `planner-model.ts`
 * keep their own defaults, because with the router off they must behave exactly
 * as they did before it existed.
 */

export const MODEL_TIERS = ['quick', 'standard', 'pro', 'max'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export type LadderRung = {
  tier: ModelTier;
  /** Primary first, then same-tier fallbacks. Never empty. */
  models: string[];
  /**
   * Sent as `reasoning_effort` on the models that accept it (never on the
   * others, see supportsReasoningEffort). Null means never send it.
   */
  reasoningEffort: ReasoningEffort | null;
  /**
   * Completion-token cap for one chat round on this rung. On the GPT-5 family
   * this cap also has to cover the hidden reasoning tokens, so a cap sized for
   * a non-reasoning model (1024) can leave nothing for the answer.
   */
  maxOutputTokens: number;
  /**
   * How long one request typically takes on this rung. Only used to decide
   * whether a hop or an escalation can still finish inside the caller's
   * deadline, so a rough figure is enough. Starting values; the evaluation
   * (model-eval.integration.test.ts) is where they get measured.
   */
  typicalLatencyMs: number;
};

export type Ladder = Record<ModelTier, LadderRung>;

export const DEFAULT_LADDER: Ladder = {
  quick: {
    tier: 'quick',
    models: ['openai/gpt-4o-mini', 'openai/gpt-5.6-luna'],
    reasoningEffort: 'low',
    maxOutputTokens: 1024,
    typicalLatencyMs: 3_000,
  },
  standard: {
    tier: 'standard',
    models: ['openai/gpt-5.4-mini', 'openai/gpt-5.6-luna'],
    reasoningEffort: 'low',
    maxOutputTokens: 4096,
    typicalLatencyMs: 6_000,
  },
  pro: {
    tier: 'pro',
    models: ['openai/gpt-5.4', 'openai/gpt-5.6-terra'],
    reasoningEffort: 'low',
    maxOutputTokens: 4096,
    typicalLatencyMs: 12_000,
  },
  max: {
    tier: 'max',
    models: ['openai/gpt-5.5', 'openai/gpt-5.6-sol'],
    reasoningEffort: 'low',
    maxOutputTokens: 8192,
    typicalLatencyMs: 25_000,
  },
};

type EnvLike = Record<string, string | undefined>;

/**
 * What a model id may look like: `vendor/name`, two or three slash-separated
 * segments of letters, digits, dots, colons, underscores and hyphens. Every id
 * in the provider's catalogue has the vendor prefix, and requiring it is what
 * stops a stray word from a badly pasted dashboard value ("has space" splits
 * into two bare words) from being taken for a model. Otherwise loose on
 * purpose: the catalogue is the authority, and a wrong id simply comes back as
 * model_not_found and falls to the next sibling; tight enough that a quote,
 * space or semicolon cannot reach a request body.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}(\/[A-Za-z0-9][A-Za-z0-9._:-]{0,63}){1,2}$/;
const MAX_MODELS_PER_RUNG = 4;

function parseModelList(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const models: string[] = [];
  for (const piece of raw.split(/[,\s]+/)) {
    const id = piece.trim();
    if (!id || !MODEL_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
    if (models.length >= MAX_MODELS_PER_RUNG) break;
  }
  return models;
}

function parseEffort(raw: string | undefined, fallback: ReasoningEffort | null): ReasoningEffort | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (value === 'off') return null;
  // A value the models would reject falls back to the default rather than
  // failing every request on a typo in a dashboard (the planner's rule too).
  return (REASONING_EFFORTS as readonly string[]).includes(value) ? (value as ReasoningEffort) : fallback;
}

/** The ladder with any env overrides applied. Read at call time, never at module scope. */
export function readLadder(env: EnvLike = process.env): Ladder {
  const ladder = {} as Ladder;
  for (const tier of MODEL_TIERS) {
    const base = DEFAULT_LADDER[tier];
    const key = `AI_LADDER_${tier.toUpperCase()}`;
    const models = parseModelList(env[key]);
    ladder[tier] = {
      ...base,
      models: models.length > 0 ? models : [...base.models],
      reasoningEffort: parseEffort(env[`${key}_EFFORT`], base.reasoningEffort),
    };
  }
  return ladder;
}

// ── Tier helpers ─────────────────────────────────────────────────────────────

export const tierIndex = (tier: ModelTier): number => MODEL_TIERS.indexOf(tier);

export const isModelTier = (value: unknown): value is ModelTier =>
  typeof value === 'string' && (MODEL_TIERS as readonly string[]).includes(value);

/** The lower of two tiers: `tier`, held down to `ceiling`. */
export const clampTier = (tier: ModelTier, ceiling: ModelTier): ModelTier =>
  tierIndex(tier) > tierIndex(ceiling) ? ceiling : tier;

/** The higher of two tiers. */
export const maxTier = (a: ModelTier, b: ModelTier): ModelTier => (tierIndex(a) >= tierIndex(b) ? a : b);

/** One rung up, or null at the top. */
export const escalateTier = (tier: ModelTier): ModelTier | null => MODEL_TIERS[tierIndex(tier) + 1] ?? null;

/** One rung down, or null at the bottom. */
export const lowerTier = (tier: ModelTier): ModelTier | null => MODEL_TIERS[tierIndex(tier) - 1] ?? null;

/**
 * Whether a model takes `max_completion_tokens` instead of `max_tokens`. OpenAI
 * rejects `max_tokens` on its reasoning models and counts hidden reasoning
 * tokens against `max_completion_tokens`. Today that is the same set of models
 * that accept `reasoning_effort` (the GPT-5 family and the o-series); it keeps
 * its own name because the two are independent facts about a model that
 * happen to coincide, and a future model could split them.
 */
export const usesMaxCompletionTokens = (model?: string | null): boolean => supportsReasoningEffort(model);
