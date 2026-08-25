"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/Copy";
import { folderMapsApi, ApiError } from "@/lib/api";
import { BASE_PATH } from "@/lib/basePath";
import { cn } from "@/lib/utils";
import type { FolderMap } from "@/lib/types";

interface DraftMap {
  key: string;
  pathTemplate: string;
  description: string;
  status: "active" | "disabled";
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const PLACEHOLDER = /^\{([A-Za-z0-9_-]{1,64})\}$/;
const MAX_DEPTH = 16;

/** Client-side mirror of the server's template rules, for live feedback. */
function templateError(template: string): string | null {
  const raw = template.trim();
  if (!raw) return "Path template is required";
  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "Path template is required";
  if (parts.length > MAX_DEPTH) return `Too deep (max ${MAX_DEPTH} levels)`;
  for (const part of parts) {
    if (part === "." || part === "..") return `Segments cannot be "." or ".."`;
    if (!PLACEHOLDER.test(part) && /[\/\u0000-\u001f]/.test(part)) return "Segments contain invalid characters";
    if (part.length > 255) return "A segment is too long";
  }
  return null;
}

function placeholders(template: string): string[] {
  const names: string[] = [];
  for (const part of template.split("/")) {
    const match = PLACEHOLDER.exec(part.trim());
    if (match && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/** Sample values used by the live preview, so the resolved path feels real. */
function sampleValue(name: string): string {
  if (/^org/i.test(name)) return "org-123";
  if (/^form/i.test(name)) return "form-456";
  if (/year/i.test(name)) return "2026";
  return `${name}-value`;
}

function resolvedPreview(template: string): string {
  return template
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = PLACEHOLDER.exec(part);
      return match ? sampleValue(match[1]) : part;
    })
    .join("/");
}

function TemplateText({ template }: { template: string }) {
  return (
    <span className="font-mono text-[12.5px]">
      {template.split("/").map((part, index) => {
        const isPlaceholder = PLACEHOLDER.test(part.trim());
        return (
          <span key={`${part}-${index}`}>
            {index > 0 && <span className="text-[var(--text-muted)]">/</span>}
            <span className={cn(isPlaceholder ? "text-[var(--accent)] dark:text-indigo-300" : "text-[var(--text)] dark:text-slate-200")}>
              {part}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function curlSnippet(map: FolderMap | DraftMap): string {
  const vars = placeholders(map.pathTemplate);
  const varJson = vars.length
    ? `,\n       "folderVars": {${vars.map((v) => `"${v}": "${sampleValue(v)}"`).join(", ")}}`
    : "";
  const base = typeof window !== "undefined" ? `${window.location.origin}${BASE_PATH}` : "https://<host>/dms";
  return `curl -X POST ${base}/api/documents \\
  -H "x-api-key: <your-secret>" \\
  -H "content-type: application/json" \\
  -d '{"filename": "file.pdf",
       "folderMap": "${map.key}"${varJson}}'`;
}

export function FolderMapsManager({ tenantId, canEdit }: { tenantId: string; canEdit: boolean }) {
  const [maps, setMaps] = useState<FolderMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DraftMap | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    folderMapsApi
      .list(tenantId)
      .then(({ maps }) => {
        if (!cancelled) setMaps(maps);
      })
      .catch(() => {
        /* folder maps are optional — fail silently */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const draftIssues = useMemo(() => {
    if (!draft) return null;
    if (!KEY_PATTERN.test(draft.key.trim())) {
      return "Keys may only contain lowercase letters, numbers, \"-\" and \"_\" (e.g. \"submissions\").";
    }
    if (maps.some((map) => map.key === draft.key.trim()) && !draft.key.trim()) return null;
    return templateError(draft.pathTemplate);
  }, [draft, maps]);

  const startAdd = () => {
    setDraft({ key: "", pathTemplate: "", description: "", status: "active" });
    setDraftError(null);
  };

  const startEdit = (map: FolderMap) => {
    setDraft({ key: map.key, pathTemplate: map.pathTemplate, description: map.description || "", status: map.status });
    setDraftError(null);
  };

  const remove = (key: string) => {
    setMaps((prev) => prev.filter((map) => map.key !== key));
  };

  const commitDraft = () => {
    if (!draft) return;
    if (!KEY_PATTERN.test(draft.key.trim())) {
      setDraftError("Keys may only contain lowercase letters, numbers, \"-\" and \"_\".");
      return;
    }
    const templateProblem = templateError(draft.pathTemplate);
    if (templateProblem) {
      setDraftError(templateProblem);
      return;
    }
    const entry: FolderMap = {
      key: draft.key.trim(),
      pathTemplate: draft.pathTemplate.trim(),
      description: draft.description.trim() || null,
      status: draft.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMaps((prev) => [...prev.filter((map) => map.key !== entry.key), entry].sort((a, b) => a.key.localeCompare(b.key)));
    setDraft(null);
    setDraftError(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { maps: saved } = await folderMapsApi.save(
        tenantId,
        maps.map((map) => ({
          key: map.key,
          pathTemplate: map.pathTemplate,
          description: map.description,
          status: map.status,
        }))
      );
      setMaps(saved);
      toast.success("Folder maps saved", {
        description: "Your applications can now file documents with folderMap.",
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to save folder maps");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-[13px] text-[var(--text-secondary)]">Loading folder maps…</p>;
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)] dark:border-white/10 dark:bg-[#0f1726] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)] dark:text-slate-100">
            <FolderTree className="h-4 w-4 text-[var(--accent)] dark:text-indigo-400" />
            Folder maps
          </h3>
          <p className="mt-0.5 max-w-lg text-[12.5px] text-[var(--text-secondary)] dark:text-slate-400">
            Path templates your applications reference instead of folder ids —{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-[11px] dark:bg-white/10">
              submissions/{"{orgId}"}/{"{formId}"}
            </code>
            . Each placeholder becomes exactly one folder level, created automatically on upload.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="secondary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={startAdd}>
            Add map
          </Button>
        )}
      </div>

      {/* Draft editor */}
      {canEdit && draft && (
        <div className="mt-4 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)]/60 p-3.5 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Map key"
              value={draft.key}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              placeholder="submissions"
              mono
              autoFocus
            />
            <Input
              label="Path template"
              value={draft.pathTemplate}
              onChange={(e) => setDraft({ ...draft, pathTemplate: e.target.value })}
              placeholder="submissions/{orgId}/{formId}"
              mono
            />
          </div>
          <div className="mt-3">
            <Input
              label="Description (optional)"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Respondent file uploads"
            />
          </div>
          {draft.pathTemplate.trim() && !templateError(draft.pathTemplate) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] dark:text-slate-500">
                Resolves to
              </span>
              <code className="break-all font-mono text-[12px] text-[var(--text)] dark:text-slate-200">
                /{resolvedPreview(draft.pathTemplate)}
              </code>
              {placeholders(draft.pathTemplate).length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {placeholders(draft.pathTemplate).map((name) => (
                    <span
                      key={name}
                      className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--accent-hover)] dark:bg-indigo-500/20 dark:text-indigo-300"
                    >
                      {name}
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
          {draftError && <p className="mt-2 text-[11.5px] font-medium text-[var(--danger)]">{draftError}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={commitDraft}>
              {maps.some((m) => m.key === draft.key.trim()) ? "Update" : "Add to list"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setDraftError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Map list */}
      {maps.length === 0 && !draft ? (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center text-[12.5px] text-[var(--text-muted)] dark:border-white/10 dark:text-slate-500">
          No folder maps yet.{" "}
          {canEdit
            ? "Add one to let your applications file documents by template."
            : "A workspace administrator has not defined any yet."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {maps.map((map) => (
            <li
              key={map.key}
              className="rounded-lg border border-[var(--border)] bg-white p-3 dark:border-white/10 dark:bg-transparent"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-[var(--text)] dark:bg-white/10 dark:text-slate-200">
                  {map.key}
                </code>
                <Badge tone={map.status === "active" ? "success" : "neutral"}>
                  {map.status === "active" ? "Active" : "Disabled"}
                </Badge>
                <span className="min-w-0 flex-1" />
                {canEdit && (
                  <>
                    <Button size="sm" variant="ghost" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => startEdit(map)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(map.key)}>
                      <span className="text-[var(--danger)]">Remove</span>
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-2 break-all">
                <TemplateText template={map.pathTemplate} />
              </div>
              {map.description && (
                <p className="mt-1 text-[12px] text-[var(--text-muted)] dark:text-slate-500">{map.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--text-muted)] dark:text-slate-500">
                <span>Example:</span>
                <code className="break-all font-mono text-[11px]">/{resolvedPreview(map.pathTemplate)}</code>
                <span className="flex-1" />
                <CopyButton value={curlSnippet(map)} label="Copy upload snippet" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button onClick={save} loading={saving} disabled={!maps.length}>
            Save folder maps
          </Button>
        </div>
      )}
    </section>
  );
}
