-- ============================================================
-- SAMPLE APP RUNTIME - Migration 0002
-- Adds deleted_at (soft-delete) columns to entities that were
-- missing them, required to implement full CRUD for Admin.
-- ============================================================

ALTER TABLE countries ADD COLUMN deleted_at TEXT;

ALTER TABLE currencies ADD COLUMN deleted_at TEXT;

ALTER TABLE sectors ADD COLUMN deleted_at TEXT;

ALTER TABLE technologies ADD COLUMN deleted_at TEXT;

ALTER TABLE stakeholders ADD COLUMN deleted_at TEXT;

ALTER TABLE catalyst_days ADD COLUMN deleted_at TEXT;
