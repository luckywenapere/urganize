# REFACTOR_NOTES.md

Read-only audit of `apps/web` against the root `CLAUDE.md`. No code modified.

---

## 0. Source documents

- **Root `CLAUDE.md`** — `CLAUDE.md` (exists, trimmed earlier in this session).
- **Nested CLAUDE.md** — none found. Glob `**/CLAUDE.md` returned only the root file.
- **CONSOLIDATION_SPEC.md** — **not present anywhere in the repo.** Glob `**/CONSOLIDATION_SPEC.md` returned no matches. The "Conflicts to watch" section at the end can only be drafted in general terms until a spec file is supplied.

### Conventions and architectural principles established by `CLAUDE.md`

**Product shape (v1):**
- Urganize is an AI Music Manager for artists, managers and labels; v1 targets independent music managers (1-3 artists).
- **The release is the spine.** Every feature must tie back to a release; if it can't, it's not v1.
- Six v1 scope items only: release object, AI-tailored rollout plan from templates, tasks (assignees+dependencies), file/asset attachment, lightweight event milestones, AI status update generator.
- A long, explicit "out of scope" list — answer is *v2* for anything on it.

**Architectural principles (9):**
1. Release is the spine — new features attach to the release, not standalone surfaces.
2. Templates carry domain knowledge; AI is a removable polish layer.
3. Structured data over free text — enumerate statuses/types/categories.
4. Single-tenant mental model, multi-tenant implementation (RLS).
5. Boring stack — Next.js App Router, Supabase, Tailwind, Zustand, XState. No new frameworks in v1.
6. Build for the case we have (1 paying user, 1 design partner team), not for hypothetical scale.
7. Feature flags from day one — env/user/workspace based.
8. Visible state changes — no silent operations.
9. Schema changes only via `supabase/migrations/`.

**Stack baseline:** TypeScript 5 strict, Next.js 16 App Router, React 19, pnpm 10.6.4 + Turborepo, Tailwind v3 (web) / v4 (homepage), shared `packages/config/tailwind/preset.js`, Supabase for `apps/web`, no test runner.

**Anti-patterns explicitly named:**
- The `Db*` type drift pattern (legacy `DbRelease`/`DbTask`/`DbFile` removed; **listed as resolved**).
- The "schema-missing fallback" pattern (`buildMissingTableResponse`) — kept for dev convenience but not to be extended.
- Four separate `getAuthenticatedUser` definitions — flagged as consolidation pending.

**Conventions:**
- PascalCase `.tsx` components, camelCase hooks `use*`, `use*Store` for Zustand stores.
- Route handlers: always `route.ts`. Per-domain helpers in `_shared.ts`.
- DB columns `snake_case`, TS types `camelCase`.
- Protected API routes use `requireActiveAuthenticatedUser`; open routes use `getAuthenticatedUser`.
- Long-running AI calls go through `apps/web/lib/ai/provider.ts`.
- Shared primitives from `packages/ui` across apps.

---

## 1. Router type and route file paths

**Router:** Next.js 16 **App Router** (`apps/web/app/` directory, file-based, route handlers under `app/api/**/route.ts`).

| Route | File |
|---|---|
| Dashboard | `apps/web/app/dashboard/page.tsx` |
| Releases (list) | `apps/web/app/dashboard/releases/page.tsx` → delegates to `apps/web/components/releases/ReleasesDashboardPage.tsx` |
| Release (detail) | `apps/web/app/dashboard/releases/[releaseId]/page.tsx` |
| Tasks | `apps/web/app/dashboard/tasks/page.tsx` |
| Settings | `apps/web/app/settings/page.tsx` |
| Locked (paywall) | `apps/web/app/locked/page.tsx` |
| Auth | `apps/web/app/auth/page.tsx` (+ `forgot-password`, `reset-password`, `callback`) |
| Admin | `apps/web/app/admin/page.tsx` |
| Payment callback | `apps/web/app/payment/callback/page.tsx` |
| Old release detail (vestigial) | `apps/web/app/release/[id]/page.tsx` |
| Root | `apps/web/app/page.tsx` |

There is **no `middleware.ts`** — auth is enforced per-route via `getAuthenticatedUser` / `requireActiveAuthenticatedUser` (per root CLAUDE.md).

---

## 2. What each route renders + `@urganize/ui` primitives used

