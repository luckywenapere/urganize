# Home's chat is separate from Sessions (2026-10-10, v1.93.0, no flag)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call: on a computer, Home's chat is ONE permanent conversation and the switch reads "Home | Sessions". Chats started with "+ New session" live in Sessions, so throwaway chats stop piling up in the list.

- **The Home chat's id is the person's user id** (`lib/chappi/home-chat.ts`). Both are uuids, so it is a valid chat id, unique per person and the same on every device, with no migration. `useChappiStore.nextChatId` makes the first message of a blank Home transcript create the chat under that id.
- **Sessions never list it** (`withoutHomeChat`), and `remove` refuses to delete it. `showHomeChat()` (history store) puts it back on screen; the Home tab, arriving on Home and the composer-focus event all call it. `useHomeChatStore.mode` ('home' | 'session') says which one the right side is showing.
- **Limits:** a Home chat past the existing 500-message / 1 MB cap shows the usual "too long" notice; the phone page and the side drawer share the same transcript store and are otherwise unchanged; if opening Home fails offline it falls back to a blank transcript under the fixed id and the normal conflict/fork rules settle it later.
- **Not verified:** no browser or real session; the cross-device behaviour rests on the id rule and unit tests.
