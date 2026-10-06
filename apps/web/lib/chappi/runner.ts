// Chappi agentic loop (SERVER-ONLY). One sanctioned home for the tool-calling
// transport — OpenAI-protocol chat completions against the RodiumAi gateway —
// mirroring provider.ts's discipline (timeout, bounded rounds). Rewritten
// 2026-08-13 off the Anthropic SDK: RodiumAi's /v1/messages is Anthropic-only
// ("Claude-first MVP"), and the founder call is to run UrgAns on RodiumAi
// instead of Anthropic. The free-tier meta/llama-* models were tried first but
// are geo-blocked at the AWS Bedrock license level for this account's region —
// see getChappiModelConfig's comment. openai/gpt-4o-mini is the verified-working
// substitute, served through /v1/chat/completions with OpenAI-style
// tools/tool_calls. Plain fetch, no SDK dependency. Non-streaming this phase.
//
// Model routing (2026-09-29): a caller may hand this loop a RouteDecision from
// lib/ai/model-router.ts. Without one the loop behaves exactly as it did before
// the router existed: the configured model, no reasoning parameter, the same
// request body. With one, the decision picks the model and its settings, and
// the loop asks the router what to do when a call fails, when the tools keep
// failing, and when the clock is running out. The decisions are the router's
// (and pure); this file only carries them out.

import { getChappiModelConfig } from './config';
import { getChappiTool, getChappiToolSchemas } from './tools';
import type { ChappiTool, ChappiToolContext } from './tools';
import { executeToolCall } from './dispatch';
import { stripModelMarkup } from '@/lib/model-markup';
import { buildUserModelContent, type ModelUserPart } from '@/lib/urgans-attachments';
import { GatewayError, classifyAiFailure, gatewayErrorFromResponse } from '@/lib/ai/gateway-error';
import { usesMaxCompletionTokens } from '@/lib/ai/model-ladder';
import { SseReader, StreamAccumulator, type StreamSummary } from '@/lib/ai/sse-stream';
import {
  addTraceUsage,
  fitToDeadline,
  nextAfterFailure,
  noteModelCalled,
  startTrace,
  startUnroutedTrace,
  type RouteDecision,
  type RoutingFailure,
  type RoutingTrace,
} from '@/lib/ai/model-router';
import { logRoutingTrace } from '@/lib/ai/routing-log';
import { attachUsageToError, type FailedCall } from '@/lib/ai/usage-log';
import {
  effortForTools,
  extractAiUsage,
  extractCachedTokens,
  supportsReasoningEffort,
  type AiUsage,
  type ReasoningEffort,
} from '@/lib/ai/provider';
import type { UsageCall } from '@/lib/credits/pricing';
import type {
  ChappiClientAction,
  ChappiMessage,
  ChappiPendingConfirmation,
  ChappiToolName,
  ChappiToolResult,
} from './types';

// Cap on tool round-trips per user turn. A realistic request ("create a release
// and add three tasks") needs a handful; the cap stops runaway token spend and
// keeps the whole run inside the route's 60s maxDuration.
const MAX_ROUNDS = 5;
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45_000;

// A routed request is given up on shortly before the turn's deadline rather
// than being allowed to run out the full 45 seconds past it.
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const ABORT_MARGIN_MS = 250;

// Two failed tool calls in one turn say the model is struggling with the job.
// One is ordinary (a stale id, a missing record) and not worth a dearer model.
const TOOL_FAILURES_BEFORE_ESCALATION = 2;

const DEADLINE_MESSAGE =
  'That took longer than I had time for, so I stopped part-way. Ask me to carry on and I will pick it up.';
const DEADLINE_NOTE = 'I ran out of time before I could finish. Ask me to carry on and I will.';
const LENGTH_NOTE = 'That answer was cut short. Ask me to carry on and I will pick it up from there.';

// ── OpenAI chat-completions wire shapes (minimal structural views) ─────────

