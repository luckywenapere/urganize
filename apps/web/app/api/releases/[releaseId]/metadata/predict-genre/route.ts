import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import {
  MAX_GENRE_PREDICTION_FILE_BYTES,
  parseGenrePrediction,
  validateGenrePredictionUpload,
} from '@/lib/genre-prediction';

// Proxy to the external genre-classifier model (a FastAPI service on an AWS
// Lambda function URL, owned by a collaborating developer). The client posts
// an audio file here, we forward it as multipart, and return the predicted
// genre so the Metadata scene can prefill its Genre field.
//
// Nothing is stored: the audio is streamed through and discarded, and the
// prediction is not written to the database — the user reviews it in the form
// and saves via the existing PATCH /api/releases/[releaseId]/metadata.

// Cold start (Python runtime + model load) plus inference can run well past a
// warm request. One attempt, no retry: re-uploading a multi-MB body on retry
// doubles the worst case for little gain. maxDuration 60 is the Hobby-plan
// ceiling (the plan route precedent), so the 30s upstream budget plus
// auth/DB pre-work fits inside it with slack. Re-do this math before adding
// retries.
const PREDICTION_TIMEOUT_MS = 30_000;
export const maxDuration = 60;

// Feature flag — the surface stays dark until
// NEXT_PUBLIC_FEATURE_GENRE_PREDICTION is 'true'. When off this handler 404s,
// so a direct API call can't reach the model through us either (the
// plan/EPK precedent). Only meaningful alongside
// NEXT_PUBLIC_FEATURE_METADATA, since the control lives on the Metadata scene.
const isGenrePredictionEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_GENRE_PREDICTION === 'true';

// Full endpoint URL including the model's /predict path, so a path change is
// config-only. Server-only on purpose: the upstream URL has no authentication
// today, so it must never reach a client bundle.
const getPredictionUrl = (): string => process.env.GENRE_PREDICTION_URL?.trim() || '';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isGenrePredictionEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const predictionUrl = getPredictionUrl();
  if (!predictionUrl) {
    return NextResponse.json(
      { error: 'Genre prediction is not configured on this environment.' },
      { status: 503 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // Team WRITE gate (uniform non-GET rule): any non-guest member may run a
  // prediction. A guest's prediction would be a paid dead end — the PATCH
  // that saves the result refuses them — so the refusal happens here, with
  // the legible view-only message rather than a fake 404.
  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Audio form data is required.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'An audio file is required.' }, { status: 400 });
  }

  const validation = validateGenrePredictionUpload({
    fileName: file.name || '',
    mimeType: file.type || '',
    fileSize: file.size,
  });
  if (!validation.ok) {
    // 413 for size, 400 for type. Vercel itself 413s anything past ~4.5 MB
    // before this handler runs, so this covers the 4-4.5 MB window and
    // non-browser callers.
    const status = file.size > MAX_GENRE_PREDICTION_FILE_BYTES ? 413 : 400;
    return NextResponse.json({ error: validation.error }, { status });
  }

  // Forward as multipart. Never set Content-Type by hand — fetch derives the
  // boundary from the FormData body.
  const upstreamForm = new FormData();
  upstreamForm.append('file', file, file.name || 'audio');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREDICTION_TIMEOUT_MS);
  let upstream: Response;
  try {
    // Pre-wired for the shared secret the model developer has yet to add;
    // harmless (and ignored upstream) until then.
    const apiKey = process.env.GENRE_PREDICTION_API_KEY?.trim();
    upstream = await fetch(predictionUrl, {
      method: 'POST',
      body: upstreamForm,
      signal: controller.signal,
      ...(apiKey ? { headers: { 'x-api-key': apiKey } } : {}),
    });
  } catch (error) {
    const isAbort = (error as { name?: string } | null)?.name === 'AbortError';
    if (isAbort) {
      return NextResponse.json(
        { error: 'Genre prediction took too long. Try again.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Genre prediction service is unreachable. Try again in a moment.' },
      { status: 503 }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    if (upstream.status === 429) {
      return NextResponse.json(
        { error: 'Genre prediction service is busy. Try again in a moment.' },
        { status: 503 }
      );
    }
    console.error(`[predict-genre] Upstream returned ${upstream.status}.`);
    return NextResponse.json(
      { error: 'Genre prediction service returned an error. Try again later.' },
      { status: 502 }
    );
  }

  const rawText = await upstream.text().catch(() => '');
  let rawBody: unknown = rawText;
  try {
    rawBody = JSON.parse(rawText);
  } catch {
    // Leave rawBody as the raw string — the parser handles bare labels.
  }

  const prediction = parseGenrePrediction(rawBody);
  if (!prediction) {
    // The debugging seam until the upstream response schema is pinned.
    console.error('[predict-genre] Unrecognized response shape:', rawText.slice(0, 500));
    return NextResponse.json(
      { error: 'Prediction response could not be understood. No changes made.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ genre: prediction.genre, confidence: prediction.confidence });
}
