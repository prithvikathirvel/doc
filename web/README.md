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

The API resolves identity from request headers (`x-tenant-id`, `x-user-id`, `x-user-name`,
`x-roles`) and, when token authentication is enabled, from an `idtoken` / `Authorization`
bearer token.

- **Administrator** — sign in with an administrator ID; the session is verified against
  `GET /api/tenants` before it is stored.
- **Tenant workspace** — sign in with the workspace URL (slug or tenant ID) and an email
  or user ID. `POST /api/workspaces/resolve` validates the workspace and returns the roles:
  the registered owner email signs in as `tenant_admin`, everyone else as `member`.

Sessions are stored in `localStorage` only and are cleared on sign out.

## Storage configuration

The storage step shows only the fields the selected provider uses. The full reference with sample
values lives in [`docs/STORAGE_CONFIGURATION.md`](../docs/STORAGE_CONFIGURATION.md).

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
