# Users, tenants and who may sign in

Short guide to how the DMS separates people, workspaces and API traffic —
with examples. Applies to the Keycloak / User Service integration in this
repository.

---

## 1. Not every user needs a DMS account

There are **three kinds of identity** in the DMS. Only the third one can
open the web UI:

| Kind | Has a DMS account? | Can sign in to the UI? | Typical source |
|---|---|---|---|
| ① Application user (no account) | No | No | Your other app's backend uploading on their behalf |
| ② Account without a workspace | Yes (`dms_users`) | Yes, but sees only "pending workspace" | Self-signup at `/signup`, or admin pre-creation |
| ③ Workspace member | Yes + row in `tenant_members` | Yes — lands in their workspace | An administrator attaches the account |

**Rule of thumb:** create DMS accounts only for people who must open the DMS
web UI (or call the API with their own session). Everyone else is ① — your
application carries their identity in a header, and the DMS keeps their
documents user-separated anyway.

---

## 2. Tenant-wise separation (how workspaces stay apart)

- Every document, folder, version, grant and audit row stores `tenant_id`.
  Every query filters by it — there is no cross-tenant read path.
- Who may act inside a tenant is decided **only** by `tenant_members`
  (`role` = `tenant_admin` or `member`). Keycloak never grants roles.
- A member of tenant A asking for tenant B gets **403**, always:

```bash
curl -i http://localhost:3000/api/documents \
  -H "Cookie: dms_at=$TOKEN" \
  -H "x-tenant-id: <tenant-B-id>"
# → 403 TENANT_FORBIDDEN
```

- One person may belong to several workspaces; at sign-in they get a picker,
  and each request's `x-tenant-id` is validated against their memberships.

---

## 3. User-wise separation for application users (no DMS account)

> End-to-end, copy-paste guide for the common case — the DMS used purely as a
> backend by another application via one `tenant_admin` API key + `x-user-id`
> attribution — lives in **[api-key-integration.md](api-key-integration.md)**.
> Read the note below on attribution vs. isolation before you build on it.

Your app may have a handful of users or thousands — either way, most of them
never need the DMS UI directly; it is your **backend** that talks to the DMS.
Give it one API key per environment and pass the end user's identifier
with every call — the DMS records it as `created_by`:

```bash
# 1. A platform administrator creates the key once (console: /admin/api-keys)
curl -X POST http://localhost:3000/api/api-keys \
  -H "Cookie: dms_at=$ADMIN_TOKEN" -H "x-dms-client: web" \
  -H "content-type: application/json" \
  -d '{"displayName":"acme app backend","tenantId":"<tenant-id>","roles":["member"]}'
# → { "apiKey": {...}, "key": "dms_ab12cd34.x9..." }   (shown exactly once)

# 2. Your backend uploads on behalf of its user "app-user-4711"
curl -X POST http://localhost:3000/api/documents \
  -H "x-api-key: dms_ab12cd34.x9..." \
  -H "x-user-id: app-user-4711" \
  -H "content-type: application/json" \
  -d '{"filename":"invoice.pdf","name":"Invoice","mimeType":"application/pdf","size":1024}'
```

What is trusted and what is not:

| Where the call's authority comes from | Where the user identity comes from |
|---|---|
| **The API key** (roles + tenant scope, revocable, hash-stored) | **`x-user-id`** — plain attribution metadata |

So user-wise separation works exactly like for UI users: documents are
filtered by `created_by`, and a member-scoped key can only operate inside its
tenant.

### When that person later needs the DMS UI

Sign them up (or create the account from the People page) and attach them.
The DMS **claims** everything their old identifier created — automatically if
your app used their email as `x-user-id`, or explicitly via `claimAliases`:

