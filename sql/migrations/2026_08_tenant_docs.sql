-- Shareable, per-tenant developer documentation configuration.
--
-- The platform administrator chooses which catalogue operations to expose and
-- generates an unguessable share link. One row per tenant (upserted). The
-- documentation content itself lives in application code (docsCatalog); this
-- table stores only the selection, branding and the share token. No secrets.

CREATE TABLE IF NOT EXISTS dms_tenant_docs (
  id                  CHAR(36)     NOT NULL,
  tenant_id           CHAR(36)     NOT NULL,
  share_token         CHAR(36)     NOT NULL,
  title               VARCHAR(255) NOT NULL,
  intro               TEXT         NULL,
  api_base_url        VARCHAR(500) NULL,
  selected_operations JSON         NOT NULL,
  status              ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_by          VARCHAR(255) NOT NULL,
  created_at          DATETIME(3)  NOT NULL,
  updated_at          DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_docs_tenant (tenant_id),
  UNIQUE KEY uq_tenant_docs_token (share_token),
  CONSTRAINT fk_tenant_docs_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
