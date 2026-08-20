"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { tenantsApi } from "@/lib/api";
import type { TenantUser } from "@/lib/types";
import { formatBytes, formatNumber, formatRelative, initials } from "@/lib/utils";

/** People active inside a tenant. Entry point of the user → documents → versions drill-down. */
export function UsersView({ tenantId, basePath }: { tenantId: string; basePath: string }) {
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

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people"
            leftIcon={<Search className="h-4 w-4" />}
            aria-label="Search workspace users"
          />
        </div>
        <Button variant="secondary" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      </div>

      <Card padded={false}>
        {loading ? (
          <LoadingBlock label="Loading workspace users" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-4 w-4" />}
            title={users.length === 0 ? "No activity yet" : "No matching people"}
            description={
              users.length === 0
                ? "People appear here once they upload a document or receive access to one."
                : "Try a different search term."
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {filtered.map((user) => (
              <li key={user.userId}>
                <Link
                  href={`${basePath}/users/${encodeURIComponent(user.userId)}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[12px] font-semibold text-[var(--text-secondary)]">
                    {initials(user.userId)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13.5px] font-medium text-[var(--text)]">{user.userId}</p>
                      {user.isOwner && (
                        <Badge tone="accent">
                          <ShieldCheck className="h-3 w-3" /> Workspace owner
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                      {formatNumber(user.activeDocuments)} documents · {formatNumber(user.versions)} versions
                      {user.sharedWithThem > 0
                        ? ` · ${formatNumber(user.sharedWithThem)} shared with them`
                        : ""}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                      Last activity {formatRelative(user.lastActivityAt)}
                    </p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    <Badge tone="neutral">{formatBytes(user.bytes)}</Badge>
                    {user.trashedDocuments > 0 && (
                      <Badge tone="neutral">{formatNumber(user.trashedDocuments)} in trash</Badge>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
