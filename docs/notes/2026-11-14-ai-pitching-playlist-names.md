# The AI pitching to playlists: names, not ids (2026-11-14, #1267, #1272, v1.284.3)

What the AI can pitch to, how it finds a playlist, and the traps. Code names keep
"UrgAns" and "Chappi"; copy says "AI".

## What happened (#1267, read from production, 6 Nov 2026)

The one team that ever bought credits tried to pitch a song through the AI. They
named Spotify and Apple Music playlists that are not on Urganize. The model never
called `list_pitch_playlists`, passed each name as the `playlistId`, and
`pitch_song` answered "That playlist was not found." seven times. The chat ran 17
messages, spent 24 bought credits, showed no card and sent nothing. The paywall,
the credits and the `send_credit_pitches()` function were never reached.
#1236 (v1.271.1) had fixed a different case, a paid playlist on the free route,
that nobody had hit.

## How it works now

- **Only curators who joined Urganize can be pitched.** The prompt says so, says to
  call `list_pitch_playlists` before proposing, that a list the user types is not
  that list, and that Spotify and Apple Music editorial playlists are pitched in
  Spotify for Artists and Apple Music for Artists (the rollout's Pitch this! has a
  step). It also says never to end a reply by saying you are about to act.
- **`pitch_song` finds a playlist by id, or by its whole name** (`matchPlaylist`
  in `lib/chappi/tool-families/promo.ts`: case, spacing and punctuation ignored,
  never part of a name, because a pitch cannot be taken back). A miss answers
  that the playlist is not on Urganize and lists the real ones; two with one name
  ask which; a playlists list that cannot be read gives its own reason.
- **The card pins what it showed (#1272).** An approved card replays its
  arguments, so `confirm` returns the resolved ones (`ChappiConfirmOutcome.args`):
  the real playlist id and `playlistName`. The runner puts those on the card
  instead of the model's own. Approving sends to that id without reading the list
  again, so a rename or a second playlist with the same name in between cannot
  redirect the pitch. A call with a name and no card (or an old card) still looks
  it up.

## Traps

- `playlistName` is not in the tool's input schema on purpose: the model never
  sets it, only `confirm` does, and it only feeds the closing line.
- A real id goes straight to the route, so a paused curator gets the route's own
  reason ("isn't taking pitches right now"). The playlists route leaves paused
  curators out, so only the send route can say it.
- The list route caps at 200 rows, which is why a real id is never looked up in it.
- The old name guard did not read the changelog, so a What's new line can still
  say the old name; #1273 added the check.

## Verified, and not

Checked on production on 14 Nov with the real model: asked to pitch to a playlist
that is not on Urganize, it showed the 8 real ones and did not loop. Its first
reply did not say the playlist is not on Urganize (it did on the second message)
and it never pointed to Spotify for Artists. Choosing a real playlist by name
through to the card was tested locally with a scripted model only, and the pinned
card (#1272) with unit tests only, not against the real model.