### Dashboard — `apps/web/app/dashboard/page.tsx`
- **Renders:** greeting (`Welcome back, {firstName}`), release count subtitle, optional error banner, "Releases" grid of `<Link>` cards (artist name, title, release date, "X of Y tasks done"), "Due soon" list (top 5 not-done tasks with `dueDate`, sorted ascending).
- **`@urganize/ui` primitives used:** **none.** The dashboard does not import from `@urganize/ui`. Card-like surfaces are raw `<div>` + Tailwind tokens (`border-stroke-default bg-bg-surface`).
- **Other imports:** `SkeletonBlock` from `@/components/loading/SkeletonBlock`, lucide icons (`AlertCircle`, `CalendarDays`), `useAuthStore`, `useReleaseStore`, `useTaskStore`, `TASK_DONE_STATUS` and `formatArtistName` helpers.
- Inline skeleton component: `DashboardSkeleton` (local function, composes `SkeletonBlock`).

### Releases (list) — `ReleasesDashboardPage.tsx`
- **Renders:** header section (kicker "Release operations" + h1 "Releases" + description + Refresh button), error banner, loading grid of 6 `ReleaseCardSkeleton`s, `EmptyState` with "Create release" CTA, grid of `<ReleaseCard>` (1/2/3/4 cols), and `<CreateReleaseModal>`.
- **`@urganize/ui` primitives used:** `Button` (with `variant`, `size`, `isLoading`, `leftIcon` props).
- **Other imports:** `EmptyState`, `CreateReleaseModal`, `ReleaseCard`, `SkeletonBlock`, lucide icons (`AlertCircle`, `Plus`, `RefreshCw`).
- Inline skeleton: `ReleaseCardSkeleton` + `ReleasesLoadingGrid` (local functions).

### Tasks — `apps/web/app/dashboard/tasks/page.tsx`
- **Renders:** header ("My tasks" kicker, "Next tasks" h1, description), "Mine only" toggle (URL `mine=1`), "New task" button (opens quick-create), three filter selects (Release / Priority / Status), five `<SectionCard>`s for the sections `overdue` / `today` / `week` / `upcoming` / `no_due_date`. Each section has an "Add" button for inline task creation (with autofocus input + Save). Sections render `<TaskRow>`s or `EmptyState`. Page-level `<EmptyState>` when total === 0.
- **`@urganize/ui` primitives used:** **none.** Page uses local components only.
- **Other imports:** `EmptyState`, `SectionCard`, `Toast`, `TaskRow`, `useTaskUI` + `TASKS_CHANGED_EVENT` from `TaskUIProvider`, `captureAnalyticsEvent`, `type ReleaseOption` from `release-helpers`, task helpers from `lib/tasks`, `supabase` client.

### Release detail — `apps/web/app/dashboard/releases/[releaseId]/page.tsx`
- Reads `releaseId` from `useParams()`, gates AI sections behind `NEXT_PUBLIC_FEATURE_TAILOR_PLAN` and `NEXT_PUBLIC_FEATURE_STATUS_UPDATE` (see §5). Uses `ReleaseInfoSection`, `AssetSection`, `TailorPlanModal`, `StatusUpdateModal`, `TaskCompletionCheckbox`, `Toast`, `ProgressBar`, `SkeletonBlock`.

### `@urganize/ui` surface (full inventory)
`packages/ui/src/`: `AiRecoveryActions.tsx`, `AudioPlayer.tsx`, `Button.tsx`, `Card.tsx`, `Input.tsx`, `LoadingScreen.tsx`, `Logo.tsx`, `SearchableGenreSelect.tsx`, `ThemeToggle.tsx`. **Among the three core routes, only `Button` is consumed** (in `ReleasesDashboardPage`). The `Logo` primitive is consumed by `AppSidebar`. Dashboard and Tasks pages use *no* shared primitives at all — surfaces are local Tailwind divs.

---

## 3. How releases and tasks are fetched, and the canonical types

### Fetch patterns

| Surface | Mechanism | Endpoint | Token |
|---|---|---|---|
| Dashboard | `useReleaseStore.loadCommandCenter()` | `/api/command-center` | Bearer from `supabase.auth.getSession()` |
| Releases list | Direct `fetch()` inside the component | `/api/releases` | Bearer |
| Release create | `useReleaseStore.createRelease()` | `POST /api/releases` | Bearer |
| Tasks list | Direct `fetch()` inside the component | `/api/tasks?<searchParams>` | Bearer |
| Release detail tasks | `useTaskStore` state (hydrated by `loadCommandCenter`) + per-action PATCH/POST | `/api/tasks/[id]` | Bearer |
| Release selector for Tasks page | Direct `fetch()` | `/api/releases` (selector payload is the only GET view since 2026-07-10) | Bearer |

