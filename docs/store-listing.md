# App store listings

Paste-ready listing copy for the Urganize mobile app. Rewritten 2026-10-31
(#944) for the current positioning: from idea to execution. The 2026-10-17
and 2026-09-24 listings and the 2026-09-09 one, which introduced the product by a category,
are in git history.

**Every string here comes from the same place as the product's own copy.** The
core line, the short line, the long description and the audience order are
defined once in `apps/web/lib/positioning.ts`, and
`apps/web/lib/positioning-guard.test.ts` scans this file for the retired
phrases, so a listing that drifted from the product would fail the build rather
than sit here quietly disagreeing with it.

Do not reorder the audience. It is artists, then managers, then labels,
everywhere. Labels were dropped on 2026-09-11 and came back on 2026-09-24 with
the founder's long description.

---

## Google Play — READY TO PASTE

The app is `com.urganize.app`. Every field below is inside Play's own limits.

### App name (30 characters max)

```
Urganize
```

8 characters.

The name is the brand alone. "Urganize: From idea to execution" is 32
characters against a hard 30-character cap that both stores enforce. Rather
than cut the founder's short line to fit, it goes where there is room for it
whole: the subtitle on the App Store, with the core line as the short
description here. Play shows the app name under the icon,
where a long name is truncated anyway.

### Short description (80 characters max)

```
Urganize is where music teams manage everything from idea to execution.
```

71 characters. This is the core line from `positioning.ts` (`CORE_LINE`),
unchanged.

### Full description (4000 characters max)

```
From idea to execution. Add a release and get the plan, week by week to release day, so your team knows what to do and when. Built for artist managers.

PLAN THE ROLLOUT
Every release starts with a real plan, not a blank board. Pick what you are putting out and Urganize lays out the whole rollout, sized to the format, with every activity dated around release day. The plans come from playbooks written by working managers, and you can edit or delete anything that does not apply to you.

GIVE EVERY ACTIVITY AN OWNER
Put a name and a date on each piece of work. Your team sees what is theirs, what is late and what is coming. Nobody has to ask where things stand.

KEEP THE FILES AND THE DETAILS TOGETHER
The artwork and the release details live with the release. Collect credits and splits from producers, writers and engineers through one link, and they do not need an account to fill it in.

BUILD A PRESS KIT YOU CAN SEND
Every artist gets one standing page you can send to writers, radio and playlist curators. It stays current as your releases land.

ASK URGANS
Urganize has a personal AI for music professionals built in. Ask it what is late, have it build your rollout plan, or tell it to create an activity in plain words. It asks before anything that cannot be undone.

WHO IT IS FOR
Artists running their own releases. Managers running more than one artist at a time. Labels running a full roster.

Start free for 3 days. No card needed.
```

1,461 characters.

Recounted 2026-10-17 (URG-344): the first paragraph is now the current long
description, and the shows block and "the master" came out because neither is
in the product any more.

Earlier recount: 2026-09-25 2026-09-25 at the rebase that finally landed the one-shot plan
(branched 2026-09-15, merged ten days later after the audience line and other
marketing copy moved underneath it). "Draft the plan" is "build your rollout
plan" and the ASK URGANS line no longer promises a review-and-approve step the
feature does not have. Measured off the fenced text above with `wc -m`, not
estimated — the same method every recount here uses, noted for history rather
than left to look like an unexplained jump.

The first paragraph is the founder's long description (`CANONICAL_DESCRIPTION`),
unchanged. Measured off the fenced text above with `wc -m`, not estimated.

### Other Play Console fields

| Field | Value |
| --- | --- |
| Category | Music & Audio |
| Tags | music, release planning, artist manager, music manager |
| Contact email | contact@urganize.app |
| Website | https://urganize.app |
| Privacy policy | https://urganize.app/privacy |

Graphics are not covered here. The feature graphic and screenshots are a
separate design pass; when they are made, the text baked into them uses the
same lines as the share card: the short line as the headline and the promise
line under it (see `apps/homepage/scripts/generate-og-image.mjs`).

---

## Apple App Store — PENDING

**Not ready to submit, and the blocker is not copy.** The iOS app has never
been built or signed. Since the move to Expo (2026-09-24) a Mac is no longer
needed, since EAS builds iOS in the cloud, but it still needs an Apple Developer
account, an APNs key and Firebase's `GoogleService-Info.plist`, none of which
can be done from this repo. See `docs/mobile/eas-setup.md` and
`docs/mobile/push-setup.md`.

The copy below is drafted against Apple's field limits so it is ready when the
build is, but treat it as a draft until somebody has seen it in App Store
Connect.

### App name (30 characters max)

```
Urganize
```

Same as Play, for the same reason. See the note under the Play app name above.

### Subtitle (30 characters max)

```
From idea to execution.
```

23 characters. This is the founder's short line (`SHORT_LINE`), unchanged, and
Apple's subtitle is the one field on either store that holds it whole.

### Promotional text (170 characters max)

```
Urganize is where music teams manage everything from idea to execution.
```

71 characters. This is `SHORT_DESCRIPTION` from `positioning.ts`, which is the
core line, unchanged.

### Description

Use the Google Play full description above without changes. It is inside
Apple's 4,000-character limit and carries no Play-specific wording.

### Keywords (100 characters max, comma separated)

```
music manager,release planning,artist manager,rollout,press kit,music team
```

74 characters. No spaces after the commas: Apple counts them, and the field is
tight.

THE TAGS AND KEYWORDS DID NOT MOVE WITH THE 2026-09-24 LINE, and that is the
same call `LANDING_KEYWORDS` records in `apps/homepage/app/layout.tsx`: these
are not read, they are typed into a store's search box, and nobody searches for
our own wording. "music manager" is still what a manager types.

`label` left the Apple keywords on 2026-09-11, when labels left the audience.
Labels are back in the audience now, so it could return; that is a founder call
and it is not added here.

### Other App Store Connect fields

| Field | Value |
| --- | --- |
| Primary category | Music |
| Secondary category | Productivity |
| Support URL | https://urganize.app |
| Marketing URL | https://urganize.app |
| Privacy policy | https://urganize.app/privacy |

**One review risk worth knowing before submitting.** Apple prohibits linking to
outside payment for digital subscriptions from inside a reviewed iOS app, and
`apps/web/lib/platform.ts` already hides pricing and the Subscribe button on iOS
for that reason. The listing must not promise in-app purchase, because there is
none: subscriptions are bought on the web.
