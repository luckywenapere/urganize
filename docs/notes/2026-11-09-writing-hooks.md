# Writing hooks (2026-11-09, #1149)

What we know about the first line of a post, DM or email, and where the skill for it lives.

## Where it lives

- Skill: `.agents/skills/writing-hooks/SKILL.md`, linked into `.claude/skills/writing-hooks` so Claude Code in this repo picks it up as `/writing-hooks`.
- Urganize context for it: `.agents/skills/writing-hooks/references/urganize.md` (reader, product line, copy rules, real pains). Update that file when positioning changes, not the skill.
- The skill is generic on purpose so it can be copied to `~/.claude/skills/` or uploaded to claude.ai for use outside this repo.

## What was learned

Source: George's X article "Learn how to write scientific hooks" (@georgewritess). The cloud session could not open x.com, so Oyin sent screenshots and the method below is taken from them. The studies George cites are his summaries; we have not checked them.

**George's 5 checks** (a hook is posted only if it passes all 5):

1. **Mirror the reader.** People stop for themselves, not your topic. Put their identity or a specific moment from their life in the hook.
2. **Let them half guess.** Curiosity peaks when the reader is about 50% sure of the answer. Show the hook to 3 people and ask what the post says: all 3 right means too much given away, none close means add one piece of context.
3. **One surprise.** The reader predicts your line from the last 100 posts they saw on the topic. Add one unexpected detail, keep the rest plain.
4. **Exact numbers.** A sharp number (11) reads as counted, a round one (10) as a guess. Still has to be true.
5. **Readable in one breath.** Read it aloud; if you run out of breath, cut. Aim for grade 6 or lower in the Hemingway Editor.

**His habit:** spend about half the writing time on the first line, write 10 versions, post the one that passes all 5. His reason: readers skim the first lines and the left edge and read only 20 to 28% of a page's words.

**What we added to it** (our rules, not George's):

- A truth gate: never invent a number, client or result to pass check 4, and the post must deliver what the hook promises.
- A list of 10 patterns, so the 10 drafts differ instead of being 10 versions of one idea.
- LinkedIn shows about 200 characters before "see more", fewer on a phone. Email subjects should stay under about 45 characters.
- DM openers are about the other person first (this matches the linkedin-outreach skill's rules).

## Open

- Measure it: log the hook used on each LinkedIn post next to its reach, so we learn which patterns work for our readers instead of assuming. Not set up yet.
