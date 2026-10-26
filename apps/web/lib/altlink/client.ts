// Altlink Partner API v2 client. Server only: the key is read from env here
// and nowhere else, sent as a bearer header (never in a URL), and never logged.

import { readLink, readStats, type AltlinkLink, type SmartLinkStats } from './rules';

export const ALTLINK_API_BASE = 'https://api.altlink.co';
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 4;

export class AltlinkError extends Error {
  status: number;
  code: string;
  /** Whatever else Altlink put in its error body (which field failed), kept short. Never shown to a user. */
  detail: string | null;
  constructor(status: number, code: string, message: string, detail: string | null = null) {
    super(message);
    this.name = 'AltlinkError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** 422 missing_identifier means "not ready yet", never an error to show. */
export const isNotReady = (error: unknown): boolean =>
  error instanceof AltlinkError && error.status === 422 && error.code === 'missing_identifier';

export const isAltlinkConfigured = (): boolean => Boolean(process.env.ALTLINK_API_KEY?.trim());

type FetchLike = typeof fetch;
export type AltlinkClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** Injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 0.5s, 1s, 2s (+ jitter), or Retry-After when it is given and shorter than 30s. */
export function backoffMs(attempt: number, retryAfter: string | null, random = Math.random): number {
  const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
  if (seconds !== null && seconds <= 30) return seconds * 1000;
  return 500 * 2 ** attempt + Math.floor(random() * 250);
}

export type CreateLinkInput = {
  title: string;
  artist_name: string;
  external_release_id: string;
  upc?: string;
  isrc?: string;
  release_date?: string;
  artwork_url?: string;
  creator_email?: string;
  timezone: string;
};

export function createAltlinkClient(options: AltlinkClientOptions = {}) {
  const apiKey = (options.apiKey ?? process.env.ALTLINK_API_KEY ?? '').trim();
  const baseUrl = (options.baseUrl ?? ALTLINK_API_BASE).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    if (!apiKey) throw new AltlinkError(0, 'not_configured', 'Altlink is not configured.');
    let lastError: AltlinkError | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        const timedOut = error instanceof Error && error.name === 'AbortError';
        lastError = new AltlinkError(0, timedOut ? 'timeout' : 'network', timedOut ? 'Altlink took too long.' : 'Could not reach Altlink.');
        if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt, null));
        continue;
      }
      clearTimeout(timer);
      const text = await response.text().catch(() => '');
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (response.ok) return json;
      const err = (json && typeof json === 'object' ? (json as Record<string, unknown>).error : null) as
        | Record<string, unknown>
        | string
        | null;
      const code =
        typeof err === 'string' ? err : typeof err?.code === 'string' ? err.code : `http_${response.status}`;
      const message =
        typeof err === 'object' && err && typeof err.message === 'string' ? err.message : `Altlink answered ${response.status}.`;
      const extra: Record<string, unknown> = {};
      if (json && typeof json === 'object') {
        for (const [key, value] of Object.entries(json as Record<string, unknown>)) if (key !== 'error') extra[key] = value;
      }
      if (err && typeof err === 'object') {
        for (const [key, value] of Object.entries(err)) if (key !== 'code' && key !== 'message') extra[key] = value;
      }
      const detail = Object.keys(extra).length ? JSON.stringify(extra).slice(0, 400) : null;
      lastError = new AltlinkError(response.status, code, message, detail);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) throw lastError;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt, response.headers.get('retry-after')));
    }
    throw lastError ?? new AltlinkError(0, 'unknown', 'Altlink did not answer.');
  }

  return {
    async health(): Promise<unknown> {
      return call('GET', '/health');
    },
    async createLink(input: CreateLinkInput): Promise<AltlinkLink> {
      const json = (await call('POST', '/v1/links', input)) as Record<string, unknown> | null;
      const link = readLink(json?.link ?? json);
      if (!link) throw new AltlinkError(502, 'bad_response', 'Altlink sent back no link.');
      return link;
    },
    async patchLink(id: string, patch: { isrc?: string; artwork_url?: string; upc?: string }): Promise<AltlinkLink | null> {
      const json = (await call('PATCH', `/v1/links/${encodeURIComponent(id)}`, patch)) as Record<string, unknown> | null;
      return readLink(json?.link ?? json);
    },
    async getStats(id: string): Promise<SmartLinkStats | null> {
      return readStats(await call('GET', `/v1/links/${encodeURIComponent(id)}/stats`));
    },
  };
}

export type AltlinkClient = ReturnType<typeof createAltlinkClient>;
