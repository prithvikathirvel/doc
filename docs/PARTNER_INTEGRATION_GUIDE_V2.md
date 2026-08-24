# Partner Integration Guide V2 — three identity scenarios

A partner (another company / external project) wants to call the **DMS API**. Their
users may live in one of **three** places. This guide explains, for each case, exactly
how **authentication** (who are you) and **authorization** (what can you do) work, what
**you** must configure, and how **they** call the API.

> Assumes you already created the partner's tenant from the Platform Admin account.

Real example host: `https://apidev.sifymodernization.digital` (API at `/dms/api`, UI at `/dms`).

---

## The three cases at a glance

| # | Partner's users live in | Their token's `iss` | Does DMS verify it directly? | What you configure |
|---|---|---|---|---|
| **1** | The **DMS realm** (your Keycloak) | `…/realms/DMS` | ✅ Yes (default) | `KEYCLOAK_ALLOWED_CLIENT_IDS` |
| **2** | A **different realm** on the same Keycloak (e.g. `ABC`) | `…/realms/ABC` | ✅ Yes | `KEYCLOAK_TRUSTED_ISSUERS` + `KEYCLOAK_ALLOWED_CLIENT_IDS` |
| **3** | A **different provider** (Auth0, Azure AD, Okta, Cognito…) | that provider's issuer | ✅ Yes *(OIDC/JWKS)* **or** via a gateway | `KEYCLOAK_TRUSTED_ISSUERS` + `KEYCLOAK_ALLOWED_CLIENT_IDS`, **or** a gateway |

**One rule is the same for all three:** DMS **never** reads roles from the token.
Authentication proves *who you are*; the *role* is resolved by DMS, on every call,
from DMS's own records (`tenant_members` and `user_app_roles`). So a partner token
**never needs role claims** — in any case.

---

## How authorization decides (identical for all cases)

```
                  ┌─────────────────────────────────────────────┐
   Partner call   │ Authorization: Bearer <partner token>       │
   ──────────────►│ x-app-id: DMS                                │
                  │ x-tenant-id: <tenant-id>                     │
                  └─────────────────────┬───────────────────────┘
                                        │
   ┌────────────────────────────────────▼────────────────────────────┐
   │ 1. AUTHENTICATION — verifyAccessToken(token)                     │
   │    • decode `iss` → must be in KEYCLOAK_TRUSTED_ISSUERS (or DMS) │
   │    • fetch that issuer's JWKS, verify RS256 signature            │
   │    • check exp / iat / audience (azp or aud in allowed clients)  │
   │    → verified `sub` (+ `email`).                                 │
   ├──────────────────────────────────────────────────────────────────┤
   │ 2. AUTHORIZATION — resolve the role, server-side                 │
   │    • app role (platform_admin?) from user_app_roles / User Mgt   │
   │    • tenant role:                                                │
   │        find membership by sub   ─┐                              │
   │        if miss → find by email   ├─ one must be active          │
   │           (FEDERATED_EMAIL_      │   else 403                    │
   │            LINKING)             ─┘                              │
   │    → req.auth.roles = [tenant_admin | member]                   │
   └──────────────────────────────────────────────────────────────────┘
```

Two things make the partner cases work:

1. **Trusted issuers** — DMS verifies any issuer you declare, not just your own realm.
2. **Email linking** — when a partner's `sub` is not in DMS (it's a foreign id), DMS
   matches them to their tenant membership by **email** instead.

---

# Case 1 — Partner users are in the DMS realm (your Keycloak)

The simplest case. The partner's users are real users in your `DMS` Keycloak realm,
issued by a client in that realm (often the `DMS` client itself).

### How auth works
- Token `iss = http://1.6.37.35/keycloak/realms/DMS`. DMS already trusts this issuer.
- DMS verifies signature against the DMS realm JWKS. ✅

### How authz works
- The partner user's `sub` is a DMS-realm subject.
- If they are the **tenant owner**, they were auto-linked as `tenant_admin` on first
  login (their email matched `owner_email`).
- If they are a **member**, the Tenant Admin added them by email.
- Either way, `tenant_members` has a row for them → authorized.

### What YOU configure
Only their **client id**, if it is not the default `DMS`:

```dotenv
KEYCLOAK_ALLOWED_CLIENT_IDS=partner-acme-app
```

(`DMS` and your browser client are already allowed.)

### How THEY call the API
They get a token from the DMS login (their email + password) and call normally:

```bash
# login (DMS realm)
TOKEN=$(curl -s -X POST https://dms.example.com/dms/api/auth/login \
  -H "content-type: application/json" \
  -d '{ "email": "admin@partner.com", "password": "****" }' | jq -r .accessToken)

# call any DMS API
curl -s https://dms.example.com/dms/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-id: DMS" \
  -H "x-tenant-id: $TENANT_ID"
```

