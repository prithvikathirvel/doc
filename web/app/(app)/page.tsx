"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  FileText,
  FolderOpen,
  HardDrive,
  Upload,
  Building2,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { InlineLoader } from "@/components/ui/Loader";
import { useSession } from "@/contexts/SessionContext";
import { documentsApi, foldersApi, healthApi } from "@/lib/api";
import type { Document, Folder, HealthResponse } from "@/lib/types";
import { formatBytes, formatRelative, providerLabel } from "@/lib/utils";

export default function OverviewPage() {
  const { tenant, storage, isAdmin, session } = useSession();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [docRes, folderRes, trashRes, healthRes] = await Promise.allSettled([
          documentsApi.list({ limit: 8, offset: 0 }),
          foldersApi.list(null),
          documentsApi.list({ includeDeleted: true, limit: 100 }),
          healthApi.get(),
        ]);
        if (cancelled) return;
        if (docRes.status === "fulfilled") {
          const list = docRes.value.documents || [];
          setDocs(list.filter((d) => d.status !== "soft_deleted").slice(0, 8));
        }
        if (folderRes.status === "fulfilled") setFolders(folderRes.value.folders || []);
        if (trashRes.status === "fulfilled") {
          const list = trashRes.value.documents || [];
          setTrashCount(list.filter((d) => d.status === "soft_deleted").length);
        }
        if (healthRes.status === "fulfilled") setHealth(healthRes.value);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, session.userId]);

  const stats = [
    {
      label: "Documents",
      value: loading ? "—" : String(docs.length >= 8 ? "8+" : docs.length),
      icon: FileText,
      href: "/documents",
      tone: "indigo",
    },
    {
      label: "Root folders",
      value: loading ? "—" : String(folders.length),
      icon: FolderOpen,
      href: "/folders",
      tone: "violet",
    },
    {
      label: "In trash",
      value: loading ? "—" : String(trashCount),
      icon: Trash2,
      href: "/trash",
      tone: "slate",
    },
    {
      label: "API health",
      value: health?.status || "—",
      icon: Activity,
      href: "/health",
      tone: health?.status === "ok" ? "emerald" : "amber",
    },
  ] as const;

  return (
    <AppShell title="Overview" subtitle="Workspace snapshot for the current tenant">
      <div className="mx-auto max-w-6xl space-y-5 animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Welcome back
            </p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">
              {session.userName || session.userId}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/documents">
              <Button leftIcon={<Upload className="h-3.5 w-3.5" />}>Upload document</Button>
            </Link>
            <Link href="/folders">
              <Button variant="outlined" leftIcon={<FolderOpen className="h-3.5 w-3.5" />}>
                New folder
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.label} href={s.href}>
                <Card className="p-4 transition-all hover:border-slate-300 hover:shadow-xs">
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                        s.tone === "indigo"
                          ? "border-indigo-100 bg-indigo-50 text-indigo-600"
                          : s.tone === "violet"
                            ? "border-violet-100 bg-violet-50 text-violet-600"
                            : s.tone === "emerald"
                              ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                              : s.tone === "amber"
                                ? "border-amber-100 bg-amber-50 text-amber-600"
                                : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 capitalize">
                    {s.value}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3" padding={false}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardHeader
                className="mb-0"
                title="Recent documents"
                description="Latest files in this tenant"
                action={
                  <Link href="/documents">
                    <Button variant="text" size="sm">
                      View all
                    </Button>
                  </Link>
                }
              />
            </div>
            {loading ? (
              <InlineLoader />
            ) : docs.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm font-medium text-slate-400">
                No documents yet. Upload your first file.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/documents/${d.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/70"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-slate-800">{d.name}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {d.originalFilename} · {formatBytes(d.size)} · {formatRelative(d.updatedAt)}
                        </p>
                      </div>
                      <StatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader title="Tenant" description="Current identity context" />
              <dl className="space-y-2.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Name</dt>
                  <dd className="font-medium text-slate-800">{tenant?.name || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Slug</dt>
                  <dd className="font-mono text-[12px] text-slate-700">{tenant?.slug || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Status</dt>
                  <dd>{tenant ? <StatusBadge status={tenant.status} /> : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Max file</dt>
                  <dd className="text-slate-700">
                    {tenant ? formatBytes(tenant.maxFileSizeBytes) : "—"}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card>
              <CardHeader
                title="Storage"
                description="Provider attached to this tenant"
                action={
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600">
                    <HardDrive className="h-3.5 w-3.5" />
                  </div>
                }
              />
              {storage ? (
                <dl className="space-y-2.5 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Provider</dt>
                    <dd>
                      <Badge tone="indigo">{providerLabel(storage.provider)}</Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Container</dt>
                    <dd className="font-mono text-[12px] text-slate-700">{storage.container}</dd>
                  </div>
                  {storage.region && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Region</dt>
                      <dd className="text-slate-700">{storage.region}</dd>
                    </div>
                  )}
                  {storage.basePrefix && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Prefix</dt>
                      <dd className="font-mono text-[12px] text-slate-700">{storage.basePrefix}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-3 py-3">
                  <p className="text-[12.5px] font-medium text-amber-800">No storage configured</p>
                  <p className="mt-0.5 text-[11.5px] text-amber-700/80">
                    Assign S3, MinIO, GCS, or Azure before uploading.
                  </p>
                  {isAdmin && (
                    <Link href="/tenants" className="mt-2 inline-block">
                      <Button size="sm" variant="outlined">
                        Configure storage
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </Card>

            {isAdmin && (
              <Link href="/tenants">
                <Card className="flex items-center gap-3 p-4 transition-all hover:border-slate-300 hover:shadow-xs">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-800">Manage tenants</p>
                    <p className="text-[11.5px] text-slate-500">Create tenants and attach storage</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </Card>
              </Link>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
