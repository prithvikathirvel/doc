"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/Feedback";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ApiError, directoryApi, tenantsApi } from "@/lib/api";
import { useSession } from "@/contexts/SessionContext";
import type { ClaimResult, DirectoryMember, MemberRole, TenantUser } from "@/lib/types";
import { formatBytes, formatNumber, formatRelative, initials } from "@/lib/utils";

function claimedToast(claimed: ClaimResult | null): void {
  if (!claimed) return;
  const total =
    claimed.documents + claimed.folders + claimed.versions + claimed.permissions;
  if (total > 0) {
    toast.success(`Linked ${total} earlier item${total === 1 ? "" : "s"}`, {
      description: `${claimed.documents} documents, ${claimed.folders} folders, ${claimed.versions} versions, ${claimed.permissions} grants were re-pointed to the new account.`,
    });
  }
}

/**
 * Workspace people: the DMS membership directory, merged with document
 * activity. Administrators manage memberships here — add existing accounts,
 * create new ones, change roles, suspend or remove.
 */
export function UsersView({ tenantId, basePath }: { tenantId: string; basePath: string }) {
  const router = useRouter();
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [activity, setActivity] = useState<TenantUser[]>([]);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const canManage = useMemo(() => {
    if (!session) return false;
    if (session.isPlatformAdmin) return true;
    return session.roles.includes("tenant_admin");
  }, [session]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [directory, usage] = await Promise.all([
        directoryApi.listMembers(tenantId),
        tenantsApi.users(tenantId).catch(() => ({ users: [] as TenantUser[] })),
      ]);
      setMembers(directory.members || []);
      setActivity(usage.users || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load workspace people");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activityById = useMemo(() => {
    const map = new Map<string, TenantUser>();
    for (const entry of activity) map.set(entry.userId.toLowerCase(), entry);
    return map;
  }, [activity]);

  // Activity rows that belong to no member: documents uploaded by machine
  // clients under legacy x-user-id values, claimable when that person signs up.
  const unlinked = useMemo(
    () => activity.filter((entry) => !activityById.has(entry.userId) && !members.some((m) => m.user.userId === entry.userId)),
    [activity, activityById, members]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) =>
        member.user.email.toLowerCase().includes(term) ||
        member.user.displayName.toLowerCase().includes(term) ||
        (member.user.username || "").toLowerCase().includes(term)
    );
  }, [members, search]);

  const changeRole = async (member: DirectoryMember, role: MemberRole) => {
    try {
      await directoryApi.updateMember(tenantId, member.user.userId, { role });
      toast.success(`${member.user.displayName} is now ${role === "tenant_admin" ? "an administrator" : "a member"}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the role");
    }
  };

  const toggleStatus = async (member: DirectoryMember) => {
    const status = member.membership.status === "active" ? "disabled" : "active";
    try {
      await directoryApi.updateMember(tenantId, member.user.userId, { status });
      toast.success(status === "active" ? "Membership re-activated" : "Membership suspended");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the membership");
    }
  };

  const removeMember = async (member: DirectoryMember) => {
    if (!window.confirm(`Remove ${member.user.displayName} from this workspace? Their documents stay.`)) return;
    try {
      await directoryApi.removeMember(tenantId, member.user.userId);
      toast.success("Member removed");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the member");
    }
  };

  const columns: Array<Column<DirectoryMember>> = [
    {
      key: "user",
      header: "Person",
      sortValue: (member) => member.user.displayName,
      cell: (member) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[11.5px] font-semibold text-[var(--text-secondary)]">
            {initials(member.user.displayName || member.user.email)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-[var(--text)]">
              {member.user.displayName}
            </span>
            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
              {member.user.email}
              {member.user.lastLoginAt ? ` · last sign-in ${formatRelative(member.user.lastLoginAt)}` : " · never signed in"}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (member) => member.membership.role,
      cell: (member) =>
        member.membership.role === "tenant_admin" ? (
          <Badge tone="accent">
            <ShieldCheck className="h-3 w-3" /> Administrator
          </Badge>
        ) : (
          <Badge tone="neutral">Member</Badge>
        ),
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "md",
      sortValue: (member) => member.membership.status,
      cell: (member) =>
        member.membership.status === "active" ? (
          <Badge tone="success" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="danger" dot>
            Suspended
          </Badge>
        ),
    },
    {
      key: "documents",
      header: "Documents",
      align: "right",
      sortValue: (member) => activityById.get(member.user.userId.toLowerCase())?.activeDocuments ?? 0,
      cell: (member) => {
        const stats = activityById.get(member.user.userId.toLowerCase());
        return <span className="text-[12.5px]">{formatNumber(stats?.activeDocuments ?? 0)}</span>;
      },
    },
    {
      key: "bytes",
      header: "Storage",
      align: "right",
      hideBelow: "md",
      sortValue: (member) => activityById.get(member.user.userId.toLowerCase())?.bytes ?? 0,
      cell: (member) => {
        const stats = activityById.get(member.user.userId.toLowerCase());
        return <span className="text-[12.5px]">{formatBytes(stats?.bytes ?? 0)}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "200px",
      cell: (member) => {
        // Your own membership is deliberately read-only: nobody may change
        // their own role, suspend or remove themselves (the API enforces the
        // same rule server-side).
        if (member.user.userId === session?.userId) {
          return <Badge tone="accent">You</Badge>;
        }
        return canManage ? (
          <div className="flex items-center justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
            <select
              value={member.membership.role}
              onChange={(event) => void changeRole(member, event.target.value as MemberRole)}
              aria-label={`Role of ${member.user.displayName}`}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11.5px] text-[var(--text-secondary)]"
            >
              <option value="member">Member</option>
              <option value="tenant_admin">Administrator</option>
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void toggleStatus(member)}
              title={member.membership.status === "active" ? "Suspend" : "Re-activate"}
            >
              {member.membership.status === "active" ? "Suspend" : "Activate"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void removeMember(member)} title="Remove">
              Remove
            </Button>
          </div>
        ) : (
          <ChevronRight className="ml-auto h-4 w-4 text-[var(--text-muted)]" />
        );
      },
    },
  ];

  return (
    <div className="animate-rise">
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(member) => member.user.userId}
        onRowClick={(member) =>
          router.push(`${basePath}/users/${encodeURIComponent(member.user.userId)}`)
        }
        defaultSort={{ key: "documents", direction: "desc" }}
        loading={loading}
        loadingLabel="Loading workspace people"
        caption="People with access to this workspace"
        toolbar={
          <>
            <div className="w-full sm:max-w-xs">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search people"
                leftIcon={<Search className="h-4 w-4" />}
                aria-label="Search workspace people"
              />
            </div>
            {canManage && (
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  leftIcon={<UserPlus className="h-3.5 w-3.5" />}
                >
                  New account
                </Button>
                <Button
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  leftIcon={<Link2 className="h-3.5 w-3.5" />}
                >
                  Add member
                </Button>
              </div>
            )}
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
            title={members.length === 0 ? "No members yet" : "No matching people"}
            description={
              members.length === 0
                ? canManage
                  ? "Add the accounts that should have access to this workspace."
                  : "Nobody has been added to this workspace yet."
                : "Try a different search term."
            }
          />
        }
      />

      {unlinked.length > 0 && (
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <p className="text-[12.5px] font-medium text-[var(--text)]">
            Unlinked activity ({unlinked.length})
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            Documents were uploaded under {unlinked.length} identifier
            {unlinked.length === 1 ? "" : "s"} that no account has claimed yet
            (for example a machine client&apos;s x-user-id). When that person is
            added to the workspace, the documents are linked automatically.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unlinked.slice(0, 8).map((entry) => (
              <Badge key={entry.userId} tone="neutral">
                {entry.userId} · {entry.documents}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {addOpen && (
        <AddMemberDialog
          tenantId={tenantId}
          onClose={() => setAddOpen(false)}
          onDone={async (claimed) => {
            setAddOpen(false);
            claimedToast(claimed);
            await load();
          }}
        />
      )}
      {createOpen && (
        <CreateUserDialog
          tenantId={tenantId}
          onClose={() => setCreateOpen(false)}
          onDone={async (claimed) => {
            setCreateOpen(false);
            claimedToast(claimed);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AddMemberDialog({
  tenantId,
  onClose,
  onDone,
}: {
  tenantId: string;
  onClose: () => void;
  onDone: (claimed: ClaimResult | null) => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [claimAliases, setClaimAliases] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await directoryApi.addMember(tenantId, {
        email: email.trim(),
        role,
        claimAliases: claimAliases
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      toast.success(`${result.member.user.displayName} added to the workspace`);
      await onDone(result.claimed);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Could not add the member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add an existing account"
      description="The person must have signed up (or been created) already. Their earlier uploads are linked automatically."
      icon={<Link2 className="h-4 w-4" />}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Email of the account"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="person@acme.com"
          error={error}
          required
          autoFocus
        />
        <div>
          <label className="text-[12.5px] font-medium text-[var(--text-secondary)]" htmlFor="member-role">
            Workspace role
          </label>
          <select
            id="member-role"
            value={role}
            onChange={(event) => setRole(event.target.value as MemberRole)}
            className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
          >
            <option value="member">Member — own and shared documents</option>
            <option value="tenant_admin">Administrator — manages this workspace</option>
          </select>
        </div>
        <Input
          label="Link earlier uploads (optional)"
          value={claimAliases}
          onChange={(event) => setClaimAliases(event.target.value)}
          placeholder="legacy.worker id, employee code, comma separated"
          hint="Additional x-user-id values this person used before having an account. Their email is always linked."
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Add to workspace
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CreateUserDialog({
  tenantId,
  onClose,
  onDone,
}: {
  tenantId: string;
  onClose: () => void;
  onDone: (claimed: ClaimResult | null) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [role, setRole] = useState<MemberRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors: Record<string, string> = {};
    if (form.password.length < 8) nextErrors.password = "At least 8 characters";
    // The identity provider rejects names shorter than 3 characters (an
    // initial like "R" must be written out or left empty).
    if (form.firstName.trim() && form.firstName.trim().length < 3) {
      nextErrors.firstName = "At least 3 characters, or leave empty";
    }
    if (form.lastName.trim() && form.lastName.trim().length < 3) {
      nextErrors.lastName = "At least 3 characters, or leave empty";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setError(undefined);
    try {
      const result = await directoryApi.createUser(
        {
          email: form.email.trim(),
          password: form.password,
          firstName: form.firstName.trim() || undefined,
          lastName: form.lastName.trim() || undefined,
          tenantId,
          role,
        },
        tenantId
      );
      toast.success("Account created and added", {
        description: "Share the password with the person; they can change it after first sign-in.",
      });
      await onDone(result.claimed);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Could not create the account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Create a new account"
      description="Creates the account in the identity provider and adds it to this workspace."
      icon={<UserPlus className="h-4 w-4" />}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            value={form.firstName}
            onChange={set("firstName")}
            placeholder="Jane"
            error={fieldErrors.firstName}
            hint="3+ characters or empty"
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={set("lastName")}
            placeholder="Doe"
            error={fieldErrors.lastName}
            hint="3+ characters or empty"
          />
        </div>
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={set("email")}
          placeholder="person@acme.com"
          required
          autoFocus
        />
        <Input
          label="Temporary password"
          type="text"
          value={form.password}
          onChange={set("password")}
          placeholder="At least 8 characters"
          error={fieldErrors.password}
          hint="Hand it over securely; the person should change it after signing in."
          required
        />
        <div>
          <label className="text-[12.5px] font-medium text-[var(--text-secondary)]" htmlFor="new-user-role">
            Workspace role
          </label>
          <select
            id="new-user-role"
            value={role}
            onChange={(event) => setRole(event.target.value as MemberRole)}
            className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
          >
            <option value="member">Member — own and shared documents</option>
            <option value="tenant_admin">Administrator — manages this workspace</option>
          </select>
        </div>
        {error && <p className="text-[12px] font-medium text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
