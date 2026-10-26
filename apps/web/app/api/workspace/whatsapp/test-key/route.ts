import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { isByoProvider, resolveBaseUrl } from '@/lib/whatsapp/byo-ai';
import { testOwnAi } from '@/lib/whatsapp/server';

// "Test key" in settings. Checks a key the person just typed, with one tiny
// call, and stores nothing. Any signed-in team member could be abused to make
// our server call an arbitrary address, so a custom address has to pass the
// same public-https check the saved setting does.

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    provider?: unknown;
    baseUrl?: unknown;
    model?: unknown;
    apiKey?: unknown;
  } | null;
  if (!body || !isByoProvider(body.provider)) {
    return NextResponse.json({ ok: false, error: 'Choose a provider.' }, { status: 400 });
  }
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : null;
  if (!resolveBaseUrl(body.provider, baseUrl)) {
    return NextResponse.json({ ok: false, error: 'The AI address must be a public https address.' }, { status: 400 });
  }
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!model || !apiKey || apiKey.length > 500) {
    return NextResponse.json({ ok: false, error: 'Add a model and a key to test.' }, { status: 400 });
  }

  const result = await testOwnAi({ provider: body.provider, baseUrl, model, apiKey });
  return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error });
}
