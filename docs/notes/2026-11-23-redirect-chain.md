# Redirect chain and domains (2026-11-23, #1380)

See the section "The new-user entry path" in CLAUDE.md for the rules. This note holds the measurements and the manual steps.

## Before (curl against production, 23 Nov 2026)

| Entry | Hops |
|---|---|
| go.urganize.app/x | 308 to team/x, 307 to urganize.app/?utm_..., then the marketing page: 2 redirects |
| go.urganize.app/ | 308 to team/, 307 to /dashboard (now /music or /dashboard by host), client bounce to /auth: 2 redirects plus a client bounce |
| app.urganize.app/ , my.urganize.app/ | 307 to /dashboard, client bounce to /auth (or client handoff to team) |

## Manual steps for the founder (Vercel and Supabase dashboards, in this order, after the deploy)

1. Vercel, project `urganize`, Domains: edit `go.urganize.app` and set it to "Connect to an environment: Production" with NO redirect (it is currently "Redirect to team.urganize.app, 308"). Until this is done the go host behaves as before, so deploying the code first is safe.
2. Nothing to change for app.urganize.app and my.urganize.app (keep them on Production, no redirect).
3. Supabase Auth, URL configuration: nothing new is required: the redirect always lands on team. Confirm `https://team.urganize.app/**` is in Redirect URLs and that Site URL is team. If Google sign-in is used from music.urganize.app, `https://music.urganize.app/**` must be there too (#1378).
4. Optional later, when app/my traffic is near zero and no webhook uses them: set both to a 308 redirect to team in Vercel and delete the handoff code.
