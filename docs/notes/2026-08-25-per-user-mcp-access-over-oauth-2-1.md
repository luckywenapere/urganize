# Per-user MCP access, over OAuth 2.1 (2026-08-25)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: *"Figure out a way for all users to take context to any LLM of
their choice through Urganize consistently through MCP probably."*

Every customer can now connect their own LLM client — claude.ai, Claude Desktop,
ChatGPT, Claude Code, Cursor — to their own workspace, and take their release
context with them. Behind `NEXT_PUBLIC_FEATURE_MCP_CONNECT`, which is **ON in
production since 2026-08-25** — the migration is applied and the OAuth flow is
confirmed end to end (see Verified below; one tool call is the only step left).
The founder-key path above is untouched, unflagged and independent: either, both,
or neither may be switched on.

**Not a scope expansion.** MCP shipped 2026-07-31 and this file recorded it as
"a second access path to the already-sanctioned Chappi tool registry, not a new
feature". This is the same registry reaching the same data for the same reasons;
what changed is who may hold a credential.

**The external fact that decided the architecture, and it is worth re-checking
before anyone "simplifies" this into a token.** Claude Code accepts a static
bearer via `--header`. **claude.ai web and Claude Desktop do not:** their
custom-connector flow assumes OAuth 2.1 and attempts Dynamic Client
Registration on connect, with no "no auth" option and no static-header fallback
(anthropics/claude-ai-mcp#402, closed as not planned). ChatGPT connectors want
OAuth too. This product's users are artist managers, not developers — they live
in claude.ai and the phone apps, which are exactly the OAuth-only clients. A
per-user token would have been three columns instead of three tables, and would
have served the founder and nobody else.

**Schema:** `20260825100000_mcp_oauth.sql` — `mcp_oauth_clients` (DCR
registrations), `mcp_oauth_codes`, `mcp_oauth_tokens`. RLS enabled with **zero
policies** on all three, the `workspace_invite_links` / `curator_invites`
posture. **Not applied anywhere yet.**

### Eight things worth knowing before editing this

1. **The credential IS the binding, and that property is preserved rather than
   abandoned.** `app/api/_shared/auth.ts` argued the env binding was safe because
   "a leaked key can only ever act as that one user", with deliberately no
   acting-user header. A token row carries its own `user_id`, so that still
   holds — one credential resolves to one account and no request header can
   redirect it. What changed is that the binding lives in a row, which is what
   makes revocation possible at all (`.env.example` used to say, of the founder
   key, "there is no revocation UI").
2. **Tokens and codes are stored sha256-HASHED, which deviates from every other
   token in this repo.** `createHash` appeared nowhere in `apps/web` before this,
   because share links and invite codes must be re-readable to render a Copy
   button (`INVITE_LINK_COLUMNS` says so in as many words). That reason does not
   apply here: an access token is handed to a client once and never shown to a
   human, so nothing needs the plaintext back and a leaked row should not be a
   working credential.
3. **The access gate is per TOOL, not per HTTP method.** `requireActiveAccount`
   reads read-only mode off `request.method` and MCP is all-POST, so the honest
   method would refuse a payment-lapsed team its MCP **reads** as well as its
   writes — while that same team can still read everything in the app.
   `resolveMcpToolAccessMethod` maps `tool.kind` to a synthetic GET or POST, and
   a refusal comes back as a JSON-RPC result carrying `isError` so the model can
   explain it rather than reporting a dead server. **Never pass the real method
   here.**
4. **The 401 carries `WWW-Authenticate` with `resource_metadata`, and that header
   is the entire discovery mechanism.** Without it a client reports the server
   unreachable instead of starting the OAuth flow. It is the first thing to check
   on any "the connector will not connect" report.
5. **`/.well-known/*` is served through `next.config.js` rewrites, and it has to
   be.** Next's router ignores dot-prefixed path segments, so
   `app/.well-known/…/route.ts` never resolves, and there is no `middleware.ts`
   in this app. Both the bare AND the path-suffixed forms are mapped
   (`/.well-known/oauth-protected-resource/api/mcp`), because RFC 9728 has a
   client try the suffixed one first for a resource that lives at a path —
   serving one and not the other works with some clients and silently fails with
   others.
6. **Single-use codes and refresh rotation are conditional UPDATEs, not
   application-level checks.** `update … where consumed_at is null returning id`;
   zero rows means somebody else won. The row is the lock — the `curator_invites`
   pattern. `checkCodeRedemption`'s own `consumedAt` check is a fast path and is
   explicitly NOT what makes single-use true. Rotation swaps both hashes on the
   existing row rather than inserting a successor, so an hourly refresh does not
   fill the owner's Settings list with dead entries.
7. **MCP tool calls are NOT metered against `urgans_monthly_actions`.** That
   ceiling exists because an UrgAns turn costs us gateway tokens; over MCP the
   customer's own model does the thinking and we pay for a database read. Each
   call records an `mcp_tool_call` billing event for visibility instead —
   free-text `type` column, existing index, **no migration**.
8. **`/api/mcp/connections` and its DELETE are deliberately NOT behind the
   paywall** — the `app/api/account/export` call, for a stronger reason: a walled
   or read-only team must always be able to cut off a credential. Authentication
   plus the curator block, and nothing else.

### The allow-list inversion, and the bug the old default shipped

`lib/mcp/tools.ts` was a **deny-list** (`EXCLUDED_TOOL_NAMES`), so a newly
registered Chappi tool joined MCP automatically and a hard-coded count in
`protocol.test.ts` was the tripwire that made somebody notice. That default was
defensible while one founder-held env key could reach the endpoint. It is not
once any customer can: `executeToolCall` never reads `tool.confirm` (the gate
lives in `runner.ts`, which the MCP path does not go through), so **that list is
the only thing standing between an outside model and a confirmation-gated tool.**

It is now an explicit `MCP_TOOL_NAMES_ALLOWED` — 13: the original 11 plus the two
context tools. The count test stays, but its job changed: it no longer guards
against accidental exposure, it catches an intended tool silently dropping out
after a rename.

**And it fixed what the old default already shipped:** `create_note` was in
`tools/list` from day one and always 401'd, because it proxies `POST /api/notes`
and that route used the plain auth helper. `tool-registry.test.ts` now parses the
tool-family sources, extracts each allow-listed tool's `callInternalApi` path AND
method, resolves the route file, and asserts that specific handler accepts the
internal actor. **It was mutation-tested twice:** the first version passed on the
reverted fix, because it matched the file's *import* rather than the handler
body — so it is per-handler now, which also lets a route legitimately opt its
POST in while leaving its GET on the plain helper, exactly what `/api/notes`
does.

### The context surface, and why "consistently" was already half-built

`buildChappiSystemPrompt` composed ROLE + team brief + workspace snapshot +
today, and only ROLE is specific to the assistant inside this app — it names
tools an outside model does not have and confirmation cards it will never see.
Everything else is just true. So that portable half moved into
`lib/chappi/portable-context.ts` and `buildChappiSystemPrompt` now calls it:
**one composition, two consumers**, so an answer from claude.ai and an answer
from UrgAns cannot be working from different facts. That is what the word
"consistently" in the request actually required, and a second renderer would have
drifted within a month — this repo has undone that duplication for
`isRecapEligible`, for the four-flag scene expression, and for four copies of
`getAccessToken`.

It lives in `lib/chappi/` and not `lib/mcp/` deliberately: `lib/mcp` imports
`lib/chappi` and never the reverse.

Exposed **both** as tools (`get_workspace_context`, `get_release_context`) and as
MCP resources (`resources/list` / `resources/read`, at
`urganize://workspace/context` and `urganize://release/<id>/context`). Resources
are the primitive that means "attach this"; tools are what every client supports;
a manager should not have to know which kind of client they picked.
`capabilities` now declares `{ tools: {}, resources: {} }`.

Both context tools are `kind: 'read'`, which is load-bearing rather than
descriptive — see point 3 above.

### Doc-drift found on the way, surfaced rather than absorbed

Two features exist in the code and appear nowhere in this file:

- **The team brief** (`lib/team-brief.ts`, `team-brief-server.ts`,
  `team-brief-nudge.ts`, `components/settings/TeamBriefSection.tsx`,
  `components/chappi/BriefAttribution.tsx`, migration
  `20260824120000_team_briefs.sql`) — a manager-authored five-section standing
  document (roster, how we work, positioning, constraints, vocabulary), capped
  per section, injected into UrgAns's system prompt on every request, edited in
  Settings → Workspace, flag-gated on `NEXT_PUBLIC_FEATURE_TEAM_BRIEF`. It is
  half of what "context" means in this feature.
- **`lib/chappi/workspace-summary.ts`** — the pure, unit-tested workspace
  snapshot renderer (releases capped at 25 and selected by recency of the release
  *or* its activities, overdue, open work per person, the team). The other half.

Neither has a Working-notes entry. Flagged here per this file's own rule rather
than back-filling a section for work this pass did not do.

### Known gaps, stated plainly

- **No rate limiting**, anywhere in this repo, and this opens an authenticated
  endpoint a customer can point any client at. Out of scope at current scale
  (principle 6); the `mcp_tool_call` event is the signal that should arrive
  before it matters.
- **Open Dynamic Client Registration**, which is what claude.ai requires.
  Registering grants nothing — a client id is not a credential, and nothing
  happens until a signed-in person approves it — and it is mitigated by
  public-clients-only plus redirect-URI validation.
- **Prompt injection widens.** Hostile text in workspace data now reaches a
  third-party model that can call create/update tools. Same accepted posture as
  UrgAns (reversible, visible, undoable in-app), restated because the model is
  one we do not control.
- **Hand-rolling an authorization server is the risk in this work.** It matches
  the repo's precedent (`lib/mcp/protocol.ts` hand-rolls JSON-RPC,
  `lib/fcm-server.ts` an RS256 JWT) and avoids a vendor under "boring stack", but
  PKCE verification, exact redirect-URI matching and single-use codes are where
  this goes wrong. All three are pure, unit-tested, and were mutation-tested:
  making PKCE accept `plain`, making redirect matching a prefix, and dropping the
  single-use check each fail exactly the tests written to catch them.