---

# Case 2 — Partner users are in a DIFFERENT realm on the same Keycloak (e.g. `ABC`)

The partner has their own Keycloak realm `ABC` on the **same** Keycloak server
(`http://1.6.37.35/keycloak`). Their users authenticate there and get a token with
`iss = http://1.6.37.35/keycloak/realms/ABC`.

### How auth works
- DMS does **not** trust `ABC` by default → the token is rejected (`issuer is not trusted`).
- You must **register the `ABC` issuer + its JWKS URI**. Because it's Keycloak, the JWKS
  URI is deterministic: `<issuer>/protocol/openid-connect/certs`.
- After that, DMS verifies the `ABC` token the same way as a DMS token — same library,
  same checks, just a different key set (cached per issuer).

### How authz works
- The partner user's `sub` is an `ABC`-realm subject — **not** in any DMS `tenant_members`
  row (those are keyed by DMS `sub`).
- So DMS falls back to **email linking**: the verified `email` claim is matched against
  `tenant_members.email`. The Tenant Admin added them by email (or they are the owner) →
  match found → authorized as their role.

### What YOU configure

```dotenv
# 1) Trust the ABC issuer and its JWKS URI
KEYCLOAK_TRUSTED_ISSUERS=http://1.6.37.35/keycloak/realms/ABC|http://1.6.37.35/keycloak/realms/ABC/protocol/openid-connect/certs

# 2) Allow the partner's Keycloak client in ABC
KEYCLOAK_ALLOWED_CLIENT_IDS=partner-abc-app

# 3) Email linking is on by default (keep it on for this case)
FEDERATED_EMAIL_LINKING=true
```

Restart the DMS API.

### What the TENANT ADMIN does (once)
Add the partner's users to the tenant **by their ABC email**:

```bash
curl -s -X POST https://dms.example.com/dms/api/tenants/$TENANT_ID/users \
  -H "Authorization: Bearer $TENANT_ADMIN_TOKEN" \
  -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -H "content-type: application/json" \
  -d '{ "email": "alice@partner.com", "roleId": "<member-role-uuid>", "role": "member" }'
```

### How THEY call the API
The partner logs in to **their own** realm `ABC`, gets their own token, and forwards it:

```bash
# the partner logs in to THEIR realm ABC (their Keycloak client)
TOKEN=$(curl -s -X POST http://1.6.37.35/keycloak/realms/ABC/protocol/openid-connect/token \
  -d "grant_type=password" -d "client_id=partner-abc-app" -d "client_secret=$ABC_SECRET" \
  -d "username=alice@partner.com" -d "password=****" | jq -r .access_token)

# their token has iss=.../realms/ABC, azp=partner-abc-app, NO role claims — that's fine
curl -s -X POST https://dms.example.com/dms/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-id: DMS" \
  -H "x-tenant-id: $TENANT_ID" \
  -F "file=@report.pdf"
# → 201  (verified against ABC JWKS, role resolved by email from tenant_members)
```

### Security
- DMS verifies the ABC token's signature against ABC's JWKS — the partner cannot forge it.
- DMS ignores any role claim in the ABC token — the partner cannot elevate themselves.
- Email linking only matches against **admin-created** memberships — no self-join.

---

# Case 3 — Partner uses a DIFFERENT provider (Auth0, Azure AD, Okta, Cognito…)

The partner authenticates against a completely separate identity provider. Their token
`iss` is that provider's (e.g. `https://login.microsoftonline.com/<tid>/v2.0`).

There are **two ways** to handle this. Pick based on what you control.

## Option 3A — DMS verifies the provider's token directly (recommended when the provider publishes a JWKS)

Any standards-compliant OIDC provider publishes a JWKS endpoint. DMS can verify those
tokens exactly like Keycloak tokens.

### What YOU configure

```dotenv
# Trust the external issuer + its JWKS URI (from the provider's
# /.well-known/openid-configuration "jwks_uri")
KEYCLOAK_TRUSTED_ISSUERS=https://login.partner.com|https://login.partner.com/.well-known/jwks.json

# Allow the provider's client / resource id (what appears in aud or azp)
KEYCLOAK_ALLOWED_CLIENT_IDS=partner-web-client

FEDERATED_EMAIL_LINKING=true
```

Restart the API.

### What the TENANT ADMIN does (once)
Add the partner users to the tenant **by their provider email** (same as Case 2).

### How THEY call the API
The partner obtains a token from their provider (authorization code, client credentials,
etc.) and sends it to DMS unchanged:

