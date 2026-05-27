-- =============================================================================
-- Add 'split_sheet' to the asset_category enum
-- =============================================================================
--
-- v1 scope item 4 (file/asset attachment) explicitly lists split sheets as a
-- release artifact. This adds a dedicated storage category so split sheets
-- group separately from generic documents and contracts. This is purely a
-- storage category — it does not add split-sheet automation, which is v2.
--
-- The application-layer enum (apps/web/lib/asset-constants.ts) gains the same
-- value; the assets.category column is typed as this Postgres enum, so the new
-- value must exist here or inserts of split-sheet assets would fail.
--
-- ADD VALUE IF NOT EXISTS is idempotent and safe to re-apply. It is intentionally
-- not wrapped in a transaction block: ALTER TYPE ... ADD VALUE cannot be used in
-- the same transaction that adds it, and bare execution avoids that constraint
-- entirely. No subsequent statement here uses the new value.
-- =============================================================================

alter type public.asset_category add value if not exists 'split_sheet';