```bash
curl -X POST http://localhost:3000/api/tenants/<tenant-id>/members \
  -H "Cookie: dms_at=$ADMIN_TOKEN" -H "x-dms-client: web" \
  -H "content-type: application/json" \
  -d '{"email":"appuser4711@acme.com","role":"member","claimAliases":["app-user-4711"]}'
# → { "member": {...}, "claimed": { "documents": 3, "folders": 1, ... } }
```

After this, that person signs in and sees those documents in their member
view immediately. Legacy trusted-header clients (`x-user-id` + `x-tenant-id` +
`x-roles` with `AUTH_DISABLED=true`) are handled the same way.

---

## 4. Workspace membership — the API

All examples assume an administrator session (`POST /api/auth/login`, cookie
`dms_at`) or an API key with the right scope. Browser mutations also need
`x-dms-client: web` (the web UI sends it automatically).

### Sign in

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@yourcompany.com","password":"••••••••"}'
# → { "session": { "user": {...}, "isPlatformAdmin": true, "memberships": [...] } }
```

### Create an account **and** attach it to a workspace in one step

Used by the People page → "New account". The identity provider requires
**first/last names of at least 3 characters** when filled — an initial like
"R" must be written out or left empty.

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Cookie: dms_at=$ADMIN_TOKEN" -H "x-dms-client: web" \
  -H "content-type: application/json" \
  -d '{
    "email": "shanmugam.revathan@sifycorp.com",
    "password": "changeme123",
    "firstName": "Shanmugam",
    "lastName": "Revathan",
    "tenantId": "aa465412-167d-481e-9350-79508f32102c",
    "role": "member"
  }'
```

### Attach an account that already exists

```bash
curl -X POST http://localhost:3000/api/tenants/<tenant-id>/members \
  -H "Cookie: dms_at=$ADMIN_TOKEN" -H "x-dms-client: web" \
  -H "content-type: application/json" \
  -d '{"email":"shanmugam.revathan@sifycorp.com","role":"member"}'
```

### Change a role / suspend / remove

```bash
# promote to workspace administrator
curl -X PATCH http://localhost:3000/api/tenants/<t>/members/<userId> \
  -H "Cookie: dms_at=$TOKEN" -H "x-dms-client: web" \
  -H "content-type: application/json" -d '{"role":"tenant_admin"}'

# suspend (keeps documents, blocks sign-in to this workspace)
curl -X PATCH .../members/<userId> -d '{"status":"disabled"}'

# remove from the workspace (documents stay)
curl -X DELETE .../members/<userId>
```

### Built-in safety rules (server-enforced)

| Rule | Result |
|---|---|
| Nobody may change their **own** role, suspend or remove themselves | `403` "You cannot change the role or status of your own membership…" |
| The **last active administrator** of a workspace cannot be demoted, suspended or removed | `409` "This workspace must keep at least one active administrator…" |
| A platform administrator bypasses rule 2 | allowed (they can always repair any workspace) |

The People page mirrors this: your own row shows **You** instead of controls.

### Typical first-time setup for a new tenant

1. Platform admin creates the tenant (console `/admin`).
2. Platform admin creates the customer's first account:
   `POST /api/users` with `tenantId` + `role: "tenant_admin"`.
3. From then on that person manages their own workspace from
   `/workspace/users` (People): adds members, promotes admins — under the
   two rules above.

---

## 5. Where each fact lives (one-screen summary)

| Question | Answer is in | Example |
|---|---|---|
| Is this really the person? (UI) | Keycloak token, verified against the realm keys | `dms_at` cookie |
| Which workspaces + role? | DMS table `tenant_members` | `{tenantId, userId, role}` |
| Platform administrator? | `dms_users.is_platform_admin` (seeded via `DMS_PLATFORM_ADMINS`) | |
| Machine client authority? | `dms_api_keys` (`x-api-key`) | scope + roles |
| Which user created a document? | `documents.created_by` | UI user id, or the `x-user-id` your app passed |
| Old uploads under a previous id? | `dms_user_aliases` + the claim step | re-pointed on attach |
