"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/Feedback";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { tenantsApi } from "@/lib/api";
import type { TenantUser } from "@/lib/types";
import { formatBytes, formatNumber, formatRelative, initials } from "@/lib/utils";

/** People active inside a tenant. Entry point of the user → documents → versions drill-down. */
export function UsersView({ tenantId, basePath }: { tenantId: string; basePath: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await tenantsApi.users(tenantId);
      setUsers(result.users || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load workspace users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => user.userId.toLowerCase().includes(term));
  }, [users, search]);

  const columns: Array<Column<TenantUser>> = [
    {
      key: "user",
      header: "Person",
      sortValue: (user) => user.userId,
      cell: (user) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[11.5px] font-semibold text-[var(--text-secondary)]">
            {initials(user.userId)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-[var(--text)]">{user.userId}</span>
            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
              Last activity {formatRelative(user.lastActivityAt)}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (user) => (user.isOwner ? 0 : 1),
      cell: (user) =>
        user.isOwner ? (
          <Badge tone="accent">
            <ShieldCheck className="h-3 w-3" /> Owner
          </Badge>
        ) : (
          <Badge tone="neutral">Member</Badge>
        ),
    },
    {
      key: "documents",
      header: "Documents",
      align: "right",
      sortValue: (user) => user.activeDocuments,
      cell: (user) => <span className="text-[12.5px]">{formatNumber(user.activeDocuments)}</span>,
    },
    {
      key: "versions",
      header: "Versions",
      align: "right",
      hideBelow: "md",
      sortValue: (user) => user.versions,
      cell: (user) => (
        <span className="text-[12.5px] text-[var(--text-secondary)]">{formatNumber(user.versions)}</span>
      ),
    },
    {
      key: "shared",
      header: "Shared with them",
      align: "right",
      hideBelow: "lg",
      sortValue: (user) => user.sharedWithThem,
      cell: (user) => (
        <span className="text-[12.5px] text-[var(--text-secondary)]">
          {formatNumber(user.sharedWithThem)}
        </span>
      ),
    },
    {
      key: "bytes",
      header: "Storage",
      align: "right",
      hideBelow: "md",
      sortValue: (user) => user.bytes,
      cell: (user) => <span className="text-[12.5px]">{formatBytes(user.bytes)}</span>,
    },
    {
      key: "open",
      header: "",
      align: "right",
      width: "48px",
      cell: () => <ChevronRight className="ml-auto h-4 w-4 text-[var(--text-muted)]" />,
    },
  ];

  return (
    <div className="animate-rise">
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(user) => user.userId}
        onRowClick={(user) => router.push(`${basePath}/users/${encodeURIComponent(user.userId)}`)}
        defaultSort={{ key: "documents", direction: "desc" }}
        loading={loading}
        loadingLabel="Loading workspace users"
        caption="People active in this tenant"
        toolbar={
          <>
            <div className="w-full sm:max-w-xs">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search people"
                leftIcon={<Search className="h-4 w-4" />}
                aria-label="Search workspace users"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>
          </>
        }
        empty={
          <EmptyState
            icon={<Users className="h-4 w-4" />}
            title={users.length === 0 ? "No activity yet" : "No matching people"}
            description={
              users.length === 0
                ? "People appear here once they upload a document or receive access to one."
                : "Try a different search term."
            }
          />
        }
      />
    </div>
  );
}