```bash
# partner gets a token from their own IdP (e.g. Auth0 client-credentials)
TOKEN=$(curl -s -X POST https://login.partner.com/oauth/token \
  -d "grant_type=client_credentials" -d "client_id=partner-web-client" \
  -d "client_secret=$SECRET" -d "audience=dms" | jq -r .access_token)

curl -s https://dms.example.com/dms/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-id: DMS" \
  -H "x-tenant-id: $TENANT_ID"
```

**Requirements for this to work:**
- The provider's token is **RS256** and publishes a JWKS. (HS256/shared-secret tokens
  cannot be verified this way — use Option 3B.)
- The token carries an **`email`** claim (so DMS can link it to a membership). Most OIDC
  providers include it with the `email` scope; if yours uses a custom claim, map it.
- The provider's `aud` or `azp` must be added to `KEYCLOAK_ALLOWED_CLIENT_IDS`.

### Security notes
- DMS verifies signature + issuer + expiry + audience. The provider cannot be impersonated.
- `FEDERATED_EMAIL_LINKING=true` means **you trust the email claims of every issuer in
  `KEYCLOAK_TRUSTED_ISSUERS`**. If two providers both have `alice@x.com`, either could
  access that membership. For high-security multi-IdP setups, prefer Option 3B.

## Option 3B — An authenticating gateway in front of DMS

Use this when the provider does not publish a JWKS, uses HS256, or you want a single
chokepoint that normalizes identity (and you do **not** want to federate every provider
into DMS's verifier).

```
Partner app ──► [ Gateway: oauth2-proxy / NGINX / Azure APIM / AWS ALB ]
                   validates the partner IdP token (any provider)
                   maps claims → trusted headers
                   strips any client-supplied identity headers
                   injects: x-user-id, x-tenant-id, x-roles
                                                              │
                                                              ▼
                                              DMS API (AUTH_MODE=headers, private network)
```

### What YOU configure
- Run DMS with `AUTH_MODE=headers` on a **private network / security group** reachable
  **only** by the gateway.
- The gateway validates the partner's IdP token and injects `x-user-id` (a stable
  identifier — typically email), `x-tenant-id`, and `x-roles` (`tenant_admin`/`member`).

### How THEY call the API
Through the gateway only. DMS never sees the partner token; it trusts the gateway's headers.

```bash
# The partner calls DMS via the gateway; the gateway adds identity headers.
curl -s https://dms-gateway.example.com/dms/api/documents \
  -H "Cookie: <partner IdP session>"   # gateway validates this, injects x-* headers
```

### NGINX sketch (oauth2-proxy)
```nginx
location /dms/api/ {
  auth_request /_oauth2_auth;
  auth_request_set $user   $upstream_http_x_auth_request_user;   # email
  auth_request_set $roles  $upstream_http_x_auth_request_groups; # mapped role

  # NEVER trust client headers — clear them first
  proxy_set_header x-user-id   "";
  proxy_set_header x-tenant-id "";
  proxy_set_header x-roles     "";

  proxy_set_header x-user-id   $user;
  proxy_set_header x-tenant-id $tenant;   # derived per request
  proxy_set_header x-roles     $roles;    # tenant_admin or member
  proxy_pass http://dms-api.internal:3000;
}
```

This needs **no DMS code change** and supports any IdP. The trade-off: you operate the
gateway and keep DMS private.

## Option 3C — Federate the provider into Keycloak (identity brokering / token exchange)

Configure Keycloak to broker/trust the partner's IdP (Keycloak supports this natively).
The partner's users then authenticate through Keycloak (which delegates to their IdP) and
receive a **DMS-realm token**. From DMS's perspective this collapses to **Case 1** — no
extra DMS config, no email-linking concerns, one consistent identity per user.

Best when you want a single identity layer for all partners.

---

## Choosing between the options

| Need | Choose |
|---|---|
| Partner is happy to use your DMS realm | **Case 1** |
| Partner has their own realm on your Keycloak | **Case 2** |
| Partner has Auth0/Azure/Okta/Cognito with RS256 + JWKS, and you trust their emails | **Case 3A** |
| Partner uses HS256, no JWKS, or you want one chokepoint / no per-IdP federation | **Case 3B** (gateway) |
| You want all partners funneled through one identity layer | **Case 3C** (Keycloak brokering) |

---

## Configuration reference (all cases)

