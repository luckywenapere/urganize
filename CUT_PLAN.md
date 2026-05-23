# v1 Cut Plan — Urganize

> **Status:** Draft — awaiting review and approval before any code changes.
> **Generated:** 2026-05-20

This document lists every file to delete, every table to drop, and every reference to fix for each out-of-scope feature being cut from the codebase.

---

## Table of Contents

1. [Notes](#1-notes)
2. [Folders](#2-folders)
3. [Pre-save campaigns & /pre-save, /listen, /p routes](#3-pre-save-campaigns--pre-save-listen-p-routes)
4. [Listener profile generation](#4-listener-profile-generation)
5. [Credit submissions & share links (/credits, /p)](#5-credit-submissions--share-links)
6. [AI chat, existing AI release plan generator, mock-ai](#6-ai-chat-existing-ai-release-plan-generator-mock-ai)
7. [Tracks & songs as separate entities](#7-tracks--songs-as-separate-entities)
8. [Cover art as a separate flow](#8-cover-art-as-a-separate-flow)
9. [Managed artists](#9-managed-artists)
10. [Collaborators directory as standalone feature](#10-collaborators-directory-as-standalone-feature)
11. [Shared utilities requiring extraction before deletion](#11-shared-utilities-requiring-extraction-before-deletion)
12. [Documentation to delete](#12-documentation-to-delete)
13. [Analytics cleanup (cross-cutting)](#13-analytics-cleanup-cross-cutting)
14. [Onboarding cleanup (cross-cutting)](#14-onboarding-cleanup-cross-cutting)
15. [Migration to write](#15-migration-to-write)

---

## 1. Notes

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/notes/route.ts` | API route |
| `apps/web/app/api/notes/[noteId]/route.ts` | API route |
| `apps/web/app/api/notes/_shared.ts` | API shared |
| `apps/web/app/dashboard/notes/page.tsx` | Page |
| `apps/web/app/dashboard/notes/loading.tsx` | Loading |
| `apps/web/components/loading/NotesBoardSkeleton.tsx` | Component |
| `apps/web/lib/release-notes.ts` | Library |

**Delete entire directories:** `app/api/notes/`, `app/dashboard/notes/`

### Tables to drop

| Table | Notes |
|-------|-------|
| `public.release_notes` | Defined in `lib/release-notes.ts` (inline SQL). Indexes: `release_notes_user_updated_idx`, `release_notes_release_idx` |

### References to fix in kept files

**None.** The notes feature is fully isolated. No imports or references from kept code.

### Shared utilities

- **`lib/ui-drafts.ts`** — used by notes board for draft persistence, but also used by settings and onboarding. **Keep the file; no changes needed.**

---

## 2. Folders

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/folders/route.ts` | API route |
| `apps/web/app/api/folders/[id]/route.ts` | API route |
| `apps/web/app/api/folders/[id]/items/route.ts` | API route |
| `apps/web/app/api/folders/[id]/items/[itemId]/route.ts` | API route |
| `apps/web/app/api/folders/[id]/items/[itemId]/move/route.ts` | API route |
| `apps/web/app/api/folders/_shared.ts` | API shared |
| `apps/web/app/dashboard/folders/page.tsx` | Page |
| `apps/web/app/dashboard/folders/loading.tsx` | Loading |
| `apps/web/app/dashboard/folders/[id]/page.tsx` | Page |
| `apps/web/app/dashboard/folders/[id]/loading.tsx` | Loading |
| `apps/web/components/folders/FolderDashboardSkeleton.tsx` | Component |
| `apps/web/components/folders/FolderDetailClientPage.tsx` | Component |
| `apps/web/components/folders/FolderDetailSkeleton.tsx` | Component |
| `apps/web/components/folders/FolderItemCard.tsx` | Component |
| `apps/web/lib/folders.ts` | Library |

**Delete entire directories:** `app/api/folders/`, `app/dashboard/folders/`, `components/folders/`

### Tables to drop

| Table | Notes |
|-------|-------|
| `public.folders` | With indexes: `folders_user_id_idx`, `folders_updated_at_idx` |
| `public.folder_items` | With indexes: `folder_items_folder_id_idx`, `folder_items_user_id_idx`, `folder_items_type_idx` |
| enum `public.folder_item_type` | Values: note, link, file, contact, release, contract |

### References to fix in kept files

| File | What to fix |
|------|-------------|
| `components/app/AppSidebar.tsx` :59-67 | Remove the "Assets" nav item pointing to `/dashboard/folders`. Replace with a new nav item for the v1 assets feature (release file attachments), or remove entirely and re-add when assets UI is built. |
| `components/app/AppTopbar.tsx` :19-20 | Remove the two `routeTitles` entries matching `/dashboard/folders` and `/dashboard/songs`. |
| `components/app/AppSidebarSkeleton.tsx` :13,22 | Remove `/dashboard/folders` from `navItems` array and its `isActivePath` branch. Adjust skeleton count. |
| `lib/analytics/client.ts` :23-24 | Remove `folder_detail` and `folders` feature route matchers. |
| `lib/analytics/shared.ts` :17 | Remove `'folders'` from `OnboardingFeature` type. |
| `lib/analytics/shared.ts` :75-84 | Remove `folder_created`, `folder_item_added`, `folder_item_moved` event type definitions. |
| `lib/onboarding.ts` :3 | Remove `'folders'` from `OnboardingFeature` type. |

### Shared utilities

- **`components/pre-save/ReleaseCombobox.tsx`** — imported by `FolderDetailClientPage.tsx`. This component is being extracted (see §11). Folders code is deleted, so no dangling import.
- **`lib/pre-save.ts`** exports `sanitizeTextField`, `formatReleaseDate`, `PreSaveReleaseOption` — imported by folders code. All of these move to shared locations (see §11). Folders code is deleted.
- **Supabase Storage bucket `proofs`** — used by folders for file uploads. Can be dropped if nothing else uses it.

---

## 3. Pre-save campaigns & /pre-save, /listen, /p routes

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/pre-save/_shared.ts` | API shared |
| `apps/web/app/api/pre-save/campaigns/route.ts` | API route |
| `apps/web/app/api/pre-save/campaigns/[id]/export/route.ts` | API route |
| `apps/web/app/api/pre-save/[slug]/route.ts` | API route |
| `apps/web/app/api/pre-save/[slug]/subscribe/route.ts` | API route |
| `apps/web/app/api/listen/[token]/route.ts` | API route |
| `apps/web/app/dashboard/pre-save/page.tsx` | Page |
| `apps/web/app/dashboard/pre-save/loading.tsx` | Loading |
| `apps/web/app/listen/[token]/page.tsx` | Page |
| `apps/web/app/listen/[token]/loading.tsx` | Loading |
| `apps/web/app/p/[slug]/page.tsx` | Page |
| `apps/web/app/p/[slug]/loading.tsx` | Loading |
| `apps/web/components/pre-save/PreSaveDashboardSkeleton.tsx` | Component |
| `apps/web/components/pre-save/PublicPreSavePage.tsx` | Component |
| `apps/web/components/pre-save/PublicPreSaveSkeleton.tsx` | Component |
| `apps/web/components/pre-save/PreSaveCountdown.tsx` | Component |
| `apps/web/lib/pre-save.ts` | Library (**after extracting shared utils — see §11**) |

**Delete entire directories:** `app/api/pre-save/`, `app/api/listen/`, `app/dashboard/pre-save/`, `app/listen/`, `app/p/`

**Move before deleting** (see §11): `components/pre-save/ReleaseCombobox.tsx` → `components/shared/ReleaseCombobox.tsx`

Then delete remaining `components/pre-save/` directory.

### Tables to drop

| Table | Notes |
|-------|-------|
| `public.pre_save_campaigns` | Indexes: `pre_save_campaigns_user_id_idx`, `pre_save_campaigns_release_id_idx`, `pre_save_campaigns_created_at_idx` |
| `public.pre_save_subscribers` | Indexes: `pre_save_subscribers_campaign_id_idx`, `pre_save_subscribers_subscribed_at_idx`, `pre_save_subscribers_campaign_email_unique_idx` |

### References to fix in kept files

| File | What to fix |
|------|-------------|
| `components/releases/ReleaseHeader.tsx` | Remove link/button to `/dashboard/pre-save?releaseId=...` |
| `components/releases/ReleaseWorkspaceTabs.tsx` | Remove the "Pre-Save" tab and its path matching logic. |
| `app/api/releases/[releaseId]/route.ts` :25,98-99,197-199 | Remove `PRE_SAVE_CAMPAIGNS_TABLE` constant, the campaign existence check query, and the `launch_pre_save` suggested action. |
| `lib/release-checklist.ts` :144-145 | Remove the "Launch Pre-Save Campaign" checklist item. |
| `lib/release-playbook.ts` :143-145 | Remove the "Pre-save or pre-release plan ready" playbook item. |
| `lib/tasks-server.ts` :1141 | Edit description to remove "pre-save destination" mention. |
| `lib/analytics/shared.ts` :17 | Remove `'presave'` from `OnboardingFeature`. |
| `lib/analytics/shared.ts` :65-74 | Remove `track_listen_page_opened`, `presave_campaign_created`, `presave_link_copied`, `presave_email_submitted`, `presave_csv_exported` event types. |
| `lib/analytics/client.ts` :22 | Remove `pre_save` feature route matcher. |
| `components/onboarding/FirstTimeOnboardingGate.tsx` :29 | Remove `'/p/'`, `'/listen/'` from `PUBLIC_ROUTE_PREFIXES`. |
| `components/onboarding/FirstTimeOnboardingGate.tsx` :30-46 | Remove or rewrite `EDUCATION_CARDS` entries referencing credits and pre-save. |
| `lib/tasks.ts` :1 | Remove `import type { PreSaveReleaseOption } from '@/lib/pre-save'` — replace with new shared location import. |
| `app/dashboard/tasks/page.tsx` :11 | Same — update import path. |
| `app/dashboard/tasks/all/page.tsx` :10 | Same — update import path. |
| `components/tasks/TaskDetailDrawer.tsx` :4,21 | Update `ReleaseCombobox` import to new shared path; update `PreSaveReleaseOption` import. |
| `components/tasks/TaskQuickCreateModal.tsx` :4,6 | Same. |
| `components/tasks/TaskUIProvider.tsx` :16 | Same. |

### Shared utilities to extract first (see §11 for details)

- `PreSaveReleaseOption` type → rename to `ReleaseOption`, move to `lib/releases.ts` or similar
- `ReleaseCombobox` component → move to `components/shared/ReleaseCombobox.tsx`
- `formatReleaseDate` function → move to shared util
- `sanitizeTextField` function → move to shared util

---

## 4. Listener profile generation

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/listener-profile/generate/route.ts` | API route |
| `apps/web/app/api/listener-profile/inputs/route.ts` | API route |
| `apps/web/app/api/listener-profile/result/route.ts` | API route |
| `apps/web/app/api/listener-profile/_shared.ts` | API shared |
| `apps/web/app/dashboard/listener-profile/page.tsx` | Page |
| `apps/web/app/dashboard/listener-profile/loading.tsx` | Loading |
| `apps/web/lib/listener-profile.ts` | Library |
| `apps/web/lib/genres.ts` | Library (orphaned — no imports found) |

**Delete entire directories:** `app/api/listener-profile/`, `app/dashboard/listener-profile/`

### Tables to drop

| Table | Notes |
|-------|-------|
| `public.listener_profile_inputs` | Index: `listener_profile_inputs_user_id_idx` |

### References to fix in kept files

| File | What to fix |
|------|-------------|
| `components/PostAuthScreen.tsx` :30,328 | Remove `listener profile generation failed` from error message regex patterns. |
| `lib/pricing-validation.ts` :52 | Remove or reword the supporting point "Identify your unique listener profile..." |

### Shared utilities

**None.** Feature is fully isolated.

---

## 5. Credit submissions & share links

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/credits/_shared.ts` | API shared |
| `apps/web/app/api/credits/[token]/route.ts` | API route |
| `apps/web/app/api/credits/[token]/submit/route.ts` | API route |
| `apps/web/app/api/plans/[planId]/credits/route.ts` | API route |
| `apps/web/app/api/plans/[planId]/credits/submissions/[submissionId]/route.ts` | API route |
| `apps/web/app/api/share-links/[id]/revoke/route.ts` | API route (track share links) |
| `apps/web/app/credits/[token]/page.tsx` | Page |
| `apps/web/app/credits/[token]/loading.tsx` | Loading |
| `apps/web/components/credits/ClaimProfilePrompt.tsx` | Component |
| `apps/web/components/credits/CreditRequestHeader.tsx` | Component |
| `apps/web/components/credits/CreditsMetadataSection.tsx` | Component |
| `apps/web/components/credits/InvalidTokenState.tsx` | Component |
| `apps/web/components/credits/OptionalDetailsSection.tsx` | Component |
| `apps/web/components/credits/PublicCreditForm.tsx` | Component |
| `apps/web/components/credits/ReleaseContextCard.tsx` | Component |
| `apps/web/components/credits/SubmissionSuccessState.tsx` | Component |
| `apps/web/components/loading/PublicCreditFormSkeleton.tsx` | Component |
| `apps/web/lib/credits.ts` | Library |

**Delete entire directories:** `app/api/credits/`, `app/api/share-links/`, `app/credits/`, `components/credits/`

### Tables to drop

| Table | Notes |
|-------|-------|
| `public.credit_collection_links` | Index: `credit_collection_links_release_id_idx` |
| `public.contributor_submissions` | Indexes: `contributor_submissions_release_id_idx`, `contributor_submissions_link_id_idx` |
| `public.credit_finalizations` | |
| `public.credit_submissions` | Defined in `lib/release-ops.ts` — also referenced in `app/api/releases/_shared.ts` |
| `public.share_links` | Defined in `app/api/tracks/_shared.ts` — for track sharing |

### References to fix in kept files

| File | What to fix |
|------|-------------|
| `lib/release-ops.ts` :4 | Remove `CREDIT_SUBMISSIONS_TABLE` export. Remove all credit-related SQL, types (`CreditSubmission`, `CreditSubmissionInput`), validation functions, and credit metadata building functions. **Keep** collaborator-related exports (`COLLABORATORS_TABLE`, `RELEASE_COLLABORATORS_TABLE`, etc.). |
| `app/api/releases/_shared.ts` :6,21,117-129 | Remove import and re-export of `CREDIT_SUBMISSIONS_TABLE`. Remove the credit submissions schema check block and the credit metadata queries (~lines 237-253, 339, 390). |
| `app/dashboard/plans/[planId]/page.tsx` :8 | Remove import of `CreditsMetadataSection` and its JSX usage. |
| `components/onboarding/FirstTimeOnboardingGate.tsx` :29 | Remove `'/credits/'` from `PUBLIC_ROUTE_PREFIXES`. |
| `components/onboarding/FirstTimeOnboardingGate.tsx` :30-46 | Remove/rewrite the "Collect credits" education card. |
| `lib/onboarding.ts` :18 | Remove `'collecting_credits_and_metadata'` from `OnboardingBiggestHeadache` type — or keep as a survey option since it's historical data. |
| `components/releases/ReleaseReadinessCard.tsx` | Remove credit-related readiness checks (imported from `release-ops.ts`). |
| `components/releases/NextStepCard.tsx` | Remove credit-related next step actions. |

### Shared utilities

- **`lib/release-ops.ts`** — heavily mixed. Must surgically remove credit-specific exports while keeping collaborator and release metadata exports. See cleanup list above.

---

## 6. AI chat, existing AI release plan generator, mock-ai

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/ai/chat/route.ts` | API route |
| `apps/web/app/api/ai/release-plan/route.ts` | API route |
| `apps/web/app/api/ai/generate-task/route.ts` | API route |
| `apps/web/services/mock-ai.ts` | Service |
| `apps/web/components/ai/ReleasePlanGenerationState.tsx` | Component |

**Delete entire directories:** `app/api/ai/` (all three route directories), `components/ai/`, `services/`

### Tables to drop

**None.** AI features don't have their own tables.

### References to fix in kept files

| File | What to fix |
|------|-------------|
| `stores/useAIStore.ts` :5 | Remove `import { requestMockAISignals } from '@/services/mock-ai'`. Replace `runCheck` implementation with a no-op or stub until real AI signals are built. **Or delete the entire store** if signals are not needed pre-template-rebuild. |
| `components/PostAuthScreen.tsx` :13-14 | Remove `import type { ReleasePlanResult }` and `import type { ReleaseTaskPlanResponse }`. Remove the `generateOnboardingTask()` function and all code that fetches `/api/ai/release-plan` (~lines 1702-1800). Replace with template-driven generation when ready. |
| `components/onboarding/FirstTimeOnboardingGate.tsx` :601-656 | Remove the `runAiGeneration()` function and all code that fetches `/api/ai/release-plan`. Replace with template-driven generation when ready. |
| `components/execution/CommandCenterPage.tsx` :13,95,108,119-143 | Remove `useAIStore` import and `runCheck` usage. Remove fetch to `/api/ai/generate-task` and auto-generated task creation. |
| `components/execution/ReleaseWorkspacePage.tsx` :24,38,53,128,148 | Remove `useAIStore` import and all `runCheck` calls. |
| `app/api/plans/[planId]/workspace/route.ts` :3,31,80+ | Remove `import { parseReleasePlanResult, type ReleasePlanResult }` and usage. This route stores plan snapshots — rework to use template-based plan structure. |

### Shared utilities (KEEP)

- **`lib/ai/provider.ts`** — the generic AI gateway routing layer. Keep for the template-driven AI rebuild.
- **`lib/release-plan.ts`** — exports `parseReleasePlanResult()` and `ReleasePlanResult` type. Keep if workspace snapshot route still needs it, otherwise delete.
- **`lib/task-plan.ts`** — exports task plan types/parsers. Keep if useful for template rebuild, otherwise delete.
- **`lib/execution-types.ts`** — defines `AISignal`, `ExecutionRelease`, `ExecutionTask`, `ReleasePipelineState`. Keep — these types support the execution UI.

---

## 7. Tracks & songs as separate entities

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/tracks/_shared.ts` | API shared |
| `apps/web/app/api/tracks/upload/route.ts` | API route |
| `apps/web/app/api/tracks/[id]/route.ts` | API route |
| `apps/web/app/api/tracks/[id]/share-links/route.ts` | API route |
| `apps/web/app/api/songs/_shared.ts` | API shared |
| `apps/web/app/api/songs/route.ts` | API route |
| `apps/web/app/api/songs/[songId]/route.ts` | API route |
| `apps/web/app/api/plans/[planId]/songs/route.ts` | API route |
| `apps/web/app/api/plans/[planId]/songs/[songId]/route.ts` | API route |
| `apps/web/app/api/releases/[releaseId]/tracks/route.ts` | API route |
| `apps/web/app/dashboard/songs/page.tsx` | Page |
| `apps/web/app/dashboard/songs/loading.tsx` | Loading |
| `apps/web/app/dashboard/songs/[songId]/page.tsx` | Page |
| `apps/web/app/dashboard/songs/[songId]/loading.tsx` | Loading |
| `apps/web/components/tracks/ListenPageClient.tsx` | Component |
| `apps/web/components/tracks/ReleaseTracksSection.tsx` | Component |
| `apps/web/components/tracks/TrackShareLinksModal.tsx` | Component |
| `apps/web/lib/tracks.ts` | Library |
| `apps/web/lib/song-library.ts` | Library |
| `apps/web/lib/release-songs.ts` | Library |

**Delete entire directories:** `app/api/tracks/`, `app/api/songs/`, `app/api/plans/[planId]/songs/`, `app/api/releases/[releaseId]/tracks/`, `app/dashboard/songs/`, `components/tracks/`

### Tables to drop

| Table | Notes |
|-------|-------|
| `public.tracks` | Indexes: `tracks_release_id_idx`, `tracks_user_id_idx` |
| `public.share_links` | Indexes: `share_links_track_id_idx`, `share_links_user_id_idx`, `share_links_token_idx` (already listed in §5) |
| `public.song_library_songs` | Index: `song_library_songs_user_updated_idx`, `song_library_songs_release_idx` |
| `public.song_library_contributors` | Index: `song_library_contributors_song_idx` |
| `public.song_library_publishing` | FK → `song_library_songs` |
| `public.song_library_production` | FK → `song_library_songs` |
| `public.song_library_administrative` | FK → `song_library_songs` |
| `public.song_library_notes` | FK → `song_library_songs` |
| `public.release_songs` | Indexes: `release_songs_release_idx`, `release_songs_song_idx` |

**Storage buckets to drop:** `release-audio`

### References to fix in kept files

| File | What to fix |
|------|-------------|
| `components/app/AppSidebar.tsx` :64-66 | Remove `/dashboard/songs` from the match function of the Assets nav item (entire nav item being reworked per §2). |
| `components/app/AppTopbar.tsx` :20 | Remove the "Song library" `routeTitles` entry. |
| `lib/analytics/shared.ts` :56-66 | Remove `track_upload_started`, `track_upload_completed`, `track_upload_failed`, `track_share_link_created`, `track_share_link_revoked`, `track_listen_page_opened`, `track_played` event types. |
| `lib/analytics/shared.ts` :17 | Remove `'audio'` from `OnboardingFeature` type. |

### Shared utilities

- **`lib/pre-save.ts` → `sanitizeTextField`, `slugifySegment`** — imported by `tracks.ts` and track upload route. Since tracks code is deleted and `pre-save.ts` is also deleted, these move to a shared utility (see §11).

---

## 8. Cover art as a separate flow

The cover-art route uploads to a separate `release-cover-art` storage bucket. In v1, cover art is just another asset in the `release-assets` bucket via the `assets` table (category = `'cover_art'`).

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/releases/cover-art/route.ts` | API route |

### Tables to drop

**None.** No dedicated table — just a storage bucket.

**Storage buckets to drop:** `release-cover-art`

### References to fix in kept files

| File | What to fix |
|------|-------------|
| `components/releases/CreateReleaseModal.tsx` :25-27,32-33,56-70,101,160,173,191,202 | Remove `CoverUploadResponse` type, `MAX_COVER_SIZE_BYTES`, `ACCEPTED_COVER_TYPES`, `validateCoverImage()`, and the fetch to `/api/releases/cover-art`. Replace with upload to the `assets` table via the existing asset upload flow (or accept cover art URL from a new asset-based upload). |
| `components/PostAuthScreen.tsx` :1095 | The checklist item `cover_art_approved` is fine — it's a logical step, not tied to the separate route. Keep it. |

---

## 9. Managed artists

### Files to delete

| Path | Type |
|------|------|
| `apps/web/app/api/managed-artists/_shared.ts` | API shared |
| `apps/web/app/api/managed-artists/route.ts` | API route |
| `apps/web/app/api/managed-artists/[artistId]/route.ts` | API route |

**Delete entire directory:** `app/api/managed-artists/`

### Tables to drop

| Table | Notes |
|-------|-------|
| `public.managed_artists` | Index: `managed_artists_manager_user_id_idx` |

### References to fix in kept files

| File | What to fix |
|------|-------------|
| `app/settings/page.tsx` :51,74-75,109-120,155,170-174,223,510-580,932-1006 | Remove all managed artist state (`managedArtistForm`, `managedArtists`, `ManagedArtist` type), fetches to `/api/managed-artists`, handlers (`handleSaveManagedArtist`, `handleDeleteManagedArtist`), and the entire "Managed Artists" settings UI section. |
| `components/PostAuthScreen.tsx` :420-425+ | Remove all managed artist state declarations (`selectedManagedArtistId`, `showAddManagedArtistForm`, `newManagedArtistName/Genre/Notes`, `managedArtists`, `managedArtistsLoading`), the `ManagedArtistOption` type, and functions: `loadManagedArtists()`, `applyManagedArtistToState()`, `moveManagedArtistSelection()`, `handleContinueManagedArtist()`, `handleSaveManagedArtist()`. Remove the artist selector UI and its props. |
| `components/loading/SettingsPageSkeleton.tsx` :37-58,152 | Remove `SettingsManagedArtistsSectionSkeleton` function and its call in the main skeleton. |

### Shared utilities

**None.** Managed artists API has its own isolated `_shared.ts`.

---

## 10. Collaborators directory as standalone feature

**Finding: No standalone collaborators directory exists in the codebase.**

All collaborator management is already scoped to releases via `app/api/releases/[releaseId]/collaborators/`. There is no separate `/dashboard/collaborators` page or standalone collaborators route.

### What STAYS (no action needed)

- `app/api/releases/[releaseId]/collaborators/route.ts` — release-scoped
- `app/api/releases/[releaseId]/collaborators/[id]/remind/route.ts` — release-scoped
- `components/releases/AddCollaboratorModal.tsx`
- `components/releases/CollaboratorStatusTable.tsx`
- `components/releases/CollaboratorStatusCard.tsx`
- `components/loading/CollaboratorTableSkeleton.tsx`
- `types/database.ts` — `CollaboratorRow`, `ReleaseCollaboratorRow` types
- Database tables: `public.collaborators`, `public.release_collaborators`

### Action

**No files to delete. No tables to drop.** This item is already clean.

---

## 11. Shared utilities requiring extraction before deletion

Before deleting `lib/pre-save.ts` and `components/pre-save/ReleaseCombobox.tsx`, extract the following shared code:

### 11a. `ReleaseCombobox` component

**Current location:** `components/pre-save/ReleaseCombobox.tsx`
**Move to:** `components/shared/ReleaseCombobox.tsx`
**Used by (after cut):** `TaskDetailDrawer`, `TaskQuickCreateModal`

### 11b. `PreSaveReleaseOption` type

**Current location:** `lib/pre-save.ts`
**Rename to:** `ReleaseOption`
**Move to:** `lib/releases.ts` or a new `lib/shared-types.ts`
**Used by (after cut):** `TaskDetailDrawer`, `TaskQuickCreateModal`, `TaskUIProvider`, `tasks/page.tsx`, `tasks/all/page.tsx`, `lib/tasks.ts`, `ReleaseCombobox`

### 11c. `formatReleaseDate` function

**Current location:** `lib/pre-save.ts`
**Move to:** `lib/releases.ts` or `lib/format.ts`
**Used by (after cut):** `ReleaseCombobox` (which also moves)

### 11d. `sanitizeTextField` function

**Current location:** `lib/pre-save.ts`
**Move to:** `lib/text-utils.ts` or `lib/sanitize.ts`
**Used by (after cut):** Nothing after tracks and folders are deleted. Can be dropped entirely unless there's a future use case.

### 11e. `slugifySegment` function

**Current location:** `lib/pre-save.ts`
**Move to:** Can be dropped — only used by `tracks/upload/route.ts` which is being deleted.

---

## 12. Documentation to delete

| Path | Reason |
|------|--------|
| `apps/web/docs/DB_MIGRATION_PRE_SAVE.md` | Pre-save cut |
| `apps/web/docs/DB_MIGRATION_LISTENER_PROFILE.md` | Listener profile cut |
| `apps/web/docs/DB_MIGRATION_MANAGED_ARTISTS.md` | Managed artists cut |
| `apps/web/docs/DB_MIGRATION_FOLDERS.md` | Folders cut |
| `apps/web/docs/DB_MIGRATION_TRACKS.md` | Tracks cut |
| `apps/web/docs/RELEASE_NOTES_SCHEMA.sql` | Notes cut |
| `apps/web/docs/RELEASE_SONGS_SCHEMA.sql` | Songs cut |
| `apps/web/docs/SONG_LIBRARY_SCHEMA.sql` | Songs cut |
| `apps/web/docs/RELEASE_OPERATIONS_SCHEMA.sql` | Credit submissions cut (review — may partially apply) |
| `apps/web/docs/credits_collection_schema.sql` | Credits cut |

**Also update:**
- `apps/web/docs/LAUNCH_QA_CHECKLIST.md` — remove sections referencing notes, folders, pre-save, listener profile, managed artists, credits, songs, tracks.

---

## 13. Analytics cleanup (cross-cutting)

After all feature deletions, clean up `lib/analytics/shared.ts`:

**Remove from `OnboardingFeature` type:**
- `'presave'`, `'audio'`, `'folders'` → type becomes empty or is deleted

**Remove from `AnalyticsEventPropertiesMap`:**
- `track_upload_started`, `track_upload_completed`, `track_upload_failed`
- `track_share_link_created`, `track_share_link_revoked`
- `track_listen_page_opened`, `track_played`
- `presave_campaign_created`, `presave_link_copied`, `presave_email_submitted`, `presave_csv_exported`
- `folder_created`, `folder_item_added`, `folder_item_moved`
- `release_cover_art_uploaded` (if cover art flow is fully replaced)

**Remove from `lib/analytics/client.ts` `featureRouteMatchers`:**
- `pre_save`, `folder_detail`, `folders`

---

## 14. Onboarding cleanup (cross-cutting)

Files affected by multiple cuts:

### `components/onboarding/FirstTimeOnboardingGate.tsx`

- Remove `'/p/'`, `'/listen/'`, `'/credits/'` from `PUBLIC_ROUTE_PREFIXES` :29
- Rewrite `EDUCATION_CARDS` :30-46 — remove credits and pre-save cards, keep release workspace card, add v1-relevant cards
- Remove any managed artist selection UI if present

### `lib/onboarding.ts`

- `OnboardingFeature` :3 — remove all three values (type may become unused)
- `OnboardingBiggestHeadache` :18 — consider removing `'collecting_credits_and_metadata'` (but it's historical survey data, so keeping the enum value is safe)
- `OnboardingReleaseProcess` :12 — `'spreadsheets_or_notes'` is fine — "notes" here is a generic word, not the feature

### `components/PostAuthScreen.tsx`

This file is hit by multiple cuts (managed artists, AI release plan, listener profile, credits, cover art). Plan the edits together to avoid conflicts:

1. Remove managed artist state and UI (§9)
2. Remove AI release plan generation code (§6)
3. Remove listener profile error regex (§4)
4. Keep cover art checklist item (§8 — it's a logical step)

---

## 15. Migration to write

Create a new SQL migration to drop all cut tables:

```sql
-- v1 cut: drop out-of-scope tables
-- Run AFTER confirming no production data needs to be preserved

-- Notes
drop table if exists public.release_notes cascade;

-- Folders
drop table if exists public.folder_items cascade;
drop table if exists public.folders cascade;
drop type if exists public.folder_item_type;

-- Pre-save
drop table if exists public.pre_save_subscribers cascade;
drop table if exists public.pre_save_campaigns cascade;

-- Listener profile
drop table if exists public.listener_profile_inputs cascade;

-- Credits
drop table if exists public.credit_finalizations cascade;
drop table if exists public.contributor_submissions cascade;
drop table if exists public.credit_collection_links cascade;
drop table if exists public.credit_submissions cascade;

-- Tracks & songs
drop table if exists public.release_songs cascade;
drop table if exists public.song_library_notes cascade;
drop table if exists public.song_library_administrative cascade;
drop table if exists public.song_library_production cascade;
drop table if exists public.song_library_publishing cascade;
drop table if exists public.song_library_contributors cascade;
drop table if exists public.song_library_songs cascade;
drop table if exists public.share_links cascade;
drop table if exists public.tracks cascade;

-- Managed artists
drop table if exists public.managed_artists cascade;

-- Duplicate activity log (per CLAUDE.md known issue #3)
drop table if exists public.activity_log cascade;
```

**Storage buckets to clean up (manual via Supabase dashboard):**
- `proofs` (folders)
- `release-audio` (tracks)
- `release-cover-art` (cover art separate flow)

---

## Execution order

1. **Extract shared utilities** (§11) — move `ReleaseCombobox`, `ReleaseOption` type, `formatReleaseDate` to shared locations. Commit.
2. **Delete feature files** (§1–§9) — all the file deletions in one pass. Commit.
3. **Fix references in kept files** — update imports, remove dead UI sections, clean sidebar/topbar. Commit.
4. **Analytics and onboarding cleanup** (§13–§14). Commit.
5. **Delete documentation** (§12). Commit.
6. **Write and apply the drop-tables migration** (§15). Commit.
7. **Run `pnpm lint`** — fix any remaining broken imports or unused variables.
8. **Manual smoke test** — dashboard loads, releases CRUD works, tasks work, settings page renders.
