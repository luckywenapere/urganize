// TRM lifecycle webhooks (URG-392): signature check and payload reading. Pure
// (node:crypto only), so it is unit-tested directly.
//
// WHAT TRM DOCUMENTS (portal, Oct 19, 2026), word for word: "Delivery
// signatures: HMAC-SHA256(timestamp + "." + raw body, signing secret). Check
// X-TRM-Webhook-Signature and reject timestamps older than five minutes. Handle
// duplicate delivery IDs safely." Nothing else: no timestamp or delivery-id
// header name, no hex-or-base64, no sample body.
//
// SO THIS READS DEFENSIVELY, WITHOUT LOOSENING THE CHECK. The HMAC over
// `timestamp.rawBody` with the secret is the only thing that lets a request in;
// the guesses below are only about WHERE TRM puts the timestamp and the id and
// HOW it spells the digest. A wrong guess fails closed (401), and the route logs
// the header names of every refused delivery so the first real one tells us.
//   - signature: hex or base64, optionally "sha256=" / "v1=" prefixed, or a
//     Stripe-style "t=<ts>,v1=<sig>" list (which then carries the timestamp).
//   - timestamp: an x-trm-*timestamp* header (or the t= part), in seconds,
//     milliseconds or ISO 8601. Older or newer than 5 minutes is refused.
//   - delivery id: an x-trm-* header naming a delivery or id, else the body's
//     delivery_id / id / event_id.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseConnectorMessage } from './release';

export const TRM_SIGNATURE_HEADER = 'x-trm-webhook-signature';
export const TRM_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/** TRM's ReleaseStatus enum (openapi 1.2.0). */
export const TRM_STATUSES = [
  'draft',
  'submitted',
  'validating',
  'accepted',
  'rejected',
  'processing',
  'published',
  'takedown_requested',
  'taken_down',
] as const;
export type TrmStatus = (typeof TRM_STATUSES)[number];
export const isTrmStatus = (value: unknown): value is TrmStatus =>
  typeof value === 'string' && (TRM_STATUSES as readonly string[]).includes(value);

/** Lower-cased header map, so lookups do not depend on how TRM capitalises. */
export type HeaderBag = Record<string, string>;

/**
 * The headers worth keeping: TRM's own (x-trm-*) and content-type. Nothing
 * else: Vercel adds internal ones (x-vercel-oidc-token, x-vercel-sc-headers,
 * forwarded, x-forwarded-*, ...) that must never land in a table. The
 * signature itself is reduced to its length.
 */
export function loggableHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [raw, value] of Object.entries(headers)) {
    const name = raw.toLowerCase();
    if (name !== 'content-type' && !name.startsWith('x-trm-')) continue;
    out[name] = name.includes('signature') ? `[${value.length} chars]` : value.slice(0, 300);
  }
  return out;
}

export function headerBag(headers: Iterable<[string, string]>): HeaderBag {
  const bag: HeaderBag = {};
  for (const [name, value] of headers) bag[name.toLowerCase()] = value;
  return bag;
}

/** A timestamp in seconds, from seconds, milliseconds or ISO 8601. */
export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Anything past year 33658 in seconds is really milliseconds.
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

type ParsedSignature = { timestamp: string | null; candidates: string[] };

/** Split the signature header into digest candidates (+ a t= timestamp). */
export function parseSignatureHeader(value: string): ParsedSignature {
  let timestamp: string | null = null;
  const candidates: string[] = [];
  for (const raw of value.split(/[,\s]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    // base64 can end in "=", so only treat a short alphabetic key as a label.
    const label = eq > 0 && eq <= 8 && /^[a-z0-9]+$/i.test(part.slice(0, eq)) ? part.slice(0, eq).toLowerCase() : null;
    if (label === 't' || label === 'ts' || label === 'timestamp') {
      timestamp = part.slice(eq + 1);
      continue;
    }
    candidates.push(label ? part.slice(eq + 1) : part);
  }
  return { timestamp, candidates };
}

/** The timestamp TRM signed with: a dedicated header first, then the t= part. */
export function findTimestamp(headers: HeaderBag, fromSignature: string | null): string | null {
  const preferred = [
    'x-trm-webhook-timestamp',
    'x-trm-timestamp',
    'x-trm-signature-timestamp',
    'x-trm-webhook-signature-timestamp',
  ];
  for (const name of preferred) if (headers[name]) return headers[name];
  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith('x-trm-') && name.includes('timestamp') && value) return value;
  }
  return fromSignature;
}