type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type OpenAiChatMessage =
  | { role: 'system' | 'assistant'; content: string }
  // A user turn is a string unless it carries a photo, then a list of parts.
  | { role: 'user'; content: string | ModelUserPart[] }
  | { role: 'assistant'; content: string | null; tool_calls: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/**
 * Converts the client's conversation history into what goes back to the
 * model, stripping markdown syntax off the ASSISTANT's own turns only (a
 * user's own words are never touched). Without this, UrgAns's own past
 * "**Setup:**"-style replies stay in the conversation as an example it keeps
 * imitating — the raw text is what's rendered on screen, so it's also what
 * gets sent back as history on every later turn.
 *
 * Strip-then-drop, not drop-then-strip: a message that was ONLY markup
 * syntax (a bare `---`, say) strips to empty and is correctly dropped, where
 * checking blankness on the raw text first would have kept it.
 */
export function toModelHistory(messages: ChappiMessage[]): OpenAiChatMessage[] {
  const out: OpenAiChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const content = stripModelMarkup(m.content);
      if (content.trim()) out.push({ role: 'assistant', content });
      continue;
    }
    // A user turn may carry a photo or a text file (lib/urgans-attachments.ts).
    // With none, this is the string it always was.
    const content = buildUserModelContent(m.content, m.attachments);
    if (typeof content === 'string' ? content.trim() : content.length > 0) {
      out.push({ role: 'user', content });
    }
  }
  return out;
}

type OpenAiChoice = {
  message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
  finish_reason?: string;
};

type ChatCompletion = { choice: OpenAiChoice; usage: AiUsage | null; cachedTokens: number | null };

/**
 * Tool arguments as the model sent them. `valid` is false when a non-empty
 * string did not parse to an object: the call still runs, with empty arguments,
 * exactly as it always has, but the router counts it as the model struggling.
 * An empty string is valid: some models send `""` for a tool with no
 * parameters, and that is not a mistake.
 */
export function parseToolArguments(raw: string): { args: Record<string, unknown>; valid: boolean } {
  if (!raw.trim()) return { args: {}, valid: true };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { args: parsed as Record<string, unknown>, valid: true };
    return { args: {}, valid: false };
  } catch {
    return { args: {}, valid: false };
  }
}

// ── Request parameters the gateway may reject ───────────────────────────────

export type TokenParam = 'max_tokens' | 'max_completion_tokens';

/**
 * The token-cap parameter a model is sent before the gateway has said otherwise.
 * Exported so the evaluation (lib/ai/model-eval.integration.test.ts) asks the
 * gateway the question the runner will really ask, not a copy of it.
 */
export const defaultTokenParam = (model: string): TokenParam =>
  usesMaxCompletionTokens(model) ? 'max_completion_tokens' : 'max_tokens';

const otherTokenParam = (param: TokenParam): TokenParam =>
  param === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';

const PARAM_REJECTION =
  /unsupported|unrecognized|not supported|unknown (request )?(parameter|argument|field)|not allowed|not permitted|extra inputs/i;
const NAMED_PARAM =
  /(?:unsupported|unrecognized|unknown|not allowed)[^.]{0,80}?\b(max_completion_tokens|max_tokens)\b/i;
const EFFORT_REJECTION = /reasoning/i;

/**
 * If a 400 says the token-cap parameter we sent is not accepted, the one to send
 * instead; otherwise null. OpenAI's own wording names both parameters ("'max_tokens'
 * is not supported with this model. Use 'max_completion_tokens' instead"), so the
 * one it calls unsupported is read out first and only that one counts.
 */
export function tokenParamAfterRejection(sent: TokenParam, message: string): TokenParam | null {
  if (!PARAM_REJECTION.test(message)) return null;
  const named = NAMED_PARAM.exec(message)?.[1]?.toLowerCase();
  const rejected = named ?? (new RegExp(`\\b${sent}\\b`, 'i').test(message) ? sent : null);
  return rejected === sent ? otherTokenParam(sent) : null;
}

/** What one turn has learned about a model's parameters, so it asks each question once. */
type Quirks = { noEffort: Set<string>; tokenParam: Map<string, TokenParam> };
const newQuirks = (): Quirks => ({ noEffort: new Set(), tokenParam: new Map() });

