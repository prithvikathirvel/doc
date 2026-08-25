-- Per-tenant document versioning toggle. Decided at tenant creation; when
-- disabled the workspace's documents keep a single version (v1) and uploading
-- new versions is rejected with 403 VERSIONING_DISABLED. Existing versions of
-- already-created documents remain readable. Default enabled: existing tenants
-- keep their behaviour unchanged.

ALTER TABLE tenants
  ADD COLUMN versioning_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER allowed_mime_types;
