import type { AiFailureKind } from './gateway-error';
import {
  MODEL_TIERS,
  clampTier,
  escalateTier,
  isModelTier,
  lowerTier,
  maxTier,
  readLadder,
  tierIndex,
  type Ladder,
  type LadderRung,
  type ModelTier,
} from './model-ladder';
import { RODIUM_PLANNER_MODEL } from './planner-model';
import { isCreditsEnabled } from '../credits/config';
import type { ReasoningEffort } from './provider';

/**
 * The model router: decides which model answers a request.
 *
 * PURE. No I/O, no clock reads it cannot be given, no env reads except through
 * an `env` argument that defaults to process.env at call time. The callers
 * (lib/chappi/runner.ts and the single-shot features) own the requests; this
 * file owns the decisions, so every one of them can be tested without a
 * gateway.
 *
 * What it decides, and why each piece exists (see also model-ladder.ts):
 *
 *   ladder      four rungs, cheapest first, each with same-tier siblings
 *   ceiling     how high a team's plan lets a request climb
 *   floor       the lowest rung a surface may run on (the planner's plan
 *               quality is a feature requirement, not something to trade away)
 *   pins        an explicit per-feature env var still wins and bypasses routing
 *   failures    what to do next when a call fails: sideways, down, or up
 *   deadlines   a hop or escalation must be able to finish in the time left
 *
 * With AI_ROUTER unset (or anything but `on` / `shadow`) none of this runs and
 * every call site behaves exactly as it did before the router existed.
 */

type EnvLike = Record<string, string | undefined>;

export type RouterMode = 'off' | 'shadow' | 'on';

export type RouteSurface =
  | 'chat'
  | 'chat_closeout'
  | 'planner'
  | 'status'
  | 'outcome'
  | 'press_kit';

// ── Switches ─────────────────────────────────────────────────────────────────

/**
 * AI_ROUTER: `on` routes, `shadow` computes and records the decision but keeps
 * using today's model, anything else is off. Deliberately strict: `true`, `1`
 * and `yes` do NOT switch it on, so a habit from the NEXT_PUBLIC_ flags cannot
 * turn on something that changes what every request costs.
 */
export function readRouterMode(env: EnvLike = process.env): RouterMode {
  const raw = String(env.AI_ROUTER ?? '').trim().toLowerCase();
  if (raw === 'on') return 'on';
  if (raw === 'shadow') return 'shadow';
  return 'off';
}

const RODIUM_HOST = /(^|\.)rodiumai\.io$/i;
const DEFAULT_CHAT_BASE = 'https://api.rodiumai.io/v1';

const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

export const isChatSurface = (surface: RouteSurface): boolean =>
  surface === 'chat' || surface === 'chat_closeout';

/**
 * The switch as it applies to one surface. The ladder is a list of RodiumAi
 * catalogue ids, so on any other gateway (OpenRouter, the Zuplo default) those
 * ids do not exist and naming one would turn every request into a 4xx. The
 * router is therefore off there whatever AI_ROUTER says. Chat has its own
 * gateway variable (CHAPPI_API_BASE, defaulting to RodiumAi); the single-shot
 * features read AI_API_BASE, whose default is NOT RodiumAi.
 */