/**
 * The request body for one chat round. Pure, and the only place it is built, so
 * what the evaluation sends is what a turn sends. The key order is part of the
 * contract: with no router and no effort it is `model, messages, max_tokens,
 * stream, tools`, the body this loop has always sent, and a test pins it.
 */
export function buildChatCompletionBody(params: {
  model: string;
  messages: OpenAiChatMessage[];
  tools?: ReturnType<typeof getChappiToolSchemas>;
  maxOutputTokens: number;
  tokenParam: TokenParam;
  reasoningEffort: ReasoningEffort | null;
  /** Ask the gateway to stream the answer. Off, the body is the one this loop has always sent. */
  stream?: boolean;
}): Record<string, unknown> {
  const hasTools = Boolean(params.tools?.length);
  const effort = hasTools ? effortForTools(params.model, params.reasoningEffort) : params.reasoningEffort;
  return {
    model: params.model,
    messages: params.messages,
    [params.tokenParam]: params.maxOutputTokens,
    ...(effort ? { reasoning_effort: effort } : {}),
    stream: params.stream === true,
    // Without this a stream ends without saying what it cost, and credits could
    // only be charged from an estimate.
    ...(params.stream === true ? { stream_options: { include_usage: true } } : {}),
    ...(params.tools?.length ? { tools: params.tools } : {}),
  };
}

async function requestChatCompletion(params: {
  apiKey: string;
  baseURL: string;
  model: string;
  messages: OpenAiChatMessage[];
  tools?: ReturnType<typeof getChappiToolSchemas>;
  maxOutputTokens: number;
  tokenParam: TokenParam;
  reasoningEffort: ReasoningEffort | null;
  timeoutMs?: number;
  /** Given, the answer is streamed and each piece of text is handed to this as it arrives. */
  onText?: (delta: string) => void;
}): Promise<ChatCompletion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${params.baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(buildChatCompletionBody({ ...params, stream: Boolean(params.onText) })),
      signal: controller.signal,
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      throw gatewayErrorFromResponse({
        status: response.status,
        rawText,
        retryAfter: response.headers?.get?.('retry-after') ?? null,
      });
    }

    // A gateway that was asked to stream but answered plain JSON is read as
    // plain JSON, below.
    const streamed = params.onText ? await readStreamedCompletion(response, params.onText) : null;
    if (streamed) return streamed;

    const payload = (await response.json().catch(() => null)) as
      | ({ choices?: OpenAiChoice[] } & Record<string, unknown>)
      | null;
    const choice = payload?.choices?.[0];
    if (!choice) throw new Error('Chappi gateway returned no choices');
    return {
      choice,
      usage: payload ? extractAiUsage(payload) : null,
      cachedTokens: payload ? extractCachedTokens(payload) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The usage of a streamed call, in the shape the non-streaming path reports. */
function usageOfStream(summary: StreamSummary): Pick<ChatCompletion, 'usage' | 'cachedTokens'> {
  if (!summary.usage) return { usage: null, cachedTokens: null };
  const payload = {
    usage: {
      prompt_tokens: summary.usage.promptTokens,
      completion_tokens: summary.usage.completionTokens,
      prompt_tokens_details: { cached_tokens: summary.cachedTokens },
    },
  };
  return { usage: extractAiUsage(payload), cachedTokens: extractCachedTokens(payload) };
}

/**
 * Reads a streamed answer to the end, handing each piece of text to `onText` as
 * it arrives, and returns it in the shape a non-streaming call returns, so
 * nothing downstream knows the difference.
 *
 * Returns null when the gateway did not actually stream (it answered plain
 * JSON), so the caller reads the body as it always did.
 *
 * If the stream is cut short (our own deadline aborting the request, the
 * connection dropping, an error object mid-stream) and the model had already
 * written text and asked for no tool, that text is returned as an answer that
 * stopped at its limit, so a slow model costs the user the tail of a reply and
 * not all of it. A stream cut while a tool call was being written is thrown,
 * because half a tool call is not something to run. Usage is absent from a cut
 * stream (the gateway only sends it last), so a cut reply reports none.
 */
async function readStreamedCompletion(
  response: Response,
  onText: (delta: string) => void
): Promise<ChatCompletion | null> {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!response.body || !/text\/event-stream/i.test(contentType)) return null;

  const reader = new SseReader();
  const accumulator = new StreamAccumulator();
  const decoder = new TextDecoder();
  const body = response.body.getReader();
  const take = (payloads: string[]) => {
    for (const data of payloads) {
      const delta = accumulator.push(data);
      if (delta) onText(delta);
    }
  };

  let broke: unknown = null;
  try {
    for (;;) {
      const { value, done } = await body.read();
      if (done) break;
      take(reader.feed(decoder.decode(value, { stream: true })));
    }
    take(reader.flush());
  } catch (error) {
    broke = error;
  }

  const summary = accumulator.summary();
  const finished = summary.done || summary.finishReason !== null;
  const { usage, cachedTokens } = usageOfStream(summary);

  if (broke || summary.streamError || !finished) {
    if (summary.content.trim() && summary.toolCalls.length === 0) {
      return {
        choice: { message: { content: summary.content }, finish_reason: 'length' },
        usage,
        cachedTokens,
      };
    }
    throw broke ?? new Error(summary.streamError ?? 'Chappi gateway stream ended early');
  }

  return {
    choice: {
      message: {
        content: summary.content || null,
        ...(summary.toolCalls.length > 0
          ? {
              tool_calls: summary.toolCalls.map(
                (call): OpenAiToolCall => ({
                  id: call.id ?? `call_${call.index}`,
                  type: 'function',
                  function: { name: call.name, arguments: call.arguments },
                })
              ),
            }
          : {}),
      },
      finish_reason: summary.finishReason ?? undefined,
    },
    usage,
    cachedTokens,
  };
}

