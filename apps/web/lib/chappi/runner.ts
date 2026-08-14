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

import { getChappiModelConfig } from './config';
import { getChappiTool, getChappiToolSchemas } from './tools';
import type { ChappiTool, ChappiToolContext } from './tools';
import { executeToolCall } from './dispatch';
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

// ── OpenAI chat-completions wire shapes (minimal structural views) ─────────

type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type OpenAiChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type OpenAiChoice = {
  message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
  finish_reason?: string;
};

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function requestChatCompletion(params: {
  apiKey: string;
  baseURL: string;
  model: string;
  messages: OpenAiChatMessage[];
  tools?: ReturnType<typeof getChappiToolSchemas>;
}): Promise<OpenAiChoice> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${params.baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: MAX_TOKENS,
        stream: false,
        ...(params.tools?.length ? { tools: params.tools } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      throw new Error(`Chappi gateway request failed (${response.status}): ${rawText.slice(0, 300)}`);
    }

    const payload = (await response.json().catch(() => null)) as {
      choices?: OpenAiChoice[];
    } | null;
    const choice = payload?.choices?.[0];
    if (!choice) throw new Error('Chappi gateway returned no choices');
    return choice;
  } finally {
    clearTimeout(timer);
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

export async function runChappiAgent(params: {
  ctx: ChappiToolContext;
  system: string;
  messages: ChappiMessage[];
}): Promise<{
  reply: string;
  clientActions: ChappiClientAction[];
  pendingConfirmation: ChappiPendingConfirmation | null;
}> {
  const config = getChappiModelConfig();
  if (!config) throw new Error('Chappi model is not configured');

  const tools = getChappiToolSchemas();
  const conversation: OpenAiChatMessage[] = [
    { role: 'system', content: params.system },
    ...params.messages
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }) as OpenAiChatMessage),
  ];

  const clientActions: ChappiClientAction[] = [];
  let finalText = '';
  // At most one card per turn: the client has a single slot for it, and two
  // competing "are you sure?" asks would be incoherent.
  let pendingConfirmation: ChappiPendingConfirmation | null = null;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const choice = await requestChatCompletion({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      messages: conversation,
      tools,
    });

    const text = String(choice.message?.content || '').trim();
    if (text) finalText = text;

    const toolCalls = Array.isArray(choice.message?.tool_calls) ? choice.message.tool_calls : [];
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
      const toolArgs = parseToolArguments(String(toolCall.function?.arguments || ''));
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

    if (round === MAX_ROUNDS - 1) {
      // Hit the round cap mid-tool-use — ask for a final summary with no tools
      // so the user still gets a coherent close instead of a dangling turn.
      const closing = await requestChatCompletion({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
        messages: [
          ...conversation,
          {
            role: 'user',
            content: 'Summarize what you did in one or two sentences. Do not call any more tools.',
          },
        ],
      });
      const closingText = String(closing.message?.content || '').trim();
      if (closingText) finalText = closingText;
    }
  }

  return { reply: finalText || 'Done.', clientActions, pendingConfirmation };
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
}): Promise<string> {
  const config = getChappiModelConfig();
  if (!config) return '';

  const outcome = params.result.ok
    ? `It succeeded: ${params.result.summary}`
    : `It failed: ${params.result.summary}`;

  try {
    const choice = await requestChatCompletion({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      messages: [
        { role: 'system', content: params.system },
        ...params.messages
          .filter((m) => m.content.trim())
          .map((m) => ({ role: m.role, content: m.content }) as OpenAiChatMessage),
        {
          role: 'user',
          content: `[The user approved the pending "${params.toolName}" action on the confirmation card, and it has now run. ${outcome} Tell them the outcome in one or two sentences. Do not call any tools.]`,
        },
      ],
    });
    return String(choice.message?.content || '').trim();
  } catch (error) {
    console.error('[chappi] closing message after confirmation failed:', error);
    return '';
  }
}
