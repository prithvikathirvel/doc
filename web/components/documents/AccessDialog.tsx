"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/Dialog";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, RadioCard } from "@/components/ui/Input";
import { Badge, LevelBadge } from "@/components/ui/Badge";
import { LoadingBlock, EmptyState } from "@/components/ui/Feedback";
import { documentsApi } from "@/lib/api";
import type { Document, DocumentAccess, DocumentPermission, PermissionLevel, PrincipalType } from "@/lib/types";
import { PERMISSION_LEVELS, accessSourceLabel, cn, formatDate } from "@/lib/utils";

/**
 * Access management for a single document.
 *
 * Access is granted as one named level so it is always clear what a principal can do.
 * The owner of the document keeps full control and cannot be locked out.
 */
export function AccessDialog({
  open,
  onClose,
  tenantId,
  document,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  document: Document | null;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grants, setGrants] = useState<DocumentPermission[]>([]);
  const [access, setAccess] = useState<DocumentAccess | null>(null);
  const [principalType, setPrincipalType] = useState<PrincipalType>("user");
  const [principalId, setPrincipalId] = useState("");
  const [level, setLevel] = useState<PermissionLevel>("viewer");
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!document) return;
    setLoading(true);
    try {
      const result = await documentsApi.listPermissions(tenantId, document.id);
      setGrants(result.permissions || []);
      setAccess(result.access);
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "Unable to load access");
      setGrants([]);
    } finally {
      setLoading(false);
    }
  }, [document, tenantId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const submit = async () => {
    if (!document) return;
    const identifier = principalId.trim();
    if (!identifier) {
      setError(principalType === "user" ? "Enter a user ID or email" : "Enter a role name");
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await documentsApi.grantAccess(tenantId, document.id, {
        principalType,
        principalId: identifier,
        level,
      });
      toast.success(`Access granted to ${identifier}`);
      setPrincipalId("");
      setLevel("viewer");
      await load();
    } catch (grantError) {
      const message = grantError instanceof Error ? grantError.message : "Could not grant access";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (grant: DocumentPermission) => {
    if (!document) return;
    try {
      await documentsApi.revokeAccess(tenantId, document.id, grant.id);
      toast.success(`Access removed for ${grant.principalId}`);
      await load();
    } catch (revokeError) {
      toast.error(revokeError instanceof Error ? revokeError.message : "Could not revoke access");
    }
  };

  const canManage = access?.canAdmin ?? false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Manage access"
      description={document ? `Who can work with “${document.name}”` : undefined}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      {loading ? (
        <LoadingBlock label="Loading access" />
      ) : (
        <div className="space-y-5">
          {access && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                Your access: <span className="font-medium text-[var(--text)]">{accessSourceLabel(access.source)}</span>
                {" · "}
                {access.canAdmin
                  ? "you can grant and revoke access for others."
                  : "you cannot change sharing for this document."}
              </p>
            </div>
          )}

          {canManage && (
            <section className="rounded-xl border border-[var(--border)] p-4">
              <h3 className="text-[13px] font-semibold text-[var(--text)]">Grant access</h3>
              <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                Granting the same principal again updates their level.
              </p>

              <div className="mt-3.5 grid gap-3 sm:grid-cols-[160px_1fr]">
                <div className="grid grid-cols-2 gap-1 self-start rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1 sm:h-10">
                  {(
                    [
                      { id: "user", label: "User", icon: UserRound },
                      { id: "role", label: "Role", icon: Users },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setPrincipalType(option.id)}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors",
                        principalType === option.id
                          ? "bg-white text-[var(--text)] shadow-[var(--shadow-xs)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                      )}
                    >
                      <option.icon className="h-3.5 w-3.5" />
                      {option.label}
                    </button>
                  ))}
                </div>
                <Input
                  value={principalId}
                  onChange={(event) => setPrincipalId(event.target.value)}
                  placeholder={principalType === "user" ? "user@acme.com" : "auditor"}
                  error={error}
                  aria-label={principalType === "user" ? "User ID or email" : "Role name"}
                />
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {PERMISSION_LEVELS.map((option) => (
                  <RadioCard
                    key={option.level}
                    selected={level === option.level}
                    onSelect={() => setLevel(option.level)}
                    title={option.label}
                    description={option.description}
                    meta={
                      <span className="mt-1.5 block text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                        {option.abilities.join(" · ")}
                      </span>
                    }
                  />
                ))}
              </div>

              <div className="mt-3.5 flex justify-end">
                <Button size="sm" loading={saving} onClick={() => void submit()}>
                  Grant access
                </Button>
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-[var(--text)]">
              People and roles with access
            </h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              {grants.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="No grants yet"
                  description="Only the document owner and tenant administrators can open this document."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {grants.map((grant) => (
                    <li key={grant.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
                        {grant.principalType === "user" ? (
                          <UserRound className="h-3.5 w-3.5" />
                        ) : (
                          <Users className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[var(--text)]">
                          {grant.principalId}
                        </p>
                        <p className="truncate text-[11.5px] text-[var(--text-muted)]">
                          {grant.principalType === "user" ? "User" : "Role"} · added{" "}
                          {formatDate(grant.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {grant.isDocumentCreator && <Badge tone="neutral">Document owner</Badge>}
                        <LevelBadge level={grant.level} />
                        {canManage && !grant.isDocumentCreator && (
                          <IconButton
                            label={`Revoke access for ${grant.principalId}`}
                            tone="danger"
                            onClick={() => void revoke(grant)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              Tenant administrators always have full access. Role grants apply to every user who signs in
              with that role.
            </p>
          </section>
        </div>
      )}
    </Dialog>
  );
}