function digestMatches(given: string, expected: Buffer): boolean {
  const attempts: Buffer[] = [];
  if (/^[0-9a-f]+$/i.test(given) && given.length === expected.length * 2) {
    attempts.push(Buffer.from(given, 'hex'));
  }
  try {
    attempts.push(Buffer.from(given, 'base64'));
  } catch {
    // not base64
  }
  return attempts.some((buf) => buf.length === expected.length && timingSafeEqual(buf, expected));
}

export type VerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'no_secret' | 'no_signature' | 'no_timestamp' | 'stale' | 'mismatch' };

/**
 * Whether this request really came from TRM. The signed content is the
 * timestamp EXACTLY as sent, a dot, and the raw body bytes as text.
 */
export function verifyTrmWebhook(
  secret: string | null | undefined,
  rawBody: string,
  headers: HeaderBag,
  nowSeconds = Math.floor(Date.now() / 1000)
): VerifyResult {
  const key = secret?.trim();
  if (!key) return { ok: false, reason: 'no_secret' };
  const header = headers[TRM_SIGNATURE_HEADER];
  if (!header) return { ok: false, reason: 'no_signature' };
  const parsed = parseSignatureHeader(header);
  const timestampRaw = findTimestamp(headers, parsed.timestamp);
  const sentAt = parseTimestamp(timestampRaw);
  if (!timestampRaw || sentAt === null) return { ok: false, reason: 'no_timestamp' };
  if (Math.abs(nowSeconds - sentAt) > TRM_WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };

  // The secret as text is what the portal shows. A "whsec_" style secret is
  // also tried as its base64 bytes, the Svix convention.
  const keys: Buffer[] = [Buffer.from(key, 'utf8')];
  if (key.startsWith('whsec_')) keys.push(Buffer.from(key.slice(6), 'base64'));
  for (const k of keys) {
    const expected = createHmac('sha256', k).update(`${timestampRaw.trim()}.${rawBody}`).digest();
    if (parsed.candidates.some((candidate) => digestMatches(candidate, expected))) {
      return { ok: true, timestamp: sentAt };
    }
  }
  return { ok: false, reason: 'mismatch' };
}

// ---------------------------------------------------------------------------
// Reading the body. TRM (Oct 19, 2026) gave the shape:
//   { id, event, created_at, data: { id (TRM API release uuid),
//     external_release_id, previous_status, status, trm_release_id,
//     reason (free text, may be null) } }
// Rejection is event "release.status_changed" with data.status "rejected"
// (there is no release.rejected). "release.delivery_failed" carries
// data.status "rejected" and data.message = the connector's JSON AS A STRING.
// The older guesses below stay as a fallback; the documented fields win
// because `data` is read before the top level.
// The shape was undocumented before that, so every field is looked for in
// the places a lifecycle event usually keeps it: top level, `data`,
// `data.release`, `release`, `payload`.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null;

function layers(body: Json): Json[] {
  const data = asRecord(body.data);
  return [
    asRecord(data.release),
    asRecord(body.release),
    data,
    asRecord(asRecord(body.payload).release),
    asRecord(body.payload),
    asRecord(data.object),
    body,
  ];
}

function pick(body: Json, keys: readonly string[]): string | null {
  for (const layer of layers(body)) {
    for (const key of keys) {
      const value = asText(layer[key]);
      if (value) return value;
    }
  }
  return null;
}

export type TrmRejectionReason = { code: string | null; text: string };

export type TrmWebhookEvent = {
  deliveryId: string | null;
  event: string | null;
  /** TRM's release uuid. */
  releaseId: string | null;
  /** Our releases.id, sent as external_release_id. */
  externalReleaseId: string | null;
  status: TrmStatus | null;
  occurredAt: string | null;
  reasons: TrmRejectionReason[];
  upc: string | null;
  isrc: string | null;
  /** TRM's own release id: set once the release is delivered into TRM. */
  trmReleaseId: string | null;
  /** release.delivery_failed only: the connector's error, parsed. */
  failure: TrmRejectionReason | null;
};

