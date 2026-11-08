# Paste their link (2026-11-08, v1.260.0, #1129, no flag)

When the streaming search can't find the right artist, the search box takes a link to their artist page instead. Mock approved the same day: `docs/mocks/paste-artist-link/mock.html`.

## Where

- **Add an artist** (`components/artists/AddArtistDialog.tsx`), including "Bring in older songs" from an artist page, which is the same dialog.
- **The Home popup** "Is this Dorian on streaming?" (`components/artists/StreamingLinkPrompt.tsx`, #1088).
- Onboarding's import step uses the same search route, so a pasted link works there too, with no change to its screen.

## How it works

- Box hint is "Artist name or link". Under name results: "Not them? Paste their link". With no results: "No profile found for that name. Check the spelling, or paste their link." (popup: "No one by that name on Deezer or Apple Music. Paste their link").
- "Paste their link" empties the box (hint "Paste their artist link") and shows `PASTE_LINK_HELP`. "Search by name instead" goes back. "Add by name" hides while the box holds a link.
- Add artist: a PASTED link (`onPasteLink`) opens the check screen at once, through `choose`, so the "Is this the same person?" question still runs. A link typed by hand is read after the usual 350 ms pause but only shows as one result to choose, because halfway through typing it can match a different artist. After Back the link shows as one result instead of opening again (`linkSeenFor`). Every paste bumps `pasteCount`, so pasting the same link again after "Try again" really tries again. Emptying the box bumps `searchSeq`, so an answer still on its way can't open an artist after "Search by name instead".
- Home popup: reads a link on paste or on the search button, and shows it as the "Is this X on streaming?" card.
- A paste keeps just the link (`extractLink`), without the words a share sheet adds; the route also takes the link out of any text before cutting it to 600 characters.
- `GET /api/artist-import/search?q=` sees a link with `looksLikeLink` and answers `{ artists: [one], fromLink: true }`, or a plain reason with 422 (can't use this link) or 502 (Deezer or Apple did not answer).

## Code

- `lib/artist-import/artist-link.ts` (pure): `extractLink` (a link inside shared text counts), `looksLikeLink`, `parseArtistLink`, `artistLinkMessage`, `PASTE_LINK_HELP`.
- `lib/artist-import/artist-link-server.ts`: `openShortLink` follows a Deezer share link (`link.deezer.com`, `deezer.page.link`) one redirect at a time, at most 4, only while it stays on those hosts, and reads `og:url` if it answers with a page. `findArtistFromLink` reads the artist by id from `api.deezer.com/artist/{id}` or `itunes.apple.com/lookup?id=`.
- Analytics: `artist_link_pasted { from: 'add_artist' | 'streaming_popup', ok }` (Add artist counts pasted links only).
- Deezer answers 200 with an error object. Only code 800 ("no data") means no such artist; any other code (quota, outage) is "Try again".

## Traps

- **Only Apple Music and Deezer links work.** Spotify links get "We can't read Spotify links". The Spotify code exists (`lib/code-finder/sources.ts`), but `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` were not set on the production app on 8 Nov 2026. Adding them is a separate founder yes; reading a Spotify link would then need its own path (Spotify artist, then a song's ISRC, then the same artist on Deezer).
- **Not tested against the live services.** This session's network blocked Deezer and Apple, so the redirect from `link.deezer.com` and Apple's lookup were tested with stand-ins only. Assumed: the share link answers with a 3xx to `www.deezer.com/.../artist/{id}`. Check with a real share link after deploy.
- Apple's lookup reads the US store unless told otherwise, so an Apple link from another store (`/ng/`) is looked up again with `&country=ng` when the first lookup is empty. The release lookup and the streaming-link save (`verifyArtist`) do not pass a country, so an artist sold only outside the US could still show no releases or fail to link.
- An Apple lookup only counts a row with `wrapperType: 'artist'`, so an album or song id in an artist-shaped link is "didn't open an artist", never the album's artist.
- The search box's `maxLength` went from 80 to 600 for links. Names are still cut to 80 by `searchImportArtists`.
- Fixed on the way: in the Home popup, a pick from the list when there was no best guess showed the question with no card and no Yes button (`showing` read the guess while `mode` was still `'guess'`). It now prefers the pick.
