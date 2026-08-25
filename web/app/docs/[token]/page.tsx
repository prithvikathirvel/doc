"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Moon, Sun, KeyRound } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { CopyButton } from "@/components/ui/Copy";
import { LoadingBlock } from "@/components/ui/Feedback";
import { docsApi, ApiError } from "@/lib/api";
import { BASE_PATH } from "@/lib/basePath";
import { cn, formatDate } from "@/lib/utils";
import type { DocCategory, DocField, DocOperation, DocHeader, TenantDocPage } from "@/lib/types";

type Theme = "light" | "dark";

const CATEGORY_ORDER: DocCategory[] = ["Documents", "Folders", "Sharing"];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  POST: "bg-[var(--accent-soft)] text-[var(--accent-hover)] border-[var(--accent-border)] dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
  PUT: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  PATCH: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  DELETE: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
};

function Requirement({ required }: { required: boolean }) {
  return required ? (
    <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
      Required
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-400">
      Optional
    </span>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0b1220] dark:bg-[#0a0f1d]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {label || "Shell"}
        </span>
        <CopyButton
          value={code}
          label="Copy"
          className="h-6 w-6 border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
        />
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[12px] leading-relaxed text-slate-100">
        <code className="whitespace-pre font-mono">{code}</code>
      </pre>
    </div>
  );
}