function readReasons(body: Json): TrmRejectionReason[] {
  const out: TrmRejectionReason[] = [];
  const seen = new Set<string>();
  const push = (code: string | null, text: string | null) => {
    const clean = text?.trim();
    if (!clean) return;
    const key = `${code ?? ''}|${clean}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ code, text: clean.slice(0, 2000) });
  };
  for (const layer of layers(body)) {
    for (const key of ['rejection_reasons', 'reasons', 'errors', 'issues', 'details', 'validation_errors']) {
      const list = layer[key];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item === 'string') push(null, item);
        else {
          const r = asRecord(item);
          push(asText(r.code) ?? asText(r.field), asText(r.message) ?? asText(r.reason) ?? asText(r.text) ?? asText(r.detail));
        }
      }
    }
    for (const key of ['rejection_reason', 'reason', 'message']) {
      const value = layer[key];
      if (typeof value === 'string') {
        // data.message on delivery_failed is JSON in a string.
        const parsed = parseConnectorMessage(value);
        if (parsed) push(parsed.code ?? asText(layer.reason_code) ?? asText(layer.code), parsed.text);
      } else if (value && typeof value === 'object') {
        const r = asRecord(value);
        const parsed = parseConnectorMessage(r);
        push(parsed?.code ?? asText(r.code), parsed?.text ?? asText(r.text));
      }
    }
    if (out.length > 0) break;
  }
  return out;
}

/** Everything the route needs from a verified body. Never throws. */
export function readTrmEvent(body: unknown, headers: HeaderBag): TrmWebhookEvent {
  const root = asRecord(body);
  let deliveryId: string | null = null;
  for (const name of ['x-trm-webhook-delivery-id', 'x-trm-delivery-id', 'x-trm-webhook-id', 'x-trm-delivery', 'x-trm-event-id']) {
    if (headers[name]) {
      deliveryId = headers[name];
      break;
    }
  }
  if (!deliveryId) {
    for (const [name, value] of Object.entries(headers)) {
      if (name.startsWith('x-trm-') && (name.includes('delivery') || name.endsWith('-id')) && value) {
        deliveryId = value;
        break;
      }
    }
  }
  deliveryId = deliveryId ?? asText(root.delivery_id) ?? asText(root.deliveryId) ?? asText(root.id) ?? asText(root.event_id);

  const event =
    headers['x-trm-webhook-event'] ?? headers['x-trm-event'] ?? asText(root.event) ?? asText(root.type) ?? asText(root.event_type);

  const statusRaw = pick(root, ['status', 'new_status', 'release_status', 'to']);
  let status: TrmStatus | null = isTrmStatus(statusRaw) ? statusRaw : null;
  if (!status && event) {
    // "release.published" carries its status in the name.
    const tail = event.split('.').pop() ?? '';
    if (isTrmStatus(tail)) status = tail;
  }

  // The release's own id. The top-level `id` is the delivery's, so it only
  // counts inside a release-shaped layer.
  const data = asRecord(root.data);
  const releaseLayer = Object.keys(asRecord(data.release)).length
    ? asRecord(data.release)
    : Object.keys(asRecord(root.release)).length
      ? asRecord(root.release)
      : null;
  const releaseId =
    asText(releaseLayer?.id) ??
    pick(root, ['release_id', 'releaseId', 'trm_release_uuid']) ??
    // TRM's documented shape: data.id is the API release uuid on every
    // release.* event (delivery_failed carries no external_release_id).
    (data.external_release_id || (event && /^release\./i.test(event)) ? asText(data.id) : null);

  return {
    deliveryId: deliveryId ? deliveryId.slice(0, 191) : null,
    event: event ? event.slice(0, 120) : null,
    releaseId,
    externalReleaseId: pick(root, ['external_release_id', 'externalReleaseId']),
    status,
    occurredAt: pick(root, ['occurred_at', 'created_at', 'updated_at', 'timestamp']),
    reasons: readReasons(root),
    upc: pick(root, ['upc']),
    isrc: pick(root, ['isrc']),
    trmReleaseId: pick(root, ['trm_release_id', 'trmReleaseId']),
    failure: event && /delivery_failed$/i.test(event) ? parseConnectorMessage(data.message ?? data.error ?? null) : null,
  };
}