The Zustand stores live at:
- `apps/web/stores/useReleaseStore.ts` — `{ releases, todaysDirective, isInitialLoading, isRefreshing, error, loadCommandCenter, createRelease }`.
- `apps/web/stores/useTaskStore.ts` — `{ tasks, selectedTaskId, error, setTasks, selectTask, createTask, updateRequirement, completeTask, tasksForRelease }`.
- `apps/web/stores/useActivityStore.ts`.

**Note:** `loadCommandCenter` hydrates both `useTaskStore` and `useActivityStore` as a side effect. The **Tasks page does *not* use `useTaskStore`** — it goes straight to `/api/tasks`. The Dashboard page *does*.

Auth token retrieval is duplicated as a local `getAccessToken()` async in every fetcher (the stores and both pages each ship their own copy). Minor drift target.

### Canonical Release type — `apps/web/types/releases.ts` lines 1–41 (verbatim)

```ts
export const RELEASE_PIPELINE_STATES = [
  'idea',
  'planning',
  'asset_prep',
  'distribution',
  'campaign',
  'post_release',
] as const;

export type ReleasePipelineState = (typeof RELEASE_PIPELINE_STATES)[number];

export const RELEASE_STATUS_OPTIONS = [
  'draft',
  'planning',
  'in_progress',
  'ready',
  'released',
  'archived',
] as const;

export type ReleaseStatus = (typeof RELEASE_STATUS_OPTIONS)[number];

export interface Release {
  id: string;
  ownerUserId: string;
  title: string;
  artistName: string;
  status: ReleaseStatus;
  state: ReleasePipelineState;
  releaseDate: string | null;
  description: string | null;
  readinessScore: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Currently identical to Release; kept as a named alias so execution-side
// callers can adopt extra fields without refactoring all import sites.
export type ExecutionRelease = Release;
```

### Canonical Task type — `apps/web/types/tasks.ts` lines 70–132 (verbatim, includes the priority + due-date fields the prompt asks for)

```ts
export const TASK_STATUS_OPTIONS = [
  'locked',
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUS_OPTIONS)[number];

export const TASK_PRIORITY_OPTIONS = ['urgent', 'high', 'medium', 'low', 'none'] as const;

export type TaskPriority = (typeof TASK_PRIORITY_OPTIONS)[number];

export interface TaskRequirement {
  type: 'file_upload' | 'field_completion' | 'approval' | 'external_action';
  spec: string;
  satisfied: boolean;
}

export interface TaskReleaseSummary {
  id: string;
  title: string;
  artistName: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  groupId: string | null;
  releaseId: string | null;
  createdBy: string;
  assignedToUserId: string | null;
  assignedTo: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  position: number;
  requirement: TaskRequirement | null;
  dependencies: string[];
  state: ReleasePipelineState;
  autoGenerated: boolean;
  /** Template classification: a work item ('task') or a dated point on the
   * timeline ('event_milestone'). Sourced from metadata.template.task_type;
   * defaults to 'task' for rows that predate the template flow. */
  taskType: 'task' | 'event_milestone';
  createdAt: string;
  updatedAt: string;

  // Relations (optional)
  release?: TaskReleaseSummary | null;
  group?: TaskGroup | null;
  assignee?: WorkspaceMember | null;
  context?: TaskContextLink;
  commentCount?: number;
  attachmentCount?: number;
}
```

**Due-date field:** `dueDate: string | null` (ISO timestamp string).
**Priority field:** `priority: TaskPriority`, where `TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none'`.

### Duplicate type definitions (the anti-pattern called out in CLAUDE.md)

Three layers of drift exist. CLAUDE.md says `Db*` prefixed types were removed because they "drifted from the schema and were unused" — but several other duplicates remain:

**(A) `apps/web/types/index.ts` — orphan file (no importers; verified with `Grep` for `from '@/types'` and `from '@/types/index'` — 0 matches in `apps/web`):**

```ts
// types/index.ts line 17
export interface Release {
  id: string;
  title: string;
  artistName: string;
  type: ReleaseType;         // 'single' | 'ep' | 'album'  — not on canonical
  status: ReleaseStatus;     // 'draft' | 'in-progress' | 'ready' | 'released'  — hyphen-style; different from canonical
  releaseDate?: Date;        // Date, not string | null
  coverArt?: string;
  userId: string;            // canonical uses ownerUserId
  createdAt: Date;
  updatedAt: Date;
}

// types/index.ts line 34
export interface Task {
  id: string;
  releaseId: string;
  userId: string;
  title: string;
  description?: string;
  phase: TaskPhase;          // 'pre-production' | 'production' | 'promotion' | 'distribution'  — not on canonical
  status: TaskStatus;        // 'pending' | 'in-progress' | 'completed'  — completely different vocabulary
  dueDate?: Date;            // Date, not string | null
  assignedTo?: string;
  isSystemGenerated: boolean;
  order: number;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
}
```

