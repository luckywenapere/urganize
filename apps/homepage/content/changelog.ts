// The ledger moved to packages/changelog (2026-07-23) so the WEB app can
// read it too — it powers the in-app "What's new" note shown on the first
// login after an update. This re-export keeps every homepage import site
// stable; the package remains the single source of truth for the product
// version (see CLAUDE.md → Versioning).
export { changelog, CURRENT_VERSION, type Release } from '@urganize/changelog';
