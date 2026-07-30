// EPK generator (URG-196). The owner-facing shape returned by the
// /api/releases/[releaseId]/epk routes. The public page's data shape lives
// in lib/epk-server.ts (server-only, never sent to the owner client).

export interface ReleaseEpk {
  id: string;
  releaseId: string;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
}