```dotenv
# Always
AUTH_MODE=keycloak
DMS_APP_ID=DMS
DMS_APP_CLIENT_ID=DMS
KEYCLOAK_REALM=DMS
KEYCLOAK_ISSUER=http://1.6.37.35/keycloak/realms/DMS
KEYCLOAK_JWKS_URI=http://1.6.37.35/keycloak/realms/DMS/protocol/openid-connect/certs

# Case 1, 2, 3A — clients allowed in the token's aud/azp (besides DMS)
KEYCLOAK_ALLOWED_CLIENT_IDS=partner-acme-app,partner-abc-app,partner-web-client

# Case 2, 3A — extra trusted issuers as issuer|jwksUri pairs
KEYCLOAK_TRUSTED_ISSUERS=\
  http://1.6.37.35/keycloak/realms/ABC|http://1.6.37.35/keycloak/realms/ABC/protocol/openid-connect/certs,\
  https://login.partner.com|https://login.partner.com/.well-known/jwks.json

# Match federated users to memberships by email when their sub is unknown
FEDERATED_EMAIL_LINKING=true
```

---

## A worked end-to-end example (Case 2)

1. **You** create the tenant (Platform Admin) with `ownerEmail: admin@partner.com`.
2. **You** add to `.env`:
   `KEYCLOAK_TRUSTED_ISSUERS=http://1.6.37.35/keycloak/realms/ABC|http://1.6.37.35/keycloak/realms/ABC/protocol/openid-connect/certs`
   `KEYCLOAK_ALLOWED_CLIENT_IDS=partner-abc-app` → restart.
3. **Partner admin** signs up in realm `ABC` with `admin@partner.com`, signs in → DMS
   auto-links them as `tenant_admin` (email matches `owner_email`).
4. **Partner admin** adds their colleague `alice@partner.com` to the tenant as `member`.
5. **Alice** gets an `ABC` token and uploads:

```bash
TOKEN=$(curl -s -X POST http://1.6.37.35/keycloak/realms/ABC/protocol/openid-connect/token \
  -d "grant_type=password" -d "client_id=partner-abc-app" -d "client_secret=$ABC_SECRET" \
  -d "username=alice@partner.com" -d "password=****" | jq -r .access_token)

curl -s -X POST https://dms.example.com/dms/api/documents \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: DMS" -H "x-tenant-id: $TENANT_ID" \
  -F "file=@contract.pdf"
# → 201
```

Alice's token has `iss=.../realms/ABC`, `azp=partner-abc-app`, and **no role claim**.
DMS verifies it, can't find `sub` in `tenant_members`, matches `alice@partner.com` by
email → `member` → upload allowed.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 … issuer is not trusted` | Issuer not in `KEYCLOAK_TRUSTED_ISSUERS` | Add `issuer\|jwksUri` and restart |
| `401 … not issued for this application` | Client id not allowed | Add to `KEYCLOAK_ALLOWED_CLIENT_IDS` |
| `401 Invalid token` (trusted issuer) | JWKS unreachable / key rotated / clock skew | Check the issuer's JWKS URL is reachable from the API host; bump `KEYCLOAK_CLOCK_TOLERANCE` |
| `403 You do not belong to this tenant` | No membership by sub **or** email | Tenant Admin adds the user by their exact email; or `FEDERATED_EMAIL_LINKING=false` is blocking email match |
| `403 … but user should be a member` | Email in token ≠ email the admin added | Make the emails match (case-insensitive); ensure the token includes the `email` claim/scope |
| Works for owner, fails for member | Member never added | Add the member by email (People page / `POST /tenants/{id}/users`) |

---

## Security checklist

- [ ] `KEYCLOAK_TRUSTED_ISSUERS` lists **only** real partner issuers; each `jwksUri` is correct.
- [ ] `KEYCLOAK_ALLOWED_CLIENT_IDS` lists **only** real partner client/resource ids.
- [ ] `FEDERATED_EMAIL_LINKING` is on only if you trust every listed issuer's email claims.
- [ ] Every federated user has an **admin-created** membership (no self-join).
- [ ] Partner tokens are short-lived; signature, issuer, expiry and audience are all verified.
- [ ] (3B) DMS is on a private network reachable only by the gateway.

## Where this is implemented

| Concern | File |
|---|---|
| Multi-issuer token verification | `src/config/keycloak.ts` |
| Trusted issuers / clients config | `src/config/settings.ts`, `.env.example` |
| Email-based membership linking | `src/middleware/authorization.ts`, `MysqlTenantMembershipRepository.findByEmailAndTenant` |
| Authoritative role resolution | `src/service/roleResolver.ts` |
| Owner auto-provisioning | `src/service/tenantService.ts` (`provisionOwnerMemberships`) |
| Gateway (headers) mode | `AUTH_MODE=headers` + `docs/ROLES_AND_ACCESS.md` |
