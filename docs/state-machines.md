# State machines in Urganize

A state machine is any flow that can be in one of several states and moves
between them: a task (todo, done), an upload (idle, uploading, failed), a
subscription (active, past due, cancelled). Most of ours are **implicit**: the
state is spread over several separate flags or written from many places, so
nothing stops two flags disagreeing (a spinner and an error at once) or a move
that should be impossible (restoring a released rollout to draft).

This file lists what a sweep of the whole app found on 9 Nov 2026 (issue
#1148): what was fixed, and what is still open, ranked. Update it when you fix
one.

## The house rule

1. **One rule per machine, in `lib/`, pure and tested.** The decision of which
   state comes next lives in one function that takes plain data and returns the
   next state (`lib/completion-surfaces.ts`, `decideArchiveToggle` in
   `lib/release-activity.ts`, `canAnswerWorkRequest`, `decideApplyClaim`,
   `decideOutboxOutcome`). Every writer calls it. vitest only reaches `lib/`,
   so a rule written inline in a store or a route is a rule nothing checks.
2. **A database status moves with a conditional update.** Write
   `.eq('status', <the state you decided from>)` and `.select('id')`, and treat
   zero rows as "someone else moved it" (answer 409, or re-read). This is what
   makes two taps, two tabs or a webhook racing a person safe.
3. **Prefer one union over several flags** for anything new:
   `{ kind: 'idle' } | { kind: 'uploading' } | { kind: 'failed'; error }`.
   Good precedents: `NewProjectSubmitState`, the autosave status
   (`idle | dirty | saving | saved | error`), `ShareImageState`.
4. **An in-flight request that can be superseded carries a token** (a counter
   or epoch captured at the start and compared before writing), never a check
   of the current value alone. Precedents: `thinkingEpoch` in UrgAns, the
   notes list epoch, `openSeq` in chat history.
5. **Anything holding one account's data registers a sign-out reset**
   (`lib/sign-out-resets.ts`).

## Fixed in #1148

| Machine | What could happen | Fix |
|---|---|---|
| Task completion sheets (`useTaskStore`) | Ticking off a second activity while the first one's sheet was open stacked two sheets; bulk Mark done showed the toast over an open sheet | `lib/completion-surfaces.ts`: one surface at a time, new replaces old |
| Notes list (`useNotesStore`) | Switching Active/Archived mid-load painted the wrong list and cached it under the wrong view; "Load older" appended the old list's page to the new one | List epoch; stale responses are dropped |
| Notes on sign-out | Same-tab sign-in as another account showed the first account's notebook | Registered `notes` sign-out reset |
| UrgAns on sign-out (`useChappiStore`) | A message and files handed over from Home were sent on the next account's first chat | Reset clears them |
| Opening a saved chat (`useChappiHistoryStore`) | A slow fetch for chat A replaced chat B opened after it | Every open bumps the open counter |
| Cover art upload (`useCoverArtUpload`) | A second pick during measuring started a second upload; the previous file's verdict sat above the new error | Single-flight guard, spinner spans the whole run, verdict cleared |
| Archive / restore (`/api/releases/[id]/archive`) | Restore wrote draft over a released rollout; two taps could both write | `decideArchiveToggle` plus a conditional update |
| Rollout edits by a team Manager (`PATCH /api/releases/[id]`, archive) | Since #854, the write filtered on the caller's id, so a Manager's edit matched no row and still answered "saved" | Write filters on the row's real owner |
| Account deletion | Wrote an invalid status and deleted the subscription row with Paystack still billing the card | Disables live Paystack subscriptions first (best effort, logged) via `lib/subscription-status.ts` |
| Bank transfer invoice (`openTransferInvoice`) | A transfer landing mid-replace turned a paid invoice into a cancelled one | Cancel only the invoice as it was read |
| UrgAns embedded actions | A slow failure could overwrite a row a retry already settled | Failure and result writes are conditional on the claim |

## Fixed since

| Machine | What could happen | Fix |
|---|---|---|
| Admin email composer (`ComposeEmailPageClient`, #1274) | A background sign-in refresh recounted the starting audience over the one chosen, so "Send to 124 people" sat over a one-person send (and a count of one could sit over a send to everyone) | `lib/email/compose-audience.ts`: the count carries the audience it was made for and shows only while that is the audience chosen now; the first-load recount runs once per person, from the current choice; a count landing under an open confirm cancels it |

## Still open, ranked

Money first, then data, then screens. None of these was changed in #1148
because each needs a decision or a live test this sandbox cannot run.

1. **`subscriptions.status` has no transition rule.** About a dozen writers;
   only account deletion is guarded. Reachable: after a plan change clears
   `paystack_subscription_code`, cancelling no longer disables Paystack, and
   the next renewal sets the row back to `active`
   (`app/api/webhooks/paystack/route.ts` renewal path); a late
   `invoice.payment_failed` sets `past_due` on a cancelled row. Next step: a
   `decideSubscriptionWrite(current, event)` in `lib/subscription-status.ts`
   and conditional writes in the webhook, tested against Paystack test mode.
2. **`tasks.status` has no server-side gate.** `PATCH /api/tasks/[id]` accepts
   any status, so locked -> done skips the blocker check and never unlocks
   dependents (the client store does both; MCP, guests and the API do not).
   `reopenTask` does not check the task was done. Next step: route status
   changes through `getTaskCompletionBlocker` and `completeTaskWithCascade` on
   the server. Needs care: the client's own cascade also PATCHes.
3. **UrgAns action reclaim re-runs `apply()`** after 120 seconds with no
   result. Every action's apply must be safe to run twice, or reclaim must
   check first.
4. **`issue_reports` admin retry** has no claim, so a double click files two
   Linear issues.
5. **`email_outbox` post-send writes** are not conditional on `sending`, so a
   stale-claim sweep and a slow sender can disagree.
6. **`releases.status` PATCH** accepts any jump between statuses.
7. **Screens with many flags:** the onboarding team step (a poll can switch the
   screen mid-join), invite accept (a failed confirmation shows no error),
   Settings artist roster (concurrent add/remove loses one), team logins
   (overlapping revokes undo each other), billing cancel (a failed reload
   hides a successful cancel), pitch composer (a failed playlist load reads as
   "No curators"), checkout (a downgrade note names the wrong plan),
   `useReleaseStore` (an old failed load puts an error over fresh data),
   `usePlannerStore` (one release's success clears another's error),
   `lib/auth-store.ts` (one `isLoading` for startup, sign-in and profile
   saves).
