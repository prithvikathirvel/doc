# DMS Web

Next.js 15 front end for the Document Management System.

## Areas

| Area | Route | Who |
|---|---|---|
| Tenant sign-in | `/login` | Tenant users (link is `\/login?workspace=<id>`) |
| Administrator sign-in | `/admin/login` | Platform administrators |
| Tenant onboarding and directory | `/admin` | Platform administrator |
| Tenant overview, analytics and handover details | `/admin/tenants/{id}` | Platform administrator |
| Tenant documents, folders, trash, settings | `/admin/tenants/{id}/…` | Platform administrator |
| System health and metrics | `/admin/system` | Platform administrator |
| Tenant workspace | `/workspace/…` | Tenant users |
| Files: folders and documents in one browser | `/workspace/documents`, `/admin/tenants/{id}/documents` | Everyone with access |
| People in a tenant → their documents → versions | `/admin/tenants/{id}/users`, `/workspace/users` | Administrators |

A platform administrator always lands on tenant onboarding. A tenant user only ever
sees their own workspace: overview with analytics, documents, folders, trash and settings.

## Sign-in model

In Keycloak mode the browser calls the configured public User Service endpoint
`POST ${NEXT_PUBLIC_USER_MGT_BASE_URL}/api/user/login` with email, password and
`x-app-id: DMS`. Signup uses the same base URL with
`POST /api/user/`. The UI then calls DMS `GET /api/tenants/mine` with the returned
bearer token to resolve DMS tenant memberships. Multiple memberships are shown
in a tenant picker.

Every DMS request sends `x-app-id: DMS`, `Authorization: Bearer <access token>`
and, for tenant work, `x-tenant-id`. Access tokens are refreshed through the
browser-reachable Keycloak token endpoint when `NEXT_PUBLIC_KEYCLOAK_TOKEN_URL`
is configured; otherwise the DMS refresh proxy is used. The client secret is
server-only. Set `NEXT_PUBLIC_DMS_API_BASE_URL` when the UI host does not proxy
POST requests to the DMS API.

For local compatibility, set `NEXT_PUBLIC_AUTH_MODE=headers` and
`AUTH_MODE=headers`; the old tenant/workspace field and developer headers remain
available only in that explicit mode. Sessions are stored in `localStorage` and
are cleared locally and at Keycloak on sign out.

## Storage configuration

The storage step shows only the fields the selected provider uses. The full reference with sample
values lives in [`docs/STORAGE_CONFIGURATION.md`](../docs/STORAGE_CONFIGURATION.md).

Full role and permission reference: [`docs/ROLES_AND_ACCESS.md`](../docs/ROLES_AND_ACCESS.md).

## Access levels

Document access is granted as a single level, shown the same way in the UI and the API:

| Level | Capabilities |
|---|---|
| Viewer | View and download |
| Contributor | Viewer + rename and upload new versions |
| Manager | Contributor + move to trash |
| Owner | Manager + grant and revoke access |

Tenant administrators always have full access; the document creator keeps owner access
and cannot be locked out.

## Stack

- Next.js 15 (App Router) and React 19
- Tailwind CSS 4 with design tokens in `app/globals.css`
- Lucide icons, Sonner toasts
- `/api/*` is proxied to the Express API (`DMS_API_URL`)

## Run

```bash
cp .env.example .env.local   # DMS_API_URL=http://127.0.0.1:3001
npm install
npm run dev                  # http://localhost:3000
```

## Theme

Neutral canvas (`#f6f7f9`) with white surfaces, a single accent (`#3b5bdb`) reserved for
primary actions and active navigation, 13–14px type, and layouts that collapse from a
fixed sidebar to a slide-over drawer below 1024px.
