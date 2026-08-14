// Fan email capture (2026-08-14). The owner-facing shapes returned by the
// /api/releases/[releaseId]/capture routes. The public page's data shape lives
// in lib/capture-server.ts (server-only, never sent to the owner client).

/** The authored capture page plus its share grant. One per release. */
export interface ReleaseCapturePage {
  id: string;
  releaseId: string;
  shareToken: string;
  headline: string;
  incentive: string;
  destinationUrl: string;
  destinationLabel: string;
  buttonLabel: string;
  /** An asset on this release, or empty to fall back to the release cover art. */
  graphicAssetId: string;
  collectName: boolean;
  consentNote: string;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One fan submission. The email is stored lowercased. */
export interface ReleaseCaptureLead {
  id: string;
  email: string;
  name: string;
  consented: boolean;
  createdAt: string;
}

/**
 * The editable half of a capture page — everything the PUT accepts.
 *
 * Deliberately a separate type from ReleaseCapturePage rather than a Partial
 * of it: the share token, ids and timestamps are server-owned and must never
 * be settable from a request body, and a Partial<> would quietly allow them.
 */
export interface CapturePageDraft {
  headline: string;
  incentive: string;
  destinationUrl: string;
  destinationLabel: string;
  buttonLabel: string;
  graphicAssetId: string;
  collectName: boolean;
  consentNote: string;
  isPaused: boolean;
}

/** What the public form POSTs. Re-validated server-side — anyone with the
 * link can call that endpoint, so this is a contract, not a trust boundary. */
export interface CaptureLeadInput {
  email: string;
  name?: string;
  consented?: boolean;
}

export const CAPTURE_HEADLINE_MAX = 80;
export const CAPTURE_INCENTIVE_MAX = 160;
export const CAPTURE_BUTTON_LABEL_MAX = 32;
export const CAPTURE_SHORT_FIELD_MAX = 200;
export const CAPTURE_CONSENT_NOTE_MAX = 240;

/** Empty draft, used by the editor before a page exists and as the shape the
 * PUT route falls back to field by field. */
export const EMPTY_CAPTURE_DRAFT: CapturePageDraft = {
  headline: '',
  incentive: '',
  destinationUrl: '',
  destinationLabel: '',
  buttonLabel: '',
  graphicAssetId: '',
  collectName: false,
  consentNote: '',
  isPaused: false,
};