Plus duplicate `UserRole`, `ReleaseStatus`, `TaskStatus`, and Zustand store-shape types (`AuthState`, `ReleaseState`, `TaskState`, `FileState`) — all unused. **This entire file is dead code** but the anti-pattern stipulation in CLAUDE.md says duplicates are a hazard; leaving the file invites future `@/types` imports that quietly resurrect a stale shape.

**(B) `apps/web/types/database.ts` — DB-row types with overlapping enums:**

```ts
export type ReleaseStatus = 'draft' | 'planning' | 'in_progress' | 'ready' | 'released' | 'archived';   // matches canonical ✓
export type TaskStatus = 'locked' | 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';   // MISSING 'blocked' that types/tasks.ts has ✗
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';   // matches canonical ✓
export type ReleaseType = 'single' | 'ep' | 'album';
```

`database.ts` redeclares `ReleaseStatus`, `TaskStatus`, `TaskPriority` as standalone unions rather than re-exporting the canonical ones. The `TaskStatus` here is **out of sync** — it's missing `'blocked'`. Any code path that imports `TaskStatus` from `database.ts` cannot represent a blocked task. (I didn't grep every callsite; flag as risk.)

**(C) `apps/web/lib/execution-types.ts` — wrapper types that conflict with `types/releases.ts`:**

```ts
// execution-types.ts
export type ExecutionRelease = Release & {
  readinessScore: number;
};
```

But `Release` in `types/releases.ts` already declares `readinessScore: number`. So the intersection adds nothing; it just re-declares an existing field. Worse, `types/releases.ts` *also* defines `ExecutionRelease`:

```ts
// types/releases.ts last line
export type ExecutionRelease = Release;
```

Two files both export a public name `ExecutionRelease` with different definitions. The stores import from `@/lib/execution-types`; nothing imports `ExecutionRelease` from `@/types/releases` (as far as the spot-checks revealed). Pick one home and re-export.

**(D) The `UserRole` union differs between `types/index.ts` (orphan, 4 roles) and `types/auth.ts` (canonical, 6 roles).** Not load-bearing while `types/index.ts` is unused, but a footgun.

---

## 4. Sidebar / nav component and how routes are registered

**File:** `apps/web/components/app/AppSidebar.tsx`.

Routes are hardcoded in a module-scoped `navItems: NavItem[]` array (lines 33–59):

```ts
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match: (pathname: string | null) => boolean;
};

const navItems: NavItem[] = [
  { href: '/dashboard',          label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dashboard' },
  { href: '/dashboard/releases', label: 'Releases',  icon: BarChart3,       match: (p) => p?.startsWith('/dashboard/releases') === true },
  { href: '/dashboard/tasks',    label: 'Tasks',     icon: CheckSquare2,    match: (p) => p?.startsWith('/dashboard/tasks') === true },
  { href: '/settings',           label: 'Settings',  icon: Settings,        match: (p) => p === '/settings' || p?.startsWith('/settings/') === true },
];
```

- Icons come from `lucide-react`.
- `match` is a function on the active pathname (from `usePathname()`), so nested paths can be active even when the link is the parent.
- Renders `<Link>` from `next/link`. Active state uses Tailwind tokens `border-stroke-default bg-bg-sidebar-active text-content-primary`.
- The sidebar imports `Logo` from `@urganize/ui` for the expanded header; collapsed state shows the `/images/urganize-mark.png` asset.
- Mobile + collapsed states are handled by `SidebarFrame` (same file).
- **To add a new nav item: append to `navItems` in this file.** There is no central route registry, no JSON config, no route metadata sidecar.

---

## 5. Feature-flag mechanism + how to gate a new route or view

**Mechanism:** env-based, string-compared, no central module. Two flags exist in v1:

| Flag | File references |
|---|---|
| `NEXT_PUBLIC_FEATURE_TAILOR_PLAN` | `apps/web/app/dashboard/releases/[releaseId]/page.tsx:28`, `apps/web/app/api/releases/[releaseId]/tailor-plan/route.ts:27`, `apps/web/.env.example:94` |
| `NEXT_PUBLIC_FEATURE_STATUS_UPDATE` | `apps/web/app/dashboard/releases/[releaseId]/page.tsx:29`, `apps/web/app/api/releases/[releaseId]/generate-status/route.ts:22`, `apps/web/.env.example:99` |

**Client-side pattern** (release detail page, lines 25–29):

```ts
// Feature flags — both AI features stay hidden until the gateway is wired to a
// capable model. NEXT_PUBLIC_ prefix so the value is inlined at build time for
// this client component. The API routes guard the same flags server-side.
const TAILOR_PLAN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TAILOR_PLAN === 'true';
const STATUS_UPDATE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_STATUS_UPDATE === 'true';
```

