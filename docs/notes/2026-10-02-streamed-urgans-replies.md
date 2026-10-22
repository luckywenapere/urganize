# Streamed UrgAns replies (2026-10-02, built off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask, after a long reply came back cut off mid-sentence: stream replies so
they appear as the model writes them. **Not a scope expansion** (it is how the
already-sanctioned assistant delivers an answer). Behind the server-only
`URGANS_STREAM=on` (read at request time, so flipping it needs a redeploy and no
client rebuild); **no migration**. Off, every path is the plain JSON answer it was.

**It was decided on evidence, not hope.** `lib/ai/stream-spike.integration.test.ts`
(opt-in, `ROUTER_SPIKE=1`, needs a key) found on 2026-10-02: all seven ladder
models stream the exact chat request (tools, effort and cap together); usage
arrives in the stream's last chunk (`stream_options: { include_usage: true }`);
streamed tool calls reassemble into valid JSON on every model; the first word
arrives in 0.9 to 2.4 s; and **dropping the connection early bills roughly what
was written, not the output cap** (1.1 RODI observed against about 45 if the cap
had been billed, on gpt-5.4, one sample). That last fact is what makes a cut-off
reply cheap to keep.

**What it does and does not fix.** It makes a reply appear in about two seconds
and keeps the text of one that runs out of time. It does NOT raise the ceiling:
gpt-5.5 writes about 93 tokens a second and the route is limited to 60 seconds, so
a single reply still tops out near 3,000 to 5,000 tokens. What a streamed turn
CAN do, once the output cap stops being artificially low, is use all the time it
has (see point 8).

### Eight things worth knowing before editing this

1. **Opt-in on both sides.** The server needs `URGANS_STREAM=on` AND the request
   needs `x-urgans-stream: 1`, so an old browser tab and a switched-off server both
   get plain JSON. The client reads the response's content type, never assumes.
   Only the literal word `on` counts, the `AI_ROUTER` rule.
2. **Refusals are never streamed.** Auth, validation, the credit check and the
   ceiling all answer before the stream starts, as JSON with their real status, so
   a stream only starts for a turn that is going to run. Approving a card
   (`confirmedAction`) is not streamed either.
3. **The wire format is `lib/chappi/stream-protocol.ts`** (newline-delimited JSON):
   `text`, `reset` and `final`. **`final` is authoritative**: it carries the same
   payload the route always sent, and the client stores THAT, not the pieces it
   showed. A stream with no `final` means a dropped connection. An unknown event
   type is skipped, so a newer server cannot break an older client.
4. **`reset` exists because a round's text is not the reply.** The runner keeps
   only the last round's text as `reply`, so text shown before a tool call, or from
   a model that was then swapped for another, is dropped from the screen when the
   next attempt starts (`onAttempt`). The route sends `reset` only if text was
   actually shown.
5. **A cut stream keeps its text, but never half a tool call.**
   `readStreamedCompletion` (runner.ts) returns text written before a cut as an
   answer that stopped at its limit, which the existing "cut short" note then
   labels. If a tool call was being written, even beside text, it THROWS: keeping
   the text and dropping the call would answer as if the model had finished and
   lose the action it asked for. Mutation-tested (the case needs text AND a
   half-written call; either alone passes for the wrong reason).
6. **Charging is unchanged and finishes before `final`.** `runTurn` in the route is
   the one body for both paths: model call, routing record, credits settled, turn
   counted, then the answer leaves. A completed stream reports real usage. **A cut
   stream sends none**, so its call is recorded with no tokens and charged as the
   existing nominal "assumed" call. That is an undercount for a long prompt cut
   early; estimating it from characters is a known follow-up, not done here.
7. **The screen shows a throttled preview, then swaps it for the real message.**
   `createTextBatcher` hands text on at most about 16 times a second, so a fast
   model does not re-render the transcript per word. The preview is keyed by store
   epoch like `isThinking`, so it can never show over a different chat. It is
   `aria-hidden` (the finished reply is announced by the existing live region), it
   follows the reply down only when the reader is already near the bottom, and the
   finished message does **not** replay the word-by-word fade (`noRevealId`). The
   old fade is what a plain-JSON reply still gets.
