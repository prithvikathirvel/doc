# Storage configuration reference

Every tenant is bound to exactly one storage target. This page lists, per provider, the fields
you must enter, the fields you must leave alone, what a real value looks like, and where to find
it in the vendor console.

Two rules apply everywhere:

1. **Credential fields hold the NAME of an environment variable, never the secret itself.**
   The API resolves the value at runtime with `process.env[<name>]`. If a name cannot be
   resolved, the raw string is used as a last resort, so a mistyped name fails loudly instead
   of silently leaking a secret into the database.
2. **Only the fields of the selected provider are accepted.** Sending a field that belongs to a
   different provider is rejected with
   `"<field> is not used by the selected storage provider"`, which keeps a tenant from carrying a
   stale MinIO endpoint after a move to S3.

The UI (**Admin → tenant → Settings → Storage configuration**, and step 2 of the onboarding
wizard) renders exactly the fields listed here. `GET /api/tenants/storage-providers` returns the
same specification for programmatic clients.

---

## Common fields

| Field | Required | Example | Notes |
|---|---|---|---|
| `basePrefix` | no | `dms` | Folder prefix in front of every object key. Keys become `dms/<tenantId>/<documentId>/v1/<file>`. Leave empty to write at the bucket root. |
| `signedUrlTtlSeconds` | no | `900` | Lifetime of upload/download links, 60–86400. 900 (15 min) suits browser uploads. |

---

## Amazon S3

| Field | Required | Enter | Do not enter |
|---|---|---|---|
| `container` (Bucket name) | yes | `acme-documents` | |
| `region` | yes | `ap-south-1` | |
| `endpoint` | no | *(empty for AWS)* | Only for S3-compatible gateways |
| `accessKeyRef` | no* | `TENANT_ACME_AWS_ACCESS_KEY` | The key itself (`AKIA…`) |
| `secretKeyRef` | no* | `TENANT_ACME_AWS_SECRET_KEY` | The secret itself |
| `sessionTokenRef` | no | `TENANT_ACME_AWS_SESSION_TOKEN` | Only for temporary STS credentials |
| — | — | — | `projectId`, `accountName`, `credentialsJsonRef`, `useSsl` |

\* Provide **both** key references, or **neither**. With neither, the SDK uses the instance role
(EC2/ECS/EKS), which is the recommended production setup.

**Where the values come from**

- Bucket name and region: S3 console → *Buckets* → your bucket → *Properties*. The region also
  appears in the bucket ARN, e.g. `arn:aws:s3:::acme-documents`.
- Access key pair: IAM console → *Users* → your service user → *Security credentials* →
  *Create access key*. Access key ID looks like `AKIAIOSFODNN7EXAMPLE`, the secret like
  `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`.

**Environment on the API host**

```env
TENANT_ACME_AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
TENANT_ACME_AWS_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**Saved configuration**

```json
{
  "provider": "s3",
  "container": "acme-documents",
  "region": "ap-south-1",
  "accessKeyRef": "TENANT_ACME_AWS_ACCESS_KEY",
  "secretKeyRef": "TENANT_ACME_AWS_SECRET_KEY",
  "basePrefix": "dms",
  "signedUrlTtlSeconds": 900
}
```

Minimum IAM policy for the bucket: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`,
`s3:ListBucket`. Add a CORS rule allowing `PUT` and `GET` from the web origin if browsers upload
through signed URLs.

---

## MinIO

| Field | Required | Enter | Do not enter |
|---|---|---|---|
| `container` (Bucket name) | yes | `acme-documents` | |
| `endpoint` | yes | `https://minio.acme.internal:9000` | A host without a scheme |
| `region` | no | `us-east-1` | |
| `accessKeyRef` | yes | `TENANT_ACME_MINIO_ACCESS_KEY` | The key itself |
| `secretKeyRef` | yes | `TENANT_ACME_MINIO_SECRET_KEY` | The secret itself |
| — | — | — | `projectId`, `accountName`, `credentialsJsonRef`, `sessionTokenRef` |

TLS is derived from the endpoint scheme: `https://` enables it, `http://` disables it. There is
no separate TLS switch, so an `http://` endpoint can never be saved as a TLS connection.

**Where the values come from**

- Endpoint: the address of the MinIO S3 API (default port `9000`). The console on port `9001` is
  *not* the API endpoint.
- Bucket: MinIO console → *Buckets* → *Create Bucket*.
- Keys: MinIO console → *Access Keys* → *Create access key*. A local development server started
  with `docker compose up` uses `minioadmin` / `minioadmin`.

**Environment on the API host**

```env
TENANT_ACME_MINIO_ACCESS_KEY=minioadmin
TENANT_ACME_MINIO_SECRET_KEY=minioadmin
```

**Saved configuration**

```json
{
  "provider": "minio",
  "container": "acme-documents",
  "endpoint": "https://minio.acme.internal:9000",
  "region": "us-east-1",
  "accessKeyRef": "TENANT_ACME_MINIO_ACCESS_KEY",
  "secretKeyRef": "TENANT_ACME_MINIO_SECRET_KEY",
  "basePrefix": "dms",
  "signedUrlTtlSeconds": 900
}
```

