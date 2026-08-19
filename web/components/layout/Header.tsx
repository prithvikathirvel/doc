"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  User,
} from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { initials } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export function Header({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { session, tenant, storage, refreshTenant, tenantLoading } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      router.push("/documents");
      return;
    }
    router.push(`/documents?q=${encodeURIComponent(term)}`);
  };

  return (
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-6 py-2 backdrop-blur-md">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-tight tracking-tight text-slate-800">
          {title || "Document Management"}
        </h1>
        {subtitle ? (
          <p className="truncate text-[12px] text-slate-500">{subtitle}</p>
        ) : tenant ? (
          <p className="truncate text-[12px] text-slate-500">
            {tenant.name}
            {storage?.provider ? (
              <span className="text-slate-400"> · {storage.provider}</span>
            ) : (
              <span className="text-amber-600"> · storage not configured</span>
            )}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <form onSubmit={onSearch} className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents…"
            className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-800 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] placeholder:text-slate-400 transition-all hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15 lg:w-72"
          />
        </form>

        <button
          type="button"
          onClick={() => void refreshTenant()}
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-indigo-600 sm:inline-flex"
          title="Refresh tenant"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${tenantLoading ? "animate-spin" : ""}`} />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pl-1 pr-2 transition-colors hover:bg-slate-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
              {initials(session.userName || session.userId)}
            </span>
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block max-w-[120px] truncate text-[12px] font-semibold text-slate-800">
                {session.userName || session.userId}
              </span>
              <span className="block max-w-[120px] truncate text-[10px] text-slate-400">
                {session.roles[0] || "user"}
              </span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08),0_8px_10px_-6px_rgba(0,0,0,0.04)] animate-fade-up">
              <div className="border-b border-slate-100 px-3 py-2.5">
                <p className="text-[13px] font-semibold text-slate-800">{session.userName}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{session.userId}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {session.roles.map((r) => (
                    <Badge key={r} tone="indigo">
                      {r}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="px-3 py-2 text-[11px] text-slate-500">
                <p className="font-semibold uppercase tracking-wider text-slate-400">Tenant</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-600">{session.tenantId}</p>
                {tenant && (
                  <p className="mt-1 flex items-center gap-1 text-emerald-600">
                    <Check className="h-3 w-3" /> {tenant.name}
                  </p>
                )}
              </div>
              <div className="border-t border-slate-100 py-1">
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Settings className="h-3.5 w-3.5 text-slate-400" />
                  Session settings
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Switch identity
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 hover:text-red-600"
                >
                  <LogOut className="h-3.5 w-3.5 text-slate-400" />
                  Sign out view
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
