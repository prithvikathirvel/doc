"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { cn, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export function UserMenu() {
  const { session, signOut, isPlatformAdmin } = useSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  if (!session) return null;

  return (
    <div className="relative" ref={containerRef}>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full min-w-[220px] overflow-hidden rounded-xl border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)] animate-rise">
          <div className="border-b border-[var(--border)] px-3 py-2.5">
            <p className="truncate text-[12.5px] font-medium text-[var(--text)]">{session.userName}</p>
            <p className="truncate font-mono text-[11px] text-[var(--text-muted)]">{session.userId}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {session.roles.map((role) => (
                <Badge key={role} tone={role === "platform_admin" ? "accent" : "neutral"}>
                  {role.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]",
          open && "border-[var(--border)] bg-[var(--surface-muted)]"
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[11.5px] font-semibold text-[var(--text-secondary)]">
          {initials(session.userName || session.userId)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-[var(--text)]">
            {session.userName}
          </span>
          <span className="flex items-center gap-1 truncate text-[11px] text-[var(--text-muted)]">
            {isPlatformAdmin ? (
              <>
                <ShieldCheck className="h-3 w-3" /> Platform administrator
              </>
            ) : (
              <>
                <UserRound className="h-3 w-3" /> {session.tenantName || "Workspace member"}
              </>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}
