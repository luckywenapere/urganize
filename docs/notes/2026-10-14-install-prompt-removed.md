# Install prompt removed (2026-10-14, v1.130.4)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder: the "Keep Urganize on your Home Screen" card "should stop showing, delete it completely". Deleted InstallAppPrompt.tsx, lib/install-prompt.ts (+ test), the beforeinstallprompt capture in NavigationTracker, and PushPermissionPrompt's wait-for-install branch (the notification card now just uses its own delay). The AndroidAppBanner mount was removed from AppShell too: it was already hidden while the install prompt flag was on, and un-gating it would have swapped one pop-up for another. Its component file remains, unmounted. NEXT_PUBLIC_FEATURE_INSTALL_PROMPT is now read by nothing. Don't bring back an install ask without asking.
