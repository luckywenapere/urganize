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
import { getChappiToolSchemas } from './tools';
import type { ChappiToolContext } from './tools';
import { executeToolCall } from './dispatch';
import type { ChappiClientAction, ChappiMessage } from './types';

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

export async function runChappiAgent(params: {
  ctx: ChappiToolContext;
  system: string;
  messages: ChappiMessage[];
}): Promise<{ reply: string; clientActions: ChappiClientAction[] }> {
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
      const result = await executeToolCall(
        params.ctx,
        String(toolCall.function?.name || ''),
        parseToolArguments(String(toolCall.function?.arguments || ''))
      );
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

  return { reply: finalText || 'Done.', clientActions };
}