/**
 * One completion, recovering from a 400 that only says a parameter was not
 * accepted. Each recovery is spent once per model per turn (the quirks), so a
 * gateway that keeps saying 400 cannot keep this looping: at most three requests.
 * Nothing else is retried here; a failure the router might route around is
 * thrown to the caller as it is.
 */
async function completeChat(params: {
  apiKey: string;
  baseURL: string;
  model: string;
  messages: OpenAiChatMessage[];
  tools?: ReturnType<typeof getChappiToolSchemas>;
  maxOutputTokens: number;
  reasoningEffort: ReasoningEffort | null;
  timeoutMs?: number;
  quirks: Quirks;
  onText?: (delta: string) => void;
}): Promise<ChatCompletion> {
  for (let attempt = 0; ; attempt += 1) {
    const tokenParam: TokenParam = params.quirks.tokenParam.get(params.model) ?? defaultTokenParam(params.model);
    const reasoningEffort = params.quirks.noEffort.has(params.model) ? null : params.reasoningEffort;

    try {
      return await requestChatCompletion({ ...params, tokenParam, reasoningEffort });
    } catch (error) {
      if (error instanceof GatewayError && error.status === 400 && attempt < 2) {
        if (reasoningEffort && EFFORT_REJECTION.test(error.message)) {
          params.quirks.noEffort.add(params.model);
          continue;
        }
        const swapped = params.quirks.tokenParam.has(params.model)
          ? null
          : tokenParamAfterRejection(tokenParam, error.message);
        if (swapped) {
          params.quirks.tokenParam.set(params.model, swapped);
          continue;
        }
      }
      throw error;
    }
  }
}

/**
 * What the loop should do with one tool call. Pure and exported so the
 * security-critical branch is unit-testable without a live gateway.
 *
 * The rule that matters: a gated tool NEVER reaches `execute` from inside the
 * model loop. The most the model can achieve is 'propose', which paints a card
 * the user has to click. That is what stops text living in workspace data (a
 * release title, a note body) from talking the model into a deletion.
 */
export type ToolInvocationDecision =
  | { action: 'execute' }
  | { action: 'propose' }
  | { action: 'refuse'; summary: string };

