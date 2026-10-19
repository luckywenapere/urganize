// TRM Partner Distribution API client (URG-392). SERVER ONLY: it holds the
// partner credentials (TRM_CLIENT_ID / TRM_CLIENT_SECRET), which never reach a
// browser. The master audio never passes through here either: the browser PUTs
// it straight to the presigned R2 URL this returns.
//
// Spec: https://partner-api.therealmusicdistro.com/docs/openapi.yaml (1.2.0).
// Production only (TRM gives no sandbox), so every write is real. Every write
// carries an Idempotency-Key, which TRM requires and which must only ever be
// reused for the byte-identical request: callers derive it from the request
// body (see idempotencyKey), so a retry of the same step reuses it and a
// changed request gets a new one.

import { createHash } from 'node:crypto';

const BASE_URL = (process.env.TRM_API_BASE_URL?.trim() || 'https://partner-api.therealmusicdistro.com/api/v1').replace(/\/$/, '');
const TIMEOUT_MS = 20_000;

export class TrmApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown[];
  constructor(status: number, message: string, code: string | null = null, details: unknown[] = []) {
    super(message);
    this.name = 'TrmApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function trmConfigured(): boolean {
  return Boolean(process.env.TRM_CLIENT_ID?.trim() && process.env.TRM_CLIENT_SECRET?.trim());
}

/** sha256 of a string, hex. */
export const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A retry key for one step of one release: same request, same key. */
export function idempotencyKey(releaseId: string, step: string, body: unknown = ''): string {
  const fingerprint = sha256Hex(typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 32);
  return `urg:${releaseId}:${step}:${fingerprint}`.slice(0, 191);
}

// ---------------------------------------------------------------------------
// Token: client_credentials, cached in memory until a minute before it expires.
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

/** For tests. */
export function resetTrmTokenCache() {
  cachedToken = null;
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function readError(response: Response): Promise<TrmApiError> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; details?: unknown[] } | string; message?: string }
    | null;
  const err = body && typeof body.error === 'object' ? body.error : null;
  const message =
    err?.message || (typeof body?.error === 'string' ? body.error : null) || body?.message || `TRM answered ${response.status}`;
  return new TrmApiError(response.status, message, err?.code ?? null, Array.isArray(err?.details) ? err.details : []);
}

export async function getTrmToken(now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;
  const clientId = process.env.TRM_CLIENT_ID?.trim();
  const clientSecret = process.env.TRM_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new TrmApiError(503, 'TRM is not configured.', 'not_configured');
  const response = await timedFetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new TrmApiError(502, 'TRM sent no token.', 'no_token');
  const lifetime = Number.isFinite(body.expires_in) ? Number(body.expires_in) : 3600;
  cachedToken = { value: body.access_token, expiresAt: now + Math.max(60, lifetime - 60) * 1000 };
  return body.access_token;
}

async function call<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  options: { body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const attempt = async (retryAuth: boolean): Promise<T> => {
    const token = await getTrmToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    let payload: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(options.body);
    }
    if (method !== 'GET') {
      if (!options.idempotencyKey) throw new TrmApiError(400, 'Idempotency-Key is required.', 'missing_idempotency_key');
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    const response = await timedFetch(`${BASE_URL}${path}`, { method, headers, body: payload });
    if (response.status === 401 && retryAuth) {
      // A token TRM revoked early: mint a fresh one once.
      cachedToken = null;
      return attempt(false);
    }
    if (!response.ok) throw await readError(response);
    if (response.status === 204) return {} as T;
    return ((await response.json().catch(() => ({}))) ?? {}) as T;
  };
  return attempt(true);
}

// ---------------------------------------------------------------------------
// Shapes (only what Urganize sends or reads)
// ---------------------------------------------------------------------------

export type TrmPolicy = 'Monetize' | 'Track' | 'Block' | 'None';

export type TrmTrackInput = {
  sequence: number;
  title: string;
  version?: string | null;
  primary_artist: string;
  featured_artists?: string[];
  isrc?: string | null;
  genre: string;
  language: string;
  explicit: boolean;
  writers: Array<{ name: string; role: string }>;
  producers: Array<{ name: string; role: string }>;
  other_credits?: Array<{ name: string; role: string }>;
  royalty_splits: Array<{ name: string; percentage: number }>;
  country_of_recording: string;
  lyrics?: string | null;
  owns_sound_recording: boolean;
  sound_recording_territories: string[];
  collect_publishing_royalties: boolean;
  composition_territories: string[];
  youtube_policy: TrmPolicy;
  facebook_policy: TrmPolicy;
  soundexchange_policy: string;
};

export type TrmReleaseInput = {
  external_release_id: string;
  artist_email?: string | null;
  trm_artist_id?: string | null;
  schema_version?: string;
  title: string;
  primary_artist: string;
  featured_artist?: string | null;
  release_type: 'Single' | 'EP' | 'Album';
  genre: string;
  release_date: string;
  upc?: string | null;
  label: string;
  copyright_name: string;
  copyright_year: number;
  language: string;
  explicit: boolean;
  stores: string[];
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  tracks: TrmTrackInput[];
};

export type TrmAsset = {
  id: string;
  type: 'audio' | 'artwork';
  file_name?: string;
  status?: 'pending' | 'verified' | 'failed';
};