For a local server use `http://127.0.0.1:9000`. Avoid `localhost` when the API runs in a
container: it resolves to the container itself, not to the host.

---

## Google Cloud Storage

| Field | Required | Enter | Do not enter |
|---|---|---|---|
| `container` (Bucket name) | yes | `acme-documents` | |
| `projectId` | yes | `acme-platform-prod` | The project *number* |
| `credentialsJsonRef` | no* | `TENANT_ACME_GCP_CREDENTIALS` | The JSON key contents |
| — | — | — | `region`, `endpoint`, `accessKeyRef`, `secretKeyRef`, `sessionTokenRef`, `accountName`, `useSsl` |

\* Leave empty when the API runs on GKE or Compute Engine with workload identity; the client then
picks up the attached service account.

**Where the values come from**

- Project ID: Google Cloud console → project selector. Format: 6–30 lowercase letters, digits and
  hyphens, e.g. `acme-platform-prod`.
- Bucket: Cloud Storage → *Buckets*. The bucket location is part of the bucket, so no region field
  is needed here.
- Service account key: IAM & Admin → *Service Accounts* → *Keys* → *Add key (JSON)*. Grant
  `roles/storage.objectAdmin` on the bucket.

**Environment on the API host** — either the file path or the JSON itself:

```env
TENANT_ACME_GCP_CREDENTIALS=/etc/dms/secrets/acme-gcs.json
# or
TENANT_ACME_GCP_CREDENTIALS={"type":"service_account","project_id":"acme-platform-prod", ...}
```

**Saved configuration**

```json
{
  "provider": "gcp",
  "container": "acme-documents",
  "projectId": "acme-platform-prod",
  "credentialsJsonRef": "TENANT_ACME_GCP_CREDENTIALS",
  "basePrefix": "dms",
  "signedUrlTtlSeconds": 900
}
```

Signed URLs need a service account with a private key; workload identity alone cannot sign URLs
unless the account has the *Service Account Token Creator* role.

---

## Azure Blob Storage

| Field | Required | Enter | Do not enter |
|---|---|---|---|
| `container` | yes | `documents` | |
| `accountName` | yes | `acmeprodstorage` | The full `*.blob.core.windows.net` host |
| `secretKeyRef` (Account key) | yes | `TENANT_ACME_AZURE_ACCOUNT_KEY` | The account key itself |
| `endpoint` | no | `https://acmeprodstorage.blob.core.windows.net` | Leave empty for public Azure |
| — | — | — | `region`, `projectId`, `credentialsJsonRef`, `accessKeyRef`, `sessionTokenRef`, `useSsl` |

**Where the values come from**

- Storage account name: Azure portal → *Storage accounts*. 3–24 lowercase letters and digits.
- Container: the storage account → *Data storage* → *Containers* → *+ Container*.
- Account key: the storage account → *Security + networking* → *Access keys* → *Show key*. It is a
  long base64 string ending in `==`.

**Environment on the API host**

```env
TENANT_ACME_AZURE_ACCOUNT_KEY=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==
```

**Saved configuration**

```json
{
  "provider": "azure",
  "container": "documents",
  "accountName": "acmeprodstorage",
  "secretKeyRef": "TENANT_ACME_AZURE_ACCOUNT_KEY",
  "basePrefix": "dms",
  "signedUrlTtlSeconds": 900
}
```

The account key is used server-side only, to mint short-lived SAS URLs.

---

## Validation rules applied to every save

| Rule | Message |
|---|---|
| Bucket name: 3–63 chars, lowercase letters, digits, `.`, `_`, `-` | *Bucket name must be 3-63 characters…* |
| Azure container: 3–63 chars, lowercase, single hyphens | *Container name must be 3-63 characters…* |
| Region format `us-east-1` | *Region must look like us-east-1* |
| Endpoint is a full `http(s)` URL | *Endpoint must be a full URL…* |
| Credential fields look like environment variable names | *… must be the name of an environment variable* |
| S3 keys supplied in pairs | *Provide both the access key and secret key references…* |
| GCP project ID: 6–30 chars | *Google Cloud project ID must be 6-30 characters…* |
| Azure account: 3–24 lowercase alphanumerics | *Storage account name must be 3-24 lowercase letters or digits* |
| Signed URL lifetime 60–86400 s | *Signed URL lifetime must be between 60 and 86400 seconds* |

---

## After saving

- The provider cache for that tenant is cleared immediately; no restart is needed for
  configuration changes.
- Changing an **environment variable** does require an API restart, because the process reads it
  from its own environment.
- Existing documents keep the provider, container and object key they were written with. Switching
  a tenant to a new provider affects new uploads only; migrate old objects separately if needed.
- Verify with a small upload: **Documents → Upload**. Failures surface as a storage error with a
  request id that matches the API log line.
