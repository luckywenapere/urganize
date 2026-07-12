// Chappi agentic loop (SERVER-ONLY). One sanctioned home for the tool-calling
// transport — the Anthropic SDK — mirroring provider.ts's discipline (timeout,
// bounded retries) but for a capability the Zuplo/Ollama transport structurally
// can't provide. Non-streaming this phase; Phase 3 upgrades to messages.stream.

import Anthropic from '@anthropic-ai/sdk';
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

// Minimal structural view of a response content block — avoids depending on the
// exact SDK block class names while still narrowing text vs tool_use.
type LooseBlock = { type: string; text?: string; id?: string; name?: string; input?: unknown };

function collectText(blocks: LooseBlock[]): string {
  return blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => (b.text as string).trim())
    .filter(Boolean)
    .join('\n\n');
}

export async function runChappiAgent(params: {
  ctx: ChappiToolContext;
  system: string;
  messages: ChappiMessage[];
}): Promise<{ reply: string; clientActions: ChappiClientAction[] }> {
  const config = getChappiModelConfig();
  if (!config) throw new Error('Chappi model is not configured');

  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    maxRetries: 1,
    timeout: REQUEST_TIMEOUT_MS,
  });

  const tools = getChappiToolSchemas() as Anthropic.Tool[];
  const conversation: Anthropic.MessageParam[] = params.messages
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  const clientActions: ChappiClientAction[] = [];
  let finalText = '';

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: MAX_TOKENS,
      system: params.system,
      messages: conversation,
      tools,
    });

    const blocks = response.content as unknown as LooseBlock[];
    const text = collectText(blocks);
    if (text) finalText = text;

    const toolUses = blocks.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) break;

    // Record the assistant's tool-call turn verbatim, then run each tool and
    // feed the results back.
    conversation.push({
      role: 'assistant',
      content: response.content as Anthropic.MessageParam['content'],
    });

    const toolResults = [];
    for (const toolUse of toolUses) {
      const result = await executeToolCall(params.ctx, String(toolUse.name), toolUse.input);
      if (result.clientAction) clientActions.push(result.clientAction);
      toolResults.push({
        type: 'tool_result' as const,
        tool_use_id: String(toolUse.id),
        is_error: !result.ok,
        content: JSON.stringify({
          ok: result.ok,
          summary: result.summary,
          data: result.data ?? null,
        }),
      });
    }
    conversation.push({
      role: 'user',
      content: toolResults as Anthropic.MessageParam['content'],
    });

    if (round === MAX_ROUNDS - 1) {
      // Hit the round cap mid-tool-use — ask for a final summary with no tools
      // so the user still gets a coherent close instead of a dangling turn.
      const closing = await client.messages.create({
        model: config.model,
        max_tokens: MAX_TOKENS,
        system: params.system,
        messages: [
          ...conversation,
          {
            role: 'user',
            content: 'Summarize what you did in one or two sentences. Do not call any more tools.',
          },
        ],
      });
      const closingText = collectText(closing.content as unknown as LooseBlock[]);
      if (closingText) finalText = closingText;
    }
  }

  return { reply: finalText || 'Done.', clientActions };
}
