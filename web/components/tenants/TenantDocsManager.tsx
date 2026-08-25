"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { CopyButton } from "@/components/ui/Copy";
import { Badge } from "@/components/ui/Badge";
import { docsApi, ApiError } from "@/lib/api";
import { BASE_PATH } from "@/lib/basePath";
import { useSession } from "@/contexts/SessionContext";
import { cn } from "@/lib/utils";
import type { DocCategory, DocOperationSummary, TenantDocConfig } from "@/lib/types";

const CATEGORY_ORDER: DocCategory[] = ["Documents", "Folders", "Sharing"];

const METHOD_TONE: Record<string, string> = {
  GET: "text-[var(--success)]",
  POST: "text-[var(--accent-hover)]",
  PUT: "text-[#5b3fbf]",
  PATCH: "text-[var(--warning)]",
  DELETE: "text-[var(--danger)]",
};

function groupCatalog(catalog: DocOperationSummary[]) {
  return CATEGORY_ORDER.filter((category) => catalog.some((item) => item.category === category)).map(
    (category) => ({
      category,
      items: catalog.filter((item) => item.category === category),
    })
  );
}

export function TenantDocsManager({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { isPlatformAdmin } = useSession();
  const canEdit = isPlatformAdmin;

  const [catalog, setCatalog] = useState<DocOperationSummary[]>([]);
  const [config, setConfig] = useState<TenantDocConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(tenantName ? `${tenantName} API` : "API documentation");
  const [intro, setIntro] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    docsApi
      .getConfig(tenantId)
      .then(({ config: saved, catalog: cat }) => {
        if (cancelled) return;
        setCatalog(cat);
        if (saved) {
          setConfig(saved);
          setTitle(saved.title);
          setIntro(saved.intro || "");
          setApiBaseUrl(saved.apiBaseUrl || "");
          setSelected(new Set(saved.selectedOperations));
        }
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load documentation settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const grouped = useMemo(() => groupCatalog(catalog), [catalog]);

  const orderedSelection = useMemo(
    () => catalog.filter((item) => selected.has(item.id)).map((item) => item.id),
    [catalog, selected]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const shareLink = useMemo(() => {
    if (typeof window === "undefined" || !config) return "";
    return `${window.location.origin}${BASE_PATH}/docs/${config.shareToken}`;
  }, [config]);

  const save = async () => {
    setSaving(true);
    try {
      const { config: saved } = await docsApi.saveConfig(tenantId, {
        title,
        intro: intro || null,
        apiBaseUrl: apiBaseUrl || null,
        selectedOperations: orderedSelection,
        status: "active",
      });
      setConfig(saved);
      toast.success("Documentation saved", {
        description: "The share link is ready below.",
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to save documentation");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!config) return;
    const next = config.status === "active" ? "disabled" : "active";
    try {
      const { config: saved } = await docsApi.updateConfig(tenantId, { status: next });
      setConfig(saved);
      toast.success(next === "active" ? "Documentation enabled" : "Documentation disabled");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to change status");
    }
  };

  const regenerate = async () => {
    if (!config) return;
    try {
      const { config: saved } = await docsApi.updateConfig(tenantId, { regenerateToken: true });
      setConfig(saved);
      toast.success("Share link regenerated", { description: "The previous link no longer works." });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to regenerate the link");
    }
  };

  if (loading) {
    return <p className="text-[13px] text-[var(--text-secondary)]">Loading documentation settings…</p>;
  }

  return (
    <div className="space-y-5">
      {!canEdit && (
        <p className="rounded-lg border border-[var(--warning-soft)] bg-[var(--warning-soft)] px-3 py-2 text-[12.5px] text-[var(--warning)]">
          Only platform administrators can generate or edit documentation. You are viewing the current configuration.
        </p>
      )}

      {/* Share link */}
      <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text)]">Share link</h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">
              Anyone with this link can read the documentation — it contains no secrets.
            </p>
          </div>
          {config && (
            <Badge tone={config.status === "active" ? "success" : "neutral"}>
              {config.status === "active" ? "Active" : "Disabled"}
            </Badge>
          )}
        </div>

        {config ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text)]" title={shareLink}>
                {shareLink}
              </span>
              <CopyButton value={shareLink} label="Copy link" />
              <a href={shareLink} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
                  <span className="hidden sm:inline">Open</span>
                </Button>
              </a>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={regenerate}>
                  Regenerate link
                </Button>
                <Button variant="ghost" size="sm" onClick={toggleStatus}>
                  {config.status === "active" ? "Disable" : "Enable"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[12.5px] text-[var(--text-muted)]">
            No documentation generated yet. Choose the operations below and save to create the link.
          </p>
        )}
      </section>

      {/* Details */}
      <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h3 className="text-[14px] font-semibold text-[var(--text)]">Details</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            placeholder={`${tenantName || "Tenant"} API`}
          />
          <Input
            label="API base URL (optional)"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            disabled={!canEdit}
            placeholder="https://dms.example.com/dms"
            hint="Shown in examples. Leave blank to keep a dummy placeholder."
            mono
          />
        </div>
        <div className="mt-3">
          <Textarea
            label="Introduction (optional)"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            disabled={!canEdit}
            placeholder="A short description shown at the top of the documentation page."
            className="min-h-[72px]"
          />
        </div>
      </section>

      {/* Operation selection */}
      <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text)]">Operations to include</h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">
              {selected.size} of {catalog.length} selected
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(catalog.map((i) => i.id)))}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-5">
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {category}
              </p>
              <div className="grid gap-1.5">
                {items.map((item) => {
                  const checked = selected.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        checked
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] bg-white hover:bg-[var(--surface-muted)]",
                        !canEdit && "cursor-default opacity-80"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit}
                        onChange={() => toggle(item.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "font-mono text-[11px] font-bold uppercase",
                              METHOD_TONE[item.method] || "text-[var(--text-secondary)]"
                            )}
                          >
                            {item.method}
                          </span>
                          <code className="break-all font-mono text-[12px] text-[var(--text)]">{item.path}</code>
                        </span>
                        <span className="mt-0.5 block text-[13px] font-medium text-[var(--text)]">{item.title}</span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--text-secondary)]">
                          {item.summary}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} loading={saving} disabled={selected.size === 0}>
            {config ? "Save changes" : "Generate documentation"}
          </Button>
        </div>
      )}
    </div>
  );
}
