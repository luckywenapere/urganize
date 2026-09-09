# Connect Urganize to your AI

This is the customer-facing guide for the per-user MCP connector. Nothing here
is code — it is what to tell a manager who asks "can I use this from Claude?",
and the checklist for switching it on.

## What it does

Your rollouts, your activities, your notes and your team brief become something
any AI app you already pay for can read — and update — without you copying
anything across. Ask Claude "what's overdue on the Midnight EP?" and it reads
your actual workspace.

It can add and change things: create a rollout, add an activity, tick one off,
write a note. It **cannot delete anything**, and it cannot see another team's
work.

## Switching it on (once, by the founder)

1. Apply `supabase/migrations/20260825100000_mcp_oauth.sql`.
2. Set `NEXT_PUBLIC_FEATURE_MCP_CONNECT=true` on the Vercel `Web` project, and
   **make sure the deploy actually rebuilds `apps/web`**. `NEXT_PUBLIC_*` is
   inlined at build time, so setting the variable alone changes nothing. Before
   trusting the flip, run
   `npx turbo-ignore @urganize/web --fallback=<the commit Vercel last deployed for that project>`
   and confirm it answers "This commit affects @urganize/web".
3. Changelog entry + version bump across all 10 `package.json` files, **at the
   flag flip, not at merge** (the EPK precedent).
4. Verify with the two probes below.

Nothing else is needed. There is no third-party OAuth provider and no extra env:
the app is its own authorization server.

## Verifying it is live, with no account

Two requests, and the pair is what makes the answer conclusive:

```bash
curl -s https://app.urganize.app/.well-known/oauth-authorization-server
# ON  -> a JSON document naming authorization_endpoint, token_endpoint, registration_endpoint
# OFF -> {"error":"Not found."}

curl -si -X POST https://app.urganize.app/api/mcp | grep -i www-authenticate
# ON  -> www-authenticate: Bearer resource_metadata="https://app.urganize.app/.well-known/oauth-protected-resource"
```

That `WWW-Authenticate` header is not decoration — it is how a client discovers
there is an authorization server at all. If a connector reports Urganize as
unreachable, check this header first.

**Do not** try to prove the flag's state by grepping the client bundle for
strings like "Connected apps": a flag's two ternary branches both compile in, so
the string is present either way. CLAUDE.md records that false positive twice.

## Connecting, per client

### claude.ai and Claude Desktop

Settings → Connectors → Add custom connector, and paste:

```
https://app.urganize.app/api/mcp
```

Claude registers itself, sends you to Urganize to sign in, and shows a screen
asking whether to let it read and update your rollouts. Say Allow and you land
back in Claude, connected. Leave the OAuth client ID and secret fields empty —
Claude registers itself and there is nothing to paste.

### ChatGPT

Needs a paid plan with Developer Mode switched on. Settings → Connectors → add
the same URL. Same consent screen.

### Claude Code

```bash
claude mcp add --transport http urganize https://app.urganize.app/api/mcp
```

It opens the same consent screen in your browser. (Claude Code also accepts a
static bearer key, which is how the founder-only `MCP_ACCESS_KEY` path works —
but a customer should use the OAuth flow above.)

### Cursor, Windsurf, Zed and others

Anything that supports a remote MCP server over HTTP with OAuth works with the
same URL. Anything that only supports a static header will not: there is no
per-user static token, deliberately.

## Disconnecting

Settings → Account → Connected apps. One button per app. It takes effect on the
next request that app makes — both its access and its refresh token die with the
row, so it cannot quietly come back.

That list is also the honest answer to "what has access to my rollouts?".

## What to say when someone asks about safety

- It only ever acts as **you**, in your own workspace. One connection, one
  account, and no way for an app to ask to be treated as somebody else.
- It cannot delete a rollout, an activity or a note. Deletions need a
  confirmation step that only exists inside Urganize.
- You can cut any app off at any time, and see when each one last called.
- If your plan lapses, connected apps can still **read** — the same as the app
  itself — and stop being able to change things.

## Known gaps, stated plainly

- **No rate limiting.** Nothing in Urganize rate-limits anything yet, and this
  is an authenticated endpoint a customer can point any client at. Each call
  records an `mcp_tool_call` billing event, so there is a usage signal before it
  becomes a problem.
- **Registration is open**, which is what claude.ai requires. Registering grants
  nothing: a client id is not a credential, and nothing happens until a signed-in
  person approves it on the consent screen.
- **Prompt injection widens.** Text living in your own workspace — a rollout
  title, a note — now reaches a third-party model that can call create and update
  tools. The same accepted posture UrgAns already has: everything those tools do
  is visible and undoable in the app. Worth restating because the model is one we
  do not control.