### Verified

The full suite (**1372 passing**, 30 env-gated skips, ~83 of them new across
`lib/mcp/oauth.test.ts`, `lib/mcp-connections.test.ts`,
`lib/chappi/portable-context.test.ts` and the two updated registry tests),
`eslint .` at **3 errors / 67 warnings** — the 3 errors are the unchanged
pre-existing `WorkspaceView.tsx` ones, and the single new warning is
`useMcpConnections`'s fetch-on-mount, byte-identical to the finding
`useTeamLogins` already carries (the documented React-19 downgraded rule).
`next build` green **by exit code** in both flag states, with `/auth`,
`/onboarding`, `/settings` and `/oauth/authorize` all still `○ Static`.

Runtime probes against `next start`, **rebuilding between flag states** because
`NEXT_PUBLIC_*` is inlined at build time even server-side: flag OFF, all six
OAuth/well-known routes plus `/api/mcp/connections` and `/api/mcp` return
**404** while the ungated `/api/releases` still **401**s — that discrimination is
what proves the gate rather than a routing accident. Flag ON, both metadata
documents return valid JSON with absolute URLs, `POST /api/mcp` returns **401
carrying `WWW-Authenticate` with `resource_metadata`**, and the authenticated
routes 401. One real defect was found this way and fixed: `/api/oauth/token`
answered `server_error` before `unsupported_grant_type`, telling a client the
server was misconfigured for a request that was invalid to begin with.

