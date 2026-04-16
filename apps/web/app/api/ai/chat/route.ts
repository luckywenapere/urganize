import { NextResponse } from 'next/server';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatRequestBody = {
  messages?: ChatMessage[];
};

type ZuploChatResponse = {
  done?: boolean;
  message?: {
    content?: string;
  };
  text?: string;
  response?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function parseJsonObject(raw: string): ZuploChatResponse | null {
  try {
    return JSON.parse(raw) as ZuploChatResponse;
  } catch {
    return null;
  }
}

function parseStreamingPayload(raw: string): ZuploChatResponse | null {
  const segments = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  if (segments.length === 1) {
    return parseJsonObject(segments[0]);
  }

  let combinedText = '';

  for (const segment of segments) {
    const payload = parseJsonObject(segment);
    if (!payload) {
      continue;
    }

    if (typeof payload.message?.content === 'string') {
      combinedText += payload.message.content;
    } else if (typeof payload.response === 'string') {
      combinedText += payload.response;
    } else if (typeof payload.text === 'string') {
      combinedText += payload.text;
    }
  }

  return combinedText ? { text: combinedText.trim() } : null;
}

const DEFAULT_AI_API_BASE = 'https://urganize-main-34fd8f6.d2.zuplo.dev';
const AI_MODEL = 'qwen2.5:3b';

function extractAssistantText(payload: ZuploChatResponse | null): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text.trim();
  }

  if (typeof payload.response === 'string' && payload.response.trim()) {
    return payload.response.trim();
  }

  if (typeof payload.message?.content === 'string' && payload.message.content.trim()) {
    return payload.message.content.trim();
  }

  const choiceText = payload.choices?.[0]?.message?.content;
  if (typeof choiceText === 'string' && choiceText.trim()) {
    return choiceText.trim();
  }

  return null;
}

export async function POST(req: Request) {
  const aiApiKey = process.env.AI_API_KEY;
  const aiApiBase = process.env.AI_API_BASE || DEFAULT_AI_API_BASE;

  if (!aiApiKey) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  let body: ChatRequestBody;

  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const response = await fetch(`${aiApiBase}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiApiKey,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: body.messages,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
    }

    const rawText = await response.text();
    const payload = parseStreamingPayload(rawText);
    const text = extractAssistantText(payload);

    if (!text) {
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
    }

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }
}
