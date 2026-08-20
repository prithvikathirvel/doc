# Roles, permissions and external authentication

This document is the contract between the DMS and whatever system authenticates your users.
It covers the roles the API understands, what each of them may do, how document-level access is
evaluated, and how to plug in an external identity provider **without changing DMS code**.

---

## 1. How the API learns who is calling

The DMS never stores passwords and has no login endpoint. Every request carries an identity that
is resolved once, in `src/middleware/authorization.ts`, into an `AuthContext`:

```ts
{ userId, userName, tenantId, roles: string[] }
```

There are two supported modes, selected by the `AUTH_DISABLED` environment variable.

### Mode A — trusted headers (`AUTH_DISABLED=true`)

| Header | Required | Example | Notes |
|---|---|---|---|
| `x-user-id` | yes | `jane@acme.com` | Identifier recorded in audit logs and permission grants |
| `x-tenant-id` | yes for tenant-scoped calls | `11111111-…` | May be omitted by a `platform_admin` |
| `x-roles` | recommended | `tenant_admin` | Comma separated; defaults to `member` |
| `x-user-name` | no | `Jane Doe` | Display name only |

Use this mode **only** when the API is not reachable directly by end users — that is, behind an
authenticating gateway (section 5) or on a developer machine.

### Mode B — identity token (`AUTH_DISABLED=false`)

The API reads a JWT from the `idtoken` header, or from `Authorization: Bearer <token>`.

| Claim | Mapped to | Accepted keys |
|---|---|---|
| Subject | `userId` | `sub`, `user_id` |
| Display name | `userName` | `preferred_username`, `name`, `email` |
| Tenant | `tenantId` | `x-tenant-id` header first, then `tenant_id`, `tid`, `tenantId` |
| Roles | `roles` | `roles`, `role` (comma string), `realm_access.roles` |

Signature handling:

- `JWT_SECRET` set → the token is verified with that secret (HMAC).
- `JWT_SECRET` empty → the token is only decoded, **not verified**. Acceptable for a local
  experiment, never for production.

Both `sub` and a name claim must be present, otherwise the request is rejected with
`401 User identity not found in token`.

---

## 2. Roles

Role names are case-insensitive and normalised to lower case.

| Role | Scope | Granted by |
|---|---|---|
| `platform_admin` | The whole platform, across every tenant | Your IdP / operations team |
| `tenant_admin` | One tenant. `admin` is accepted as a legacy alias | Workspace owner, or your IdP |
| `member` | One tenant, access limited to their own and shared documents | Default for everyone else |

The web app derives roles as follows: an administrator signs in at `/admin/login` and receives
`platform_admin`; a tenant user signs in at `/login`, and `POST /api/workspaces/resolve` returns
`tenant_admin` when the email matches the tenant's registered owner, otherwise `member`.

### What each role may do

| Capability | `platform_admin` | `tenant_admin` | `member` |
|---|---|---|---|
| Onboard a tenant, list all tenants | yes | no | no |
| Read/update any tenant profile | yes | own tenant only | no |
| Change tenant status (suspend) | yes | no | no |
| Configure tenant storage | yes | own tenant | no |
| Read tenant analytics and people | yes | own tenant | no |
| List every document in a tenant | yes | yes | only own + shared |
| Read / write / delete a document | yes | yes | per document grant |
| Manage sharing of a document | yes | yes | only with `owner` grant |
| Create folders | yes | yes | yes |
| Delete a folder (and its contents) | yes | yes | only folders they created |
| Restore or permanently delete | yes | yes | per document grant |

Tenant isolation is enforced on every call: a `tenant_admin` of tenant A receives `403` for
tenant B, and document ids from another tenant return `404`.

---

## 3. Document permission levels

Grants are stored as four booleans but are always created and displayed as one level.

| Level | Read / download | Rename, new version | Move to trash | Grant and revoke access |
|---|---|---|---|---|
| `viewer` | yes | no | no | no |
| `contributor` | yes | yes | no | no |
| `manager` | yes | yes | yes | no |
| `owner` | yes | yes | yes | yes |

