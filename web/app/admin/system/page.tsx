"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Database, HardDrive, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingBlock } from "@/components/ui/Feedback";
import { StatCard } from "@/components/ui/Analytics";
import { platformApi } from "@/lib/api";
import type { HealthResponse, MetricsSnapshot } from "@/lib/types";
import { providerLabel } from "@/lib/utils";

function flatten(snapshot: MetricsSnapshot, prefix = ""): Array<{ key: string; value: string }> {
  return Object.entries(snapshot).flatMap(([key, value]) => {
    const label = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flatten(value as MetricsSnapshot, label);
    }
    return [{ key: label, value: Array.isArray(value) ? value.join(", ") : String(value) }];
  });
}

export default function SystemHealthPage() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healthResult, metricsResult] = await Promise.allSettled([
        platformApi.health(),
        platformApi.metrics(),
      ]);
      setHealth(healthResult.status === "fulfilled" ? healthResult.value : null);
      setMetrics(metricsResult.status === "fulfilled" ? metricsResult.value : null);
      if (healthResult.status === "rejected") toast.error("The API health endpoint is unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = metrics ? flatten(metrics) : [];

  return (
    <AdminShell
      title="System health"
      subtitle="API, database and storage provider status"
      actions={
        <Button variant="secondary" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      }
    >
      {loading && !health ? (
        <LoadingBlock label="Checking services" />
      ) : (
        <div className="space-y-4 animate-rise">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="API status"
              value={health?.status === "ok" ? "Operational" : health?.status || "Unreachable"}
              icon={<Activity className="h-4 w-4" />}
              hint={health ? undefined : "No response from the API"}
            />
            <StatCard
              label="Database"
              value={health?.database === "up" ? "Connected" : "Unavailable"}
              icon={<Database className="h-4 w-4" />}
            />
            <StatCard
              label="Storage adapters"
              value={String(health?.providers?.length ?? 0)}
              icon={<HardDrive className="h-4 w-4" />}
              hint="Registered providers"
            />
          </div>

          <Card>
            <CardHeader title="Registered storage providers" />
            <div className="flex flex-wrap gap-2">
              {(health?.providers || []).map((provider) => (
                <Badge key={provider} tone="accent">
                  {providerLabel(provider)}
                </Badge>
              ))}
              {(health?.providers || []).length === 0 && (
                <p className="text-[12.5px] text-[var(--text-muted)]">No providers registered.</p>
              )}
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader title="Runtime metrics" description="In-process counters since the last restart" className="mb-0" />
            </div>
            {rows.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-[var(--text-muted)]">No metrics reported.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left">
                  <tbody className="divide-y divide-[var(--border)]">
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--text-secondary)] sm:px-5">
                          {row.key}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12.5px] font-medium text-[var(--text)] sm:px-5">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