export function resolveToolInvocation(
  tool: ChappiTool | undefined,
  hasPendingConfirmation: boolean
): ToolInvocationDecision {
  // Unknown tools fall through to dispatch, which owns the "Unknown tool" copy.
  if (!tool?.confirm) return { action: 'execute' };
  if (hasPendingConfirmation) {
    return {
      action: 'refuse',
      summary:
        'Another action is already waiting for the user to approve it. Ask them to approve or cancel that one first.',
    };
  }
  return { action: 'propose' };
}

/** Fed back to the model in place of a result when it proposes a gated tool.
 * Worded to close off the two failure modes that matter: claiming the action
 * happened, and calling the tool again in a loop. */
const PROPOSED_NOT_EXECUTED =
  'PROPOSED, NOT EXECUTED. A confirmation card is now showing for the user. Tell them to approve or cancel it. Do not call this tool again, and do not say the action is done.';

// ── Routing ─────────────────────────────────────────────────────────────────

export type ChatRouting = {
  /** The rung the turn's tool rounds start on. */
  decision: RouteDecision;
  /**
   * The rung for the no-tools summary that ends a turn cut off by the round
   * cap. Defaults to `decision`; the caller normally passes the cheap one, since
   * summarising what already happened needs no strength.
   */
  closeoutDecision?: RouteDecision;
  /** Epoch ms by which the turn must be finished. Without it there is no clock. */
  deadlineMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** The env the decision was made under, so a hop reads the same ladder. */
  env?: Record<string, string | undefined>;
};

export type ChappiAgentResult = {
  /**
   * Every gateway call this turn made, with the model that answered and the
   * tokens it reported. What a credits charge is worked out from; empty when
   * nothing was called. Collected whether or not the router is on.
   */
  usageCalls: UsageCall[];
  /**
   * The attempts this turn made that returned no answer, with the model each used
   * and why it failed. Not charged and never part of `usageCalls`; the usage log
   * reads them, because a call that failed may still have been billed to us.
   */
  failedCalls: FailedCall[];
  reply: string;
  clientActions: ChappiClientAction[];
  pendingConfirmation: ChappiPendingConfirmation | null;
  trace: RoutingTrace;
};

/** The decision in force for one call, held so a hop can replace it. */
type DecisionHolder = { decision: RouteDecision | null };

type CallSettings = { model: string; maxOutputTokens: number; reasoningEffort: ReasoningEffort | null };

/** What to send for a decision. With none, exactly what was sent before the router existed. */
function settingsFor(decision: RouteDecision | null, configuredModel: string): CallSettings {
  if (!decision) return { model: configuredModel, maxOutputTokens: MAX_TOKENS, reasoningEffort: null };
  return {
    model: decision.model,
    maxOutputTokens: decision.maxOutputTokens,
    // The effort is a property of the rung, but only some models take it.
    reasoningEffort: supportsReasoningEffort(decision.model) ? decision.reasoningEffort : null,
  };
}

const textOf = (choice: OpenAiChoice): string => String(choice.message?.content || '').trim();
const toolCallsOf = (choice: OpenAiChoice): OpenAiToolCall[] =>
  Array.isArray(choice.message?.tool_calls) ? (choice.message?.tool_calls ?? []) : [];

