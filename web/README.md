# DMS Web

Next.js 15 front end for the Document Management System.

## Areas

| Area | Route | Who |
|---|---|---|
| Sign-in | `/login` | Everyone (email + password; the session decides where you land) |
| Administrator sign-in | `/admin/login` | Same credentials; only DMS-directory platform administrators reach the console |
| Self-signup | `/signup` | Anyone creating an account (workspace assigned later by an administrator) |
| Workspace picker | `/select-workspace` | Accounts with several workspaces |
| Pending workspace | `/pending` | Accounts without a workspace yet |
| Tenant onboarding and directory | `/admin` | Platform administrator |
| API keys for machine clients | `/admin/api-keys` | Platform administrator |
| Tenant overview, analytics and handover details | `/admin/tenants/{id}` | Platform administrator |
| Tenant documents, folders, trash, settings | `/admin/tenants/{id}/…` | Platform administrator |
| System health and metrics | `/admin/system` | Platform administrator |
| Tenant workspace | `/workspace/…` | Tenant users |
| Files: folders and documents in one browser | `/workspace/documents`, `/admin/tenants/{id}/documents` | Everyone with access |
| People in a tenant → their documents → versions | `/admin/tenants/{id}/users`, `/workspace/users` | Administrators |

A platform administrator always lands on tenant onboarding. A tenant user only ever
sees their own workspace: overview with analytics, documents, folders, trash and settings.

## Sign-in model

Credentials are verified by Keycloak through the central User Service; what an
account may do is decided by the DMS directory, never by the browser.

- `POST /api/auth/login` exchanges email + password for an httpOnly cookie session
  (`dms_at` / `dms_rt`). Tokens never reach JavaScript and cannot be attached to a
  cross-site request (SameSite=Lax + the `x-dms-client` marker on mutations).
- The session response says whether the account is a platform administrator and lists
  its workspaces; the UI redirects accordingly (console, workspace, picker, or the
  pending screen). Access tokens are refreshed by the API on 401 `TOKEN_EXPIRED`.
- Roles come from the DMS database (`tenant_members`); the token only proves identity.
- Machine clients use `x-api-key` keys (see `/admin/api-keys`) instead of cookies.

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