8. **A streamed turn gets a higher output cap, and the clock stops shrinking it
   (2026-10-02).** Each ladder rung has a `streamMaxOutputTokens` beside
   `maxOutputTokens`: quick 2,048, standard 6,144, pro and max 8,192, against
   1,024 / 4,096 / 3,000 / 3,000 for a plain turn. The plain caps and
   `outputCapForTime` exist because a reply still being written at the deadline
   was abandoned and fully billed; a streamed one is cut and KEPT, and the spike
   found a cut stream is billed about what was written, so the caps no longer need
   to guarantee the whole reply fits. `RouteDecision.streaming` carries this:
   `capFor` picks the cap, `fitToDeadline` does not shrink a streamed decision to
   the time left (it still steps DOWN a rung that cannot finish in time, and uses
   the lower rung's streaming cap), and a hop keeps the streaming cap. The route
   works out `wantsStream` before it plans the routing, so a plain turn, with the
   switch off or the header absent, is byte-for-byte what it was. **The clock is
   still the limit:** at about 93 tokens a second a reply gets roughly 4,000 tokens
   in a clean single round, and what is left after tool rounds in a longer turn.
   What this removes is the artificial ceiling (the 1,300-token final round of the
   2026-10-02 incident was a time-based cap, not a real limit). More length needs
   more clock: `maxDuration` is 60 here, and whether this account can go higher
   (Vercel's longer limits on Fluid compute) was not checked.
   **The credit hold follows the turn's output cap (2026-10-02).** `holdCredits`
   used to assume a flat 1.5k tokens out, which undercounts a long reply on the top
   rungs, so a nearly empty balance could start a turn and finish below zero. The
   route now holds for the answer the turn may write: `holdOutputTokens` takes the
   routed decision's `maxOutputTokens`, floors it at 1,500 (a turn the router did
   not touch holds exactly what it did) and ceilings it at 4,000, roughly what the
   clock lets a reply write, so a streamed cap of 8,192 does not demand the price of
   a reply that cannot be written before the deadline. Still a start-of-turn check,
   not a reserved row; the "no lock between the check and the charge" limit stands.
   The ceiling and floor are credits decisions (`HOLD_COMPLETION_CEILING` /
   `HOLD_COMPLETION_TOKENS` in `lib/credits/pricing.ts`). Mutation-tested: dropping
   the cap from the route, the ceiling and the floor each fail a named test.

### Verified

Full suite **5995 passed, 69 skipped**; `tsc --noEmit` clean apart from the 8
documented `confirmed-action.test.ts` errors; `eslint .` at 3 errors / 90 warnings,
**every file this touched lints at zero** (the totals are the tree's, measured
file by file rather than assumed); `next build` green by exit code with `/auth`,
`/onboarding`, `/settings`, `/dashboard`, `/dashboard/urgans` and `/locked` still
`○ Static`. Runtime probe: a stream request with the switch on and no login gets a
plain 401 JSON, never a stream. **Mutation-tested**, each confirmed applied and
each killed by a named test: dropping `stream_options`, allowing a cut stream with a
half-written tool call, ignoring the server switch, inverting the reset rule, and
not clearing text on reset (one of these first survived, which is how the
text-plus-half-call test came to exist).

**Looked at in a browser.** The real `ChappiConversation` was mounted in a throwaway
page (deleted) against a fake gateway streaming with realistic timing: the opt-in
header is sent; the preview grows from 8 to 316 characters over about 4.5 s;
"Thinking..." disappears at the first word; the preview swaps for the final message
with bold applied and zero fade words; a dropped connection keeps the partial text
and adds the note with the composer usable; a mid-reply reset returns to
"Thinking..." and streams the new text; and a plain-JSON reply still gets the old
reveal. **Screenshots were not possible** (the pane was hidden), so this is DOM
evidence, not a look at the pixels.

**The higher streaming cap (point 8)** was verified separately: full suite **6007
passed, 69 skipped**; `tsc --noEmit` clean apart from the 8 documented errors; `eslint .`
unchanged at 3 errors / 90 warnings with every touched file at zero; `next build` green
with the key routes still `○ Static`. **Seven mutations, each confirmed applied and each
killed by a named test**: the streamed decision being shrunk to the time left, the
decision ignoring the streaming cap, a hop dropping it, the step down to a lower
rung dropping it, the routing plan not receiving the flag, the route not passing the
flag, and a streaming cap set below the plain one. Two of these first never applied
(the search text had LF where the file has CRLF), which is the same trap this file
already records, and were redone.

### Not verified

**No streamed reply has gone through the real route with a real model and a real
session**, and no credit has been charged from a streamed turn. The Android and iOS
shell (a webview) has not been tried with a streamed fetch. The route's behaviour
under Vercel's real streaming (buffering, the 60 s ceiling cutting a stream) is
reasoned, not observed.

### Activation

1. Set `URGANS_STREAM=on` on the Vercel `Web` project (Production) and redeploy.
   Env is read per deployment; nothing needs rebuilding.
2. Send one real message and watch it stream. Check one turn's credit charge
   against RodiumAi's usage log, as for any credits change.
3. Try it once from the phone app.
4. To back out, remove the variable and redeploy; every reply is plain JSON again.
5. No changelog entry or version bump at merge (off by default). If it is worth
   announcing, the entry lands at the flip.
