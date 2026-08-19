# Architecture

```
Client
  |
  v
API  (Express routes / controllers)
  |
  v
Application  (DocumentService, FolderService, TenantService)
  |
  v
Domain ports
  +-- DocumentRepository / FolderRepository / TenantRepository
  +-- StorageProvider
          |
          v
   StorageProviderRegistry.resolve(tenantConfig)
          |
   +------+------+------+
   v      v      v      v
  S3    MinIO   GCP   Azure
```

- Domain and application code import **ports**, never `boto3` / `@aws-sdk` / `minio` / `@google-cloud/storage` / `@azure/storage-blob`.
- Vendor SDKs live only under `src/infrastructure/storage/*`.
- Vendor exceptions are translated to `StorageNotFoundError`, `StoragePermissionError`, `StorageUploadError`, etc.
- Workflows, stages, instances, and handlers from the previous codebase were removed. This service is document storage only.

## Capability flags

Not every vendor exposes multipart the same way. Providers advertise capabilities:

- signed upload / download URLs
- multipart
- streaming
- copy / list

The application uses a signed URL when the provider supports it; otherwise it falls back to a proxied stream.

## Multi-tenancy

`tenant_id` is on every metadata row and is the first prefix of every object key:

`{basePrefix}/{tenantId}/{documentId}/v{n}/{filename}`

A request for tenant A can never load tenant B's row, even with a guessed UUID.