A grant applies to a **principal**, which is either a user (`principalType: "user"`, matched
against `userId`) or a role (`principalType: "role"`, matched against any entry in `roles`).

### How effective access is resolved

1. `platform_admin` → owner.
2. `tenant_admin` (or `admin`) → owner.
3. Document creator → owner.
4. Otherwise the user grant and all role grants are merged, most permissive wins.
5. No grant → no access (`403` on read).

Guard rails:

- The creator's owner grant cannot be downgraded or revoked.
- You cannot reduce or revoke your own access unless you are a tenant administrator.
- Granting the same principal twice updates the existing grant instead of duplicating it.
- Members only *see* documents they created or were granted read access to, in list results.

`GET /api/documents/:id` and `GET /api/documents/:id/permissions` return the caller's effective
access, so a client can hide actions instead of discovering them through errors.

---

## 4. Choosing an integration approach

| Approach | Code change in DMS | Signature verified | Best for |
|---|---|---|---|
| **A. Authenticating gateway injects headers** | none | by the gateway | Any IdP: Entra ID, Okta, Auth0, Keycloak, Cognito, PingFederate |
| **B. HMAC-signed JWT sent to the API** | none | yes, by the DMS | An IdP or service that can issue HS256 tokens with the shared secret |
| **C. RS256 / JWKS verification inside the DMS** | small middleware change | yes, by the DMS | Teams that cannot place a gateway in front |

Approach **A** is the recommended way to satisfy "no changes to the DMS code".

---

## 5. Approach A — external IdP through a gateway

```
Browser ──► Identity provider (OIDC login)
   │
   ▼
Gateway / reverse proxy  ── validates the IdP token, maps claims ──►  DMS API
(NGINX, Envoy, AWS ALB + Cognito, Azure API Management, Apigee, oauth2-proxy)
        injects: x-user-id, x-user-name, x-tenant-id, x-roles
```

### Steps

1. **Register the application** in your IdP (authorization code + PKCE for the browser).
2. **Add the claims the DMS needs** to the access or ID token:
   - a stable subject (`sub`, or `email` if you prefer email identifiers),
   - the DMS tenant id — add a custom claim such as `tenant_id`, filled from the user's
     organisation attribute or group,
   - roles or groups that you can map to `platform_admin`, `tenant_admin`, `member`.
3. **Deploy the gateway in front of the API.** It must:
   - reject unauthenticated requests,
   - validate the token signature and audience against the IdP JWKS,
   - map claims to the four identity headers,
   - **strip any client-supplied `x-user-id`, `x-tenant-id`, `x-roles`, `x-user-name` headers
     before adding its own** — this is the one rule that must not be missed.
4. **Lock down the API**: run it with `AUTH_DISABLED=true` and bind it to a private network,
   security group or service mesh so only the gateway can reach it.
5. **Map roles** in the gateway, for example:

   | IdP group | `x-roles` |
   |---|---|
   | `dms-platform-admins` | `platform_admin` |
   | `acme-workspace-admins` | `tenant_admin` |
   | everyone else | `member` |

6. **Point the web UI at the gateway** so browser requests carry the session cookie the gateway
   understands.

### NGINX example

```nginx
location /api/ {
    auth_request /_oauth2_auth;                    # oauth2-proxy, or your OIDC module

    auth_request_set $user   $upstream_http_x_auth_request_user;
    auth_request_set $email  $upstream_http_x_auth_request_email;
    auth_request_set $tenant $upstream_http_x_auth_request_tenant;
    auth_request_set $roles  $upstream_http_x_auth_request_groups;

    # Never trust what the client sent.
    proxy_set_header x-user-id   "";
    proxy_set_header x-tenant-id "";
    proxy_set_header x-roles     "";
    proxy_set_header x-user-name "";

    proxy_set_header x-user-id   $email;
    proxy_set_header x-user-name $user;
    proxy_set_header x-tenant-id $tenant;
    proxy_set_header x-roles     $roles;

    proxy_pass http://dms-api:3000;
}
```