export async function runChappiAgent(params: {
  ctx: ChappiToolContext;
  system: string;
  messages: ChappiMessage[];
  routing?: ChatRouting;
  /**
   * Given, every model call is streamed and each piece of reply text is handed
   * to this as it arrives. The returned `reply` is still the authority: what was
   * streamed is a preview, and a round that goes on to use tools, or a model
   * that is swapped for another, replaces it (see `onAttempt`).
   */
  onText?: (delta: string) => void;
  /** Called before each model call, so a caller can drop the preview of a round that is being replaced. */
  onAttempt?: () => void;
}): Promise<ChappiAgentResult> {
  const config = getChappiModelConfig();
  if (!config) throw new Error('Chappi model is not configured');

  const routing = params.routing;
  const clock = routing?.now ?? Date.now;
  const env = routing?.env ?? process.env;
  const deadlineMs = routing?.deadlineMs;
  const startedAt = clock();

  const trace = routing ? startTrace(routing.decision, 'on') : startUnroutedTrace('chat', config.model);
  const quirks = newQuirks();
  const main: DecisionHolder = { decision: routing?.decision ?? null };

  const tools = getChappiToolSchemas();
  const conversation: OpenAiChatMessage[] = [
    { role: 'system', content: params.system },
    ...toModelHistory(params.messages),
  ];

  const clientActions: ChappiClientAction[] = [];
  const usageCalls: UsageCall[] = [];
  const failedCalls: FailedCall[] = [];
  let finalText = '';
  // At most one card per turn: the client has a single slot for it, and two
  // competing "are you sure?" asks would be incoherent.
  let pendingConfirmation: ChappiPendingConfirmation | null = null;
  let toolFailures = 0;
  let rounds = 0;
  let degraded: 'deadline' | null = null;
  // True when the text we are about to return stopped because the model hit its
  // output cap rather than because it finished. Without this the page shows a
  // sentence that just ends, with nothing to say it was cut short.
  let finalCutShort = false;

  /** Move `holder` to whatever the router says follows `failure`. False means stay. */
  const hop = (holder: DecisionHolder, failure: RoutingFailure): boolean => {
    const from = holder.decision;
    if (!from) return false;
    const next = nextAfterFailure({ decision: from, failure, deadlineMs, now: clock(), env });
    if (!next) return false;
    trace.hops.push({ from: from.model, to: next.model, kind: failure.kind });
    trace.endTier = next.tier;
    holder.decision = next;
    return true;
  };

  const timeoutMs = (): number =>
    deadlineMs === undefined
      ? REQUEST_TIMEOUT_MS
      : Math.max(MIN_REQUEST_TIMEOUT_MS, Math.min(REQUEST_TIMEOUT_MS, deadlineMs - clock() - ABORT_MARGIN_MS));

  /**
   * One completion under `holder`'s decision, moving to another model when the
   * router says to. `isUnusable` lets the caller call an answer that arrived but
   * is no use (nothing said, nothing done) a failure worth a stronger model.
   */
  const complete = async (
    holder: DecisionHolder,
    messages: OpenAiChatMessage[],
    withTools: boolean,
    isUnusable?: (choice: OpenAiChoice) => boolean
  ): Promise<ChatCompletion> => {
    for (;;) {
      const settings = settingsFor(holder.decision, config.model);
      noteModelCalled(trace, settings.model);
      params.onAttempt?.();

      let completion: ChatCompletion;
      try {
        completion = await completeChat({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
          model: settings.model,
          messages,
          tools: withTools ? tools : undefined,
          maxOutputTokens: settings.maxOutputTokens,
          reasoningEffort: settings.reasoningEffort,
          timeoutMs: timeoutMs(),
          quirks,
          ...(params.onText ? { onText: params.onText } : {}),
        });
      } catch (error) {
        const failure = classifyAiFailure(error);
        failedCalls.push({ model: settings.model, kind: failure.kind });
        if (hop(holder, { kind: failure.kind, retryAfterMs: failure.retryAfterMs })) continue;
        throw error;
      }

      addTraceUsage(trace, completion.usage);
      usageCalls.push({
        model: settings.model,
        promptTokens: completion.usage?.promptTokens ?? null,
        completionTokens: completion.usage?.completionTokens ?? null,
        cachedTokens: completion.cachedTokens,
      });
      if (isUnusable?.(completion.choice) && hop(holder, { kind: 'bad_output' })) continue;
      return completion;
    }
  };

  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      // Hold the rung to the time left. Between rounds, "nothing fits" means stop:
      // the tools already run stay run, and the user is told where it got to.
      if (main.decision && deadlineMs !== undefined) {
        const fitted = fitToDeadline(main.decision, { deadlineMs, now: clock(), env });
        if (fitted === null) {
          // The first round has to try regardless (the user asked something) and
          // is protected by the clipped request timeout instead.
          if (round > 0) {
            degraded = 'deadline';
            break;
          }
        } else if (fitted !== main.decision) {
          trace.reasons.push(...fitted.reasons.slice(main.decision.reasons.length));
          trace.endTier = fitted.tier;
          main.decision = fitted;
        }
      }

      const { choice } = await complete(main, conversation, true, (candidate) => {
        // Nothing said and nothing asked for. A reasoning model that spends its
        // whole token cap thinking looks exactly like this, and so does a model
        // that simply gave up. Not when an earlier round already said something.
        const empty = !textOf(candidate) && toolCallsOf(candidate).length === 0;
        return empty && (candidate.finish_reason === 'length' || !finalText);
      });
      rounds += 1;

      const text = textOf(choice);
      if (text) {
        finalText = text;
        finalCutShort = choice.finish_reason === 'length';
      }

      const toolCalls = toolCallsOf(choice);
      if (toolCalls.length === 0) break;

      // Record the assistant's tool-call turn verbatim, then run each tool and
      // feed the results back as role:"tool" messages keyed by tool_call_id.
      conversation.push({
        role: 'assistant',
        content: choice.message?.content ?? null,
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolName = String(toolCall.function?.name || '');
        const parsed = parseToolArguments(String(toolCall.function?.arguments || ''));
        const toolArgs = parsed.args;
        const tool = getChappiTool(toolName);
        const decision = resolveToolInvocation(tool, pendingConfirmation !== null);

        let result: ChappiToolResult;
        if (decision.action === 'refuse') {
          result = { ok: false, summary: decision.summary };
        } else if (decision.action === 'propose') {
          // Gated: build the card and stop. Nothing is mutated on this path.
          // A throw here must not take down the turn — mirror dispatch's
          // normalize-into-a-failure discipline.
          try {
            const outcome = await tool!.confirm!(params.ctx, toolArgs);
            if (outcome.ok) {
              pendingConfirmation = {
                toolName: toolName as ChappiToolName,
                args: toolArgs,
                title: outcome.title,
                detail: outcome.detail,
                confirmLabel: outcome.confirmLabel,
              };
              result = { ok: true, summary: PROPOSED_NOT_EXECUTED };
            } else {
              // The proposal itself was invalid (bad id, missing precondition).
              // Relay it as an ordinary failure so the model can correct and retry.
              result = { ok: false, summary: outcome.summary };
            }
          } catch (error) {
            console.error(`[chappi] confirm builder for "${toolName}" failed:`, error);
            result = {
              ok: false,
              summary: 'Could not prepare that action for confirmation. Nothing was changed.',
            };
          }
        } else {
          result = await executeToolCall(params.ctx, toolName, toolArgs);
        }

        if (!parsed.valid || !result.ok) toolFailures += 1;
        if (result.clientAction) clientActions.push(result.clientAction);
        conversation.push({
          role: 'tool',
          tool_call_id: String(toolCall.id),
          content: JSON.stringify({
            ok: result.ok,
            summary: result.summary,
            data: result.data ?? null,
          }),
        });
      }

      // The tools keep failing: move up for the rest of the turn, if the plan and
      // the clock allow. Only worth doing when another round is coming.
      if (toolFailures >= TOOL_FAILURES_BEFORE_ESCALATION && round < MAX_ROUNDS - 1) {
        if (hop(main, { kind: 'tool_errors' })) toolFailures = 0;
      }

      if (round === MAX_ROUNDS - 1) {
        // Hit the round cap mid-tool-use — ask for a final summary with no tools
        // so the user still gets a coherent close instead of a dangling turn.
        const closeout: DecisionHolder = { decision: routing ? (routing.closeoutDecision ?? main.decision) : null };
        const fitted =
          closeout.decision && deadlineMs !== undefined
            ? fitToDeadline(closeout.decision, { deadlineMs, now: clock(), env })
            : closeout.decision;

        // No time left for a summary is not a failure: the work is done and the
        // last thing the model said (or "Done.") stands.
        if (fitted !== null || !closeout.decision) {
          closeout.decision = fitted;
          try {
            const closing = await complete(
              closeout,
              [
                ...conversation,
                {
                  role: 'user',
                  content: 'Summarize what you did in one or two sentences. Do not call any more tools.',
                },
              ],
              false
            );
            const closingText = textOf(closing.choice);
            if (closingText) {
              finalText = closingText;
              finalCutShort = closing.choice.finish_reason === 'length';
            }
          } catch (error) {
            // Unrouted, this is thrown exactly as it always was. Routed, the tools
            // have run and the router has already tried another model: a missing
            // summary must not turn a finished turn into an error.
            if (!routing) throw error;
            console.error('[chappi] closing summary failed:', error);
          }
        }
      }
    }
  } catch (error) {
    trace.latencyMs = clock() - startedAt;
    trace.rounds = rounds;
    logRoutingTrace(trace, true);
    // The turn failed and is not charged, but its earlier rounds were billed to us.
    // The route that catches this reads them off the error to record the cost.
    attachUsageToError(error, { usageCalls, failedCalls });
    throw error;
  }

  trace.rounds = rounds;
  trace.latencyMs = clock() - startedAt;
  const cutShort = !degraded && Boolean(finalText) && finalCutShort;
  if (degraded) trace.degraded = degraded;
  else if (cutShort) trace.degraded = 'length';
  logRoutingTrace(trace, false);

  const reply = degraded
    ? finalText
      ? `${finalText}\n\n${DEADLINE_NOTE}`
      : DEADLINE_MESSAGE
    : cutShort
      ? `${finalText}\n\n${LENGTH_NOTE}`
      : finalText || 'Done.';
  return { reply, clientActions, pendingConfirmation, trace, usageCalls, failedCalls };
}