function FieldTable({
  caption,
  fields,
}: {
  caption: string;
  fields: DocField[];
}) {
  if (!fields.length) return null;
  return (
    <div className="mt-3.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] dark:text-slate-500">
        {caption}
      </p>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] dark:border-white/10">
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {fields.map((field) => (
              <tr key={field.name} className="border-b border-[var(--border)] last:border-0 dark:border-white/10">
                <td className="w-[32%] align-top bg-[var(--surface-muted)] px-3 py-2 dark:bg-white/5">
                  <div className="flex flex-col gap-1">
                    <code className="font-mono text-[11.5px] font-medium text-[var(--text)] dark:text-slate-200">
                      {field.name}
                    </code>
                    <Requirement required={field.required} />
                  </div>
                </td>
                <td className="align-top px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {field.type}
                    </span>
                    {field.example !== undefined && (
                      <code className="break-all font-mono text-[11px] text-[var(--accent-hover)] dark:text-indigo-300">
                        e.g. {field.example}
                      </code>
                    )}
                  </div>
                  {field.description && (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-muted)] dark:text-slate-500">
                      {field.description}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderChips({ headers }: { headers: DocHeader[] }) {
  if (!headers.length) return null;
  return (
    <div className="mt-3.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] dark:text-slate-500">
        Headers
      </p>
      <div className="flex flex-col gap-1.5">
        {headers.map((header) => (
          <div
            key={header.name}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 dark:border-white/10 dark:bg-white/5"
          >
            <code className="font-mono text-[12px] font-medium text-[var(--text)] dark:text-slate-200">
              {header.name}
            </code>
            <Requirement required={Boolean(header.required)} />
            <code className="break-all font-mono text-[11.5px] text-[var(--accent-hover)] dark:text-indigo-300">
              {header.value}
            </code>
            {header.description && (
              <span className="text-[11.5px] text-[var(--text-muted)] dark:text-slate-500">
                — {header.description}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OperationCard({ operation }: { operation: DocOperation }) {
  return (
    <article className="scroll-mt-24 rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-xs)] dark:border-white/10 dark:bg-[#0f1726]">
      {/* Full URL bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 dark:border-white/10 dark:bg-white/5">
        <span
          className={cn(
            "inline-flex h-6 min-w-[56px] items-center justify-center rounded-md border px-2 font-mono text-[11px] font-bold",
            METHOD_STYLES[operation.method] ||
              "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10"
          )}
        >
          {operation.method}
        </span>
        <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] font-medium text-[var(--text)] dark:text-slate-100">
          {operation.url}
        </code>
        <CopyButton value={operation.url} label="Copy URL" />
      </div>

      <div className="p-4 sm:p-5">
        <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--text)] dark:text-slate-100">
          {operation.title}
        </h4>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)] dark:text-slate-400">
          {operation.summary}
        </p>

        <HeaderChips headers={operation.auth} />
        <FieldTable caption="Path & query parameters" fields={operation.parameters} />
        <FieldTable caption="Request body" fields={operation.bodyFields || []} />

        <div className="mt-3.5 space-y-3">
          {operation.bodyExample && <CodeBlock code={operation.bodyExample} label="Request example" />}
          <CodeBlock code={operation.curl} label="cURL" />
          <CodeBlock code={operation.responseExample} label="Example response" />
        </div>

        {operation.notes && operation.notes.length > 0 && (
          <ul className="mt-3.5 space-y-1.5">
            {operation.notes.map((note) => (
              <li
                key={note}
                className="flex gap-2 text-[12px] leading-relaxed text-[var(--text-secondary)] dark:text-slate-400"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)] dark:bg-slate-600" />
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function AuthPanel() {
  return (
    <section id="authentication" className="scroll-mt-24">
      <div className="mb-3 flex items-center gap-3">
        <KeyRound className="h-4 w-4 text-[var(--accent)] dark:text-indigo-400" />
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text)] dark:text-slate-100">
          Authentication
        </h2>
        <span className="h-px flex-1 bg-[var(--border)] dark:bg-white/10" />
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)] dark:border-white/10 dark:bg-[#0f1726] sm:p-5">
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)] dark:text-slate-400">
          Every request is made server-to-server from your backend with an API key in the{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11.5px] text-[var(--text)] dark:bg-white/10 dark:text-slate-200">
            x-api-key
          </code>{" "}
          header. The key fixes the workspace and the role. Optionally pass{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11.5px] text-[var(--text)] dark:bg-white/10 dark:text-slate-200">
            x-user-id
          </code>{" "}
          to attribute the action to one of your end users.
        </p>
        <div className="mt-3">
          <CodeBlock
            label="Header example"
            code={'x-api-key: dms_a1b2c3d4.<your-secret>\nx-user-id: <user-id>     # optional\nx-tenant-id: <tenant-id>  # optional'}
          />
        </div>
      </div>
    </section>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export default function PublicDocsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [page, setPage] = useState<TenantDocPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>("light");

  // Initialise + persist the documentation theme (scoped to this page).
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("dms-docs-theme") : null;
    const prefersDark =
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (typeof window !== "undefined") window.localStorage.setItem("dms-docs-theme", theme);
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    docsApi
      .publicPage(token)
      .then((result) => {
        if (!cancelled) setPage(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.status === 404
                ? "This documentation link is no longer available."
                : err.message
              : "Unable to load the documentation."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const grouped = useMemo(() => {
    if (!page) return [];
    return CATEGORY_ORDER.filter((category) => page.operations.some((op) => op.category === category)).map(
      (category) => ({
        category,
        operations: page.operations.filter((op) => op.category === category),
      })
    );
  }, [page]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)] dark:bg-[#0b1220]">
        <LoadingBlock label="Loading documentation" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--canvas)] px-6 text-center dark:bg-[#0b1220]">
        <BrandMark size="lg" />
        <h1 className="mt-2 text-[18px] font-semibold text-[var(--text)] dark:text-slate-100">
          Documentation unavailable
        </h1>
        <p className="max-w-sm text-[13.5px] text-[var(--text-secondary)] dark:text-slate-400">{error}</p>
        <Link href={`${BASE_PATH}/login`} className="mt-1 text-[13px] font-medium text-[var(--accent)] hover:underline dark:text-indigo-400">
          Go to sign-in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--text)] dark:bg-[#0b1220] dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#0f1726]/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandMark size="sm" />
          <div className="flex items-center gap-3">
            <span className="hidden text-[12px] text-[var(--text-muted)] dark:text-slate-500 sm:inline">
              Generated {formatDate(page.generatedAt)}
            </span>
            <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:flex lg:py-12">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block lg:w-56 lg:shrink-0">
          <nav className="sticky top-24 space-y-1">
            <a
              href="#authentication"
              className="block rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-white hover:text-[var(--text)] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
            >
              Authentication
            </a>
            {grouped.map(({ category, operations }) => (
              <div key={category}>
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] dark:text-slate-500">
                  {category}
                </p>
                {operations.map((op) => (
                  <a
                    key={op.id}
                    href={`#${slugify(op.id)}`}
                    className="block truncate rounded-lg px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-white hover:text-[var(--text)] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
                    title={op.title}
                  >
                    {op.title}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          {/* Hero */}
          <section>
            <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-muted)] dark:text-slate-500">
              <BookOpen className="h-3.5 w-3.5" />
              API Reference
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-[var(--text)] dark:text-slate-100 sm:text-[30px]">
              {page.title}
            </h1>
            <p className="mt-1 text-[14px] text-[var(--text-secondary)] dark:text-slate-400">
              Prepared for <span className="font-medium text-[var(--text)] dark:text-slate-200">{page.tenant.name}</span>
            </p>
            {page.intro && (
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--text-secondary)] dark:text-slate-400">
                {page.intro}
              </p>
            )}
            <div className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] dark:text-slate-500">
                Base URL
              </span>
              <code className="break-all font-mono text-[12px] text-[var(--text)] dark:text-slate-200">
                {page.apiBaseUrl}/api
              </code>
            </div>
          </section>

          {/* Mobile category pills */}
          <nav className="mt-8 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
            <a href="#authentication" className="whitespace-nowrap rounded-md bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] shadow-[var(--shadow-xs)] dark:bg-[#0f1726] dark:text-slate-400">
              Authentication
            </a>
            {grouped.map(({ category }) => (
              <a
                key={category}
                href={`#${slugify(category)}`}
                className="whitespace-nowrap rounded-md bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] shadow-[var(--shadow-xs)] dark:bg-[#0f1726] dark:text-slate-400"
              >
                {category}
              </a>
            ))}
          </nav>

          {/* Authentication */}
          <div className="mt-8">
            <AuthPanel />
          </div>

          {/* Sections */}
          <div className="mt-12 space-y-12">
            {grouped.map(({ category, operations }) => (
              <section key={category} id={slugify(category)} className="scroll-mt-24">
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text)] dark:text-slate-100">
                    {category}
                  </h2>
                  <span className="h-px flex-1 bg-[var(--border)] dark:bg-white/10" />
                  <span className="text-[12px] text-[var(--text-muted)] dark:text-slate-500">{operations.length}</span>
                </div>
                <div className="space-y-4">
                  {operations.map((operation) => (
                    <div key={operation.id} id={slugify(operation.id)} className="scroll-mt-24">
                      <OperationCard operation={operation} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Footer */}
          <footer className="mt-16 border-t border-[var(--border)] pt-6 text-center dark:border-white/10">
            <p className="text-[12px] text-[var(--text-muted)] dark:text-slate-500">
              Examples use placeholder values only — replace them with your own workspace details.
            </p>
            <p className="mt-2 text-[12px] text-[var(--text-muted)] dark:text-slate-500">Powered by Sify DMS</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
