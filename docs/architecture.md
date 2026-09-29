# Urganize multi-platform architecture

## Status: DECIDED (founder decision, 2026-09-29)

This is the canonical, founder-authorized platform strategy for Urganize going
forward: web, mobile, and a new desktop client, sharing one Supabase backend.
All future implementation decisions should follow this architecture unless the
founder explicitly changes it — the same standing this file gives every other
sanctioned scope expansion.

Two things about how it is written down here are worth keeping in mind, even
though the direction itself is decided:

1. **The desktop half (Tauri + Rust) introduces a new language and a new
   platform, and nothing has been built yet.** It is a conscious departure from
   this repo's usual "boring stack" / "build for the case we have" defaults —
   accepted explicitly rather than silently, the same way every other
   deliberate exception to a stated principle in this repo is recorded (see
   `CLAUDE.md`'s own note on this decision). Rust is scoped narrowly, to native
   OS capabilities, not as a frontend rewrite; see "Desktop" below.
2. **The mobile description below matches what is actually built today** (a
   webview shell, not a native-first rewrite), with a genuinely native-first
   mobile client recorded as the decided long-term direction to grow into
   incrementally, surface by surface — not a mandate to rewrite it now. See
   "Mobile" below, and `docs/mobile/expo-shell.md` for the full account of the
   current shell.

The web app, the shared Supabase backend, the technology boundaries, and the
reuse principles below describe real, already-true structure today.

```
                         URGANIZE
                            │
                         Supabase
                            │
              ┌─────────────┼─────────────┐
              │             │             │
             WEB          MOBILE        DESKTOP
              │             │             │
           Next.js         Expo         Tauri
              │             │             │
         TypeScript      TypeScript    TypeScript
                                          │
                                         Rust
                                    (native/OS
                                    capabilities,
                                     not built)
```

---

## Web

**Technology:** Next.js (App Router) + TypeScript. Two apps in this monorepo:
`apps/web` (the authenticated product, `app.urganize.app`) and `apps/homepage`
(marketing, `urganize.app`).

This is the primary product and the source of truth for every feature. Do not
rewrite or migrate it to another framework. See the root `CLAUDE.md` for the
full build history, conventions, and every shipped feature.

## Mobile

**Technology:** Expo + React Native + TypeScript. `apps/mobile`
(`com.urganize.app`).

**What is actually built, as of 2026-09-25 (`docs/mobile/expo-shell.md`):**
`apps/mobile` is a thin native shell that shows the live, continuously
deployed web app (`https://app.urganize.app`) inside a `react-native-webview`,
plus a small bridge (`packages/native-bridge`) for the handful of things a web
page cannot do on its own: native push (via React Native Firebase / FCM, not
Expo's own notifications service), the OS share sheet, Google sign-in's OAuth
redirect, and reading the phone's safe-area/status-bar chrome.

**This is deliberate, not a stopgap.** The web app has dozens of pages and
route handlers that need a live server (auth, admin operations, AI calls,
payment webhooks) — a static export is impossible, and a parallel native
codebase would mean two implementations of the same product to keep in sync.
The shell preserves the property that matters most for a small team: **every
web change reaches phones the moment it deploys, with no app-store review.**
Only changes to the shell itself (new native modules, permissions, icons) need
a store build; JavaScript-only shell changes can ship as an EAS Update.

**Decided long-term direction:** the founder has confirmed the strategic
destination is a genuinely native-first mobile client ("a native mobile
client, not simply a wrapped web application"), not a webview shell forever.
That destination is authorized; the path there is deliberately incremental —
the shell grows real native screens surface by surface, as each one clearly
earns it, rather than as a single rewrite. Treat this as the accepted future
direction rather than something still pending sign-off, and scope each native
surface as its own dated decision when it is actually built, the way every
other feature in this repo is recorded.

Read `docs/mobile/expo-shell.md` before touching `apps/mobile`, the bridge
protocol, or the platform-detection code in `apps/web/lib/platform.ts` and
`apps/web/lib/native-bridge.ts`.

## Desktop (decided — not yet started)

**Technology:** Tauri + React/TypeScript for the UI, Rust for native desktop
capabilities.

**Authorized by the founder on 2026-09-29; nothing has been built yet.** No
`apps/desktop` package exists. This section records the shape this decision
commits to, and the guardrails that should still apply while building it.

### Principle: more than a packaged web app

If this is ever built, the desktop client's long-term purpose is a local
operating layer for music-business workflows — not simply Urganize running
inside a native window. The eventual idea is that it can connect directly to a
user's own project folders on disk:

```
User's Computer

/Projects
    /Artist
        /Single
            /Audio
            /Artwork
            /Metadata
            /Press
            /Social
            /Distribution
```

A desktop app could, over time:

1. Connect to a user's selected project directories.
2. Monitor filesystem changes.
3. Detect relevant files.
4. Extract metadata.
5. Index local assets.
6. Synchronize relevant information with Urganize.
7. Surface missing/inconsistent release information.
8. Help organize release assets.
9. Work offline and synchronize when connectivity returns.

**This is the decided long-term direction, not a requirement to implement all
of it immediately.** Build it incrementally, based on validated product needs,
the same as everything else in this repo.

### Where Rust fits

Rust is introduced specifically for native desktop capabilities, not as the
application's primary language. Candidate responsibilities:

- Filesystem access and file watching
- Large/local file operations
- Local indexing and hashing
- Background workers
- OS integration (native notifications, tray, etc.)
- Secure local credential handling
- Offline/local sync infrastructure

**Do not rewrite the frontend in Rust.** The UI stays React + TypeScript,
reusing Urganize's existing frontend concepts and design system where
practical, exactly as the web and mobile clients do.

---

## Shared backend

Supabase remains the single shared backend for every client. All clients
operate against the same canonical data model; see the root `CLAUDE.md`
("Databases" section) for the authoritative, currently-maintained list of
tables and the RLS model. In broad terms, shared backend concerns include:

- Authentication
- Workspaces / teams
- Users and roster artists
- Releases (rollouts), tasks, activities
- Metadata, credits, collaborators
- Cloud storage (Supabase Storage)
- Billing (Paystack)
- Every other persistent product concern

Avoid creating platform-specific backend systems (a second database, a
parallel API layer per client) unless a real, documented technical requirement
forces it. None has arisen so far — web, and now mobile, both talk to the same
Supabase project and the same Next.js API routes.

---

## Technology boundaries

Keep responsibilities clear across whichever clients exist.

**TypeScript / React** — UI, navigation, forms, dashboards, the release
workspace, catalog, CRM-style surfaces, AI interfaces (UrgAns), settings,
notifications, and all product interaction logic. This is the language and
framework for every client's UI, including a future desktop client's.

**Rust** (desktop only, if built) — native filesystem access, OS-level
functionality, high-performance local processing, file watching, large file
manipulation, local indexing, background native processes, and secure native
functionality that is inappropriate or inefficient to do from a browser layer
or a webview. **Do not introduce Rust merely because it is faster** — only for
capabilities genuinely unavailable elsewhere.

**Supabase** — persistent cloud data, authentication, authorization, the
database, cloud storage, realtime where appropriate, and backend services in
general.

## Cross-platform development principle

Business logic and product concepts should stay as platform-agnostic as
reasonably possible, with platform-specific functionality behind a clear
interface rather than scattered `if (isTauri)` / `if (isNative)` checks. The
mobile bridge already follows this shape and is the model to extend:

```
NativeBridgeService (apps/web/lib/native-bridge.ts, packages/native-bridge)
       │
       ├── Web:      no-op / feature not present
       ├── Mobile:   Expo shell over react-native-webview
       └── Desktop:  Tauri, if built — same request/response shape
```

If a desktop client is ever built, it should extend this same protocol
package (`packages/native-bridge`) rather than inventing a second one, so the
rest of `apps/web` interacts with one abstraction regardless of which shell it
is running inside.

## Reuse strategy

Prefer reuse where it creates genuine leverage:

- Shared TypeScript types
- Shared API/data models
- Shared validation and business rules
- Shared design system (`packages/ui`, `packages/config`)
- Shared Supabase schema

Do not force identical UI or architecture across platforms when a platform's
own conventions call for something different — mobile's webview shell and
web's server-rendered pages already diverge in exactly this way, on purpose.

## Implementation rules

Before implementing a new feature that spans more than one client, decide
which layer it belongs to:

1. Shared backend / data model (Supabase, API routes)
2. Web
3. Mobile
4. Desktop (if it exists)
5. A native desktop capability (Rust)

Do not duplicate functionality unnecessarily. When a feature has
platform-specific requirements, keep a shared product abstraction and
implement the platform-specific adapter underneath it, the way the
`native-bridge` package already does for mobile.

**Do not introduce new frameworks, runtimes, databases, or architectural
patterns beyond what this document already decides — on any client — without
a clear, documented reason, and without checking this file and the root
`CLAUDE.md` first.** Desktop and mobile-native-first are decided directions;
anything beyond what is described here still needs its own explicit, dated
decision recorded the way every other scope expansion in `CLAUDE.md` is
recorded, before writing implementation code.
