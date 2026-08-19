# DMS Web UI

Minimal Next.js 15 frontend for the vendor-agnostic Document Management System.

## Features

- **Session identity** — tenant / user / roles (header-based local auth)
- **Overview** — tenant snapshot, storage status, recent documents
- **Documents** — list, search, upload (direct + signed URL), rename, download, share, trash
- **Document detail** — versions, permissions, metadata, restore / permanent delete
- **Folders** — nested browse, create, rename, delete
- **Trash** — restore or permanently erase
- **Tenants (admin)** — create tenants, attach S3 / MinIO / GCS / Azure (env-var refs)
- **Health** — API health + metrics
- **Settings** — edit session headers

## Stack

- Next.js 15 (App Router)
- Tailwind CSS 4
- Lucide icons, Sonner toasts
- Proxies `/api/*` → Express DMS (`DMS_API_URL`)

## Run

```bash
# Terminal 1 — API (repo root)
cp .env.example .env   # set PORT=3001, AUTH_DISABLED=true, MySQL, MinIO refs
docker compose up -d
mysql … < sql/schema.sql && mysql … < sql/seed.sql
npm install && npm run serve:express-dev

# Terminal 2 — UI
cd web
cp .env.example .env.local   # DMS_API_URL=http://127.0.0.1:3001
npm install
npm run dev
```

Open http://localhost:3000 — use the Alice demo preset (tenant `11111111-…`).

## Theme

Soft slate canvas (`#f8fafc`), indigo accent (`#4f46e5`), white cards, 13px body, low-contrast borders — see the design system in the product brief.
