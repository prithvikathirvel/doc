-- Example tenant used for local development with MinIO.
-- Replace the UUID if you already created the tenant through the API.

USE dms;

INSERT INTO tenants (id, name, slug, status, max_file_size_bytes, allowed_mime_types, created_at, updated_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Acme Demo',
  'acme',
  'active',
  52428800,
  JSON_ARRAY('application/pdf', 'text/plain', 'image/png', 'image/jpeg'),
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO storage_configs (
  id, tenant_id, provider, container, region, endpoint,
  access_key_ref, secret_key_ref, use_ssl, signed_url_ttl_seconds, base_prefix, created_at, updated_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'minio',
  'documents',
  'us-east-1',
  'http://127.0.0.1:9000',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  0,
  900,
  'dms',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE provider = VALUES(provider), container = VALUES(container), endpoint = VALUES(endpoint);