**LIVE, and the OAuth flow is confirmed end to end (2026-08-25).** The founder
applied the migration, set `NEXT_PUBLIC_FEATURE_MCP_CONNECT=true`, and connected
`npx @modelcontextprotocol/inspector` to production successfully. That one
connection exercises, against real tables: discovery through both `.well-known`
documents, Dynamic Client Registration, the consent screen rendering and being
approved, PKCE, the authorization-code exchange, the access token, and
`tools/list`. It also proves the deploy genuinely rebuilt `apps/web` — a stale
bundle would have 404'd discovery and the Inspector could not have started, which
is the trap the activation checklist warns about.

**Still NOT verified, and it is not a small remainder — NO TOOL HAS EVER BEEN
CALLED.** So no context has actually been read out of this feature, and nothing
has round-tripped through the internal-actor branch in
`app/api/_shared/auth.ts` — which is where five of the thirteen allow-listed
tools live, `create_note` among them. Its long-standing 401 is fixed in code and
covered by a structural test, and has still never been exercised by a real
request. Also untested: revoking in Settings → Account → Connected apps and
confirming the next call fails (that list has never rendered), refresh-token
rotation, which only happens an hour in, and both claude.ai and ChatGPT
specifically. The next real check is one tool call — `get_workspace_context`
answers most of it at once.

### Adding a custom connector on claude.ai (2026-08-25)

The founder could not find the option, so recording it rather than letting the
next session re-derive it. Custom connectors still exist and are supported; two
things get in the way:

- **The path is Settings → Customize → Connectors → `+` → Add custom
  connector.** Not Settings → Connectors, which is what this session told him
  first and is the likely reason he could not find it.
- **They require a PAID Claude plan.** Free accounts do not get them.

Do not confuse this with submitting to the public connector *directory*, which
does need a Team or Enterprise admin — that is publishing, and irrelevant to
adding a private one. Note also that the July 2026 MCP spec update deprecated SSE
in favour of a stateless HTTP request/response model, which is exactly the shape
`/api/mcp` already serves (no session ids, plain JSON, GET is 405) — so nothing
here is on the deprecated path.

Either way claude.ai is one client's UI, not the feature: the Inspector, Claude
Code, Cursor and any other OAuth-capable client connect today.

### Activation checklist

1. ~~Apply `20260825100000_mcp_oauth.sql`~~ — done 2026-08-25.
2. ~~Set `NEXT_PUBLIC_FEATURE_MCP_CONNECT=true` on the Vercel `Web` project~~ —
   done, and the rebuild is confirmed by the Inspector connecting at all (a stale
   bundle 404s discovery). If a future flip needs checking before anything can
   connect, `npx turbo-ignore @urganize/web --fallback=<the commit Vercel last
   deployed>` is the way.
3. ~~Changelog entry + version bump across all 10 `package.json` files~~ — done
   as v1.2.0, at the flip rather than at merge (the EPK precedent).
4. ~~Probe production~~ — superseded: the Inspector connecting proves discovery
   and the token exchange, which is strictly more than the curl probe showed. For
   the record, do **not** try to prove the flag by grepping the client bundle —
   both ternary branches compile in, a false positive this repo has recorded
   twice.
5. **OPEN, and the only thing left:** call one tool. `get_workspace_context`
   covers the most ground in a single request — it is a read, so it also tells you
   nothing about the five REST-proxied tools; `create_note` is the one to try
   after it, since its fix has never run. Then disconnect in Settings → Account →
   Connected apps and confirm the next call fails.

Customer-facing setup guide: `docs/mcp-connect.md`.
