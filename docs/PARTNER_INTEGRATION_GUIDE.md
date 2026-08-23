# Giving the DMS to another company (Partner Integration Guide)

This guide explains, end to end, how to hand the **DMS API** and the **Tenant Admin UI**
to another company (a "partner" / external project) — assuming **you have already
created their tenant from the Platform Admin account**.

It has three audiences, clearly separated:

- **You (the DMS platform owner)** — Part 1: what to prepare and hand over.
- **The partner's administrator** — Part 3: using the Tenant Admin UI.
- **The partner's developer** — Part 4 & 5: calling the DMS API from their own code.

> Real example values are shown with `https://dms.example.com`. In the Sify dev
> environment the equivalent is `https://apidev.sifymodernization.digital/dms`.

---

## Table of contents

1. [The big picture](#1-the-big-picture)
2. [Part 1 — What YOU (platform owner) must do](#part-1--what-you-platform-owner-must-do)
3. [Part 2 — The handoff package you give the partner](#part-2--the-handoff-package-you-give-the-partner)
4. [Part 3 — Using the Tenant Admin UI](#part-3--using-the-tenant-admin-ui)
5. [Part 4 — Using the DMS API (programmatic)](#part-4--using-the-dms-api-programmatic)
6. [Part 5 — The partner's own Keycloak token (external JWT)](#part-5--the-partners-own-keycloak-token-external-jwt)
7. [Roles & what each can do](#6-roles--what-each-can-do)
8. [Errors & common problems](#7-errors--common-problems)
9. [Final checklists](#8-final-checklists)

---

## 1. The big picture

```
   ┌───────────────────────────┐        ┌──────────────────────────────┐
   │  YOU (Platform Owner)     │        │  PARTNER (another company)   │
   │  - run the DMS            │        │  - has their own users       │
   │  - run Keycloak (DMS realm)│       │  - may have their own app    │
   └─────────────┬─────────────┘        └─────────────┬────────────────┘
                 │  1. you create their tenant        │
                 │     (ownerEmail = partner admin)   │
                 │                                    │
                 │  2. you hand over the package ─────┼──► tenant id, URLs, app id
                 │                                    │
                 │                                    │  3a. partner admin signs in at the UI
                 │                                    │      → auto-linked as Tenant Admin
                 │                                    │
                 │                                    │  3b. partner dev calls the API with a
                 │  ◄──────── DMS API calls ──────────┼─────  Keycloak access token
                 │       (Bearer token + x-app-id)    │      (their client, or the DMS client)
```

Two rules that make everything else simple:

- **The partner never puts roles in their token.** DMS resolves the role itself, on
  every call, from DMS's own records. The token only proves *who* the caller is.
- **A user must exist in the tenant** (as owner or an added member) before they can
  do anything. The owner is linked automatically on first login; members are added
  by the tenant admin.

---

## Part 1 — What YOU (platform owner) must do

You have already created the tenant. There are **3 small preparation steps** before
the partner can use anything.

### Step 1.1 — Confirm the tenant was created with the right owner email

When you created the tenant, you set `ownerEmail`. **This email is the single most
important value** — the person who controls it becomes the Tenant Admin automatically.

```bash
# As Platform Admin, view the tenant you created
curl -s https://dms.example.com/dms/api/tenants/<tenant-id> \
  -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
  -H "x-app-id: DMS"
```

Check the response shows the partner admin's email in `ownerEmail`. If it is wrong,
fix it:

```bash
curl -s -X PATCH https://dms.example.com/dms/api/tenants/<tenant-id> \
  -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
  -H "x-app-id: DMS" \
  -H "x-tenant-id: <tenant-id>" \
  -H "content-type: application/json" \
  -d '{ "ownerEmail": "admin@partner.com" }'
```

### Step 1.2 — Choose how the partner authenticates

Pick **one** of:

| Option | When to use | What you do |
|---|---|---|
| **A. DMS Keycloak client (`DMS`)** | The partner has no identity system, or is happy to use yours | Nothing extra. They log in with `POST /api/auth/login` using their email + password. |
| **B. The partner's own Keycloak client** | The partner already has users in the same Keycloak realm and wants their app to call DMS directly | Add their client id to `KEYCLOAK_ALLOWED_CLIENT_IDS` (Step 1.3). |

**Option A is the default and the simplest.** Use it unless the partner explicitly
needs their own client.

### Step 1.3 — (Only for Option B) Register the partner's client id

If the partner has their own Keycloak client (e.g. `partner-acme-app`) in the `DMS`
realm, add it to your DMS `.env` so its tokens are accepted:

```dotenv
KEYCLOAK_ALLOWED_CLIENT_IDS=partner-acme-app
# (comma-separated for more than one partner)
```

Then restart the DMS API. Signature and issuer are still verified — this only adds
the client to the audience allowlist.

> The partner's token does **not** need role claims. DMS ignores token roles and
> resolves the role from its own `tenant_members` table. See Part 5.

### Step 1.4 — Make sure storage is attached

The tenant must have a storage configuration, or uploads will fail with
`Tenant has no storage configuration`. You set this at creation time; verify:

```bash
curl -s https://dms.example.com/dms/api/tenants/<tenant-id> \
  -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" -H "x-app-id: DMS" \
  -H "x-tenant-id: <tenant-id>" | jq .storage
```

If empty, attach storage (the partner cannot do this themselves):

```bash
curl -s -X PUT https://dms.example.com/dms/api/tenants/<tenant-id>/storage \
  -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" -H "x-app-id: DMS" \
  -H "x-tenant-id: <tenant-id>" -H "content-type: application/json" \
  -d '{ "provider": "minio", "container": "partner-acme", "endpoint": "http://...", "accessKeyRef": "...", "secretKeyRef": "..." }'
```

(Field reference: `GET /dms/api/tenants/storage-providers` lists every provider's fields.)

---

## Part 2 — The handoff package you give the partner

Send the partner these values. They will need all of them.

| Item | Example | Where it comes from |
|---|---|---|
| **Tenant Admin UI URL** | `https://dms.example.com/dms/login` | your deployment |
| **API base URL** | `https://dms.example.com/dms/api` | your deployment |
| **App id** | `DMS` | always `DMS` |
| **Tenant id** | `7c1f...-...` | from tenant creation response |
| **Tenant slug** | `partner-acme` | the workspace name typed at sign-in |
| **Owner email** | `admin@partner.com` | the `ownerEmail` you set |
| **How to get a password** | "sign up at the UI with that email first" | the owner must create their account |
| *(Option B only)* Their client id | `partner-acme-app` | their Keycloak client |

> **Important onboarding note for the partner admin:** they must **create their
> account first** (sign up at `/dms/login` using the owner email), then sign in.
> The first successful sign-in links them to the tenant as **Tenant Admin**
> automatically — no manual step from you.

---

## Part 3 — Using the Tenant Admin UI

For the partner's **administrator** (non-technical) users.

### 3.1 First sign-in (one time)

1. Go to **`https://dms.example.com/dms/login`**.
2. If they do not have an account yet, click **Create an account** and register with
   the **owner email** you were given (`admin@partner.com`).
3. Sign in with that email + password.
4. They land in **`/workspace`** as a **Tenant Admin**.

> If they see *"Your account isn't linked to a DMS workspace yet"*, the email they
> signed up with does not match the tenant's `ownerEmail`. Fix the email (theirs, or
> the one you set on the tenant) so they match.

### 3.2 What a Tenant Admin can do in the UI

- Upload, preview, download, version, rename, move-to-trash and restore documents
- Create folders and delete folders (with their contents)
- Share a document with another user at one of four levels: **viewer / contributor / manager / owner**
- **Add members** to the workspace (People page) by email, and set them as
  `tenant_admin` or `member`
- View workspace analytics (storage usage, upload trends, contributors)

### 3.3 Adding a member (the partner admin does this)

The Tenant Admin goes to **People → Add user**, enters the new member's email and a
role. Behind the scenes this calls:

```http
POST /dms/api/tenants/<tenant-id>/users
{ "email": "alice@partner.com", "roleId": "<role-uuid>", "role": "member" }
```

That member then signs up + signs in, and they appear in the workspace. **Members
cannot self-join** — only the Tenant Admin (or a Platform Admin) can add them.

---

## Part 4 — Using the DMS API (programmatic)

For the partner's **developer**. This section uses **Option A** (the DMS login). For
the partner's own token, see Part 5.

### 4.1 Every request needs three headers

| Header | Value | Notes |
|---|---|---|
| `Authorization` | `Bearer <accessToken>` | from login (Step 4.2) |
| `x-app-id` | `DMS` | always `DMS` |
| `x-tenant-id` | `<tenant-id>` | the partner's tenant; required for tenant-scoped calls |

### 4.2 Step 1 — Log in to get an access token

```bash
curl -s -X POST https://dms.example.com/dms/api/auth/login \
  -H "content-type: application/json" \
  -d '{ "email": "admin@partner.com", "password": "their-password" }'
```

Response:

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "expiresIn": 300,
  "user": { "userId": "d9a9113f-...", "email": "admin@partner.com", "displayName": "Acme Admin" },
  "role": "tenant_admin",
  "roles": ["tenant_admin"],
  "tenants": [
    { "id": "7c1f...-...", "name": "Partner Acme", "slug": "partner-acme", "status": "active", "role": "tenant_admin" }
  ]
}
```

Save `accessToken`, `refreshToken`, and the `tenants[0].id` (your tenant id).

> The access token expires after `expiresIn` seconds (300 = 5 min). Use the refresh
> token to get a new one (Step 4.9). Never store the client secret in the partner's
> app — they only ever hold user tokens.

### 4.3 Step 2 — Upload a document (simple, small files)

For files up to the API body limit, upload directly with multipart:

```bash
curl -s -X POST https://dms.example.com/dms/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-id: DMS" \
  -H "x-tenant-id: $TENANT_ID" \
  -F "file=@invoice-2026.pdf" \
  -F "name=Q3 Invoice" \
  -F "folderId="
```

Response:

```json
{ "document": {
    "id": "b3f7...-...",
    "name": "Q3 Invoice",
    "mimeType": "application/pdf",
    "size": 204800,
    "status": "active",
    "currentVersion": 1,
    "createdBy": "d9a9113f-..."
} }
```

### 4.4 Step 2-alt — Upload a document (large files, signed URL)

For large files, DMS returns a **direct-to-storage signed URL** so the file never
passes through the API. Two calls:

**Call 1 — create the upload session:**

```bash
curl -s -X POST https://dms.example.com/dms/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -H "content-type: application/json" \
  -d '{ "filename": "big-video.mp4", "mimeType": "video/mp4", "size": 524288000 }'
```

Response (when the storage provider supports signed URLs):

```json
{
  "document": { "id": "b3f7...-...", "status": "pending_upload", ... },
  "upload": {
    "url": "https://storage.../big-video.mp4?X-Amz-...",
    "method": "PUT",
    "headers": { "content-type": "video/mp4" },
    "expiresAt": "2026-08-23T12:05:00.000Z"
  }
}
```

**Call 2 — PUT the bytes straight to storage** (no auth headers from DMS; use the
headers DMS gave you):

```bash
curl -s -X PUT "$UPLOAD_URL" \
  -H "content-type: video/mp4" \
  --data-binary @big-video.mp4
```

**Call 3 — tell DMS the upload finished:**

```bash
curl -s -X POST https://dms.example.com/dms/api/documents/$DOC_ID/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -H "content-type: application/json" \
  -d '{ "size": 524288000 }'
# → { "document": { ..., "status": "active" } }
```

### 4.5 List documents

```bash
curl -s "https://dms.example.com/dms/api/documents?limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID"
# → { "items": [ { "id": "...", "name": "...", "status": "active", ... } ], "total": 42 }
```

Query options: `folderId`, `q` (name search), `createdBy`, `includeDeleted=true`,
`limit`, `offset`. Members only see documents they created or were granted.

### 4.6 Download / preview a document

DMS returns a short-lived **signed download URL** (recommended — no bytes through the API):

```bash
curl -s -X POST https://dms.example.com/dms/api/documents/$DOC_ID/download \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -H "content-type: application/json" -d '{}'
# → { "document": {...}, "signedUrl": { "url": "https://storage.../?...", "method": "GET", "headers": {} }, ... }
```

Then `GET` that `url` to fetch the bytes. For an inline (browser-preview) URL, use
`/preview` instead of `/download`. For a specific version, send `{ "versionNumber": 2 }`.

To stream through the API instead (e.g. server-side proxy):

```bash
curl -s https://dms.example.com/dms/api/documents/$DOC_ID/content \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -o invoice.pdf
```

### 4.7 Create a new version of a document

```bash
curl -s -X POST https://dms.example.com/dms/api/documents/$DOC_ID/versions \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -F "file=@invoice-2026-v2.pdf"
# → { "document": { ..., "currentVersion": 2 } }

# list versions
curl -s https://dms.example.com/dms/api/documents/$DOC_ID/versions \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID"
```

### 4.8 Share a document with another user

```bash
curl -s -X POST https://dms.example.com/dms/api/documents/$DOC_ID/permissions \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -H "content-type: application/json" \
  -d '{ "principalType": "user", "principalId": "<other-user-id>", "level": "viewer" }'
```

Levels: `viewer` (read), `contributor` (+write/new version), `manager` (+delete),
`owner` (+share/revoke). List grants with `GET /documents/$DOC_ID/permissions`,
revoke with `DELETE /documents/$DOC_ID/permissions/$PERMISSION_ID`.

### 4.9 Refresh the token

```bash
curl -s -X POST https://dms.example.com/dms/api/auth/refresh \
  -H "x-app-id: DMS" -H "content-type: application/json" \
  -d '{ "refreshToken": "$REFRESH_TOKEN" }'
# → { "accessToken": "...", "refreshToken": "...", "expiresIn": 300 }
```

Call this when the access token is near expiry. When the refresh token itself
expires, the user must log in again.

### 4.10 Folders (optional)

```bash
# create
curl -s -X POST https://dms.example.com/dms/api/folders \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -H "content-type: application/json" -d '{ "name": "Invoices", "parentId": null }'

# list (root)
curl -s "https://dms.example.com/dms/api/folders?parentId=null" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID"
```

### 4.11 Minimal code pattern (any language)

```text
on startup / login:     POST /api/auth/login  → keep accessToken, refreshToken, tenantId
before each call:       if token expires in <60s → POST /api/auth/refresh
on every API call:      set Authorization, x-app-id: DMS, x-tenant-id headers
on 401:                 refresh once; if still 401 → re-login
```

---

## Part 5 — The partner's own Keycloak token (external JWT)

Use this when the partner has their **own app** that authenticates users against the
**same Keycloak `DMS` realm**, and they want to call DMS with *their* token — without
going through `/api/auth/login`.

### Why this is safe

- The partner's token must still be **signed by the realm** and **not expired** — DMS
  verifies the signature, issuer and audience. The partner cannot forge or tamper.
- DMS **ignores any role claims** in the token and resolves the caller's role from its
  own `tenant_members` table. So even though the partner's token has no role, DMS still
  knows they are a `member` or `tenant_admin`.
- The partner **cannot elevate themselves** by editing their token.

### Setup (you do once)

1. The partner's Keycloak client lives in the `DMS` realm (e.g. `partner-acme-app`).
2. Add it to your DMS `.env`: `KEYCLOAK_ALLOWED_CLIENT_IDS=partner-acme-app`, restart.
3. Make sure the partner's users are **members of the tenant** (owner auto-linked on
   first login, or added by the Tenant Admin).

### The partner calls DMS directly

```bash
# The partner gets this token from THEIR login flow (their Keycloak client).
# It looks like a normal DMS-realm JWT, just with azp = "partner-acme-app"
# and NO role claims. That is fine.
curl -s https://dms.example.com/dms/api/documents \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "x-app-id: DMS" \
  -H "x-tenant-id: $TENANT_ID"
```

DMS verifies the token, sees `azp: partner-acme-app` (allowed), resolves the user's
role from `tenant_members`, and authorizes the call. **No change to the partner's
token is ever required.**

> If the partner is in a **different Keycloak realm** (or a different IdP entirely),
> do not weaken token verification. Put an authenticating gateway in front of DMS
> that validates their IdP and injects the standard headers (`AUTH_MODE=headers` on a
> private network). See `docs/ROLES_AND_ACCESS.md`, Approach A.

---

## 6. Roles & what each can do

| Action | Platform Admin | Tenant Admin | Member |
|---|---|---|---|
| Sign in at | `/admin/login` | `/login` | `/login` |
| Onboard / list tenants | ✅ | ❌ | ❌ |
| Add members to the workspace | ✅ | ✅ | ❌ |
| Configure storage | ✅ | ✅ (own) | ❌ |
| Read analytics | ✅ | ✅ (own) | ❌ |
| Upload / list all documents | ✅ | ✅ | own + shared only |
| Download / preview | ✅ | ✅ | per grant |
| New version / rename | ✅ | ✅ | per grant |
| Share / revoke access | ✅ | ✅ | only with `owner` grant |
| Move to trash / restore / delete | ✅ | ✅ | per grant |

Tenant isolation is enforced on every call: a member of tenant A gets `403` for
tenant B.

---

## 7. Errors & common problems

| HTTP | Message | Meaning / fix |
|---|---|---|
| 401 | `Token not provided` | Missing `Authorization: Bearer`. |
| 401 | `Invalid token` | Token expired, bad signature, or wrong issuer/audience. Refresh or re-login. |
| 403 | `Unknown or missing x-app-id` | Add `x-app-id: DMS`. |
| 403 | `… not issued for this application` | The token's client is not allowed. Add it to `KEYCLOAK_ALLOWED_CLIENT_IDS`. |
| 403 | `You do not belong to this tenant` | Wrong `x-tenant-id`, or the user has no active membership. Add them as a member. |
| 403 | `Platform administrator role required` | A platform-only endpoint called by a non-platform user. |
| 403 | `Tenant administrator role required` | An admin endpoint called by a member. |
| 404 | `Tenant has no storage configuration` | You (platform owner) must attach storage to the tenant. |
| 409 | `The workspace URL "…" is already taken` | Duplicate tenant slug. |
| 4xx | `Your account isn't linked to a DMS workspace yet` | The user signed up but is neither the owner nor an added member. |

---

## 8. Final checklists

### You (platform owner) — before handing over

- [ ] Tenant created with the correct `ownerEmail`.
- [ ] Storage attached to the tenant (`GET /tenants/<id>` shows `storage`).
- [ ] (Option B) partner's Keycloak client added to `KEYCLOAK_ALLOWED_CLIENT_IDS` and API restarted.
- [ ] Handoff package sent (Part 2).
- [ ] `KEYCLOAK_REALM=DMS`, `DMS_APP_CLIENT_ID=DMS` set correctly in `.env`.

### Partner admin — first day

- [ ] Sign up at `/dms/login` using the **owner email**.
- [ ] Sign in → lands in `/workspace` as Tenant Admin.
- [ ] Add team members by email (People page).

### Partner developer — first integration

- [ ] `POST /api/auth/login` works and returns `accessToken` + `tenants`.
- [ ] Three headers set on every call (`Authorization`, `x-app-id`, `x-tenant-id`).
- [ ] Upload (direct or signed-URL) succeeds.
- [ ] Token refresh wired before the 5-minute expiry.
- [ ] 401 → refresh once → re-login handling in place.

---

### Where to look in the code

| Topic | File |
|---|---|
| Auth + role resolution | `docs/SECURE_AUTHORIZATION.md` |
| Roles & access model | `docs/ROLES_AND_ACCESS.md` |
| All API routes | `src/route/*.ts` |
| Login / refresh / logout | `src/controller/express/authController.ts` |
| Document endpoints | `src/controller/express/documentController.ts` |
| Tenant / member endpoints | `src/controller/express/tenantController.ts` |
| Allowed Keycloak clients | `KEYCLOAK_ALLOWED_CLIENT_IDS` in `.env` |
