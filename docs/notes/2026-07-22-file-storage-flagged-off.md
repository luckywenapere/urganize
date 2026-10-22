# File storage flagged off (2026-07-22, URG-182)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Linear issue URG-182 asked to "remove file storage feature from the app." No feature flag existed for Phase 3 — it had shipped always-on. Given production already holds real files for real releases, the founder confirmed a flag-based turn-off over a full rip-out: reversible, no data touched. Added `NEXT_PUBLIC_FEATURE_FILES`, default `false`.

- **Gated:** the release detail page's inline `AssetSection`, the standalone `/dashboard/releases/[releaseId]/files` page (bounces back to the release page when off, mirroring the content-calendar precedent), the workspace `TasksPanel` "Files" link, and all three assets API routes (`GET`/`POST /api/releases/[releaseId]/assets`, `POST .../assets/upload-url`, `DELETE .../assets/[assetId]`) — each 404s when off (tailor-plan precedent).
- **Not touched:** the `assets` DB table, the `release-assets` Supabase Storage bucket, and existing rows/objects for releases that already have files. Workspace logo upload (`lib/workspace-logo.ts`, gated separately by `NEXT_PUBLIC_FEATURE_WORKSPACE`) and task attachments (own `TASK_ATTACHMENTS_BUCKET`) are distinct features that happen to share code/bucket context and were left alone. Storage cleanup on release deletion and account deletion (`app/api/releases/[releaseId]/route.ts`, `app/api/account/delete-now/route.ts`) also left alone — it cleans up whatever's actually in storage regardless of this flag.
- Re-enabling is a one-line env change (`NEXT_PUBLIC_FEATURE_FILES=true`); no migration either direction.
- Ledger: v0.16.4.