export function effectiveRouterMode(surface: RouteSurface, env: EnvLike = process.env): RouterMode {
  const mode = readRouterMode(env);
  if (mode === 'off') return 'off';
  const base = isChatSurface(surface)
    ? String(env.CHAPPI_API_BASE ?? '').trim() || DEFAULT_CHAT_BASE
    : String(env.AI_API_BASE ?? '').trim();
  return RODIUM_HOST.test(hostnameOf(base)) ? mode : 'off';
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

/** The lowest rung each surface may run on. */
const SURFACE_FLOOR: Record<RouteSurface, ModelTier> = {
  chat: 'quick',
  chat_closeout: 'quick',
  // The planner honours instructions like "no marketing" against a list of up
  // to ~110 tasks and holds a strict JSON schema. A small model gets that wrong
  // in ways that look plausible, so this floor beats any plan ceiling.
  planner: 'pro',
  status: 'quick',
  outcome: 'quick',
  press_kit: 'standard',
};

/** How many times one request may change model. */
const SURFACE_MAX_HOPS: Record<RouteSurface, number> = {
  chat: 2,
  chat_closeout: 1,
  planner: 2,
  status: 2,
  // The outcome sheet gives the model three seconds in all. A second attempt
  // cannot fit, so this surface never hops.
  outcome: 0,
  press_kit: 2,
};

/**
 * The env var that pins a surface to one model, bypassing the router. These are
 * the variables each feature read before the router existed, in the same
 * fallback order, so an existing pin keeps meaning what it meant.
 */
function pinnedModelFor(surface: RouteSurface, env: EnvLike): string | undefined {
  const get = (key: string) => String(env[key] ?? '').trim() || undefined;
  switch (surface) {
    case 'planner':
      return get('AI_PLANNER_MODEL');
    case 'status':
      return get('AI_STATUS_MODEL');
    case 'outcome':
      return get('AI_OUTCOME_MODEL') ?? get('AI_STATUS_MODEL');
    case 'press_kit':
      return get('AI_PRESSKIT_MODEL') ?? get('AI_STATUS_MODEL');
    default:
      return undefined;
  }
}

/**
 * What each surface used before the router existed: the value its call site
 * passed as `model`. Undefined means "the gateway's own default". Used by the
 * call sites when the router is off or in shadow, and recorded on every
 * decision so a shadow log can show what would have changed.
 */
export function legacyModelFor(surface: RouteSurface, env: EnvLike = process.env): string | undefined {
  const get = (key: string) => String(env[key] ?? '').trim() || undefined;
  switch (surface) {
    case 'chat':
    case 'chat_closeout':
      return get('CHAPPI_MODEL');
    case 'planner': {
      const pin = get('AI_PLANNER_MODEL');
      if (pin) return pin;
      const base = String(env.AI_API_BASE ?? '').trim();
      return RODIUM_HOST.test(hostnameOf(base)) ? RODIUM_PLANNER_MODEL : undefined;
    }
    default:
      return pinnedModelFor(surface, env);
  }
}

/**
 * The ladder as this surface sees it. For chat, today's CHAPPI_MODEL is the
 * quick rung's primary model (it is "the one it's currently using"), unless the
 * ladder itself was configured explicitly with AI_LADDER_QUICK.
 */
function ladderFor(surface: RouteSurface, env: EnvLike): Ladder {
  const ladder = readLadder(env);
  if (isChatSurface(surface) && !String(env.AI_LADDER_QUICK ?? '').trim()) {
    const current = String(env.CHAPPI_MODEL ?? '').trim();
    if (current) {
      ladder.quick = { ...ladder.quick, models: Array.from(new Set([current, ...ladder.quick.models])) };
    }
  }
  return ladder;
}

// ── Plan ceiling ─────────────────────────────────────────────────────────────

export type TeamForRouting = { state?: string | null; tier?: string | null };

/**
 * How high a team's plan lets a request climb.
 *
 * Read from `state` AND `tier`, never `tier` alone. resolveTeamTier
 * (lib/entitlements.ts) deliberately reports `label`, which is uncapped, for a
 * trial, a grace period, a comped team, a grandfathered deal and anything
 * unknown, so that seat and release limits never bite during an evaluation.
 * Reading that as a plan would hand every three-day trial the most expensive
 * model. Only a team that is actually paying gets its plan's ceiling; everyone
 * else, and any caller that did not say, is held at Manager level.
 */
export function resolveCeiling(team: TeamForRouting | undefined, env: EnvLike = process.env): ModelTier {
  // With credits on, every plan can use every rung (founder spec, 2026-10-01):
  // plans decide access, credits pay for each use, and the dearer rungs cost
  // more credits. A plan ceiling on top would charge twice for the same limit.
  if (isCreditsEnabled({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: env.NEXT_PUBLIC_FEATURE_URGANS_CREDITS })) {
    return 'max';
  }
  const pick = (key: string, fallback: ModelTier): ModelTier => {
    const value = String(env[key] ?? '').trim().toLowerCase();
    return isModelTier(value) ? value : fallback;
  };
  const unpaid = pick('AI_ROUTER_CEILING_TRIAL', 'pro');
  if (!team || team.state !== 'paid') return unpaid;
  switch (team.tier) {
    case 'solo':
      return pick('AI_ROUTER_CEILING_SOLO', 'standard');
    case 'manager':
      return pick('AI_ROUTER_CEILING_MANAGER', 'pro');
    case 'label':
      return pick('AI_ROUTER_CEILING_LABEL', 'max');
    default:
      return unpaid;
  }
}

// ── Reading a chat turn ──────────────────────────────────────────────────────

export type ChatTurnSignals = {
  /** The latest thing the user said. */
  lastUserText: string;
  /** How many user messages are in the window, this one included. */
  userTurns: number;
};

export type ChatClassification = { tier: ModelTier; score: number; reasons: string[] };

// These are STARTING values. They are rules, not a model, on purpose: no extra
// request, no latency, fully testable. The shadow log and the evaluation are
// where they get calibrated; treat any threshold here as provisional.
const ANALYSIS_CUES: RegExp[] = [
  /\bstrateg(y|ic|ies)\b/i,
  /\banaly[sz](e|is|es)\b/i,
  /\bcompar(e|ing|ison)\b/i,
  /\btrade-?offs?\b/i,
  /\bprioriti[sz](e|ing)\b/i,
  /\brecommend(ation|ations)?\b/i,
  /\bshould (we|i)\b/i,
  /\bwhy (did|is|are|isn'?t|aren'?t|was|were|didn'?t)\b/i,
  /\bwhat('?s| is| would be) the best\b/i,
  /\b(evaluate|assess|audit|forecast|optimi[sz]e)\b/i,
  /\b(go-?to-?market|roadmap|campaign plan|launch plan)\b/i,
];
const SEQUENCE_CUES: RegExp[] = [
  /\b(and then|after that|then also|step by step|for each|for every)\b/i,
  /\b(all|every) (of )?(my|the|our) (releases|rollouts|tasks|activities|artists|shows)\b/i,
  /\bacross (all|every|the next|my)\b/i,
];
const LIST_LINE = /(^|\n)\s*(\d+[.)]|[-*•])\s+\S/g;
const CREATIVE_VERB = /\b(write|draft|rewrite|compose|brainstorm|come up with|generate)\b/i;
const CREATIVE_NOUN =
  /\b(bio|caption|press release|pitch|announcement|email|posts?|ideas|copy|outline|script|story|newsletter|content calendar|tagline|blurb)\b/i;
const RETRY_CUE =
  /\b(that'?s (wrong|not (right|what i)|incorrect)|not what i (asked|meant|wanted)|try again|you (missed|forgot|didn'?t)|still (wrong|not)|redo (it|that|this)|do it again)\b/i;
const LOOKUP_START = /^\s*(what|which|when|who|where|how many|how much|show|list|open|go to|take me|find|tell me|check)\b/i;

const LONG_INPUT_CHARS = 600;
const LONG_BRIEF_CHARS = 200;
const LOOKUP_MAX_CHARS = 120;

/** Which rung a request looks like it needs. */
export function classifyChatTurn(signals: ChatTurnSignals): ChatClassification {
  const text = String(signals.lastUserText ?? '').trim();
  const reasons: string[] = [];
  if (!text) return { tier: 'quick', score: 0, reasons };

  let score = 0;

  const analysisHits = ANALYSIS_CUES.filter((cue) => cue.test(text)).length;
  // Several distinct analysis cues in one message is a heavier ask than one.
  const analysisPoints = analysisHits >= 2 ? 2 : analysisHits;
  if (analysisPoints > 0) {
    score += analysisPoints;
    reasons.push(analysisHits >= 2 ? `analysis cues (${analysisHits})` : 'analysis cue');
  }

  const listLines = (text.match(LIST_LINE) ?? []).length;
  const ands = (text.match(/\band\b/gi) ?? []).length;
  const multiStep = SEQUENCE_CUES.some((cue) => cue.test(text)) || listLines >= 2 || ands >= 4;
  if (multiStep) {
    score += 1;
    reasons.push('multi-step');
  }

  if (CREATIVE_VERB.test(text) && CREATIVE_NOUN.test(text) && text.length >= LONG_BRIEF_CHARS) {
    score += 1;
    reasons.push('long creative brief');
  }

  if (text.length > LONG_INPUT_CHARS) {
    score += 1;
    reasons.push('long input');
  }

  // A correction only means something after there has been an answer to correct.
  const retry = signals.userTurns >= 2 && RETRY_CUE.test(text);
  if (retry) {
    score += 1;
    reasons.push('correction after a first answer');
  }

  // A short question that opens like a lookup ("what should I focus on today?")
  // stays on the quick rung even with one analysis word in it. It does not
  // override a correction or a multi-step ask.
  const looksLikeLookup = text.length <= LOOKUP_MAX_CHARS && LOOKUP_START.test(text);
  if (looksLikeLookup && !retry && !multiStep && score <= 1) {
    if (score > 0) reasons.push('simple lookup kept on quick');
    return { tier: 'quick', score, reasons };
  }

  const tier = MODEL_TIERS[Math.min(score, MODEL_TIERS.length - 1)];
  return { tier, score, reasons };
}

// ── Decisions ────────────────────────────────────────────────────────────────

export type RouteDecision = {
  surface: RouteSurface;
  tier: ModelTier;
  /** The model to call now. */
  model: string;
  /** This rung's models, primary first. */
  models: string[];
  /** Null means the router has no opinion (a pinned model) or never sends one. */
  reasoningEffort: ReasoningEffort | null;
  maxOutputTokens: number;
  reasons: string[];
  /** The highest rung this request may climb to. */
  ceiling: ModelTier;
  /** The lowest rung this surface may run on. */
  floor: ModelTier;
  /** True when an explicit env var chose the model and routing stopped. */
  pinned: boolean;
  maxHops: number;
  hops: number;
  /** Every model tried so far for this request, in order. Never re-tried. */
  tried: string[];
  /** What this surface used before the router existed, for shadow comparison. */
  legacyModel: string | null;
};

export type RouteRequest = {
  surface: RouteSurface;
  /** Required for `chat`; ignored elsewhere. */
  chat?: ChatTurnSignals;
  team?: TeamForRouting;
  env?: EnvLike;
};

/** A decision for a known rung. Trusts its inputs; routeModel does the choosing. */
export function decisionForTier(input: {
  surface: RouteSurface;
  tier: ModelTier;
  ceiling: ModelTier;
  env?: EnvLike;
  reasons?: string[];
}): RouteDecision {
  const env = input.env ?? process.env;
  const rung = ladderFor(input.surface, env)[input.tier];
  const floor = SURFACE_FLOOR[input.surface];
  const model = rung.models[0];
  return {
    surface: input.surface,
    tier: input.tier,
    model,
    models: [...rung.models],
    reasoningEffort: rung.reasoningEffort,
    maxOutputTokens: rung.maxOutputTokens,
    reasons: [...(input.reasons ?? [])],
    ceiling: input.ceiling,
    floor,
    pinned: false,
    maxHops: SURFACE_MAX_HOPS[input.surface],
    hops: 0,
    tried: [model],
    legacyModel: legacyModelFor(input.surface, env) ?? null,
  };
}

/** Choose the model for a request. */
export function routeModel(req: RouteRequest): RouteDecision {
  const env = req.env ?? process.env;
  const surface = req.surface;
  const floor = SURFACE_FLOOR[surface];
  // A floor beats a ceiling: the ceiling is lifted to it rather than left
  // contradicting it.
  const ceiling = maxTier(resolveCeiling(req.team, env), floor);
  const legacyModel = legacyModelFor(surface, env) ?? null;

  const pin = pinnedModelFor(surface, env);
  if (pin) {
    const rung = ladderFor(surface, env)[floor];
    return {
      surface,
      tier: floor,
      model: pin,
      models: [pin],
      reasoningEffort: null,
      maxOutputTokens: rung.maxOutputTokens,
      reasons: ['pinned by env'],
      ceiling,
      floor,
      pinned: true,
      maxHops: 0,
      hops: 0,
      tried: [pin],
      legacyModel,
    };
  }

  let tier: ModelTier = floor;
  const reasons: string[] = [];
  if (surface === 'chat') {
    const classified = classifyChatTurn(req.chat ?? { lastUserText: '', userTurns: 1 });
    tier = classified.tier;
    reasons.push(...classified.reasons);
  }

  // `ceiling` was lifted to the floor above, and `tier` starts at or above it,
  // so clamping can never take a surface below its floor.
  const capped = clampTier(tier, ceiling);
  if (capped !== tier) reasons.push(`capped at ${ceiling} by plan (wanted ${tier})`);
  tier = capped;

  return { ...decisionForTier({ surface, tier, ceiling, env, reasons }), legacyModel };
}

// ── What to do when a call fails ─────────────────────────────────────────────

/** A failure the router can act on: a gateway failure, or the tools failing twice. */
export type RoutingFailure = { kind: AiFailureKind | 'tool_errors'; retryAfterMs?: number };

/** The margin a hop needs beyond the rung's typical latency. */
const HOP_GUARD_MS = 1_500;

/** The smallest cap worth sending: below this an answer is cut off before it says anything. */
export const MIN_USEFUL_OUTPUT_TOKENS = 600;

/** The margin the request keeps before the turn's deadline (the runner's own abort margin). */
const OUTPUT_TIME_MARGIN_MS = 250;

/**
 * The most a rung can be asked to write in the time left. A request that is
 * still writing when the deadline passes is given up on, the user gets an
 * error, and the provider bills the whole answer anyway, so the cap follows the
 * clock instead of assuming the whole turn is free. Never above the rung's own
 * cap, and never below MIN_USEFUL_OUTPUT_TOKENS (a rung that cannot manage even
 * that does not fit, which fits() and fitToDeadline already decide).
 */
export function outputCapForTime(
  rung: Pick<LadderRung, 'maxOutputTokens' | 'startupMs' | 'outputTokensPerSec'>,
  timeLeftMs: number
): number {
  const streamingMs = Math.max(0, timeLeftMs - rung.startupMs - OUTPUT_TIME_MARGIN_MS);
  const fromTime = Math.floor((streamingMs / 1000) * rung.outputTokensPerSec);
  return Math.max(Math.min(MIN_USEFUL_OUTPUT_TOKENS, rung.maxOutputTokens), Math.min(rung.maxOutputTokens, fromTime));
}

const fits = (rung: LadderRung, deadlineMs: number | undefined, now: number): boolean =>
  deadlineMs === undefined || deadlineMs - now >= rung.typicalLatencyMs + HOP_GUARD_MS;

const firstUntried = (models: string[], tried: string[]): string | undefined =>
  models.find((model) => !tried.includes(model));

function hopTo(
  decision: RouteDecision,
  ladder: Ladder,
  tier: ModelTier,
  model: string,
  kind: string,
  time?: { deadlineMs?: number; now: number }
): RouteDecision {
  const rung = ladder[tier];
  const hop = decision.hops + 1;
  return {
    ...decision,
    tier,
    model,
    models: [...rung.models],
    reasoningEffort: rung.reasoningEffort,
    maxOutputTokens:
      time?.deadlineMs === undefined
        ? rung.maxOutputTokens
        : outputCapForTime(rung, time.deadlineMs - time.now),
    hops: hop,
    tried: [...decision.tried, model],
    reasons: [...decision.reasons, `hop ${hop}: ${kind} ${decision.model} -> ${model}`],
  };
}

/**
 * The decision to use after a failure, or null to stop and let the failure
 * through.
 *
 *   rate limited / unavailable / server error   sideways to the same-tier
 *       sibling first (it has its own limit), then down a rung
 *   timeout                                     down a rung (a same-speed
 *       sibling will not be faster), or sideways if there is nowhere lower
 *   bad output / tools failing twice            up one rung, within the plan
 *       ceiling, and only if the slower rung can still finish in time
 *   anything else                               stop: no other model fixes a
 *       wrong key, an empty balance or a malformed request
 *
 * Bounded by maxHops, never revisits a model, never goes below the surface's
 * floor, and every hop must fit in the time left.
 */
export function nextAfterFailure(input: {
  decision: RouteDecision;
  failure: RoutingFailure;
  deadlineMs?: number;
  now?: number;
  env?: EnvLike;
  ladder?: Ladder;
}): RouteDecision | null {
  const { decision, failure, deadlineMs } = input;
  if (decision.pinned || decision.hops >= decision.maxHops) return null;

  const ladder = input.ladder ?? ladderFor(decision.surface, input.env ?? process.env);
  const now = input.now ?? Date.now();
  const kind = failure.kind;

  const sideways = (): RouteDecision | null => {
    const model = firstUntried(decision.models, decision.tried);
    return model && fits(ladder[decision.tier], deadlineMs, now) ? hopTo(decision, ladder, decision.tier, model, kind, { deadlineMs, now }) : null;
  };

  const down = (): RouteDecision | null => {
    let tier = lowerTier(decision.tier);
    while (tier && tierIndex(tier) >= tierIndex(decision.floor)) {
      const model = firstUntried(ladder[tier].models, decision.tried);
      if (model && fits(ladder[tier], deadlineMs, now)) return hopTo(decision, ladder, tier, model, kind, { deadlineMs, now });
      tier = lowerTier(tier);
    }
    return null;
  };

  const up = (): RouteDecision | null => {
    const tier = escalateTier(decision.tier);
    if (!tier || tierIndex(tier) > tierIndex(decision.ceiling)) return null;
    const model = firstUntried(ladder[tier].models, decision.tried);
    return model && fits(ladder[tier], deadlineMs, now) ? hopTo(decision, ladder, tier, model, kind, { deadlineMs, now }) : null;
  };

  switch (kind) {
    case 'rate_limited':
    case 'model_unavailable':
    case 'server':
      return sideways() ?? down();
    case 'timeout':
      return down() ?? sideways();
    case 'bad_output':
    case 'tool_errors':
      return up();
    default:
      return null;
  }
}

/**
 * Hold a decision to the time left: the same decision if its rung can finish,
 * otherwise the fastest rung at or above the floor that can. Not a hop, so
 * `hops` is unchanged. Null means nothing fits and the caller should stop.
 * A pinned model is never second-guessed.
 */
export function fitToDeadline(
  decision: RouteDecision,
  options: { deadlineMs?: number; now?: number; env?: EnvLike; ladder?: Ladder }
): RouteDecision | null {
  const { deadlineMs } = options;
  if (deadlineMs === undefined || decision.pinned) return decision;

  const now = options.now ?? Date.now();
  const ladder = options.ladder ?? ladderFor(decision.surface, options.env ?? process.env);
  if (fits(ladder[decision.tier], deadlineMs, now)) {
    const cap = Math.min(decision.maxOutputTokens, outputCapForTime(ladder[decision.tier], deadlineMs - now));
    if (cap >= decision.maxOutputTokens) return decision;
    return { ...decision, maxOutputTokens: cap, reasons: [...decision.reasons, `time: output capped at ${cap}`] };
  }

  let tier = lowerTier(decision.tier);
  while (tier && tierIndex(tier) >= tierIndex(decision.floor)) {
    if (fits(ladder[tier], deadlineMs, now)) {
      const rung = ladder[tier];
      const model = firstUntried(rung.models, decision.tried) ?? rung.models[0];
      return {
        ...decision,
        tier,
        model,
        models: [...rung.models],
        reasoningEffort: rung.reasoningEffort,
        maxOutputTokens: outputCapForTime(rung, deadlineMs - now),
        tried: decision.tried.includes(model) ? decision.tried : [...decision.tried, model],
        reasons: [...decision.reasons, `time: ${decision.tier} -> ${tier}`],
      };
    }
    tier = lowerTier(tier);
  }
  return null;
}

// ── What happened, for the log ───────────────────────────────────────────────

export type RoutingTrace = {
  mode: RouterMode;
  surface: RouteSurface;
  startTier: ModelTier;
  endTier: ModelTier;
  ceiling: ModelTier;
  /** Models actually called, in order. */
  models: string[];
  hops: Array<{ from: string; to: string; kind: string }>;
  reasons: string[];
  rounds?: number;
  /** Null means the gateway never reported it, which is not the same as zero. */
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  legacyModel?: string | null;
  /** In shadow: the model the router would have used. */
  wouldUseModel?: string;
  /** Set when the turn was cut short: it ran out of time before it finished. */
  degraded?: 'deadline';
};

/**
 * A trace for a request the router did not route (the router is off, or a
 * shadow run that kept today's model). The tier fields read `quick` because the
 * configured model is the quick rung's model; `mode` is what says nothing was
 * decided. Fresh arrays every time, so one request cannot write into another.
 */
export function startUnroutedTrace(surface: RouteSurface, model: string | null): RoutingTrace {
  return {
    mode: 'off',
    surface,
    startTier: 'quick',
    endTier: 'quick',
    ceiling: 'quick',
    models: [],
    hops: [],
    reasons: [],
    tokensIn: null,
    tokensOut: null,
    latencyMs: 0,
    legacyModel: model,
  };
}

/** The start of a trace for a request about to be made under `decision`. */
export function startTrace(decision: RouteDecision, mode: RouterMode): RoutingTrace {
  return {
    mode,
    surface: decision.surface,
    startTier: decision.tier,
    endTier: decision.tier,
    ceiling: decision.ceiling,
    models: [],
    hops: [],
    reasons: [...decision.reasons],
    tokensIn: null,
    tokensOut: null,
    latencyMs: 0,
    legacyModel: decision.legacyModel,
  };
}

/** Note that `model` was called (consecutive repeats collapse). */
export function noteModelCalled(trace: RoutingTrace, model: string): void {
  if (trace.models[trace.models.length - 1] !== model) trace.models.push(model);
}

/** Add one call's token usage. A call that reported nothing leaves the totals alone. */
export function addTraceUsage(
  trace: RoutingTrace,
  usage: { promptTokens: number | null; completionTokens: number | null } | null | undefined
): void {
  if (!usage) return;
  if (usage.promptTokens !== null) trace.tokensIn = (trace.tokensIn ?? 0) + usage.promptTokens;
  if (usage.completionTokens !== null) trace.tokensOut = (trace.tokensOut ?? 0) + usage.completionTokens;
}

const MAX_TRACE_MODELS = 6;
const MAX_TRACE_HOPS = 4;
const MAX_TRACE_REASONS = 6;
const MAX_TRACE_REASON_CHARS = 80;

/**
 * A trace as small, flat fields for `billing_events.metadata`. Bounded however
 * long the trace is, and token counts stay null when the gateway did not report
 * them.
 */
export function summarizeTrace(trace: RoutingTrace): Record<string, unknown> {
  return {
    mode: trace.mode,
    surface: trace.surface,
    start_tier: trace.startTier,
    end_tier: trace.endTier,
    ceiling: trace.ceiling,
    models: trace.models.slice(0, MAX_TRACE_MODELS),
    hop_count: trace.hops.length,
    hops: trace.hops.slice(0, MAX_TRACE_HOPS),
    reasons: trace.reasons.slice(0, MAX_TRACE_REASONS).map((reason) => reason.slice(0, MAX_TRACE_REASON_CHARS)),
    rounds: trace.rounds ?? null,
    tokens_in: trace.tokensIn,
    tokens_out: trace.tokensOut,
    latency_ms: trace.latencyMs,
    legacy_model: trace.legacyModel ?? null,
    would_use_model: trace.wouldUseModel ?? null,
    degraded: trace.degraded ?? null,
  };
}