/**
 * Writes the closing line after the user approved a card and the action ran.
 *
 * Deliberately called with NO tools: the action is already done, and the model
 * physically cannot start another one from here. Returns '' on any failure —
 * the caller falls back to the tool's own summary, because the mutation
 * happened and a model hiccup must never leave the user thinking it didn't.
 */
export async function closeConfirmedAction(params: {
  system: string;
  messages: ChappiMessage[];
  toolName: string;
  result: ChappiToolResult;
  routing?: Pick<ChatRouting, 'decision' | 'deadlineMs' | 'now' | 'env'>;
}): Promise<string> {
  const config = getChappiModelConfig();
  if (!config) return '';

  const outcome = params.result.ok
    ? `It succeeded: ${params.result.summary}`
    : `It failed: ${params.result.summary}`;

  const messages: OpenAiChatMessage[] = [
    { role: 'system', content: params.system },
    ...toModelHistory(params.messages),
    {
      role: 'user',
      content: `[The user approved the pending "${params.toolName}" action on the confirmation card, and it has now run. ${outcome} Tell them the outcome in one or two sentences. Do not call any tools.]`,
    },
  ];

  const clock = params.routing?.now ?? Date.now;
  const env = params.routing?.env ?? process.env;
  const deadlineMs = params.routing?.deadlineMs;
  const quirks = newQuirks();
  let decision: RouteDecision | null = params.routing?.decision ?? null;

  try {
    for (;;) {
      const settings = settingsFor(decision, config.model);
      try {
        const { choice } = await completeChat({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
          model: settings.model,
          messages,
          maxOutputTokens: settings.maxOutputTokens,
          reasoningEffort: settings.reasoningEffort,
          timeoutMs:
            deadlineMs === undefined
              ? undefined
              : Math.max(MIN_REQUEST_TIMEOUT_MS, Math.min(REQUEST_TIMEOUT_MS, deadlineMs - clock() - ABORT_MARGIN_MS)),
          quirks,
        });
        return textOf(choice);
      } catch (error) {
        const failure = classifyAiFailure(error);
        const next = decision
          ? nextAfterFailure({
              decision,
              failure: { kind: failure.kind, retryAfterMs: failure.retryAfterMs },
              deadlineMs,
              now: clock(),
              env,
            })
          : null;
        if (!next) throw error;
        decision = next;
      }
    }
  } catch (error) {
    console.error('[chappi] closing message after confirmation failed:', error);
    return '';
  }
}
