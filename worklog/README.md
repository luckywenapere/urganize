# Work log

One place for Urganize's day-to-day work: ideas, what we did each day, and anything worth keeping that got pasted into a chat. Everyone on the team can read it and add to it: engineering, marketing, operations.

## What lives where

| File | What goes in it |
|---|---|
| `ideas.md` | Every idea, newest at the top. One line each, with date, who, and status. |
| `days/YYYY-MM-DD.md` | One file per day: plan, done, notes. |
| `pastes/YYYY-MM-DD-short-name.md` | Text someone pasted (a message, notes, a list, a transcript), saved as is with a one-line summary on top. |

## How to use it

**With Claude (easiest).** Say it in plain words:

- "Add this idea: ..." → goes to the top of `ideas.md`.
- "Log today: ..." → goes in today's `days/` file.
- "Save this" + paste → becomes a file in `pastes/`.
- "What ideas do we have about pricing?" or "What did we do last Tuesday?" → Claude searches this folder and brings it back.

**By hand.** Open the file on GitHub, press the pencil icon, edit, commit. No setup needed.

**Finding things.** On GitHub, press `t` and type a file name, or use the search box with `path:worklog` plus your words.

## Rules

1. **Never put passwords, API keys, bank details or private customer data here.** Everyone with repo access can read it.
2. Ideas are not decisions. Status says where each one stands.
3. Write plain words a new teammate would understand. No em dashes.
4. Never delete someone else's entry. Change its status instead.

## Idea statuses

`new` (just captured) · `discussing` · `planned` (has a GitHub issue, link it) · `done` · `dropped` (say why in a few words)
