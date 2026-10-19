# Supabase Auth email templates (URG-386)

What production sends for confirm signup, magic link, password reset, invite and email change. Supabase does not read this folder: install a change through the Management API (`PATCH /v1/projects/<ref>/config/auth` with `mailer_templates_<kind>_content` and `mailer_subjects_<kind>`; `confirmation`, `magic_link`, `recovery`, `invite`, `email_change`), and back up the current values first.

One card, the app icon, one Young Serif sentence, the address in a pill, one green button named for its action, the expiry, a plain-link fallback, a one-line footer. Light by default with a true dark version for Apple Mail / iOS Mail; Gmail's forced dark keeps AA; Outlook desktop gets a VML button and a 480px ghost table.

Only Supabase's own variables are used: `.ConfirmationURL`, `.Email`, `.NewEmail`. Never put sign-up metadata (`.Data.*`, e.g. `release_title`) in a template: anyone can set it at sign-up, and text they choose would go out from verify@urganize.app (phishing risk). The confirm headline is the fixed "Confirm your email to start your rollout."
