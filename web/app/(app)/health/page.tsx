"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Database, RefreshCw, Server } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { InlineLoader } from "@/components/ui/Loader";
import { healthApi } from "@/lib/api";
import type { HealthResponse, MetricsSnapshot } from "@/lib/types";

export default function HealthPage() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, m] = await Promise.all([healthApi.get(), healthApi.metrics()]);
      setHealth(h);
      setMetrics(m);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Health check failed";
      setError(msg);
      setHealth(null);
      setMetrics(null);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title="Health" subtitle="API, database, and registered storage providers">
      <div className="mx-auto max-w-4xl space-y-4 animate-fade-up">
        <div className="flex justify-end">
          <Button
            variant="outlined"
            size="sm"
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>

        {loading && !health ? (
          <InlineLoader label="Checking API…" />
        ) : error ? (
          <Card className="border-red-100 bg-red-50/40 p-6">
            <p className="text-sm font-semibold text-red-700">API unreachable</p>
            <p className="mt-1 text-[13px] text-red-600/90">{error}</p>
            <p className="mt-3 text-[12px] text-slate-600">
              Start the Express backend on the port configured in <code className="font-mono">DMS_API_URL</code>{" "}
              (default <code className="font-mono">3001</code>), then refresh.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <Activity className="h-4 w-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Status</span>
                </div>
                <p className="mt-2 text-xl font-bold capitalize text-slate-900">{health?.status}</p>
                <Badge tone={health?.status === "ok" ? "emerald" : "amber"} className="mt-2">
                  {health?.status === "ok" ? "Healthy" : "Degraded"}
                </Badge>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <Database className="h-4 w-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Database</span>
                </div>
                <p className="mt-2 text-xl font-bold capitalize text-slate-900">{health?.database}</p>
                <Badge tone={health?.database === "up" ? "emerald" : "red"} className="mt-2">
                  {health?.database === "up" ? "Connected" : "Down"}
                </Badge>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <Server className="h-4 w-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Providers</span>
                </div>
                <p className="mt-2 text-xl font-bold text-slate-900">{health?.providers?.length ?? 0}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(health?.providers || []).map((p) => (
                    <Badge key={p} tone="indigo">
                      {p}
                    </Badge>
                  ))}
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader title="Metrics snapshot" description="In-process counters from the API" />
              <pre className="max-h-96 overflow-auto rounded-lg border border-slate-100 bg-slate-50/80 p-3 font-mono text-[12px] leading-relaxed text-slate-700">
                {JSON.stringify(metrics, null, 2)}
              </pre>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