**Server-side pattern** (`tailor-plan/route.ts`, lines 22–27):

```ts
// Feature flag — the AI provider isn't wired to a capable model yet, so the
// whole tailoring feature stays dark until NEXT_PUBLIC_FEATURE_TAILOR_PLAN is
// 'true'. When off, both handlers 404 so a direct API call can't invoke the
// model either.
const isTailorPlanEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_TAILOR_PLAN === 'true';
```

The server-side handler returns 404 when the flag is off — *not* 403 — so probing the URL gives nothing away.

**No user-based or workspace-based flagging exists.** No `getFeatureFlag(user, flag)` helper, no `useFeatureFlag()` hook, no flag table in the schema. CLAUDE.md principle #7 ("Feature flags from day one — env-based, user-based, or workspace-based") is currently satisfied by the env-based slice only.

**To gate a new route/view in this codebase:**
1. Pick a flag name with the `NEXT_PUBLIC_FEATURE_` prefix (so the value is inlined into the client bundle at build time).
2. At the top of the client page/component: `const X_ENABLED = process.env.NEXT_PUBLIC_FEATURE_X === 'true';`. Conditionally render — typically returning `null` or a teaser when false.
3. In every Route Handler the feature touches: same check, and `return new NextResponse(null, { status: 404 })` when off (mirror the existing handlers' shape; they 404 quietly).
4. Add a commented entry to `apps/web/.env.example` documenting the flag and its default (the existing flags use commented `# NEXT_PUBLIC_FEATURE_X=false`).
5. Add the variable name to `turbo.json`'s `tasks.build.env` allowlist **only if** you want the value to participate in Turborepo's build hash. (The two existing flags are *not* in `turbo.json`'s env list — they're inlined at build time by Next/Webpack regardless, but adding them would make `turbo` re-hash builds when the flag value changes.)
6. To take it live in production: set the env var on the relevant Vercel project (`Web` for app routes).

There is no per-user or per-workspace overriding short of writing a lookup in your handler — the codebase has no precedent yet.

---

## 6. Tailwind config + design tokens

**apps/web Tailwind config** — `apps/web/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";
import sharedPreset from "@urganize/config/tailwind";

const config: Config = {
  presets: [sharedPreset],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}"
  ]
};

export default config;
```

Tailwind v3 (autoprefixer + postcss as dev deps). Scans `app/`, `components/`, `lib/`, `types/`, and the shared `packages/ui/src/`.

**Shared preset** — `packages/config/tailwind/preset.js` exports a Tailwind config that uses CSS-variable colors with the `<alpha-value>` shorthand so each token supports opacity slots (`bg-bg-base/50`, etc.). The CSS variables themselves are defined in `apps/web/app/globals.css` `:root` and `.dark` blocks (the app is hard-locked to dark mode per CLAUDE.md).

**Color tokens (from `preset.js`):**

| Family | Tokens |
|---|---|
| `bg.*` | `base`, `sidebar`, `sidebar-active`, `surface`, `elevated`, `overlay`, `hover`, `active` |
| `brand.*` | `DEFAULT`, `hover`, `muted` (16% alpha), `subtle` (8% alpha) |
| `content.*` | `primary`, `secondary`, `tertiary`, `quaternary`, `inverse` |
| `stroke.*` | `subtle` (4%), `default` (6%), `strong` (10%) |
| `status.*` | `success`, `warning`, `error`, `info` |

**RGB values (from `apps/web/app/globals.css`):**

```css
--color-bg-base: 15 15 15;
--color-bg-sidebar: 20 20 20;
--color-bg-sidebar-active: 30 30 30;
--color-bg-surface: 26 26 26;
--color-bg-elevated: 28 28 28;
--color-bg-overlay: 23 23 23;
--color-bg-hover: 30 30 30;
--color-bg-active: 30 30 30;
--color-brand: 62 207 142;
--color-brand-hover: 85 219 156;
--color-text-primary: 226 226 226;
--color-text-secondary: 128 128 128;
--color-text-tertiary: 102 102 102;
--color-text-quaternary: 74 74 74;
--color-text-inverse: 9 15 11;
--color-stroke: 255 255 255;
--color-status-success: 62 207 142;
--color-status-warning: 240 185 92;
--color-status-error: 240 106 106;
--color-status-info: 120 169 255;
```

Brand color is green `rgb(62 207 142)` — same as status-success. (Identical values; this is intentional but worth noting if anyone ever wants the two distinct.)

**Other preset extensions:**
- Fonts: `font-sans` IBM Plex Sans, `font-display` Space Grotesk, `font-mono` JetBrains Mono.
- Custom font sizes (xs–4xl) with line-heights, plus negative letter-spacing on the larger headings.
- Custom spacing: `18` (72px), `88` (352px).
- Custom border radius: `sm` 4px → `2xl` 16px.
- Custom shadows including `glow` and `glow-sm` (brand-tinted).
- Animations: `fade-in`, `scale-in`, `slide-in`, `pulse-glow`, `shimmer`, `spin`, `bounce-in`.
- Transition timing functions: `out`, `in-out`, `spring`.
- Transition durations: `instant` 50ms → `slower` 500ms.

---

## 7. Loading-skeleton components + "Refresh" implementation

### Skeleton primitive

`apps/web/components/loading/SkeletonBlock.tsx` (verbatim — 10 lines):

```tsx
'use client';

type SkeletonBlockProps = {
  className?: string;
};

export function SkeletonBlock({ className = '' }: SkeletonBlockProps) {
  return <div aria-hidden="true" className={`skeleton-shimmer ${className}`} />;
}
```

The actual shimmer animation comes from the `.skeleton-shimmer` class declared in `apps/web/app/globals.css` (paired with the `shimmer` keyframes in the Tailwind preset).

### Page/section skeletons in `apps/web/components/loading/`

- `RootShellSkeleton.tsx`, `DashboardPageSkeleton.tsx`, `SettingsPageSkeleton.tsx`
- `PageHeaderSkeleton.tsx`, `SectionCardSkeleton.tsx`, `CenteredMessageSkeleton.tsx`
- `CollaboratorTableSkeleton.tsx`, `SongLibrarySkeleton.tsx`, `SongMetadataSkeleton.tsx`
- `AppSidebarSkeleton.tsx` (lives under `components/app/`)

**Caveat:** the active route pages (Dashboard, Releases list, Tasks) do **not** import the dedicated page-level skeleton components. Each one defines its own inline skeleton:
- Dashboard → local `DashboardSkeleton()` function in `app/dashboard/page.tsx`.
- Releases list → local `ReleaseCardSkeleton()` + `ReleasesLoadingGrid()` in `ReleasesDashboardPage.tsx`.
- Tasks → local `TaskSectionLoadingState()` in `app/dashboard/tasks/page.tsx` (uses the raw `skeleton-shimmer` class directly, not `SkeletonBlock`).

The pre-built `DashboardPageSkeleton`, `SettingsPageSkeleton`, `SongLibrarySkeleton`, etc. may be dead code — worth confirming before any refactor reuses them.

### "Refresh" action

Only one place: **`ReleasesDashboardPage.tsx`**. Pattern (lines 65–138):

```tsx
const [isLoading, setIsLoading] = useState(true);
const [isRefreshing, setIsRefreshing] = useState(false);

const loadReleases = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
  if (mode === 'initial') setIsLoading(true);
  else setIsRefreshing(true);
  // ...fetch...
  setIsLoading(false);
  setIsRefreshing(false);
}, []);

// In the header:
<Button
  type="button"
  variant="secondary"
  size="md"
  onClick={() => void loadReleases('refresh')}
  isLoading={isRefreshing}
  leftIcon={<RefreshCw className="h-4 w-4" />}
>
  Refresh
</Button>
```

Key points:
- `Button` from `@urganize/ui` with its built-in `isLoading` handling.
- `RefreshCw` icon from `lucide-react`.
- Two distinct loading modes (`initial` skeleton vs `refresh` button spinner) gated by separate boolean state.
- After `CreateReleaseModal` succeeds it calls `void loadReleases('refresh')` to avoid the full skeleton flash.

`useReleaseStore` carries the same shape internally — `isInitialLoading` vs `isRefreshing` flags — but neither the Dashboard nor the Tasks page exposes a refresh button. There is **no shared `<RefreshButton>` component**; the pattern is duplicate-once-and-go. `StatusUpdateModal.tsx` also imports `RefreshCw` but uses it for a "regenerate" action, not page refresh.

---

## 8. Task filters

All filter logic lives in **`apps/web/app/dashboard/tasks/page.tsx`** — there is no extracted filters component.

**Three filters + one toggle, all URL-driven:**

| Filter | URL param | Source of values |
|---|---|---|
| Release | `?release=<id>` | `fetch('/api/releases')` → `ReleaseOption[]` from `@/lib/release-helpers` (selector payload is the only GET view since 2026-07-10) |
| Priority | `?priority=<value>` | `TASK_PRIORITY_OPTIONS` from `@/lib/tasks` (re-exported from `@/types/tasks`): `'urgent' \| 'high' \| 'medium' \| 'low' \| 'none'` |
| Status | `?status=<value>` | `TASK_STATUS_OPTIONS` from `@/lib/tasks` (re-exported from `@/types/tasks`): `'locked' \| 'backlog' \| 'todo' \| 'in_progress' \| 'blocked' \| 'in_review' \| 'done' \| 'cancelled'` |
| Mine only (toggle) | `?mine=1` | n/a — boolean |

**Filter UI:** native `<select>` elements wrapped in `<label>`, styled via the `input` CSS class (defined in `globals.css`) and the `h-12 rounded-[18px]` Tailwind sizing.

**Read/write pattern:**

```ts
const searchParams = useSearchParams();
const releaseFilter  = searchParams.get('release')  || '';
const priorityFilter = (searchParams.get('priority') || '') as TaskPriority | '';
const statusFilter   = (searchParams.get('status')   || '') as TaskStatus | '';
const mineOnly       = searchParams.get('mine') === '1';

const syncFilter = (next: Record<string, string>) => {
  const params = new URLSearchParams(searchParams.toString());
  Object.entries(next).forEach(([key, value]) => {
    if (value) params.set(key, value); else params.delete(key);
  });
  router.replace(`/dashboard/tasks${params.toString() ? `?${params.toString()}` : ''}`);
};
```

The Tasks page reloads via `useEffect([searchParams.toString()])` and forwards `searchParams.toString()` straight into the `/api/tasks?...` request.

**Latent type:** `lib/tasks.ts` lines 126–131 defines a `TaskFilters` interface

```ts
export interface TaskFilters {
  releaseId?: string | null;
  priority?: TaskPriority | '';
  status?: TaskStatus | '';
  sort?: TaskSortKey;
}
```

…but the page does not use it. Filter values are read individually from `searchParams`. If a refactor wants a shared filters store/hook, `TaskFilters` is the existing shape to target.

**Helper labels for filter UI:** `getTaskPriorityLabel`, `getTaskStatusLabel`, `getTaskSectionLabel`, `getTaskSectionDescription` — all in `apps/web/lib/tasks.ts`.

---

## 9. Scripts (typecheck / lint / build / test)

### Root `package.json` scripts

```json
{
  "build": "node scripts/run-turbo.cjs build",
  "dev":   "node scripts/run-turbo.cjs dev",
  "lint":  "node scripts/run-turbo.cjs lint"
}
```

### `apps/web/package.json` scripts

```json
{
  "dev":   "next dev",
  "build": "next build",
  "start": "next start",
  "lint":  "eslint ."
}
```

### `turbo.json` tasks

- `build` — `dependsOn: ['^build']`, outputs `.next/**`, `dist/**`, `build/**`, and an extensive `env` allowlist (Supabase, Paystack, trial, Postgres, PostHog).
- `dev` — `cache: false`, `persistent: true`.
- `lint` — `dependsOn: ['^lint']`, no outputs.

### What's missing

- **No `typecheck` script** anywhere. `tsc --noEmit` is not wired into the workspace. CLAUDE.md emphasises strict TypeScript across the board, but type drift between `types/tasks.ts` and `types/database.ts` (see §3) currently can't be caught by CI because there's no typecheck step.
- **No test runner.** No `vitest`, `jest`, `playwright` in `package.json` (verified by grep). CLAUDE.md states tests are a v2 investment and lists `pnpm lint` as the only CI gate.
- **No `format` / Prettier script.**
- **No `dev` script in `apps/homepage/package.json` examined here** — but referenced by `turbo run dev` filter in CLAUDE.md.

To run a full local check today: `pnpm install && pnpm lint && pnpm build` (build = typecheck via `next build`). Lint is the only fast gate.

---

## Risks / unknowns

1. **`apps/web/types/index.ts` is orphaned but live.** No `from '@/types'` imports exist anywhere in `apps/web`. The file is dead weight but every `Release`, `Task`, `ReleaseStatus`, `TaskStatus`, `UserRole` it exports has a divergent shape from the canonical types. Risk: a future refactor that adds an `@/types` barrel re-export, or autocomplete picking up the orphan, silently substitutes the stale shape and breaks runtime behavior. CLAUDE.md lists duplicate types as an anti-pattern; this file is the largest unresolved instance.
2. **`apps/web/types/database.ts` `TaskStatus` is missing `'blocked'`.** Other call-sites that import `TaskStatus` from `database.ts` (not grepped exhaustively) cannot represent blocked tasks. This may be intentional (DB-row mirror) — but if so, it deserves a comment.
3. **Two `ExecutionRelease` definitions.** `lib/execution-types.ts` declares `Release & { readinessScore: number }` (redundant — `Release` already has `readinessScore`). `types/releases.ts` declares `Release` (no intersection). Stores import from `lib/execution-types`. The names diverge by import path, which is the kind of latent footgun TypeScript can't help with.
4. **Tasks page bypasses `useTaskStore`.** Dashboard pulls tasks from the Zustand store (hydrated by `loadCommandCenter`); Tasks page fetches `/api/tasks` directly. Means a task mutation on one page doesn't necessarily reflect on the other without a refresh cycle. Consolidating to a single fetcher requires care.
5. **No `typecheck` step.** Type drift is invisible to CI today. Adding `"typecheck": "tsc --noEmit"` to both root and `apps/web` `package.json` and a matching `typecheck` task in `turbo.json` is a low-cost guardrail.
6. **`getAccessToken` is duplicated** across `useReleaseStore`, `useTaskStore`, `ReleasesDashboardPage`, and the Tasks page — same 5-line helper. Mirrors the wider "four `getAuthenticatedUser` definitions" pattern CLAUDE.md flagged.
7. **Pre-built page skeletons (`DashboardPageSkeleton`, `SettingsPageSkeleton`, `SongLibrarySkeleton`, etc.) appear unused** — each route ships its own inline skeleton. Worth verifying with Grep before any "skeleton consolidation" refactor.
8. **`ReleasePipelineState` and `RELEASE_PIPELINE_STATES` are still exported from `types/releases.ts`** and used by `Task.state` and the legacy DB column `releases.state`, even though CLAUDE.md says the six-stage pipeline UI was cut and the column "remains in DB; UI just stopped surfacing them." Consumers of `state` may need an audit if the pipeline concept is being fully retired.
9. **Brand color and status-success share the same RGB (62 207 142).** Intentional today but worth knowing if a designer wants them to diverge.
10. **No central feature-flag module.** Adding workspace- or user-scoped flags is greenfield work — there's no existing helper to extend.

---

## Conflicts to watch (vs CONSOLIDATION_SPEC.md)

**`CONSOLIDATION_SPEC.md` is not present in the repo** (verified with `Glob "**/CONSOLIDATION_SPEC.md"`), so a literal point-by-point conflict comparison isn't possible. The list below is a *prospective* one — likely conflict surfaces a consolidation spec is most likely to touch, given the audit findings above:

- **Canonical type location.** If the spec mandates a single source of truth (e.g. `@urganize/lib` or a `@/types` barrel), it will conflict with: (a) the orphan `apps/web/types/index.ts`, (b) the redeclared enums in `apps/web/types/database.ts`, (c) the two homes for `ExecutionRelease` (`lib/execution-types.ts` vs `types/releases.ts`).
- **Fetcher consolidation.** A spec calling for a single fetch hook will conflict with the four ad-hoc `getAccessToken` copies and the split between store-based (Dashboard) vs direct-fetch (Tasks, Releases list) consumers.
- **Feature flag mechanism.** If the spec calls for a typed flag helper (`useFeatureFlag(name)`) or user/workspace-based flags, it will replace the current pattern of inline `process.env.NEXT_PUBLIC_FEATURE_* === 'true'` checks duplicated across each page and route handler.
- **Sidebar nav registry.** If the spec wants nav items to be data-driven (e.g. exported from a route metadata module), it will conflict with the hardcoded `navItems` array in `AppSidebar.tsx`.
- **Refresh / loading state.** If the spec specifies a shared `<RefreshButton>` or a `useResource()` hook with initial/refresh distinction, the current pattern is bespoke per page (only Releases list has it).
- **Skeleton inventory.** If the spec calls for one skeleton per page type, the pre-built skeletons under `components/loading/` will need to be wired into the pages that currently ship local inline versions.
- **`TaskStatus` membership.** If the spec sets the canonical task status union, the `database.ts` version (missing `'blocked'`) is the most likely flashpoint.
- **Tailwind tokens.** If the spec introduces new color/spacing tokens, they must be added to `packages/config/tailwind/preset.js` AND the CSS-variable definitions in `apps/web/app/globals.css` (both `:root` and `.dark`).
- **Typecheck/test gates.** If the spec mandates typecheck as a CI step, `package.json` scripts and `turbo.json` task definitions need additions; none exist today.
- **`/release/[id]` legacy route.** `apps/web/app/release/[id]/page.tsx` still exists alongside `apps/web/app/dashboard/releases/[releaseId]/page.tsx`. If the spec specifies one canonical release detail URL, the legacy route is the candidate to retire.

Once a `CONSOLIDATION_SPEC.md` is supplied (path, branch, or contents), this section can be replaced with a concrete per-clause delta.
