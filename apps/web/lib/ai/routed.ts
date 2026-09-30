import { classifyAiFailure } from './gateway-error';
import {
  addTraceUsage,
  effectiveRouterMode,
  legacyModelFor,
  nextAfterFailure,
  noteModelCalled,
  routeModel,
  startTrace,
  type RouteSurface,
  type RoutingTrace,
  type TeamForRouting,
} from './model-router';
import { logRoutingTrace } from './routing-log';
import {
  generatePlainTextAiOutput,
  generateStructuredAiOutput,
  type AiJsonSchema,
  type AiMessage,
  type AiUsage,
  type ReasoningEffort,
} from './provider';

/**
 * The single-shot AI features' way in to the model router.
 *
 * Status updates, task outcomes, press-kit drafting and the rollout planner
 * used to call lib/ai/provider.ts with a `model` read from their own env var.
 * They call these instead, and this file is the only thing that knows whether
 * the router is on:
 *
 *   off      the exact call the feature made before, byte for byte
 *   shadow   the same call, plus a record of what the router WOULD have used;
 *            nothing about which model answers, or whether a failure is retried
 *            elsewhere, changes
 *   on       the router's model, and on a failure a bounded move to another one
 *
 * The provider's own retry loop is left alone and runs per model. This wrapper
 * only acts once a model has given up: it asks the router what to do next and,
 * if there is somewhere to go and time to get there, calls again.
 *
 * Chat (UrgAns) has its own transport and does not come through here.
 */

type EnvLike = Record<string, string | undefined>;

export type SingleShotSurface = Exclude<RouteSurface, 'chat' | 'chat_closeout'>;

type RoutedCommon = {
  surface: SingleShotSurface;
  /** Lets the plan cap what a request may climb to. Without it the cap is Manager level. */
  team?: TeamForRouting;
  env?: EnvLike;
  /** Absolute epoch ms. A hop must be able to finish before it. */
  deadlineMs?: number;
  onUsage?: (usage: AiUsage) => void;
  /** Called once when the request finishes, whether it worked or not. */
  onTrace?: (trace: RoutingTrace) => void;
  /** An explicit effort (for the planner, AI_PLANNER_REASONING_EFFORT) beats the rung's. */
  reasoningEffort?: ReasoningEffort;
};

/** What a single attempt is told to use. */
type Attempt = {
  model: string | undefined;
  reasoningEffort: ReasoningEffort | undefined;
  onUsage: (usage: AiUsage) => void;
  /** The attempt calls this when the model answered but the answer was unusable. */
  markBadOutput: () => void;
};

const GATEWAY_DEFAULT_LABEL = 'gateway-default';

async function runRouted<R>(common: RoutedCommon, call: (attempt: Attempt) => Promise<R>): Promise<R> {
  const env = common.env ?? process.env;
  const mode = effectiveRouterMode(common.surface, env);
  const legacyModel = legacyModelFor(common.surface, env);

  if (mode === 'off') {
    return call({
      model: legacyModel,
      reasoningEffort: common.reasoningEffort,
      onUsage: (usage) => common.onUsage?.(usage),
      markBadOutput: () => {},
    });
  }

  const decision = routeModel({ surface: common.surface, team: common.team, env });
  const trace = startTrace(decision, mode);
  const startedAt = Date.now();
  const finish = (failed: boolean) => {
    trace.latencyMs = Date.now() - startedAt;
    common.onTrace?.(trace);
    logRoutingTrace(trace, failed);
  };
  const reportUsage = (usage: AiUsage) => {
    addTraceUsage(trace, usage);
    common.onUsage?.(usage);
  };

  if (mode === 'shadow') {
    trace.wouldUseModel = decision.model;
    noteModelCalled(trace, legacyModel ?? GATEWAY_DEFAULT_LABEL);
    let failed = false;
    try {
      return await call({
        model: legacyModel,
        reasoningEffort: common.reasoningEffort,
        onUsage: reportUsage,
        markBadOutput: () => {},
      });
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      finish(failed);
    }
  }

  let current = decision;
  for (;;) {
    noteModelCalled(trace, current.model);
    let badOutput = false;
    try {
      const value = await call({
        model: current.model,
        reasoningEffort: common.reasoningEffort ?? current.reasoningEffort ?? undefined,
        onUsage: reportUsage,
        markBadOutput: () => {
          badOutput = true;
        },
      });
      trace.endTier = current.tier;
      finish(false);
      return value;
    } catch (error) {
      const classified = classifyAiFailure(error);
      // A parse that returned nothing is the provider throwing a plain Error;
      // the flag is what says it was the answer that was bad, not the gateway.
      const failure = badOutput ? { ...classified, kind: 'bad_output' as const } : classified;
      const next = nextAfterFailure({ decision: current, failure, deadlineMs: common.deadlineMs, env });
      if (!next) {
        trace.endTier = current.tier;
        finish(true);
        throw error;
      }
      trace.hops.push({ from: current.model, to: next.model, kind: failure.kind });
      trace.endTier = next.tier;
      current = next;
    }
  }
}

/** generateStructuredAiOutput, routed. */
export async function generateRoutedStructuredOutput<T>(
  params: RoutedCommon & {
    messages: AiMessage[];
    parse: (raw: string) => T | null;
    invalidFormatMessage?: string;
    jsonSchema?: AiJsonSchema;
    timeoutMs?: number;
    maxRetries?: number;
    temperature?: number;
  }
): Promise<T> {
  const { surface, team, env, deadlineMs, onUsage, onTrace, reasoningEffort, parse, ...rest } = params;
  return runRouted({ surface, team, env, deadlineMs, onUsage, onTrace, reasoningEffort }, (attempt) =>
    generateStructuredAiOutput<T>({
      ...rest,
      model: attempt.model,
      reasoningEffort: attempt.reasoningEffort,
      deadlineMs,
      onUsage: attempt.onUsage,
      parse: (raw) => {
        const value = parse(raw);
        if (value === null || value === undefined) attempt.markBadOutput();
        return value;
      },
    })
  );
}

/** generatePlainTextAiOutput, routed. */
export async function generateRoutedPlainText(
  params: RoutedCommon & {
    messages: AiMessage[];
    timeoutMs?: number;
    maxRetries?: number;
  }
): Promise<string> {
  const { surface, team, env, deadlineMs, onUsage, onTrace, reasoningEffort, ...rest } = params;
  return runRouted({ surface, team, env, deadlineMs, onUsage, onTrace, reasoningEffort }, (attempt) =>
    generatePlainTextAiOutput({
      ...rest,
      model: attempt.model,
      reasoningEffort: attempt.reasoningEffort,
      deadlineMs,
      onUsage: attempt.onUsage,
    })
  );
}