Equivalent building blocks: **AWS** ALB OIDC authentication plus a Lambda@Edge or a small
sidecar to rename headers; **Azure** API Management `validate-jwt` followed by `set-header`
policies; **Apigee** `VerifyJWT` plus `AssignMessage`.

### Verifying the wiring

```bash
# Through the gateway: succeeds and the audit log shows the real user
curl -s https://dms.example.com/api/tenants/me -H "Cookie: <session>"

# Direct to the API from outside the private network: must not be reachable
curl -s http://dms-api.internal:3000/api/tenants/me -H "x-user-id: attacker"
```

---

## 6. Approach B — send an HMAC JWT to the API

Use when a gateway is not available and your IdP (or your own auth service) can mint HS256
tokens.

1. Share a strong secret with the API: `JWT_SECRET=<32+ random bytes>`, `AUTH_DISABLED=false`.
2. Issue one token per user **per tenant**, containing:

```json
{
  "sub": "jane@acme.com",
  "preferred_username": "Jane Doe",
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "roles": ["tenant_admin"],
  "exp": 1767225600
}
```

3. Send it as `idtoken: <jwt>` or `Authorization: Bearer <jwt>`. If the token has no tenant
   claim, add `x-tenant-id`.
4. In the web UI, paste the token in the **Identity token** field on the tenant sign-in page.

For local experiments the repository ships a minting helper:

```bash
npm run mint:jwt -- --tenant <tenant-uuid> --sub jane@acme.com --name "Jane Doe" \
  --roles tenant_admin --secret "$JWT_SECRET"
```

Rotation: change `JWT_SECRET`, restart the API, reissue tokens. Tokens are stateless, so a
short `exp` (15–60 minutes) is the practical revocation mechanism.

---

## 7. Approach C — verify RS256 / JWKS inside the DMS

The current middleware verifies with a shared secret only. If you must verify IdP-signed RS256
tokens directly, the change is contained to `decodeToken()` in `src/middleware/authorization.ts`:
fetch and cache the JWKS, then verify with the matching key. Everything else — role handling,
tenant resolution, permissions — stays as documented above.

---

## 8. Mapping users to tenants

The DMS identifies a tenant by its UUID. Pick one of:

- **Claim on the user** — the IdP carries `tenant_id`; simplest when a user belongs to one tenant.
- **Group naming convention** — `acme-workspace-admins` → look up `acme` with
  `POST /api/workspaces/resolve` and use the returned id.
- **Per-tenant sign-in** — the user chooses their workspace at sign-in and the gateway sets
  `x-tenant-id` accordingly, which is what the bundled UI does.

A user who belongs to several tenants needs one identity per tenant, or a tenant switcher that
changes `x-tenant-id` for subsequent requests.

---

## 9. Checklist before going live

- [ ] `AUTH_DISABLED=true` only behind a gateway on a private network, otherwise `false` with a strong `JWT_SECRET`.
- [ ] The gateway strips client-supplied identity headers before injecting its own.
- [ ] `platform_admin` is granted to operators only, never mapped from a customer group.
- [ ] Every user identity is stable (`sub` or email) — grants are stored against it.
- [ ] Tenant ids come from a trusted claim or from the gateway, never from user input.
- [ ] Tokens are short lived and the signature is verified somewhere in the path.
- [ ] Audit entries show the expected `actorId` after a test upload.

## 10. Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `401 x-user-id header is required` | Header mode, no identity injected | Add `x-user-id` in the gateway, or authorise in Swagger |
| `401 Token not provided` | `AUTH_DISABLED=false` and no token | Send `idtoken` / `Authorization: Bearer` |
| `401 User identity not found in token` | Token has no `sub` or no name claim | Add `sub` and `preferred_username`/`name`/`email` |
| `401 Tenant id not found` | No tenant claim and no `x-tenant-id` | Map the tenant claim or set the header |
| `403 You do not have access to this tenant` | Tenant id does not match the caller | Check the tenant mapping in the gateway |
| `403 Platform administrator role required` | `platform_admin` missing | Fix the role mapping |
| Audit shows the wrong actor | Gateway forwards a client header | Strip inbound identity headers |
