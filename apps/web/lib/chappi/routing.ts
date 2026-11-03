import { classifyAiFailure } from '@/lib/ai/gateway-error';
import {
  effectiveRouterMode,
  routeModel,
  startTrace,
  summarizeTrace,
  type ChatTurnSignals,
  type RoutingTrace,
  type TeamForRouting,
} from '@/lib/ai/model-router';
import type { ChatRouting } from './runner';
import type { ChappiMessage } from './types';

/**
 * What /api/urgans needs from the model router, kept out of the route so it can
 * be tested without a request. Everything here is a decision or a reshaping; the
 * requests themselves are runner.ts's.
 */

type EnvLike = Record<string, string | undefined>;

/**
 * How long a turn may run. The route's ceiling is 60s (`maxDuration`); the turn
 * stops itself eight seconds short so there is still time to record it and
 * answer the client, which a run that only stops when Vercel kills it never has.
 */
export const TURN_BUDGET_MS = 52_000;

/** What the classifier reads of a conversation: the last thing said, and how far in we are. */
export function chatSignals(messages: ChappiMessage[]): ChatTurnSignals {
  const users = messages.filter((message) => message.role === 'user');
  return { lastUserText: users[users.length - 1]?.content ?? '', userTurns: users.length };
}

export type ChatRoutingPlan =
  /** Not routing. The turn runs exactly as it did before the router existed. */
  | { mode: 'off' }
  /** Deciding and recording only. The turn still runs on today's model. */
  | { mode: 'shadow'; trace: RoutingTrace }
  /** Routing for real. */
  | { mode: 'on'; routing: ChatRouting };

/**
 * The plan for one chat turn. `team` is the caller's TeamAccessSnapshot; only its
 * `state` and `tier` are read, and both are needed (see resolveCeiling: `tier`
 * alone reports the uncapped flagship for a trial).
 */
export function planChatRouting(input: {
  messages: ChappiMessage[];
  team: TeamForRouting | undefined;
  /** The reply will be streamed, which raises the output cap (RouteDecision.streaming). */
  streaming?: boolean;
  env?: EnvLike;
  now?: () => number;
}): ChatRoutingPlan {
  const env = input.env ?? process.env;
  const mode = effectiveRouterMode('chat', env);
  if (mode === 'off') return { mode: 'off' };

  const decision = routeModel({
    surface: 'chat',
    chat: chatSignals(input.messages),
    team: input.team,
    streaming: input.streaming,
    env,
  });

  if (mode === 'shadow') {
    const trace = startTrace(decision, 'shadow');
    trace.wouldUseModel = decision.model;
    return { mode: 'shadow', trace };
  }

  const now = input.now ?? Date.now;
  return {
    mode: 'on',
    routing: {
      decision,
      closeoutDecision: routeModel({ surface: 'chat_closeout', team: input.team, env }),
      deadlineMs: now() + TURN_BUDGET_MS,
      now: input.now,
      // Carried so a hop reads the ladder the decision was made under. Left
      // undefined when the caller did not choose one, so the runner reads the
      // process env at the moment it needs it, as everything else does.
      env: input.env,
    },
  };
}

/**
 * The closing line after an approved card. Only a live router changes anything
 * here (shadow never changes which model answers), and it is always the cheap
 * rung: the action has already run and the model is only saying so.
 */
export function planCloseoutRouting(input: { env?: EnvLike } = {}): Pick<ChatRouting, 'decision' | 'env'> | undefined {
  const env = input.env ?? process.env;
  if (effectiveRouterMode('chat_closeout', env) !== 'on') return undefined;
  return { decision: routeModel({ surface: 'chat_closeout', env }), env: input.env };
}

/**
 * A shadow turn, finished. The shadow trace holds what the router WOULD have done;
 * `actual` is the (unrouted) run that really happened. Joined, one record says
 * both, which is what a shadow log is for. Returns a new object.
 */
export function completeShadowTrace(shadow: RoutingTrace, actual: RoutingTrace): RoutingTrace {
  return {
    ...shadow,
    hops: [...shadow.hops],
    reasons: [...shadow.reasons],
    models: [...actual.models],
    tokensIn: actual.tokensIn,
    tokensOut: actual.tokensOut,
    latencyMs: actual.latencyMs,
    rounds: actual.rounds,
  };
}

/**
 * What to store on the billing event for a turn. Nothing for a turn the router
 * did not touch, so with the router off the row is byte for byte what it was.
 */
export function routingMetadata(trace: RoutingTrace): { routing: Record<string, unknown> } | undefined {
  if (trace.mode === 'off') return undefined;
  return { routing: summarizeTrace(trace) };
}

export type AgentErrorDescription = {
  status: 503 | 504;
  message: string;
  /**
   * What the log should say about it, when it should say anything. A slow model or
   * a busy gateway is ordinary and logs nothing here; the other three do:
   *   balance      the provider balance is empty. No model helps, a person must top it up.
   *   credentials  the key was rejected. A person must fix it.
   *   unexpected   none of the above and not understood, so worth reading later.
   */
  alert?: 'balance' | 'credentials' | 'unexpected';
};

/**
 * What to tell the client, and whether to shout, when a turn threw. Replaces a
 * message-pattern match in the route: /rate[- ]limit/ never matched the gateway's
 * own `rate_limit_exceeded`, so a real 429 was reported as "unavailable".
 */
export function describeAgentError(error: unknown): AgentErrorDescription {
  const failure = classifyAiFailure(error);
  switch (failure.kind) {
    case 'timeout':
      return { status: 504, message: 'AI took too long. Try again.' };
    case 'rate_limited':
      return { status: 503, message: 'AI is busy. Try again in a moment.' };
    case 'insufficient_balance':
      return { status: 503, message: 'AI is unavailable right now.', alert: 'balance' };
    case 'auth':
      return { status: 503, message: 'AI is unavailable right now.', alert: 'credentials' };
    default:
      return { status: 503, message: 'AI is unavailable right now.', alert: 'unexpected' };
  }
}

/** The line the route writes for each kind of alert. */
export const AGENT_ALERT_LOG_LINES: Record<NonNullable<AgentErrorDescription['alert']>, string> = {
  balance: '[chappi] gateway balance exhausted, AI is down until it is topped up:',
  credentials: '[chappi] gateway rejected the API key, AI is down until it is fixed:',
  unexpected: '[chappi] agent run failed:',
};