export type TrmRelease = {
  id: string;
  status: string;
  /** Problems TRM found (shape not documented; read defensively). */
  validation_errors?: unknown;
  /** Review details on a rejection (shape not documented; read defensively). */
  review?: unknown;
  external_release_id?: string;
  trm_release_id?: string | null;
  upc?: string | null;
  assets?: TrmAsset[];
  tracks?: Array<{ isrc?: string | null }>;
};

export type TrmPresign = {
  asset: TrmAsset;
  upload: { method: 'PUT'; url: string; expires_in?: number; required_headers?: Record<string, string> };
};

type Wrapped<T> = { data?: T } & Partial<T>;
const unwrap = <T>(body: Wrapped<T>): T => (body.data ?? (body as T)) as T;

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function createTrmRelease(input: TrmReleaseInput, key: string): Promise<TrmRelease> {
  return unwrap(await call<Wrapped<TrmRelease>>('POST', '/releases', { body: input, idempotencyKey: key }));
}

/** PATCH takes the full input minus external_release_id (immutable). */
export async function replaceTrmRelease(releaseId: string, input: TrmReleaseInput, key: string): Promise<void> {
  const { external_release_id: _immutable, ...rest } = input;
  void _immutable;
  await call('PATCH', `/releases/${encodeURIComponent(releaseId)}`, { body: rest, idempotencyKey: key });
}

export async function getTrmRelease(releaseId: string): Promise<TrmRelease> {
  return unwrap(await call<Wrapped<TrmRelease>>('GET', `/releases/${encodeURIComponent(releaseId)}`));
}

export async function presignTrmAsset(
  releaseId: string,
  input: { type: 'audio' | 'artwork'; file_name: string; mime_type: string; size_bytes: number; sha256: string; track_sequence?: number },
  key: string
): Promise<TrmPresign> {
  return unwrap(
    await call<Wrapped<TrmPresign>>('POST', `/releases/${encodeURIComponent(releaseId)}/assets/presign`, {
      body: input,
      idempotencyKey: key,
    })
  );
}

export async function completeTrmAsset(releaseId: string, assetId: string, key: string): Promise<void> {
  await call('POST', `/releases/${encodeURIComponent(releaseId)}/assets/${encodeURIComponent(assetId)}/complete`, {
    idempotencyKey: key,
  });
}

/** Submits to stores. Real and billable-unknown: only lib/trm/server.ts calls
 *  it, behind canSendToTrm. */
export async function submitTrmRelease(releaseId: string, key: string): Promise<void> {
  await call('POST', `/releases/${encodeURIComponent(releaseId)}/submit`, { idempotencyKey: key });
}

export async function getTrmCapabilities(): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>('GET', '/capabilities');
}

// ---------------------------------------------------------------------------
// Stores. TRM (Oct 19, 2026): `stores: ["all"]` is INVALID (422
// validation_failed on stores.0). Send the explicit list from GET
// /capabilities (data.stores), cached server-side for an hour; if that call
// fails, TRM's own list below (case-sensitive, exactly as TRM gave it).
// ---------------------------------------------------------------------------

export const TRM_FALLBACK_STORES: readonly string[] = [
  'Spotify',
  'Apple Music',
  'YouTube Music',
  'TikTok Music',
  'Audiomack',
  'Deezer',
  'Amazon Music',
  'Tidal',
  'Boomplay',
  'iHeartRadio',
  'Pandora',
  'SoundCloud Go',
  'Napster',
  'Anghami',
  'JioSaavn',
  'Trebel',
  'Shazam',
  'Facebook / Instagram',
  'Snap / TikTok',
  'NetEase',
  'Tencent',
];

const STORES_TTL_MS = 60 * 60 * 1000;
let cachedStores: { value: string[]; expiresAt: number } | null = null;

/** For tests. */
export function resetTrmStoresCache() {
  cachedStores = null;
}

/** data.stores from a capabilities body: strings, or objects with a name. */
export function storesFromCapabilities(body: unknown): string[] {
  const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  const list = Array.isArray(data.stores) ? data.stores : [];
  const out: string[] = [];
  for (const item of list) {
    const name =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? ((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).id)
          : null;
    if (typeof name === 'string' && name.trim() && name.trim().toLowerCase() !== 'all' && !out.includes(name.trim())) {
      out.push(name.trim());
    }
  }
  return out;
}

/** Every store TRM delivers to for this partner. Never throws. */
export async function getTrmStores(now = Date.now()): Promise<string[]> {
  if (cachedStores && cachedStores.expiresAt > now) return cachedStores.value;
  try {
    const stores = storesFromCapabilities(await getTrmCapabilities());
    if (stores.length > 0) {
      cachedStores = { value: stores, expiresAt: now + STORES_TTL_MS };
      return stores;
    }
  } catch (error) {
    console.error('[trm] capabilities failed; using the fallback store list', error instanceof Error ? error.message : error);
  }
  return [...TRM_FALLBACK_STORES];
}

/** PUT bytes to a presigned URL (server-side cover art only). */
export async function putToPresignedUrl(upload: TrmPresign['upload'], bytes: ArrayBuffer, mimeType: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': mimeType, ...(upload.required_headers ?? {}) };
  const response = await timedFetch(upload.url, { method: 'PUT', headers, body: bytes });
  if (!response.ok) throw new TrmApiError(response.status, 'The cover art upload to TRM failed.', 'upload_failed');
}
